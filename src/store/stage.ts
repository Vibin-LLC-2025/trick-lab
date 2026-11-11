// The part of the stage nothing covers (ADR-86, 2026-11-11). On the game
// screen the cards in the top corners and the tray along the bottom sit over
// the 3D view (ADR-66); the cameras frame their subject inside what is left.
// The page measures it (ui/useStageClear.ts) and gives it to the store with
// one action, setStageClear; the scene reads it (SceneCamera). Pure layout
// arithmetic here: no React, no DOM, no three.

/** A rectangle in page pixels, as getBoundingClientRect gives it. */
export interface PageRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The clear part of the stage as fractions of the stage's own width and
 * height, 0 to 1 from its top left: `left` < `right`, `top` < `bottom`.
 */
export interface ClearArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The whole stage: nothing over it (the lab, the welcome screen, tests, and before the first measurement). */
export const FULL_STAGE: ClearArea = { left: 0, top: 0, right: 1, bottom: 1 };

/** Where an element over the stage sits, so the side it is cut from never depends on its height or its text. */
export type CoverSide = 'left' | 'right' | 'bottom';

export interface Cover {
  side: CoverSide;
  rect: PageRect;
}

/**
 * How little of the stage may be left on either axis: a layout that covers
 * more than this (a stage far narrower than the layout ever makes) falls back
 * to the whole stage rather than squeezing the picture into a sliver.
 */
export const MIN_CLEAR = 0.2;

/** Clear space kept between the subject's rectangle and a card, in page pixels. */
export const CLEAR_GAP = 8;

const round = (n: number) => Math.round(n * 10000) / 10000;

/**
 * The clear area of `stage` with `covers` over it. A card on the left moves
 * the clear area's left edge to its right edge plus the gap, one on the right
 * moves its right edge, one along the bottom moves its bottom edge up. A
 * cover that does not overlap the stage cuts nothing. Each cut is by its side
 * only, never by its height, so a card that grows (a walk-through, a longer
 * line) never moves the picture; the bottom tray is the one cover whose
 * height counts. Rounded to 1/10000 so a sub-pixel wobble is no change.
 */
export function clearArea(stage: PageRect, covers: readonly Cover[]): ClearArea {
  const w = stage.right - stage.left;
  const h = stage.bottom - stage.top;
  if (!(w > 0 && h > 0)) return FULL_STAGE;
  let left = stage.left;
  let right = stage.right;
  let bottom = stage.bottom;
  for (const { side, rect } of covers) {
    const overlaps = rect.right > stage.left && rect.left < stage.right && rect.bottom > stage.top && rect.top < stage.bottom && rect.right > rect.left && rect.bottom > rect.top;
    if (!overlaps) continue;
    if (side === 'left') left = Math.max(left, rect.right + CLEAR_GAP);
    else if (side === 'right') right = Math.min(right, rect.left - CLEAR_GAP);
    else bottom = Math.min(bottom, rect.top - CLEAR_GAP);
  }
  const area = { left: round((left - stage.left) / w), top: 0, right: round((right - stage.left) / w), bottom: round((bottom - stage.top) / h) };
  if (area.right - area.left < MIN_CLEAR || area.bottom - area.top < MIN_CLEAR) return FULL_STAGE;
  return area;
}

/** The same area: no change for the store. */
export const sameArea = (a: ClearArea | null, b: ClearArea | null) =>
  a === b || (a !== null && b !== null && a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom);
