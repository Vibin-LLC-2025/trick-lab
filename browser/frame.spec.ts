import { expect, test, type Page } from '@playwright/test';
import { open, type DebugWindow } from './helpers';

// The game's framing and its HUD (ADR-86). At 1440 x 900 on High, on the
// player's go at rest from Free, Filmer and Side: the board, both shoes and
// the head sit inside the part of the stage the cards leave clear, under no
// card, and the board is long on screen; the landing zones on the sliders
// show round the thumb.

test.use({ viewport: { width: 1440, height: 900 } });

type Box = { l: number; t: number; r: number; b: number };

/** The page boxes of the board, the shoes and the head (from the scene's own meshes and the head bone), the clear area, the covering cards and the board's length. */
const measure = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as DebugWindow;
    const r3f = w.__trickLab.get() as unknown as {
      camera: { position: { constructor: new (x?: number, y?: number, z?: number) => V } };
      gl: { domElement: HTMLCanvasElement };
      scene: { updateMatrixWorld: (f: boolean) => void; traverse: (f: (o: O) => void) => void };
    };
    type V = { x: number; y: number; z: number; clone: () => V; project: (c: unknown) => V; applyMatrix4: (m: unknown) => V; fromBufferAttribute: (a: unknown, i: number) => V };
    type O = { name: string; isMesh?: boolean; isBone?: boolean; visible: boolean; matrixWorld: unknown; geometry: { attributes: { position: { count: number } } }; localToWorld: (v: V) => V };
    const cam = r3f.camera;
    const Vec = cam.position.constructor;
    const canvas = r3f.gl.domElement.getBoundingClientRect();
    const boxes: Record<string, Box> = {};
    const add = (k: string, p: V) => {
      const n = p.project(cam);
      const x = canvas.left + ((n.x + 1) / 2) * canvas.width;
      const y = canvas.top + ((1 - n.y) / 2) * canvas.height;
      const b = (boxes[k] ??= { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity });
      b.l = Math.min(b.l, x);
      b.r = Math.max(b.r, x);
      b.t = Math.min(b.t, y);
      b.b = Math.max(b.b, y);
    };
    r3f.scene.updateMatrixWorld(true);
    let head: O | null = null;
    const deck: V[] = [];
    r3f.scene.traverse((o) => {
      if (o.isBone && o.name === 'head') head = o;
      const k = /^(Deck|Truck|Wheels)/.test(o.name) ? 'board' : /^Shoe/.test(o.name) ? 'shoes' : null;
      if (!k || !o.isMesh || !o.visible) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 3) {
        const v = new Vec().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (o.name === 'Deck_Wood') deck.push(v.clone());
        add(k, v);
      }
    });
    // The head: round the head bone, up to the beanie's crown 0.22 m along it.
    if (head)
      for (const [x, y, z] of [
        [0, 0.22, 0],
        [0.12, 0.1, 0],
        [-0.12, 0.1, 0],
        [0, 0.1, 0.12],
        [0, 0.1, -0.12],
      ])
        add('head', (head as O).localToWorld(new Vec(x, y, z)));
    // The deck's length: its two farthest vertices along its long axis, on the page.
    let length = 0;
    for (const a of deck.filter((_, i) => i % 7 === 0))
      for (const b of deck.filter((_, i) => i % 7 === 0)) {
        const pa = a.clone().project(cam);
        const pb = b.clone().project(cam);
        length = Math.max(length, Math.hypot(((pa.x - pb.x) / 2) * canvas.width, ((pa.y - pb.y) / 2) * canvas.height));
      }
    const s = w.__trickLabStore.getState();
    const stage = document.querySelector('.app__stage')!.getBoundingClientRect();
    const c = s.stageClear!;
    const clear = { l: stage.left + c.left * stage.width, r: stage.left + c.right * stage.width, t: stage.top + c.top * stage.height, b: stage.top + c.bottom * stage.height };
    const covers = [...document.querySelectorAll('[data-covers]')].map((e) => {
      const r = e.getBoundingClientRect();
      return { name: e.className, l: r.left, t: r.top, r: r.right, b: r.bottom };
    });
    return { boxes, clear, covers, length, measured: s.stageClear !== null };
  });

