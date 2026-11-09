// The models' life outside React (ADR-48). No three.js here, so starting the
// downloads never waits for the model chunk.
//
// - Early downloads: the tier's GLBs start downloading as soon as the 3D code
//   (the TrickScene chunk) has arrived, not after the model chunk arrives and
//   asks for them. TrickScene calls prefetchModels; the GLTF loader (gltf.ts,
//   in the lazy model chunk) takes each early download when it asks for that
//   file, so nothing is fetched twice, even with the HTTP cache off. Not at
//   page open: a download beside the 3D code shares its bandwidth and delays
//   the first frame (2.1 s at 3 Mbps, measured 2026-11-09).
// - Release: when the student moves down a tier, the models the new tier
//   never shows are freed (geometry, materials, textures and their decoded
//   images, and the loader's cache entry). gltf.ts registers how; TrickScene
//   asks for it, without loading the model chunk on a tier that never had it.

const pending = new Map<string, Promise<ArrayBuffer>>();

/**
 * Starts each download once, at low priority so the model chunk, which must
 * arrive before any model can be parsed, goes first where the browser can
 * order requests. A failure is kept in the promise
 * (never unhandled): the loader then asks again the normal way, and that
 * failure reaches the scene's AssetBoundary.
 */
export function prefetchModels(urls: readonly string[]) {
  if (typeof fetch !== 'function') return;
  for (const url of urls) {
    if (pending.has(url)) continue;
    const early = fetch(url, { priority: 'low' }).then((r) => {
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return r.arrayBuffer();
    });
    early.catch(() => {});
    pending.set(url, early);
  }
}

/** The early download of `url`, once: a second ask (the model again after a tier change) fetches again. */
export function takePrefetched(url: string): Promise<ArrayBuffer> | undefined {
  const early = pending.get(url);
  pending.delete(url);
  return early;
}

/**
 * How long after a tier change the models it no longer shows are freed. The
 * old Canvas's R3F root tears itself down (scene, renderer, context) in two
 * reconciler passes after its unmount, well inside this; until then a frame
 * could still draw the old models.
 */
export const RELEASE_AFTER_MS = 1000;

let renderer: object | null = null;
const waiting: ((r: object) => void)[] = [];

/**
 * TrickScene notes each renderer it creates. The KTX2 textures (ADR-49) are
 * transcoded to a GPU format the renderer supports, so the loader waits for
 * the first one before it parses a model.
 */
export function noteRenderer(r: object) {
  renderer = r;
  for (const w of waiting.splice(0)) w(r);
}

/** The first renderer, as soon as there is one. */
export const whenRenderer = (): Promise<object> =>
  renderer ? Promise.resolve(renderer) : new Promise((resolve) => waiting.push(resolve));

type Release = (urls: readonly string[]) => void;
let release: Release | null = null;

/** gltf.ts registers how a loaded model is freed, when its chunk first loads. */
export function onReleaseModels(fn: Release) {
  release = fn;
}

/**
 * Frees `urls`: drops their early downloads if nobody took them, and, if the
 * model chunk ever loaded, the loaded models themselves. A no-op for a file
 * never asked for.
 */
export function releaseModels(urls: readonly string[]) {
  for (const url of urls) pending.delete(url);
  release?.(urls);
}
