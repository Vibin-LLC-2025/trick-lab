import { expect, test, type Page } from '@playwright/test';
import { drawCalls, expectTier, GATE, LEDGER, open, popAndLand, TIERS, type DebugWindow } from './helpers';

// The draw-call caps (ADR-62): every switch combination, on the welcome
// screen at rest, on the game screen at rest (with the skate spot, ADR-69)
// and in the lab over a 360 flip, fits the tier's cap and its
// expected worst case (LEDGER). The switches are the store's own actions, as the View
// panel's switches call them; none of them remounts the Canvas.

type Switches = { feet: boolean; legs: boolean; trails: boolean; cues: boolean };
const KEYS = { feet: ['feetVisible', 'toggleFeet'], legs: ['legsVisible', 'toggleLegs'], trails: ['footPathsVisible', 'toggleFootPaths'], cues: ['motionCuesVisible', 'toggleMotionCues'] } as const;

/** Every combination; the legs show only with the feet, so feet off is one. Feet on first: the shoes load once. */
const COMBOS: Switches[] = [];
for (const legs of [false, true]) for (const trails of [false, true]) for (const cues of [false, true]) COMBOS.push({ feet: true, legs, trails, cues });
for (const trails of [false, true]) for (const cues of [false, true]) COMBOS.push({ feet: false, legs: false, trails, cues });

const name = (c: Switches) => (Object.keys(c) as (keyof Switches)[]).filter((k) => c[k]).join('+') || 'none';

async function setSwitches(page: Page, c: Switches) {
  await page.evaluate(
    ([c, keys]) => {
      const store = (window as unknown as DebugWindow).__trickLabStore;
      for (const [k, [flag, toggle]] of Object.entries(keys)) {
        const s = store.getState() as unknown as Record<string, unknown>;
        if (s[flag] !== c[k as keyof typeof c]) (s[toggle] as () => void)();
      }
    },
    [c, KEYS] as const,
  );
  // Whatever the switch mounted (the shoes from the model cache) is on screen within a few frames.
  await page.waitForTimeout(300);
}

for (const tier of TIERS)
  test(`every switch combination fits the ledger on ${tier}`, async ({ page }) => {
    test.setTimeout(240_000);
    // Exact pops in the game, so a Space press pops there as in the lab (the timing bar draws nothing in the scene).
    const errors = await open(page, tier, 'lab', { 'skate-taught': 'yes', 'pop-mode': 'exact', 'skate-auto': 'off' });
    await expectTier(page, tier);
    const seen: Record<string, number> = {};
    // The lab, over a 360 flip (preset 7).
    await page.keyboard.press('7');
    for (const c of COMBOS) {
      await setSwitches(page, c);
      const rest = await drawCalls(page);
      const { calls } = await popAndLand(page);
      seen[`lab/${name(c)}`] = Math.max(rest, calls);
    }
    // The game screen, with the skate spot (ADR-69) on Medium and High, at
    // rest and over a 360 flip of the player's: once the spot's model has
    // arrived (the count stops moving), every combination.
    await page.evaluate(() => (window as unknown as DebugWindow).__trickLabStore.getState().setScreen('skate'));
    const settled = async () => {
      const before = await drawCalls(page);
      await page.waitForTimeout(400);
      return (await drawCalls(page)) === before;
    };
    await expect.poll(settled, { timeout: 20_000 }).toBe(true);
    for (const c of COMBOS) {
      await setSwitches(page, c);
      const rest = await drawCalls(page);
      await page.evaluate(() => {
        const st = (window as unknown as DebugWindow).__trickLabStore;
        // A fresh game each time, with the player up first.
        st.getState().startSkate();
        for (let i = 0; i < 50 && st.getState().skate.first !== 'you'; i++) st.getState().startSkate();
        st.getState().callSkateTrick('360-flip');
      });
      const { calls } = await popAndLand(page);
      seen[`skate/${name(c)}`] = Math.max(rest, calls);
    }
    // The welcome screen at rest (its preview has no trails or cues).
    await page.evaluate(() => (window as unknown as DebugWindow).__trickLabStore.getState().setScreen('home'));
    for (const c of COMBOS.filter((c) => !c.trails && !c.cues)) {
      await setSwitches(page, c);
      seen[`home/${name(c)}`] = await drawCalls(page);
    }
    test.info().annotations.push({ type: 'draw calls', description: JSON.stringify(seen) });
    const most = Math.max(...Object.values(seen));
    expect(most, JSON.stringify(seen)).toBeLessThan(GATE[tier]);
    expect(most, JSON.stringify(seen)).toBeLessThanOrEqual(LEDGER[tier]);
    // Every switch on reaches the ledger's number: the count saw the full scene.
    expect(Math.max(seen['lab/feet+legs+trails+cues']!, seen['skate/feet+legs+trails+cues']!)).toBe(LEDGER[tier]);
    expect(errors).toEqual([]);
  });
