import { expect, test } from '@playwright/test';
import { expectTier, GAME_CHECK_RATE, open, popAndLand, TIERS, type DebugWindow } from './helpers';

// The frames a landing draws (CLAUDE.md rule 4, PERF-BUDGET.md): read from the
// store, not the frameloop. From the frame that drew the landing to the point
// where R3F reports no pending frame, at most the one frame the landing's own
// write queued; after that point, none.
for (const tier of TIERS)
  test(`a landing stops drawing on ${tier}`, async ({ page }) => {
    const errors = await open(page, tier, 'lab');
    await expectTier(page, tier);
    await page.keyboard.press('1');
    // One untimed trick first: the first one compiles what a flight draws.
    await popAndLand(page);
    for (let i = 0; i < 3; i++) {
      const l = await popAndLand(page, 1500);
      expect(l.dropped).toBe(false);
      expect(l.toIdle).toBeLessThanOrEqual(1);
      expect(l.afterIdle).toBe(0);
    }
    expect(errors).toEqual([]);
  });

// A game's landing (step 13, ADR-68): the board rolls on, rocks or falls and
// slides, a made trick replays (ADR-72), then everything comes to rest, and from one second after rest no
// frame is drawn for the next two (the plan's frame rule).
for (const tier of TIERS)
  test(`a game's landing comes to rest and stops drawing on ${tier}`, async ({ page }) => {
    const errors = await open(page, tier, 'skate', { 'skate-taught': 'yes', 'pop-mode': 'exact', 'skate-auto': 'off' });
    await expectTier(page, tier);
    for (const flick of [2.0, 1.1]) {
      await page.evaluate(([flick, rate]) => {
        const st = (window as unknown as DebugWindow).__trickLabStore;
        st.getState().setRate(rate);
        // A fresh game each time, with the player up first.
        st.getState().startSkate();
        for (let i = 0; i < 50 && st.getState().skate.first !== 'you'; i++) st.getState().startSkate();
        // Past the coin flip (ADR-80).
        st.getState().continueSkate();
        st.getState().callSkateTrick('kickflip');
        st.getState().setInput('flick', flick);
      }, [flick, GAME_CHECK_RATE] as const);
      await page.keyboard.press('Space');
      const grade = await page.evaluate(async () => {
        const w = window as unknown as DebugWindow;
        const raf = () => new Promise((r) => requestAnimationFrame(r));
        const t0 = performance.now();
        const rested = () => {
          const s = w.__trickLabStore.getState();
          // A made trick's instant replay (ADR-72) plays once the board stops: rest is after it too.
          return s.status === 'done' && s.roll === 'still' && s.landing !== 'plays' && s.replay === 'none';
        };
        while (!rested()) {
          // A guard against a hang, not a speed check: without a GPU, High draws a frame in 0.1 to 0.6 s, and the
          // replay adds about 20 frames after the roll stops (ADR-72). Frame times are measured on real hardware.
          if (performance.now() - t0 > 40_000) { const s = w.__trickLabStore.getState(); throw new Error(`the landing never came to rest: ${s.status}, ${s.roll}, ${s.landing}, ${s.replay}`); }
          await raf();
        }
        return w.__trickLabStore.getState().result!.grade;
      });
      expect(grade).toBe(flick === 2.0 ? 'sketchy' : 'bail');
      await page.waitForTimeout(1000);
      const before = await page.evaluate(() => (window as unknown as DebugWindow).__trickLabPerf.frames);
      await page.waitForTimeout(2000);
      const after = await page.evaluate(() => (window as unknown as DebugWindow).__trickLabPerf.frames);
      expect(after - before, `${tier}, flick ${flick}`).toBe(0);
    }
    expect(errors).toEqual([]);
  });
