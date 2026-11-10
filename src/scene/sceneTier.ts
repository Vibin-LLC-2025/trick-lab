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

/** The post-processing the tier runs (ADR-51): occlusion and the grade on Medium, those plus motion blur and the glow on High, none on Low. */
export const effectsFor = (s: TierState) => ART.post.tiers[effectiveQuality(s)];

type BlurState = TierState & Pick<TrickState, 'motionBlur' | 'status' | 'rate' | 'reducedMotion'>;

/**
 * Motion blur runs (ADR-51) only where it shows speed: on a tier that has it,
 * with the switch on, while a trick plays at normal speed. Off in slow motion
 * (the point there is to see each moment), while paused or scrubbing, and
 * under reduced motion.
 */
export const motionBlurOn = (s: BlurState) =>
  effectsFor(s)?.motionBlur === true && s.motionBlur && s.status === 'playing' && s.rate === 1 && !s.reducedMotion;

type DustState = TierState & Pick<TrickState, 'screen' | 'motionCuesVisible' | 'reducedMotion'>;

/**
 * Dust (step 19, ADR-74): on the game screen, on Medium and High (Low gets no
 * new features, ADR-62). It has no switch of its own: it follows the Motion
 * cues switch, and is off under reduced motion.
 */
export const dustShown = (s: DustState) => s.screen === 'skate' && effectiveQuality(s) !== 'low' && s.motionCuesVisible && !s.reducedMotion;
