import { expect, test } from '@playwright/test';
import { expectTier, open, TIERS, type Screen } from './helpers';

// Every screen loads on every tier, on the renderer the tier must run, with no console errors.
const SCREENS: readonly Screen[] = ['home', 'lab', 'skate'];

for (const tier of TIERS)
  for (const screen of SCREENS)
    test(`${screen} on ${tier}`, async ({ page }) => {
      const errors = await open(page, tier, screen);
      await expectTier(page, tier);
      await expect(page.locator('#screen-heading')).toBeVisible();
      // A few frames more, for anything that fails after the first.
      await page.waitForTimeout(500);
      expect(errors).toEqual([]);
    });
