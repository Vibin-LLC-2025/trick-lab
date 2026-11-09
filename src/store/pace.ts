// Automatic step-down (ADR-59, 2026-11-09; step 13 of
// docs/PLAN-LOOK-FEEL-PERF.md): whether tricks run choppy on this device, from
// the frame intervals of the first few tricks on a tier. Pure: no React, no
// three, no store. The scene measures (PerfProbe, flightPace.ts); the store
// decides (noteTrickPace in ui.ts, asked by the landing's resolution).
import type { Quality } from './types';

export const PACE = {
  /** Tricks judged on a tier: its first few that drew enough frames. */
  tricks: 3,
  /**
   * A trick is judged only if its recorded frames cover this much time, in at
   * least `minIntervals` intervals: a pop resolved at once (reduced motion)
   * or a scrub records none. By time, not a frame count, so a slow device
   * is judged too: a 0.53 s kickflip at 20 frames a second draws about 10
   * (review of Phase D, 2026-11-09: a 12-frame minimum let it go unjudged).
   */
  minCoveredMs: 250,
  minIntervals: 2,
  /** A trick whose median frame interval is over this ran under 25 frames a second: choppy. */
  choppyMs: 40,
  /** Choppy tricks out of `tricks` that step the tier down. */
  choppyOf: 2,
  /**
   * A single interval longer than this is a one-off stall, not the pace: left
   * out. Pauses, the time before a pop and a hidden tab never enter the
   * record (flightPace.ts recordFrame), so this only guards the rest.
   */
  ignoreOverMs: 1000,
} as const;

/** The tier one step down, or null on Low. */
export const lowerTier = (q: Quality): Quality | null => (q === 'high' ? 'medium' : q === 'medium' ? 'low' : null);

/**
 * A trick's pace: the median of its frame intervals in milliseconds (the
 * first `count` of `intervals`), leaving out one-off stalls; null if what is
 * left covers too little time to judge by. The median, so a compile hitch or
 * a garbage collection does not count as choppy.
 */
export function trickPace(intervals: ArrayLike<number>, count: number): number | null {
  const kept: number[] = [];
  let covered = 0;
  for (let i = 0; i < Math.min(count, intervals.length); i++) {
    const ms = intervals[i]!;
    if (ms > 0 && ms <= PACE.ignoreOverMs) {
      kept.push(ms);
      covered += ms;
    }
  }
  if (kept.length < PACE.minIntervals || covered < PACE.minCoveredMs) return null;
  kept.sort((a, b) => a - b);
  const mid = kept.length >> 1;
  return kept.length % 2 ? kept[mid]! : (kept[mid - 1]! + kept[mid]!) / 2;
}

/** Whether a tier's judged tricks ran choppy: at least `choppyOf` of them over `choppyMs`. */
export const ranChoppy = (paces: readonly number[]) => paces.filter((ms) => ms > PACE.choppyMs).length >= PACE.choppyOf;
