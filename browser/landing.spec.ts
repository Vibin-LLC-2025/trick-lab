import { expect, test } from '@playwright/test';
import { expectTier, open, popAndLand, TIERS } from './helpers';

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
