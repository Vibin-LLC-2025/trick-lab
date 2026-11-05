/**
 * Playback speed stops (2026-11-04, replaces the 1x / 0.25x toggle). A
 * discrete list rather than a continuous range: every stop reads as a clean
 * number, arrow keys move one stop, and the low end is fine enough to watch
 * the feet. The rate multiplies the frame delta in FlightDriver, so a change
 * applies on the next frame of a flight already in the air.
 */
export const SPEEDS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1, 1.25, 1.5, 2] as const;

/** The slow speed `s` switches to until the student picks another one. */
export const DEFAULT_SLOW = 0.25;

/** Index of the stop nearest to a rate. */
export function speedIndex(rate: number): number {
  let best = 0;
  for (let i = 1; i < SPEEDS.length; i++) {
    if (Math.abs(SPEEDS[i]! - rate) < Math.abs(SPEEDS[best]! - rate)) best = i;
  }
  return best;
}

/** Nearest stop to a rate. */
export const snapSpeed = (rate: number): number => SPEEDS[speedIndex(rate)]!;

/** Visible readout: "0.25x". */
export const speedLabel = (rate: number) => `${rate}x`;

/** Spoken value: "0.25 times speed", "normal speed". */
export const speedText = (rate: number) => (rate === 1 ? 'normal speed' : `${rate} times speed`);
