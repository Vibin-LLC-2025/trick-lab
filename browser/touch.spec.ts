import { expect, test, type Page } from '@playwright/test';
import { HASH, open, type Screen } from './helpers';

// Phones and touch (PLAN-PLAY-POLISH-REACH step 21). On a touch screen at a
// phone's and a tablet's sizes, on every screen and in a game: the page never
// scrolls sideways, every control on screen is big enough for a thumb (40 px
// or more each way; tokens.css sets 44 where the main pointer is a finger),
// and a tap pops. Low, for speed: the layout is the same on every tier.

const SIZES = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
] as const;

/** The page's width against the window's, and every visible control smaller than a thumb. */
const audit = (page: Page) =>
  page.evaluate(() => {
    const small: string[] = [];
    for (const el of document.querySelectorAll('button, a[href], input, select')) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden') continue;
      // The sound check is a debug panel (?debug), not part of the app a student sees.
      if (el.closest('[aria-labelledby="sound-check-heading"]')) continue;
      if (r.width < 40 || r.height < 40) small.push(`${(el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 30)} ${Math.round(r.width)} x ${Math.round(r.height)}`);
    }
    return { page: document.documentElement.scrollWidth, window: window.innerWidth, small };
  });

for (const size of SIZES)
  test.describe(`touch at ${size.width} x ${size.height}`, () => {
    test.use({ viewport: size, hasTouch: true });

    test('no sideways scroll and thumb-sized controls on every screen and in a game', async ({ page }) => {
      const errors = await open(page, 'low', 'home', { 'skate-taught': 'yes', 'skate-auto': 'off' });
      for (const screen of ['home', 'lab', 'skate'] as Screen[]) {
        await page.goto(`/?debug&nosw${HASH[screen]}`);
        await page.waitForTimeout(400);
        const a = await audit(page);
        expect(a.page, `${screen}: the page is as wide as the window`).toBeLessThanOrEqual(a.window);
        expect(a.small, `${screen}: controls smaller than a thumb`).toEqual([]);
      }
      // In a game: the cards, the tray and the leave dialog.
      await page.getByRole('button', { name: 'Start game' }).tap();
      // The coin flip waits over the stage (ADR-80): its Continue is thumb-sized too.
      const coin = await audit(page);
      expect(coin.small).toEqual([]);
      await page.getByRole('button', { name: /^Continue/ }).tap();
      const game = await audit(page);
      expect(game.page).toBeLessThanOrEqual(game.window);
      expect(game.small).toEqual([]);
      await page.getByRole('button', { name: 'Quit game' }).tap();
      const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog')).first();
      await expect(dialog).toBeVisible();
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      expect((await audit(page)).small).toEqual([]);
      expect(errors).toEqual([]);
    });
  });

test.describe('a tap pops', () => {
  test.use({ viewport: SIZES[0], hasTouch: true });

  test('in the lab, a tap on Pop starts the trick', async ({ page }) => {
    const errors = await open(page, 'low', 'lab');
    await page.locator('.playback .btn--primary').tap();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __trickLabStore: { getState: () => { status: string } } }).__trickLabStore.getState().status)).not.toBe('idle');
    expect(errors).toEqual([]);
  });
});
