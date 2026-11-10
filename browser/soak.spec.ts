import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { expectTier, gameGo, open, popAndLand, waitReady, type DebugWindow, type Tier } from './helpers';

// The soak test (ROADMAP "later" item 9, PLAN-PLAY-POLISH-REACH step 5): five
// warm-up tricks on High, then 50 tricks in blocks of ten, switching between
// High and Low before each block after the first, so the blocks run High,
// Low, High, Low, High. Each switch remounts the Canvas (it is keyed on the
// tier) and frees the models Low never shows after RELEASE_AFTER_MS (ADR-48).
//
// Since step 20 half of every block is a game (PLAN-PLAY-POLISH-REACH): five
// tricks in the lab, then five goes of a game of SKATE on the game screen,
// with the roll, the landings' motion, the dust, the skate spot, the
// computer's own deck and the instant replay, then back to the lab, where
// the sample is taken. So what a game loads and swaps must be back to the
// lab's counts each time, too.
//
// When a sample is taken: after the warm-up, and at the end of each block,
// which is after the switch's new root was ready, after RELEASE_AFTER_MS and
// two frames more, then after two garbage collections. At the end of the
// block, not straight after the switch: the motion cues' geometry is uploaded
// only once drawn, and a landed flight hides the cues, so a root fresh from a
// switch counts one geometry fewer until its first pop (found 2026-11-09).
//
// The hard check is the count of geometries and textures: at a tier they must
// equal that tier's first sample, exactly. That is what a leaked model, map
// or shared resource moves, and it cannot fail by chance. The heap gets a
// loose limit only (HEAP_GROWTH_MAX, first High sample to last): it moves with
// the JIT and the machine, so it catches a large leak, not a small one.

/** modelCache.ts RELEASE_AFTER_MS. */
const RELEASE_AFTER_MS = 1000;

/**
 * The heap may grow this much over the soak: about twice what hand-run soaks
 * measured (2.07 to 2.08 MB with the leak fixed, 2.44 MB with the leak,
 * 2026-11-09, docs/PERF-BUDGET.md, step 5), since CI machines are slower and
 * noisier. About 1 MB of the growth is V8's compiled code warming up over
 * four tier changes, and the event log keeps every trick by design (ADR-7).
 * Loose on purpose: the counts above are the hard check.
 */
const HEAP_GROWTH_MAX = 4 * 1024 * 1024;

type Sample = { tier: Tier; geometries: number; textures: number; heap: number; objects: number };

/**
 * The heap without V8's compiled code, from a heap snapshot: what the page's
 * own objects, strings and arrays hold. Compiled code keeps growing as the JIT
 * warms up over a long session (about 1 MB over four tier changes, measured
 * 2026-11-09), so the total alone cannot tell a small leak from warming up.
 */
async function objectHeap(cdp: CDPSession): Promise<number> {
  const chunks: string[] = [];
  const onChunk = (e: { chunk: string }) => chunks.push(e.chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
  const snap = JSON.parse(chunks.join('')) as { snapshot: { meta: { node_fields: string[]; node_types: [string[]] } }; nodes: number[] };
  const fields = snap.snapshot.meta.node_fields;
  const types = snap.snapshot.meta.node_types[0];
  const n = fields.length;
  const iType = fields.indexOf('type');
  const iSize = fields.indexOf('self_size');
  let bytes = 0;
  for (let i = 0; i < snap.nodes.length; i += n) if (types[snap.nodes[i + iType]!] !== 'code') bytes += snap.nodes[i + iSize]!;
  return bytes;
}

async function sample(page: Page, cdp: CDPSession, tier: Tier): Promise<Sample> {
  await page.waitForTimeout(RELEASE_AFTER_MS);
  const counts = await page.evaluate(async () => {
    const w = window as unknown as DebugWindow;
    for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(r));
    w.gc?.();
    w.gc?.();
    return w.__trickLab.get().gl.info.memory;
  });
  // The page's own heap reading is rounded; the protocol's is exact.
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return { tier, geometries: counts.geometries, textures: counts.textures, heap: usedSize, objects: await objectHeap(cdp) };
}

