// What each part of the scene renders for the tier in use (ADR-15, ADR-16;
// audit fix 2026-11-04). Every selector reads the store's effectiveQuality,
// the same one the View panel shows, so a board or shoe model that failed to
// load sends the renderer, the board, the shoes and the ground to Low
// together, while the saved preference is kept for the next visit. A ground
// that fails alone only swaps in the plain plane (Pad's AssetBoundary does
// not report it), so it never lowers the tier.

import { effectiveQuality, type Quality, type TrickState } from '../store';
import { ART } from './artDirection';

type TierState = Pick<TrickState, 'quality' | 'boardAssetFailed'>;

/** The tier the Canvas runs: its key (antialias and powerPreference need a new context) and its ART.quality settings. */
export const sceneTier: (s: TierState) => Quality = effectiveQuality;

/** The renderer settings for the tier in use: DPR, antialias, power preference, shadows (High only; the disc otherwise). */
export const rendererFor = (s: TierState) => ART.quality[effectiveQuality(s)];

/** The shoe GLB on High only; the primitive shoe otherwise. */
export const shoesFromModel = (s: TierState) => effectiveQuality(s) === 'high';

/** The textured ground GLB on Medium and High; the plain plane on Low. */
export const groundTextured = (s: TierState) => effectiveQuality(s) !== 'low';
