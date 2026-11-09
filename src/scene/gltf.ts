// How every GLB is loaded and freed (BoardModel, ShoesModel, GroundModel).
// Part of the lazy model chunk: a student on Low never downloads it.
import { useGLTF } from '@react-three/drei';
import { LoaderUtils, Material, Mesh, Texture, type WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { BASIS_DIR } from '../asset/spec';
import { isUnwanted, onReleaseModels, RELEASE_AFTER_MS, takePrefetched, whenRenderer } from './modelCache';

// useGLTF(path, useDraco, useMeshopt, extendLoader). Draco is off: drei would
// fetch its decoder from a CDN, which school networks often block. The meshopt
// decoder ships inside the JS bundle (three-stdlib), so it works offline (ADR-13).
export const DRACO = false;
export const MESHOPT = true;

type GLTFLoader = Parameters<NonNullable<Parameters<typeof useGLTF>[3]>>[0];
/** What the loader hands back (three-stdlib's GLTF), before R3F adds the node and material maps. */
type GLTF = Parameters<Parameters<GLTFLoader['load']>[1]>[0];

/**
 * The textures are KTX2 (Basis Universal, ADR-49): the worker transcodes each
 * to a format the GPU keeps compressed. Its transcoder is served from our own
 * public/basis/ (copied from three by npm run assets), never a CDN.
 */
const ktx2 = new KTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}${BASIS_DIR}`);
let ktx2Ready: Promise<void> | null = null;
/**
 * Ready to read KTX2 textures. The transcoder starts downloading at the first
 * ask (the model chunk's preload, beside the models), since it is needed
 * before any texture can be read. KTX2Loader picks its GPU format from a
 * renderer, and three-stdlib's GLTFLoader silently drops a texture its KTX2
 * loader cannot read yet, so no model is parsed before the first Canvas has
 * made one either. A transcoder that cannot load fails every model load, so
 * AssetBoundary shows the simple board and says so, instead of a board
 * without its textures.
 */
const textureSupport = () =>
  (ktx2Ready ??= Promise.all([
    ktx2.init(),
    whenRenderer().then((r) => {
      ktx2.detectSupport(r as WebGLRenderer);
    }),
  ]).then(() => undefined));

/** The part of a glTF material definition that names textures. */
interface MaterialDef {
  name?: string;
  pbrMetallicRoughness?: { baseColorTexture?: unknown; metallicRoughnessTexture?: unknown };
  normalTexture?: unknown;
  occlusionTexture?: unknown;
  emissiveTexture?: unknown;
}

/** The material slots a glTF file can ask a texture for, and where three's material keeps it. */
const TEXTURE_SLOTS: readonly [(def: MaterialDef) => unknown, string][] = [
  [(d) => d.pbrMetallicRoughness?.baseColorTexture, 'map'],
  [(d) => d.normalTexture, 'normalMap'],
  [(d) => d.pbrMetallicRoughness?.metallicRoughnessTexture, 'roughnessMap'],
  [(d) => d.occlusionTexture, 'aoMap'],
  [(d) => d.emissiveTexture, 'emissiveMap'],
];

/**
 * The textures a loaded model asked for but did not get. three-stdlib's
 * GLTFLoader turns a texture that fails to load or decode (a corrupt KTX2,
 * a transcoder error) into a missing map and still reports the model as
 * loaded; the board would then show without its textures and nobody would
 * be told. Read through the parser's material associations, so a material
 * the loader cloned (vertex colours) is checked too.
 */
export function missingTextures(gltf: Pick<GLTF, 'parser'>): string[] {
  const json = gltf.parser.json as { materials?: MaterialDef[] };
  const missing: string[] = [];
  for (const [object, ref] of gltf.parser.associations) {
    if (!(object instanceof Material) || ref.materials === undefined) continue;
    const def = json.materials?.[ref.materials];
    if (!def) continue;
    for (const [asks, key] of TEXTURE_SLOTS) {
      if (asks(def) && !(object as unknown as Record<string, unknown>)[key]) missing.push(`${def.name ?? ref.materials}.${key}`);
    }
  }
  return [...new Set(missing)];
}

/** What each URL loaded, so a release can free it. */
const loaded = new Map<string, GLTF>();
const patched = new WeakSet<GLTFLoader>();

/**
 * drei's extendLoader hook, applied on every load and preload (ADR-48). It
 * patches the one shared GLTFLoader once: a file TrickScene started early is
 * parsed from that download instead of being fetched again; anything else,
 * or an early download that failed, loads the normal way, whose failure
 * reaches AssetBoundary. Every result is noted for releaseLoaded.
 */
export function shareEarlyDownloads(loader: GLTFLoader) {
  if (patched.has(loader)) return;
  patched.add(loader);
  loader.setKTX2Loader(ktx2 as unknown as Parameters<GLTFLoader['setKTX2Loader']>[0]);
  const load = loader.load.bind(loader);
  loader.load = (url, onLoad, onProgress, onError) => {
    const done = (gltf: GLTF) => {
      // A model missing a texture is a failed model: AssetBoundary falls back and says so.
      const missing = missingTextures(gltf);
      if (missing.length) {
        disposeModel(gltf);
        onError?.(new Error(`${url}: textures did not load (${missing.join(', ')})`) as unknown as ErrorEvent);
        return;
      }
      loaded.set(url, gltf);
      onLoad(gltf);
      // Finished after the student moved to a tier that never shows it (a slow
      // link, or a model failing first): freed like the others once the tier
      // has settled, unless the student has come back to a tier that needs it.
      if (isUnwanted(url)) setTimeout(() => isUnwanted(url) && releaseLoaded([url]), RELEASE_AFTER_MS);
    };
    const early = takePrefetched(url);
    // The download runs meanwhile; only the parse waits for the renderer.
    textureSupport().then(
      () => {
        if (!early) return load(url, done, onProgress, onError);
        early.then(
          (data) => {
            try {
              loader.parse(data, LoaderUtils.extractUrlBase(url), done, onError);
            } catch (e) {
              onError?.(e as ErrorEvent);
            }
          },
          () => load(url, done, onProgress, onError),
        );
      },
      (e) => onError?.(e as ErrorEvent),
    );
  };
}

/** A tier's GLB, suspending until it is in. */
export const useModel = (url: string) => useGLTF(url, DRACO, MESHOPT, shareEarlyDownloads);

/** Starts loading a GLB into the cache (from its early download when there is one). */
export const preloadModel = (url: string) => useGLTF.preload(url, DRACO, MESHOPT, shareEarlyDownloads);

/** Disposes one loaded model: each geometry, material and texture once, and closes the decoded images. */
export function disposeModel(gltf: Pick<GLTF, 'scene'>) {
  const materials = new Set<Material>();
  gltf.scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m as Material);
  });
  const textures = new Set<Texture>();
  for (const m of materials) {
    for (const value of Object.values(m)) if (value instanceof Texture) textures.add(value);
    m.dispose();
  }
  for (const t of textures) {
    const image: unknown = t.source.data;
    t.dispose();
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
  }
}

/**
 * Frees the models at `urls` that were loaded (ADR-48, the ADR-15 follow-up):
 * the loader's cache entry goes, so a later ask loads the file again (from the
 * HTTP cache), and the GPU and decoded image memory with it. Called through
 * modelCache when the student moves down a tier, after the Canvas for the old
 * tier has unmounted, so nothing on screen still uses them.
 */
export function releaseLoaded(urls: readonly string[]) {
  for (const url of urls) {
    const gltf = loaded.get(url);
    if (!gltf) continue;
    loaded.delete(url);
    useGLTF.clear(url);
    disposeModel(gltf);
  }
}

onReleaseModels(releaseLoaded);
