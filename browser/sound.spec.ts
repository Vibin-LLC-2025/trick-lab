import { expect, test } from '@playwright/test';
import { open, popAndLand } from './helpers';

// The sounds (step 18, ADR-73). With sound off a visit downloads neither the
// player nor a single recording, even through a game; turned on, the player
// arrives, every recording downloads from this site and decodes, and nothing
// is logged as an error. Low, for speed: the sound is the same on every tier.

const SOUNDISH = /\/sounds\/|\/assets\/player-/;

test('with sound off, a visit downloads no sound file and not the player', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (SOUNDISH.test(r.url())) asked.push(r.url());
  });
  const errors = await open(page, 'low', 'skate', { 'skate-taught': 'yes', 'pop-mode': 'exact', 'skate-auto': 'off' });
  await page.getByRole('button', { name: 'Start game' }).click();
  // Enter on the coin flip's Continue (ADR-80), then Space pops.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await page.waitForTimeout(2000);
  expect(asked).toEqual([]);
  expect(errors).toEqual([]);
});

test('turned on, every recording downloads and decodes, and the sound check plays them', async ({ page }) => {
  const done: string[] = [];
  page.on('requestfinished', async (r) => {
    if (/\/sounds\/.*\.mp3$/.test(r.url()) && (await r.response())?.status() === 200) done.push(r.url().split('/').pop()!);
  });
  const errors = await open(page, 'low', 'lab');
  // The switch is in Settings (ADR-89).
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const sound = page.getByRole('button', { name: 'Sound', exact: true });
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  // The sound check (?debug) counts the takes the player has decoded.
  await expect(page.getByText('Recordings arrived: Pop 3 of 3, Catch 3 of 3, Landing 3 of 3, Bail 2 of 2.', { exact: false })).toBeVisible({ timeout: 15_000 });
  expect([...new Set(done)].sort()).toEqual(['bail-1.mp3', 'bail-2.mp3', 'catch-1.mp3', 'catch-2.mp3', 'catch-3.mp3', 'land-1.mp3', 'land-2.mp3', 'land-3.mp3', 'pop-1.mp3', 'pop-2.mp3', 'pop-3.mp3']);
  // Each take and each synthesized version plays without an error.
  const check = page.getByRole('region', { name: 'Sound check' });
  for (const b of await check.getByRole('button').all()) await b.click();
  // A trick with sound on: the pop, the catch, the landing.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('1');
  await popAndLand(page);
  expect(errors).toEqual([]);
});
