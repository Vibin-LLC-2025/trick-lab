// ADR-48 (2026-11-09): the tier's GLBs download from the moment the page
// opens, the loader parses those downloads instead of fetching again, and a
// move down a tier frees the models it no longer shows. jsdom has no network,
// so fetch is stubbed; the loader is a stand-in with GLTFLoader's load and
// parse, since the real one would need a real GLB and a WebGL context.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Mesh, MeshStandardMaterial, Scene, Texture } from 'three';
import { useGLTF } from '@react-three/drei';
import { prefetchModels, releaseModels, takePrefetched } from './modelCache';
import { disposeModel, shareEarlyDownloads } from './gltf';
import { BOARD_HIGH_URL, BOARD_URL, GROUND_URL, modelsFor, modelsUnusedBy, SHOES_URL } from './modelUrls';

type Loader = Parameters<typeof shareEarlyDownloads>[0];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(ok = true) {
  const fetch = vi.fn((url: string) =>
    Promise.resolve({ ok, status: ok ? 200 : 404, arrayBuffer: () => Promise.resolve(new TextEncoder().encode(url).buffer) }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

/** A loader with GLTFLoader's load and parse: parse hands back a scene named after the bytes. */
function fakeLoader() {
  const load = vi.fn((_url: string, onLoad: (g: unknown) => void) => onLoad({ scene: new Scene(), from: 'network' }));
  const parse = vi.fn((data: ArrayBuffer, path: string, onLoad: (g: unknown) => void) =>
    onLoad({ scene: new Scene(), from: new TextDecoder().decode(data), path }),
  );
  const loader = { load, parse } as unknown as Loader;
  shareEarlyDownloads(loader);
  return { loader, load, parse };
}

const loadWith = (loader: Loader, url: string) =>
  new Promise<Record<string, unknown>>((resolve, reject) => loader.load(url, (g) => resolve(g as never), undefined, reject));

describe('the models each tier shows (ADR-48)', () => {
  it('starts the board, then the ground, then the shoes on High; Medium the original board and the ground; Low nothing', () => {
    expect(modelsFor('high', true)).toEqual([BOARD_HIGH_URL, GROUND_URL, SHOES_URL]);
    expect(modelsFor('high', false)).toEqual([BOARD_HIGH_URL, GROUND_URL]);
    expect(modelsFor('medium', true)).toEqual([BOARD_URL, GROUND_URL]);
    expect(modelsFor('low', true)).toEqual([]);
  });

  it('frees on a move down only what the new tier never shows', () => {
    expect(modelsUnusedBy('high')).toEqual([]);
    expect(modelsUnusedBy('medium').sort()).toEqual([BOARD_HIGH_URL, SHOES_URL].sort());
    expect(modelsUnusedBy('low').sort()).toEqual([BOARD_HIGH_URL, BOARD_URL, GROUND_URL, SHOES_URL].sort());
    for (const q of ['high', 'medium'] as const) for (const url of modelsFor(q, true)) expect(modelsUnusedBy(q)).not.toContain(url);
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
});