const inside = (b: Box, c: Box) => b.l >= c.l - 0.5 && b.r <= c.r + 0.5 && b.t >= c.t - 0.5 && b.b <= c.b + 0.5;
const overlaps = (b: Box, c: Box) => b.r > c.l && b.l < c.r && b.b > c.t && b.t < c.b;

test('the rider at rest is inside the clear part of the stage from Free, Filmer and Side, under no card, the board long (ADR-86)', async ({ page }) => {
  const errors = await open(page, 'high', 'skate', { 'skate-taught': 'yes', 'skate-auto': 'off', 'pop-mode': 'timed', theme: 'dark' });
  await page.evaluate(() => {
    const st = (window as unknown as DebugWindow).__trickLabStore;
    for (let i = 0; i < 40; i++) {
      st.getState().startSkate();
      if (st.getState().skate.phase === 'you-set') break;
      st.getState().quitSkate();
    }
    st.getState().continueSkate();
    st.getState().callSkateTrick('kickflip');
  });
  // The rider's model streams in on High.
  await page.waitForFunction(() => {
    let found = false;
    (window as unknown as DebugWindow).__trickLab.get().scene.traverse((o) => {
      if ((o as unknown as { isBone?: boolean }).isBone && o.name === 'head') found = true;
    });
    return found;
  });
  const floor = { free: 200, film: 205, side: 265 } as const;
  for (const view of ['free', 'film', 'side'] as const) {
    const before = await page.evaluate((v) => {
      const w = window as unknown as DebugWindow;
      const st = w.__trickLabStore.getState() as unknown as { gameView: string; setGameView: (v: string) => void };
      // The view already on screen (Free, the default) changes nothing and draws nothing new.
      const frames = st.gameView === v ? -1 : w.__trickLabPerf.frames;
      st.setGameView(v);
      return frames;
    }, view);
    // The view is measured once it is on screen: a frame drawn since a change
    // and none queued. Without a GPU a frame can take over a second, so a
    // fixed wait measured a camera halfway between two views. A timeout here
    // means the change asked for no frame at all, which is a fault of its own.
    await page.waitForFunction(
      (before) => {
        const w = window as unknown as DebugWindow;
        const r3f = w.__trickLab.get();
        return w.__trickLabPerf.frames > before && r3f.frameloop === 'demand' && r3f.internal.frames === 0;
      },
      before,
      { timeout: 30_000, polling: 'raf' },
    );
    const m = await measure(page);
    expect(m.measured).toBe(true);
    for (const part of ['board', 'shoes', 'head'] as const) {
      const b = m.boxes[part]!;
      expect(b, `${view}: the ${part}`).toBeDefined();
      expect(inside(b, m.clear), `${view}: the ${part} inside the clear part`).toBe(true);
      for (const card of m.covers) expect(overlaps(b, card), `${view}: the ${part} under ${card.name}`).toBe(false);
    }
    expect(m.length, `${view}: the board's length on the page`).toBeGreaterThan(floor[view]);
  }
  expect(errors).toEqual([]);
});

test('the landing zones show round the thumb: taller than it and at least 20 px wide (ADR-86)', async ({ page }) => {
  await open(page, 'low', 'skate', { 'skate-taught': 'yes', 'skate-auto': 'off', 'pop-mode': 'timed' });
  await page.evaluate(() => {
    const st = (window as unknown as DebugWindow).__trickLabStore;
    for (let i = 0; i < 40; i++) {
      st.getState().startSkate();
      if (st.getState().skate.phase === 'you-set') break;
      st.getState().quitSkate();
    }
    st.getState().continueSkate();
    st.getState().callSkateTrick('kickflip');
  });
  const zones = await page.evaluate(() =>
    [...document.querySelectorAll('.field__zone:not(.field__zone--clean)')].map((z) => {
      const r = z.getBoundingClientRect();
      const range = z.parentElement!.querySelector('input')!.getBoundingClientRect();
      return { w: r.width, h: r.height, mid: r.top + r.height / 2, track: range.top + range.height / 2 };
    }),
  );
  expect(zones.length).toBeGreaterThan(0);
  for (const z of zones) {
    expect(z.w).toBeGreaterThanOrEqual(20);
    // The mouse's thumb is 16 px: the band shows 6 px above and below it, centred on the track.
    expect(z.h).toBeGreaterThanOrEqual(28);
    expect(Math.abs(z.mid - z.track)).toBeLessThan(1);
  }
});
