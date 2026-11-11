import { useLayoutEffect } from 'react';
import { clearArea, useTrickStore, type Cover, type CoverSide } from '../store';

/** app.css's wide game layout, where the game's cards and tray are over the stage (ADR-66). Must match its media query. */
export const HUD_WIDE = '(min-width: 961px)';

const SIDES: readonly CoverSide[] = ['left', 'right', 'bottom'];

/**
 * Measures the part of the stage the game's cards and tray leave uncovered
 * (ADR-86) and gives it to the store (setStageClear), which the cameras frame
 * in. Every element that can sit over the stage says from which side it cuts
 * with `data-covers` (left, right or bottom). On a wide screen every one of
 * them is over the stage; where the panels stack under it (a phone) only the
 * ones laid over it (positioned absolute or fixed: the turn chip, the pinned
 * Pop) count, since the rest scroll under the pinned stage. Measured again
 * when the stage or a cover changes size and when a cover comes or goes
 * (a game starting or ending), never per frame; the store ignores a
 * measurement that has not changed. Off the game screen, or with no layout
 * to measure (tests), the store holds none and the cameras frame the whole
 * stage.
 */
export function useStageClear() {
  const game = useTrickStore((s) => s.screen === 'skate');
  const setStageClear = useTrickStore((s) => s.setStageClear);
  useLayoutEffect(() => {
    const stage = document.querySelector<HTMLElement>('.app__stage');
    const app = stage?.closest<HTMLElement>('.app');
    if (!game || !stage || !app || typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') {
      setStageClear(null);
      return;
    }
    const wide = window.matchMedia(HUD_WIDE);
    let watched: HTMLElement[] = [];
    const measure = () => {
      const covers: Cover[] = [];
      for (const el of app.querySelectorAll<HTMLElement>('[data-covers]')) {
        const side = el.dataset.covers as CoverSide;
        if (!SIDES.includes(side)) continue;
        if (!wide.matches && !['absolute', 'fixed'].includes(getComputedStyle(el).position)) continue;
        covers.push({ side, rect: el.getBoundingClientRect() });
      }
      setStageClear(clearArea(stage.getBoundingClientRect(), covers));
    };
    const sizes = new ResizeObserver(measure);
    const watch = () => {
      for (const el of watched) sizes.unobserve(el);
      watched = [stage, ...app.querySelectorAll<HTMLElement>('[data-covers]')];
      for (const el of watched) sizes.observe(el);
      measure();
    };
    // A cover coming or going: the tray as a game starts, the result card as it ends.
    const children = new MutationObserver(watch);
    children.observe(app, { childList: true, subtree: true });
    wide.addEventListener('change', measure);
    watch();
    return () => {
      sizes.disconnect();
      children.disconnect();
      wide.removeEventListener('change', measure);
      setStageClear(null);
    };
  }, [game, setStageClear]);
}
