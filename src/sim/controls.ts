// ROUGH (PLAN-PLAY-POLISH-REACH step 8, 2026-11-09): the two candidate game
// controls, as pure functions from what the player did to pop, flick and
// scoop. Behind `?controls=flick` and `?controls=bar`; the owner picks one,
// and step 9 builds it properly and deletes the other. No React, no three,
// no store.
import type { TrickInputs } from './flight';
import type { SkateLevel } from './skate';
import { INPUT_LIMITS, resolveTrick } from './tricks';

const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));
const rate = (x: number) => clamp(x, INPUT_LIMITS.flick.min, INPUT_LIMITS.flick.max) + 0;

/**
 * A. Flick it yourself. Hold to crouch: the pop grows with the hold, from the
 * lowest to the highest over `popFullMs`. The flick and the scoop are rates,
 * as on the sliders, so a longer hold (more airtime) needs less of them.
 * - Pointer: a drag of `pxPerRate` pixels is 1 rev/s. Right is a kickflip,
 *   left a heelflip; down (toward the rider's heels) is backside, up frontside.
 * - Keys: each arrow adds `ratePerMs` for as long as it is held. Right and
 *   Left are the flick, Down and Up the scoop, the same way round.
 */
export const FLICK_IT = { popFullMs: 2000, pxPerRate: 60, ratePerMs: 0.003 } as const;

/** The pop a crouch held this long gives, metres. Not on the slider grid: nobody's hand is. */
export function popFromHold(holdMs: number): number {
  const { min, max } = INPUT_LIMITS.pop;
  return min + (max - min) * clamp(holdMs / FLICK_IT.popFullMs, 0, 1);
}

/** A pointer gesture: how long the press was held, and how far it was dragged from where it started (screen pixels, y down). */
export const pointerAttempt = (holdMs: number, dx: number, dy: number): TrickInputs => ({
  pop: popFromHold(holdMs),
  flick: rate(dx / FLICK_IT.pxPerRate),
  scoop: rate(dy / FLICK_IT.pxPerRate),
});

/** A keyboard gesture: how long Space was held, and each arrow while it was. */
export const keyAttempt = (holdMs: number, held: { left: number; right: number; up: number; down: number }): TrickInputs => ({
  pop: popFromHold(holdMs),
  flick: rate((held.right - held.left) * FLICK_IT.ratePerMs),
  scoop: rate((held.down - held.up) * FLICK_IT.ratePerMs),
});

/** The trick these inputs are winding up to, by name, whether or not it would land: the line of text under the pad. */
export const windUpName = (inputs: TrickInputs): string => resolveTrick(inputs).name;

/**
 * B. Sliders plus a timing bar. The sliders say what you are going for; Pop
 * starts a bar that sweeps for `sweepMs`, and Pop again releases. Inside the
 * band around `centreMs` you get exactly what you set. Outside it the flick
 * and the scoop scale with how far outside you were: early under-rotates,
 * late over-rotates. The pop is never changed. No release by the sweep's end
 * is a release at its end.
 */
export const BAR = {
  sweepMs: 1200,
  centreMs: 800,
  /** Half the band's width per level, ms. */
  half: { easy: 140, normal: 100, hard: 60 } as Record<SkateLevel, number>,
  /** How hard a miss scales the rates: the scale at half a sweep outside the band is 1 plus or minus this. */
  k: { easy: 0.5, normal: 0.6, hard: 0.7 } as Record<SkateLevel, number>,
} as const;

/** How far outside the band a release was, signed ms: negative early, positive late, 0 inside. */
export function barMiss(releaseMs: number, level: SkateLevel): number {
  const e = clamp(releaseMs, 0, BAR.sweepMs) - BAR.centreMs;
  const out = Math.max(0, Math.abs(e) - BAR.half[level]);
  return Math.sign(e) * out + 0;
}

/** The attempt a release at `releaseMs` makes of the slider setup `intended`. */
export function timedAttempt(intended: TrickInputs, releaseMs: number, level: SkateLevel): TrickInputs {
  const miss = barMiss(releaseMs, level);
  if (miss === 0) return { ...intended };
  const scale = 1 + (BAR.k[level] * miss) / (BAR.sweepMs / 2);
  return { pop: intended.pop, flick: rate(intended.flick * scale), scoop: rate(intended.scoop * scale) };
}

/** What a release did, in a few words: "In the band.", "A little early: under-rotated.", "Late: over-rotated." */
export function barFeedback(releaseMs: number, level: SkateLevel): string {
  const miss = barMiss(releaseMs, level);
  if (miss === 0) return 'In the band.';
  const little = Math.abs(miss) < 60 ? 'A little ' : '';
  const word = miss < 0 ? 'early: less spin than you set' : 'late: more spin than you set';
  return `${little}${word}.`.replace(/^./, (c) => c.toUpperCase());
}

/** Which rough control the URL asks for: `?controls=flick`, `?controls=bar`, or neither (today's sliders and Pop). */
export type ControlsMode = 'flick' | 'bar' | null;
export const controlsModeFrom = (search: string): ControlsMode => {
  const v = new URLSearchParams(search).get('controls');
  return v === 'flick' || v === 'bar' ? v : null;
};
