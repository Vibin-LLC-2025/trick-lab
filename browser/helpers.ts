// Shared by the browser checks (PLAN-PLAY-POLISH-REACH step 5, `npm run test:browser`).
// They run against a production build served by scripts/measure/serve.ts, in
// Chromium with SwiftShader (no GPU), and read the app through `?debug`:
// the R3F root (`window.__trickLab`), PerfProbe's numbers (`__trickLabPerf`,
// with the root's number and its `ready` flag, rootReadiness.ts) and the store
// (`__trickLabStore`). `?nosw` keeps a service worker out of every run.
import { expect, type Page } from '@playwright/test';

export type Tier = 'high' | 'medium' | 'low';
export type Screen = 'home' | 'lab' | 'skate';
export const TIERS: readonly Tier[] = ['high', 'medium', 'low'];
export const HASH: Record<Screen, string> = { home: '', lab: '#/lab', skate: '#/skate' };

/**
 * The draw-call caps (strict: under 60 on High, under 40 on Medium, under 20
 * on Low, ADR-62) and the expected worst case per tier with every switch on
 * (PLAN-PLAY-POLISH-REACH, "Performance targets"). The expected number moves
 * only with a step that adds or removes a draw, in that step's commit.
 */
export const GATE: Record<Tier, number> = { high: 60, medium: 40, low: 20 };
export const LEDGER: Record<Tier, number> = { high: 34, medium: 19, low: 12 };

/** The R3F root, PerfProbe's numbers and the store, as the checks read them. */
interface Debug {
  __trickLab: { get: () => R3F };
  __trickLabPerf: { frames: number; drawCalls: number; root: number; ready: boolean };
  __trickLabStore: { getState: () => Store; subscribe: (fn: (s: Store, prev: Store) => void) => () => void };
}
interface R3F {
  frameloop: string;
  internal: { frames: number };
  invalidate: () => void;
  gl: { isWebGPURenderer?: boolean; backend?: { isWebGPUBackend?: boolean }; info: { memory: { geometries: number; textures: number } } };
}
interface Store {
  status: string;
  quality: Tier;
  boardAssetFailed: boolean;
  sceneUnavailable: boolean;
  setQuality: (q: Tier) => void;
  setScreen: (s: Screen) => void;
  /** The game (a game's landing, ADR-68). */
  skate: { first: 'you' | 'computer' | null; phase: string };
  startSkate: () => void;
  callSkateTrick: (id: string) => void;
  setInput: (key: 'pop' | 'flick' | 'scoop', value: number) => void;
  roll: 'still' | 'push' | 'slow';
  landing: 'none' | 'plays' | 'over';
  result: { grade: 'clean' | 'sketchy' | 'bail' } | null;
}
export type DebugWindow = Window & Debug & { gc?: () => void };

/** Prefs in localStorage before the app starts (keys without the `trick-lab.` prefix). */
export type Prefs = Record<string, string>;

/**
 * Loads a screen on a tier with these prefs: storage cleared and set before
 * the app runs, WebGPU hidden (CI has no adapter, so every run checks the
 * same WebGL2 backend), and the page waits until the Canvas is ready.
 * Returns the console errors collected from then on.
 */
export async function open(page: Page, tier: Tier, screen: Screen, prefs: Prefs = {}) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(
    ([tier, prefs]) => {
      // Once per page: a reload keeps what the app saved since.
      if (sessionStorage.getItem('browser-check')) return;
      sessionStorage.setItem('browser-check', '1');
      localStorage.clear();
      localStorage.setItem('trick-lab.quality', tier);
      for (const [k, v] of Object.entries(prefs)) localStorage.setItem(`trick-lab.${k}`, v);
    },
    [tier, prefs] as const,
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
  });
  await page.goto(`/?debug&nosw${HASH[screen]}`);
  await waitReady(page);
  return errors;
}

/** Waits until the Canvas drawing now (a newer root than `after`, if given) has finished starting up. */
export async function waitReady(page: Page, after = 0) {
  await page.waitForFunction(
    (after) => {
      const w = window as unknown as DebugWindow;
      return !!w.__trickLabPerf && w.__trickLabPerf.root > after && w.__trickLabPerf.ready;
    },
    after,
    { timeout: 90_000 },
  );
}

