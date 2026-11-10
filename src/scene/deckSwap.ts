// The deck graphics on the board (step 16, ADR-71): swaps the board GLB's
// Graphic material map for a deck's own texture, and frees each texture
// exactly once. gltf.ts makes the one registry (it owns the model cache,
// rule 7) with its KTX2 loader; this file has no loader, so it is tested with
// a fake one.
import type { MeshStandardMaterial, Texture } from 'three';

/** How a request to show a deck ended. */
export type DeckShown = 'shown' | 'stale' | 'failed';

interface Slot {
  material: MeshStandardMaterial;
  /** The GLB's own deck bottom: put back for today's deck and before the model is freed. */
  original: Texture;
  /** Every deck texture asked for on this model, by URL. */
  alternates: Map<string, Promise<Texture>>;
  /** Goes up with each request, so a slow download that finishes late is not applied over a later choice. */
  request: number;
}

/** A deck texture matches the map it stands in for: orientation, colour space, wrapping, filtering, UV channel. */
function match(t: Texture, original: Texture) {
  t.flipY = original.flipY;
  t.colorSpace = original.colorSpace;
  t.wrapS = original.wrapS;
  t.wrapT = original.wrapT;
  t.magFilter = original.magFilter;
  t.minFilter = original.minFilter;
  t.anisotropy = original.anisotropy;
  t.channel = original.channel;
}

export function createDeckRegistry(load: (url: string) => Promise<Texture>) {
  /** Per board model URL. */
  const slots = new Map<string, Slot>();

  /**
   * Shows a deck on the model at `modelUrl` through its Graphic material:
   * `textureUrl` null puts back the GLB's own. A texture is downloaded once
   * per model and kept until the model is freed, so switching back is at
   * once. Resolves 'shown' once it is on the material, 'stale' if a later
   * request or a release came first, 'failed' if the download failed (the
   * material keeps what it had; a later ask tries again).
   */
  function show(modelUrl: string, material: MeshStandardMaterial, textureUrl: string | null): Promise<DeckShown> {
    let slot = slots.get(modelUrl);
    if (!slot || slot.material !== material) {
      if (!material.map) return Promise.resolve('failed');
      slot = { material, original: material.map, alternates: new Map(), request: 0 };
      slots.set(modelUrl, slot);
    }
    const s = slot;
    const request = ++s.request;
    const current = () => slots.get(modelUrl) === s && s.request === request;
    if (textureUrl === null) {
      s.material.map = s.original;
      return Promise.resolve('shown');
    }
    let p = s.alternates.get(textureUrl);
    if (!p) {
      p = load(textureUrl).then((t) => {
        match(t, s.original);
        return t;
      });
      s.alternates.set(textureUrl, p);
    }
    const asked = p;
    return asked.then(
      (t) => {
        if (!current()) return 'stale';
        s.material.map = t;
        return 'shown';
      },
      () => {
        if (s.alternates.get(textureUrl) === asked) s.alternates.delete(textureUrl);
        return current() ? 'failed' : 'stale';
      },
    );
  }

  /**
   * Before a model is freed (gltf.ts releaseLoaded): its own map goes back on
   * the material, so disposing the model frees it once, and every deck
   * texture loaded for it is freed once, including one still downloading.
   */
  function release(modelUrl: string) {
    const s = slots.get(modelUrl);
    if (!s) return;
    slots.delete(modelUrl);
    s.request++;
    s.material.map = s.original;
    for (const p of s.alternates.values())
      p.then(
        (t) => t.dispose(),
        () => {},
      );
    s.alternates.clear();
  }

  return { show, release };
}
