/// <reference types="node" />
// ADR-48 (2026-11-09): the tier's GLBs download as soon as the 3D code
// arrives, the loader parses those downloads instead of fetching again, and a
// move down a tier frees the models it no longer shows. ADR-49: the loader
// reads KTX2 textures, so it parses nothing before a renderer exists. jsdom
// has no network, so fetch is stubbed; the loader is a stand-in with
// GLTFLoader's load, parse and setKTX2Loader, and the renderer a stand-in
// with the extension list KTX2Loader asks, since the real ones would need a
// real GLB and a WebGL context.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Mesh, MeshStandardMaterial, Scene, Texture } from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
// The loader drei's useGLTF builds, with the meshopt decoder it gives it: the real one, for the texture check.
import { GLTFLoader, MeshoptDecoder } from 'three-stdlib';
import { useGLTF } from '@react-three/drei';
import { allShown, noteRenderer, noteShown, onShown, prefetchModels, RELEASE_AFTER_MS, releaseModels, setUnwanted, takePrefetched } from './modelCache';
import { disposeModel, missingTextures, shareEarlyDownloads } from './gltf';
import { BOARD_HIGH_URL, BOARD_URL, GROUND_URL, modelsFor, modelsUnusedBy, RIDER_URL, SHOES_URL, SPOT_URL } from './modelUrls';

type Loader = Parameters<typeof shareEarlyDownloads>[0];

// The transcoder lives in public/basis/, which jsdom cannot fetch: it loads at once here.
beforeEach(() => {
  vi.spyOn(KTX2Loader.prototype, 'init').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setUnwanted([]);
});

