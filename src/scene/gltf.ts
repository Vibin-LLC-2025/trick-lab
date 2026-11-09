// How every GLB is loaded and freed (BoardModel, ShoesModel, GroundModel).
// Part of the lazy model chunk: a student on Low never downloads it.
import { useGLTF } from '@react-three/drei';
import { LoaderUtils, Mesh, Texture, type Material } from 'three';
import { onReleaseModels, takePrefetched } from './modelCache';

// useGLTF(path, useDraco, useMeshopt, extendLoader). Draco is off: drei would
// fetch its decoder from a CDN, which school networks often block. The meshopt
// decoder ships inside the JS bundle (three-stdlib), so it works offline (ADR-13).
export const DRACO = false;
export const MESHOPT = true;

type GLTFLoader = Parameters<NonNullable<Parameters<typeof useGLTF>[3]>>[0];
/** What the loader hands back (three-stdlib's GLTF), before R3F adds the node and material maps. */
type GLTF = Parameters<Parameters<GLTFLoader['load']>[1]>[0];

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
  const load = loader.load.bind(loader);
  loader.load = (url, onLoad, onProgress, onError) => {
    const done = (gltf: GLTF) => {
      loaded.set(url, gltf);
      onLoad(gltf);
    };
    const early = takePrefetched(url);
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
