import { MeshStandardMaterial, SRGBColorSpace, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { createDeckRegistry } from './deckSwap';

/** A loader whose downloads the test finishes by hand, in any order, counting each texture's disposals. */
function fakeLoader() {
  const pending = new Map<string, { resolve: (t: Texture) => void; reject: (e: Error) => void }[]>();
  const made: Texture[] = [];
  const disposed = new Map<Texture, number>();
  const load = (url: string) =>
    new Promise<Texture>((resolve, reject) => {
      pending.set(url, [...(pending.get(url) ?? []), { resolve, reject }]);
    });
  const finish = async (url: string, ok = true) => {
    const waiting = pending.get(url)?.shift();
    if (!waiting) throw new Error(`nothing is downloading ${url}`);
    if (ok) {
      const t = new Texture();
      t.name = url;
      t.addEventListener('dispose', () => disposed.set(t, (disposed.get(t) ?? 0) + 1));
      made.push(t);
      waiting.resolve(t);
    } else waiting.reject(new Error(`${url}: 404`));
    // Let the registry's handlers run.
    await new Promise((r) => setTimeout(r, 0));
  };
  const asked = (url: string) => pending.get(url)?.length ?? 0;
  return { load, finish, asked, made, disposed };
}

function board() {
  const original = new Texture();
  original.name = 'own';
  original.flipY = false;
  original.colorSpace = SRGBColorSpace;
  original.anisotropy = 8;
  original.channel = 0;
  return { material: new MeshStandardMaterial({ map: original }), original };
}

const MODEL = 'models/board.glb';

describe('the deck swap (step 16, ADR-71)', () => {
  it('puts a downloaded deck on the board, matched to the map it replaces, and today\'s back without a download', async () => {
    const f = fakeLoader();
    const r = createDeckRegistry(f.load);
    const { material, original } = board();
    const shown = r.show(MODEL, material, 'dusk.ktx2');
    await f.finish('dusk.ktx2');
    expect(await shown).toBe('shown');
    const dusk = material.map!;
    expect(dusk.name).toBe('dusk.ktx2');
    expect([dusk.flipY, dusk.colorSpace, dusk.anisotropy]).toEqual([false, SRGBColorSpace, 8]);
    expect(await r.show(MODEL, material, null)).toBe('shown');
    expect(material.map).toBe(original);
    // Back to Dusk: from the cache, no second download.
    expect(await r.show(MODEL, material, 'dusk.ktx2')).toBe('shown');
    expect(f.asked('dusk.ktx2')).toBe(0);
    expect(material.map).toBe(dusk);
  });

  it('never applies a slow download over a later choice', async () => {
    const f = fakeLoader();
    const r = createDeckRegistry(f.load);
    const { material, original } = board();
    const first = r.show(MODEL, material, 'dusk.ktx2');
    const second = r.show(MODEL, material, 'bolt.ktx2');
    const third = r.show(MODEL, material, null);
    await f.finish('bolt.ktx2');
    await f.finish('dusk.ktx2');
    expect(await first).toBe('stale');
    expect(await second).toBe('stale');
    expect(await third).toBe('shown');
    expect(material.map).toBe(original);
    const last = r.show(MODEL, material, 'bolt.ktx2');
    const fourth = r.show(MODEL, material, 'dusk.ktx2');
    expect(await last).toBe('stale');
    expect(await fourth).toBe('shown');
    expect(material.map!.name).toBe('dusk.ktx2');
  });

  it('keeps the board as it was when a download fails, and tries again on the next ask', async () => {
    const f = fakeLoader();
    const r = createDeckRegistry(f.load);
    const { material, original } = board();
    const failed = r.show(MODEL, material, 'ripple.ktx2');
    await f.finish('ripple.ktx2', false);
    expect(await failed).toBe('failed');
    expect(material.map).toBe(original);
    const again = r.show(MODEL, material, 'ripple.ktx2');
    expect(f.asked('ripple.ktx2')).toBe(1);
    await f.finish('ripple.ktx2');
    expect(await again).toBe('shown');
  });

  it('frees every texture exactly once when the model goes, its own map back on, a download still running included', async () => {
    const f = fakeLoader();
    const r = createDeckRegistry(f.load);
    const { material, original } = board();
    const ownDisposed: number[] = [];
    original.addEventListener('dispose', () => ownDisposed.push(1));
    void r.show(MODEL, material, 'dusk.ktx2');
    await f.finish('dusk.ktx2');
    void r.show(MODEL, material, 'bolt.ktx2');
    const running = r.show(MODEL, material, 'circuit.ktx2');
    await f.finish('bolt.ktx2');
    r.release(MODEL);
    // The model's own map is on again, for the model's dispose to free; the registry does not free it.
    expect(material.map).toBe(original);
    expect(ownDisposed).toEqual([]);
    await f.finish('circuit.ktx2');
    expect(await running).toBe('stale');
    expect(material.map).toBe(original);
    expect(f.made).toHaveLength(3);
    for (const t of f.made) expect(f.disposed.get(t), t.name).toBe(1);
    // A second release, or one for a model never shown, frees nothing more.
    r.release(MODEL);
    r.release('models/board-high.glb');
    for (const t of f.made) expect(f.disposed.get(t), t.name).toBe(1);
  });

  it('starts afresh on a model loaded again after a tier change, with its own material', async () => {
    const f = fakeLoader();
    const r = createDeckRegistry(f.load);
    const a = board();
    void r.show(MODEL, a.material, 'dusk.ktx2');
    await f.finish('dusk.ktx2');
    r.release(MODEL);
    const b = board();
    const shown = r.show(MODEL, b.material, 'dusk.ktx2');
    // A new download for the new model: the old texture was freed with the old one.
    expect(f.asked('dusk.ktx2')).toBe(1);
    await f.finish('dusk.ktx2');
    expect(await shown).toBe('shown');
    expect(b.material.map!.name).toBe('dusk.ktx2');
    expect(a.material.map).toBe(a.original);
    r.release(MODEL);
    expect(b.material.map).toBe(b.original);
    await new Promise((r) => setTimeout(r, 0));
    for (const t of f.made) expect(f.disposed.get(t)).toBe(1);
  });
});