async function switchTo(page: Page, tier: Tier) {
  const root = await page.evaluate(() => (window as unknown as DebugWindow).__trickLabPerf.root);
  await page.evaluate((tier) => (window as unknown as DebugWindow).__trickLabStore.getState().setQuality(tier), tier);
  await waitReady(page, root);
  await expectTier(page, tier);
}

/** Five tricks in the lab, then five goes of a game, then the lab again. `from` numbers the goes, so sets land and bail in turn. */
async function block(page: Page, from: number) {
  const seen: Record<string, number> = {};
  for (let i = 0; i < 5; i++) await popAndLand(page);
  await page.evaluate(() => (window as unknown as DebugWindow).__trickLabStore.getState().setScreen('skate'));
  for (let i = 0; i < 5; i++) {
    const grade = await gameGo(page, from + i);
    if (grade) seen[grade] = (seen[grade] ?? 0) + 1;
  }
  await page.evaluate(() => (window as unknown as DebugWindow).__trickLabStore.getState().setScreen('lab'));
  await page.keyboard.press('1');
  return seen;
}

test('50 tricks, half of them in a game, switching High and Low keep the memory flat', { tag: '@soak' }, async ({ page }) => {
  // A guard against a hang, not a speed check: a game's go on High without a GPU takes several seconds (the roll-out, the replay).
  test.setTimeout(1_200_000);
  const errors = await open(page, 'high', 'lab', { 'skate-taught': 'yes', 'pop-mode': 'exact', 'skate-auto': 'off' });
  await expectTier(page, 'high');
  expect(await page.evaluate(() => typeof (window as unknown as DebugWindow).gc)).toBe('function');
  const cdp = await page.context().newCDPSession(page);
  await page.keyboard.press('1');
  // The warm-up visits the game too, so the first sample has seen everything a block shows.
  const grades: Record<string, number> = {};
  const tally = (seen: Record<string, number>) => {
    for (const [k, v] of Object.entries(seen)) grades[k] = (grades[k] ?? 0) + v;
  };
  tally(await block(page, 0));
  const samples: Sample[] = [await sample(page, cdp, 'high')];
  const blocks: Tier[] = ['high', 'low', 'high', 'low', 'high'];
  for (const [b, tier] of blocks.entries()) {
    if (b > 0) await switchTo(page, tier);
    tally(await block(page, 5 * (b + 1)));
    samples.push(await sample(page, cdp, tier));
  }
  test.info().annotations.push({ type: 'samples', description: JSON.stringify(samples) });
  for (const t of ['high', 'low'] as const) {
    const at = samples.filter((s) => s.tier === t);
    for (const s of at) expect({ geometries: s.geometries, textures: s.textures }, JSON.stringify(samples)).toEqual({ geometries: at[0]!.geometries, textures: at[0]!.textures });
  }
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  // In the run's own output, so a CI log shows how close to the limit it ran.
  const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;
  console.log(
    `long run: heap grew ${kb(last.heap - first.heap)} (limit ${kb(HEAP_GROWTH_MAX)}), without compiled code ${kb(last.objects - first.objects)}; ` +
      samples.map((s) => `${s.tier} ${s.geometries} geometries ${s.textures} textures`).join(', '),
  );
  // The games really had landings and bails in them.
  expect(grades.bail ?? 0, JSON.stringify(grades)).toBeGreaterThan(0);
  expect((grades.clean ?? 0) + (grades.sketchy ?? 0), JSON.stringify(grades)).toBeGreaterThan(0);
  expect([first.tier, last.tier]).toEqual(['high', 'high']);
  expect(last.heap - first.heap, JSON.stringify(samples)).toBeLessThan(HEAP_GROWTH_MAX);
  expect(errors).toEqual([]);
});
