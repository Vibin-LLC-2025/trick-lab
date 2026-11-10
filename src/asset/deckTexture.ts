// A deck texture's size per board level (step 16, ADR-71), for the build and
// the checks. Apart from deckSpec.ts, which the first page download carries,
// so the board spec stays out of it.
import { TEXTURES, TEXTURES_HIGH, type DetailLevel } from './spec';

/** The texture a deck swaps in on a board level: the same size as that GLB's deck bottom. */
export const deckTexture = (level: DetailLevel) => (level === 'high' ? TEXTURES_HIGH.deckBottom : TEXTURES.deckBottom);
