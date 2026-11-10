import { expect, test, type Page } from '@playwright/test';
import { expectTier, open, type DebugWindow } from './helpers';

// The decks (step 16, ADR-71) on the tiers that draw them: a chosen deck's
// texture reaches the board's Graphic material, today's comes back without a
// download, and a deck that cannot be downloaded leaves the board as it was
// and puts the choice back, said in the live region.

/** The board's deck-bottom map, as the scene has it: the GLB's own is named, a deck's texture is not. */
const deckMap = (page: Page) =>
  page.evaluate(() => {
    let found: { name: string; width: number } | null = null;
    (window as unknown as DebugWindow).__trickLab.get().scene.traverse((o) => {
      const m = o.material as { map?: { name: string; image?: { width: number } } } | undefined;
      if (o.name === 'Deck_Graphic' && m?.map) found = { name: m.map.name, width: m.map.image?.width ?? 0 };
    });
    return found as { name: string; width: number } | null;
  });

const setDeck = (page: Page, deck: string) =>
  page.evaluate((d) => (window as unknown as DebugWindow).__trickLabStore.getState().setDeck(d), deck);

for (const [tier, width] of [['high', 2048], ['medium', 1024]] as const)
  test(`a chosen deck goes on the board, and a failed one leaves it on ${tier}`, async ({ page }) => {
    const errors = await open(page, tier, 'lab');
    await expectTier(page, tier);
    await expect.poll(() => deckMap(page)).toEqual({ name: 'deckBottom', width });
    const asked: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/models/decks/')) asked.push(r.url().replace(/^.*\/models\/decks\//, ''));
    });
    await setDeck(page, 'dusk');
    await expect.poll(() => deckMap(page)).toEqual({ name: '', width });
    expect(asked).toEqual([`deck-dusk-${tier}.ktx2`]);
    await setDeck(page, 'classic');
    await expect.poll(() => deckMap(page)).toEqual({ name: 'deckBottom', width });
    // Ripple cannot be downloaded: the board keeps today's, the choice goes back and the student is told.
    await page.route('**/models/decks/deck-ripple-*', (r) => r.abort());
    await setDeck(page, 'ripple');
    await expect.poll(() => page.evaluate(() => (window as unknown as DebugWindow).__trickLabStore.getState().deck)).toBe('classic');
    await expect(page.locator('[aria-live="polite"]').first()).toHaveText('The Ripple deck could not be downloaded. Keeping the Trick Lab deck.');
    expect(await deckMap(page)).toEqual({ name: 'deckBottom', width });
    // The blocked download is the one error: the browser's own line for it (it does not name the file).
    expect(errors).toEqual(['Failed to load resource: net::ERR_FAILED']);
  });