function stubFetch(ok = true) {
  const fetch = vi.fn((url: string) =>
    Promise.resolve({ ok, status: ok ? 200 : 404, arrayBuffer: () => Promise.resolve(new TextEncoder().encode(url).buffer) }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

/** A loader result's parser with no materials: nothing asked for, nothing missing. */
const noTextures = () => ({ json: {}, associations: new Map() });

/** A loader with GLTFLoader's load, parse and setKTX2Loader: parse hands back a scene named after the bytes. */
function fakeLoader() {
  const load = vi.fn((_url: string, onLoad: (g: unknown) => void) => onLoad({ scene: new Scene(), parser: noTextures(), from: 'network' }));
  const parse = vi.fn((data: ArrayBuffer, path: string, onLoad: (g: unknown) => void) =>
    onLoad({ scene: new Scene(), parser: noTextures(), from: new TextDecoder().decode(data), path }),
  );
  const setKTX2Loader = vi.fn();
  const loader = { load, parse, setKTX2Loader } as unknown as Loader;
  shareEarlyDownloads(loader);
  return { loader, load, parse, setKTX2Loader };
}

/** A renderer as KTX2Loader.detectSupport reads it: a WebGL one with no compressed formats. */
const fakeRenderer = { extensions: { has: () => false } };

const loadWith = (loader: Loader, url: string) =>
  new Promise<Record<string, unknown>>((resolve, reject) => loader.load(url, (g) => resolve(g as never), undefined, reject));

describe('the models each tier shows (ADR-48)', () => {
  it('starts the board, then the ground, then the shoes on High; Medium the original board and the ground; Low nothing', () => {
    expect(modelsFor('high', true)).toEqual([BOARD_HIGH_URL, GROUND_URL, SHOES_URL]);
    expect(modelsFor('high', false)).toEqual([BOARD_HIGH_URL, GROUND_URL]);
    expect(modelsFor('medium', true)).toEqual([BOARD_URL, GROUND_URL]);
    expect(modelsFor('low', true)).toEqual([]);
  });

  it('adds the rider last on Medium and High while it is on screen with the feet, never on Low (ADR-85)', () => {
    expect(modelsFor('high', true, true)).toEqual([BOARD_HIGH_URL, GROUND_URL, SHOES_URL, RIDER_URL]);
    expect(modelsFor('medium', true, true)).toEqual([BOARD_URL, GROUND_URL, RIDER_URL]);
    expect(modelsFor('high', false, true)).toEqual([BOARD_HIGH_URL, GROUND_URL]);
    expect(modelsFor('low', true, true)).toEqual([]);
  });

  it('frees on a move down only what the new tier never shows', () => {
    expect(modelsUnusedBy('high')).toEqual([]);
    expect(modelsUnusedBy('medium').sort()).toEqual([BOARD_HIGH_URL, SHOES_URL].sort());
    // The skate spot too (ADR-69): only the game screen on Medium and High shows it.
    expect(modelsUnusedBy('low').sort()).toEqual([BOARD_HIGH_URL, BOARD_URL, GROUND_URL, SHOES_URL, SPOT_URL, RIDER_URL].sort());
    for (const q of ['high', 'medium'] as const) for (const url of modelsFor(q, true, true)) expect(modelsUnusedBy(q)).not.toContain(url);
  });
});

describe('the models on screen (ADR-56)', () => {
  it("counts each model while it is mounted, the shoe's two mounts as one model, and tells a listener each time one comes", () => {
    const heard: number[] = [];
    let n = 0;
    const stop = onShown(() => heard.push(++n));
    const tier = modelsFor('high', true);
    expect(allShown([])).toBe(true);
    expect(allShown(tier)).toBe(false);
    const offBoard = noteShown(BOARD_HIGH_URL);
    const offGround = noteShown(GROUND_URL);
    const offLeft = noteShown(SHOES_URL);
    const offRight = noteShown(SHOES_URL);
    expect(allShown(tier)).toBe(true);
    expect(heard).toEqual([1, 2, 3, 4]);
    // One shoe unmounting leaves the other on screen; the second takes the model off.
    offLeft();
    expect(allShown(tier)).toBe(true);
    offRight();
    expect(allShown(tier)).toBe(false);
    expect(allShown(modelsFor('high', false))).toBe(true);
    stop();
    noteShown(SHOES_URL)();
    expect(heard).toHaveLength(4);
    offBoard();
    offGround();
    expect(allShown(modelsFor('medium', true))).toBe(false);
  });
});

describe('early downloads', () => {
  it('fetches each file once, at low priority, and hands each download over once', async () => {
    const fetch = stubFetch();
    prefetchModels(['/a.glb', '/b.glb']);
    prefetchModels(['/a.glb']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith('/a.glb', { priority: 'low' });
    const a = takePrefetched('/a.glb');
    expect(new TextDecoder().decode(await a)).toBe('/a.glb');
    expect(takePrefetched('/a.glb')).toBeUndefined();
    releaseModels(['/b.glb']);
    expect(takePrefetched('/b.glb')).toBeUndefined();
  });

  it('keeps a failed download as a rejected promise, never an unhandled one', async () => {
    stubFetch(false);
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    prefetchModels(['/missing.glb']);
    await new Promise((r) => setTimeout(r, 0));
    expect(unhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', unhandled);
    await expect(takePrefetched('/missing.glb')).rejects.toThrow('HTTP 404');
  });
});

describe('the loader shares the early downloads', () => {
  it('gives the loader a KTX2 loader and parses nothing before the first renderer exists (ADR-49)', async () => {
    const { loader, load, setKTX2Loader } = fakeLoader();
    expect(setKTX2Loader).toHaveBeenCalledTimes(1);
    expect(setKTX2Loader.mock.calls[0]![0]).toHaveProperty('detectSupport');
    const pending = loadWith(loader, '/models/waits.glb');
    await new Promise((r) => setTimeout(r, 10));
    expect(load).not.toHaveBeenCalled();
    noteRenderer(fakeRenderer);
    expect((await pending).from).toBe('network');
  });

  it('reports a transcoder that cannot load as a failed model, so AssetBoundary shows the simple board (ADR-49)', async () => {
    vi.resetModules();
    vi.spyOn(KTX2Loader.prototype, 'init').mockRejectedValue(new Error('blocked'));
    const fresh = await import('./gltf');
    const cache = await import('./modelCache');
    cache.noteRenderer(fakeRenderer);
    const load = vi.fn();
    const loader = { load, parse: vi.fn(), setKTX2Loader: vi.fn() } as unknown as Loader;
    fresh.shareEarlyDownloads(loader);
    await expect(loadWith(loader, '/models/no-transcoder.glb')).rejects.toThrow('blocked');
    expect(load).not.toHaveBeenCalled();
  });

  it('parses a file that was started early instead of fetching it again, with its folder as the resource path', async () => {
    stubFetch();
    prefetchModels(['/models/early.glb']);
    const { loader, load, parse } = fakeLoader();
    const gltf = await loadWith(loader, '/models/early.glb');
    expect(load).not.toHaveBeenCalled();
    expect(parse).toHaveBeenCalledTimes(1);
    expect(gltf.from).toBe('/models/early.glb');
    expect(gltf.path).toBe('/models/');
  });

  it('loads the normal way when nothing was started early, or the early download failed', async () => {
    const { loader, load } = fakeLoader();
    expect((await loadWith(loader, '/models/late.glb')).from).toBe('network');
    stubFetch(false);
    prefetchModels(['/models/broken.glb']);
    expect((await loadWith(loader, '/models/broken.glb')).from).toBe('network');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('patches the shared loader once, however many loads apply the hook', async () => {
    const { loader, load } = fakeLoader();
    shareEarlyDownloads(loader);
    shareEarlyDownloads(loader);
    await loadWith(loader, '/models/once.glb');
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('a model whose textures did not load (review of Phase A, 2026-11-09)', () => {
  // Vitest runs from the project root.
  const GLB = resolve(process.cwd(), 'public', 'models', 'board-high.glb');

  /** The committed board through the real GLTFLoader, its KTX2 textures answered by `ktx2Load`. */
  async function loadBoard(ktx2Load: (onLoad: (t: Texture) => void, onError: (e: unknown) => void) => void) {
    // Copied into this realm's ArrayBuffer: the loader checks `instanceof ArrayBuffer`, and Node's file buffer is another realm's under jsdom.
    const file = readFileSync(GLB);
    const bytes = new ArrayBuffer(file.byteLength);
    new Uint8Array(bytes).set(file);
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(bytes) }));
    // jsdom has no object URLs; the loader makes one per embedded image.
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} }));
    vi.spyOn(KTX2Loader.prototype, 'load').mockImplementation(function (this: KTX2Loader, _url, onLoad, _progress, onError) {
      ktx2Load(onLoad as (t: Texture) => void, (e) => onError?.(e as ErrorEvent));
    });
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder());
    shareEarlyDownloads(loader as unknown as Loader);
    noteRenderer(fakeRenderer);
    const url = `/models/board-high-${Math.random()}.glb`;
    prefetchModels([url]);
    return loadWith(loader as unknown as Loader, url);
  }

  it('accepts the committed board when every texture loads, with every map in place', async () => {
    const gltf = await loadBoard((onLoad) => onLoad(new Texture()));
    expect(missingTextures(gltf as never)).toEqual([]);
    let maps = 0;
    (gltf.scene as Scene).traverse((o) => {
      if (o instanceof Mesh && o.material.map) maps++;
    });
    expect(maps).toBeGreaterThan(0);
  });

  it('fails the whole model when a texture does not load, so AssetBoundary shows the simple board', async () => {
    let n = 0;
    await expect(loadBoard((onLoad, onError) => (n++ === 2 ? onError(new Error('corrupt KTX2')) : onLoad(new Texture())))).rejects.toThrow(
      /textures did not load \(.+\)/,
    );
  });

  it('names each material slot the file asked a texture for but did not get', () => {
    const asked = new MeshStandardMaterial({ map: new Texture() });
    const parser = {
      json: { materials: [{ name: 'Grip', pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, normalTexture: { index: 1 } }] },
      associations: new Map([[asked, { materials: 0 }]]),
    };
    expect(missingTextures({ parser } as never)).toEqual(['Grip.normalMap']);
  });
});

describe('releasing a model', () => {
  it('disposes each geometry, material and texture once and closes the decoded images', () => {
    class FakeBitmap {
      close = vi.fn();
    }
    vi.stubGlobal('ImageBitmap', FakeBitmap);
    const bitmap = new FakeBitmap();
    const map = new Texture(bitmap as never);
    const normalMap = new Texture();
    const shared = new MeshStandardMaterial({ map, normalMap });
    const geometry = new BoxGeometry();
    const scene = new Scene();
    scene.add(new Mesh(geometry, shared), new Mesh(new BoxGeometry(), shared));
    const spies = [vi.spyOn(geometry, 'dispose'), vi.spyOn(shared, 'dispose'), vi.spyOn(map, 'dispose'), vi.spyOn(normalMap, 'dispose')];
    disposeModel({ scene } as never);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('frees a loaded model on release: its cache entry goes and its meshes are disposed; others are kept', async () => {
    const clear = vi.spyOn(useGLTF, 'clear');
    const { loader } = fakeLoader();
    const kept = await loadWith(loader, '/models/kept.glb');
    const freed = await loadWith(loader, '/models/freed.glb');
    const geometry = new BoxGeometry();
    const dispose = vi.spyOn(geometry, 'dispose');
    (freed.scene as Scene).add(new Mesh(geometry, new MeshStandardMaterial()));
    (kept.scene as Scene).add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
    releaseModels(['/models/freed.glb', '/models/never-loaded.glb']);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith('/models/freed.glb');
    expect(dispose).toHaveBeenCalledTimes(1);
    releaseModels(['/models/freed.glb']);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  /** A loader whose model arrives when the test says. */
  function slowLoader() {
    let finish: () => void = () => {};
    const load = vi.fn((_url: string, onLoad: (g: unknown) => void) => {
      finish = () => onLoad({ scene: new Scene(), parser: noTextures() });
    });
    const loader = { load, parse: vi.fn(), setKTX2Loader: vi.fn() } as unknown as Loader;
    shareEarlyDownloads(loader);
    noteRenderer(fakeRenderer);
    return { loader, load, finish: () => finish() };
  }

  it('frees a model that finishes loading after the student moved to a tier without it', async () => {
    vi.useFakeTimers();
    const clear = vi.spyOn(useGLTF, 'clear');
    const { loader, load, finish } = slowLoader();
    const done = loadWith(loader, '/models/slow.glb');
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    setUnwanted(['/models/slow.glb']);
    releaseModels(['/models/slow.glb']);
    expect(clear).not.toHaveBeenCalled();
    finish();
    await done;
    vi.advanceTimersByTime(RELEASE_AFTER_MS);
    expect(clear).toHaveBeenCalledWith('/models/slow.glb');
  });

  it('keeps a late model the student came back for before it was freed', async () => {
    vi.useFakeTimers();
    const clear = vi.spyOn(useGLTF, 'clear');
    const { loader, load, finish } = slowLoader();
    const done = loadWith(loader, '/models/back.glb');
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    setUnwanted(['/models/back.glb']);
    finish();
    await done;
    setUnwanted([]);
    vi.advanceTimersByTime(RELEASE_AFTER_MS);
    expect(clear).not.toHaveBeenCalled();
  });
});
