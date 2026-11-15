/**
 * Playback speed stops (2026-11-04, replaces the 1x / 0.25x toggle). A
 * discrete list rather than a continuous range: every stop reads as a clean
 * number, arrow keys move one stop, and the low end is fine enough to watch
 * the feet. The rate multiplies the frame delta in FlightDriver, so a change
 * applies on the next frame of a flight already in the air.
 */
export const SPEEDS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1, 1.25, 1.5, 2] as const;

import type { TrickState } from './types';

/**
 * The game's own speed (ADR-78): on the game screen everything that moves
 * with the playback speed (the flight, the landing, the roll, their sounds)
 * runs at this share of it, so a trick at "normal" speed in a game can be
 * watched: a 0.53 s kickflip takes 1.3 s. Slow motion in the game is slower
 * still. The lab is the exact experiment and keeps the speed it shows.
 */
export const GAME_PACE = 0.4;

/** The slow speed `s` switches to until the student picks another one. */
export const DEFAULT_SLOW = 0.25;

/**
 * The slowest the game screen goes (2026-11-13): the lab's finest stops are
 * for watching the feet, and carried into a game they made it look stuck (a
 * lab speed of 0.05 played a game at 0.02 of real time, a kickflip 27 s in
 * the air, with nothing on the game screen saying so). The lab keeps them.
 */
export const GAME_SLOWEST = DEFAULT_SLOW;

/** The playback speed as the game screen plays it, before its pace: never slower than GAME_SLOWEST. */
export const gameSpeed = (rate: number) => Math.max(rate, GAME_SLOWEST);

/** The speed things move at now: the playback speed, times the game's pace on the game screen. */
export const playRate = (s: Pick<TrickState, 'rate' | 'screen'>) => (s.screen === 'skate' ? gameSpeed(s.rate) * GAME_PACE : s.rate);

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
