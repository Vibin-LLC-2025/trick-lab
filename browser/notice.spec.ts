import { expect, test } from '@playwright/test';
import { open, type DebugWindow } from './helpers';

// Shortcuts opened during a game's instant replay (the 2026-11-13 review, C-07): opening it ends the replay, and
// closing it, by its Close button or by Escape, puts the go's notice up with focus on its Continue (ADR-80). Low, so
// the check runs as quickly as it can; the replay plays on every tier.

test.use({ viewport: { width: 1440, height: 900 } });

for (const how of ['Close', 'Escape'] as const)
  test(`closing Shortcuts by ${how} during a replay focuses the notice's Continue`, async ({ page }) => {
    const errors = await open(page, 'low', 'skate', { 'skate-taught': 'yes', 'skate-auto': 'off', 'pop-mode': 'exact', 'instant-replay': 'on' });
    await page.evaluate(() => {
      const st = (window as unknown as DebugWindow).__trickLabStore as unknown as {
        getState: () => { startSkate: () => void; quitSkate: () => void; continueSkate: () => void; callSkateTrick: (id: string) => void; skate: { phase: string } };
      };
      for (let i = 0; i < 40; i++) {
        st.getState().startSkate();
        if (st.getState().skate.phase === 'you-set') break;
        st.getState().quitSkate();
      }
      st.getState().continueSkate();
      st.getState().callSkateTrick('kickflip');
    });
    // An ollie for a kickflip: a miss, which is not replayed on its own since ADR-105; its notice offers Watch replay.
    await page.getByRole('button', { name: /^Pop/ }).click();
    await page.getByRole('button', { name: 'Watch replay' }).click({ timeout: 60_000 });
    await page.waitForFunction(() => (window as unknown as DebugWindow).__trickLabStore.getState().replay === 'plays', null, { timeout: 60_000 });
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toBeVisible();
    if (how === 'Close') await dialog.getByRole('button', { name: 'Close' }).click();
    else await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('skate-notice-continue');
    expect(errors).toEqual([]);
  });