/** The renderer the Canvas runs: WebGL (WebGLRenderer), or the WebGPURenderer on its WebGPU or WebGL2 backend. */
export const rendererOf = (page: Page) =>
  page.evaluate(() => {
    const gl = (window as unknown as DebugWindow).__trickLab.get().gl;
    return gl.isWebGPURenderer ? (gl.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGPU on WebGL2') : 'WebGL';
  });

/** What each tier must run on in these checks: a fallback cannot pass as High. */
export const RENDERER: Record<Tier, string> = { high: 'WebGPU on WebGL2', medium: 'WebGPU on WebGL2', low: 'WebGL' };

/** The store's tier and whether anything fell back. */
export const storeState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as DebugWindow).__trickLabStore.getState();
    return { quality: s.quality, boardAssetFailed: s.boardAssetFailed, sceneUnavailable: s.sceneUnavailable };
  });

/** Asserts the page is on `tier` with its renderer and nothing fell back. */
export async function expectTier(page: Page, tier: Tier) {
  expect(await storeState(page)).toEqual({ quality: tier, boardAssetFailed: false, sceneUnavailable: false });
  expect(await rendererOf(page)).toBe(RENDERER[tier]);
}

/** The most draw calls over `ms` of frames, after a forced one. */
export const drawCalls = (page: Page, ms = 500) =>
  page.evaluate(async (ms) => {
    const w = window as unknown as DebugWindow;
    w.__trickLab.get().invalidate();
    let calls = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      await new Promise((r) => requestAnimationFrame(r));
      calls = Math.max(calls, w.__trickLabPerf.drawCalls);
    }
    return calls;
  }, ms);

/**
 * Pops (a real Space press) and waits for the landing by the store. With a
 * window, returns the landing's frames: from the frame that drew the landing
 * to the point where R3F reports no pending frame (the frameloop is demand and
 * nothing is queued), and after that point over the window. Null if the Canvas
 * remounted meanwhile (a sample on another root is dropped).
 */
export async function popAndLand(page: Page, windowMs = 0) {
  await page.evaluate(() => {
    const w = window as unknown as DebugWindow & { __landing?: { root: number; endpoint: number | null; stop: () => void; calls: number } };
    const perf = w.__trickLabPerf;
    const l = (w.__landing = { root: perf.root, endpoint: null as number | null, stop: () => {}, calls: 0 });
    l.stop = w.__trickLabStore.subscribe((s, prev) => {
      // The landing's write runs inside FlightDriver's frame, before PerfProbe draws it: that frame is the endpoint.
      if (l.endpoint === null && prev.status === 'playing' && s.status !== 'playing') l.endpoint = perf.frames + 1;
    });
    // The most draw calls while the flight plays.
    const watch = () => {
      l.calls = Math.max(l.calls, perf.drawCalls);
      if (l.endpoint === null) requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  await page.keyboard.press('Space');
  return page.evaluate(async (windowMs) => {
    const w = window as unknown as DebugWindow & { __landing: { root: number; endpoint: number | null; stop: () => void; calls: number } };
    const l = w.__landing;
    const perf = w.__trickLabPerf;
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const until = async (test: () => boolean, ms: number) => {
      const t0 = performance.now();
      while (!test()) {
        if (performance.now() - t0 > ms) throw new Error('timed out waiting for the landing');
        await raf();
      }
    };
    try {
      await until(() => l.endpoint !== null, 30_000);
    } finally {
      l.stop();
    }
    const endpoint = l.endpoint!;
    if (!windowMs) return { calls: l.calls, toIdle: null, afterIdle: null, dropped: false };
    await until(() => {
      const s = w.__trickLab.get();
      return s.frameloop === 'demand' && s.internal.frames === 0 && perf.frames >= endpoint;
    }, 10_000);
    const atIdle = perf.frames;
    const t0 = performance.now();
    while (performance.now() - t0 < windowMs) await raf();
    if (perf.root !== l.root) return { calls: l.calls, toIdle: null, afterIdle: null, dropped: true };
    return { calls: l.calls, toIdle: atIdle - endpoint, afterIdle: perf.frames - atIdle, dropped: false };
  }, windowMs);
}
