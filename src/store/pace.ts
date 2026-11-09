// Automatic step-down (ADR-59, 2026-11-09; step 13 of
// docs/PLAN-LOOK-FEEL-PERF.md): whether tricks run choppy on this device, from
// the frame intervals of the first few tricks on a tier. Pure: no React, no
// three, no store. The scene measures (PerfProbe, paceWatch.ts); the store
// decides (noteTrickPace in ui.ts).
import type { Quality } from './types';

export const PACE = {
  /** Tricks judged on a tier: its first few that drew enough frames. */
  tricks: 3,
  /** Fewer frames than this (a scrub, a pop resolved at once) is not a trick to judge by. */
  minFrames: 12,
  /** A trick whose median frame interval is over this ran under 25 frames a second: choppy. */
  choppyMs: 40,
  /** Choppy tricks out of `tricks` that step the tier down. */
  choppyOf: 2,
  /** A gap longer than this is a hidden tab or a one-off stall, not the trick's pace: left out. */
  ignoreOverMs: 250,
} as const;

/** The tier one step down, or null on Low. */
export const lowerTier = (q: Quality): Quality | null => (q === 'high' ? 'medium' : q === 'medium' ? 'low' : null);

/**
 * A trick's pace: the median of its frame intervals in milliseconds (the
 * first `count` of `intervals`), leaving out the long gaps; null if too few
 * frames are left to judge by. The median, so a compile hitch on the first
 * frame or a garbage collection does not count as choppy.
 */
export function trickPace(intervals: ArrayLike<number>, count: number): number | null {
  const kept: number[] = [];
  for (let i = 0; i < Math.min(count, intervals.length); i++) {
    const ms = intervals[i]!;
    if (ms > 0 && ms <= PACE.ignoreOverMs) kept.push(ms);
  }
  if (kept.length < PACE.minFrames) return null;
  kept.sort((a, b) => a - b);
  const mid = kept.length >> 1;
  return kept.length % 2 ? kept[mid]! : (kept[mid - 1]! + kept[mid]!) / 2;
}

/** Whether a tier's judged tricks ran choppy: at least `choppyOf` of them over `choppyMs`. */
export const ranChoppy = (paces: readonly number[]) => paces.filter((ms) => ms > PACE.choppyMs).length >= PACE.choppyOf;
