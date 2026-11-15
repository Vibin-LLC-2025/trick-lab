// The welcome screen's preview (ADR-45): preset tricks on a loop, in slow
// motion, posed by FlightDriver. Pure frame-step logic, kept out of the
// component so it can be tested with no WebGL. No React, no three. The
// preview never touches the store's flight, so it logs and scores nothing.

import { computeFlight, type Flight } from '../sim/flight';
import { presetById } from '../sim/tricks';
import { ART } from './artDirection';

const S = ART.showcase;

/** The preview's flights, computed once at load (never in a frame). Every one lands (tricks.test.ts checks the presets). */
export const SHOWCASE_FLIGHTS: readonly Flight[] = S.tricks.map((id) => computeFlight(presetById(id).inputs));

/** The still pose for reduced motion, the Low tier and a failed view. */
export const SHOWCASE_STILL = { flight: SHOWCASE_FLIGHTS[S.still.trick]!, progress: S.still.progress };

/** The preview's own clock: which trick, and how far into its cycle. One per mounted driver, mutated in place. */
export interface ShowcaseClock {
  index: number;
  /** Seconds into the current trick's cycle: hold, flight, hold. */
  t: number;
}

export const newShowcaseClock = (): ShowcaseClock => ({ index: 0, t: 0 });

/** Seconds one trick takes on screen: the hold on the pad, the slowed flight, the hold at the landing. */
export const cycleSeconds = (f: Flight) => S.holdBefore + f.airtime / S.rate + S.holdAfter;

/** Advances the clock by one frame, capped at `maxStep`, moving to the next trick (and round) as each cycle ends. */
export function stepShowcase(c: ShowcaseClock, delta: number) {
  c.t += Math.min(Math.max(0, delta), S.maxStep);
  let f = SHOWCASE_FLIGHTS[c.index]!;
  while (c.t >= cycleSeconds(f)) {
    c.t -= cycleSeconds(f);
    c.index = (c.index + 1) % SHOWCASE_FLIGHTS.length;
    f = SHOWCASE_FLIGHTS[c.index]!;
  }
}

/** The flight on screen. */
export const showcaseFlight = (c: ShowcaseClock): Flight => SHOWCASE_FLIGHTS[c.index]!;

/**
 * The flight's own seconds since touchdown, in the hold after the landing
 * (0 before): the rider's recovery (ADR-96) plays there, standing back up
 * into the riding stance, as in a game, not frozen in the landing's squat
 * (2026-11-13).
 */
export function showcaseAfter(c: ShowcaseClock): number {
  const f = SHOWCASE_FLIGHTS[c.index]!;
  return Math.max(0, (c.t - S.holdBefore - f.airtime / S.rate) * S.rate);
}

/** Whether the clock is in the hold before the pop, where the rider rides with no flight yet and sinks into the crouch. */
export const showcaseLeadIn = (c: ShowcaseClock) => c.t < S.holdBefore;

/** The wind-up's readiness in the hold before the pop: 0 riding as the last trick left the rider, to 1 crouched at the pop. */
export function showcaseReady(c: ShowcaseClock): number {
  if (c.t >= S.holdBefore) return 1;
  const s = c.t / S.holdBefore;
  return s * s * (3 - 2 * s);
}

/** Whether the clock has moved from its start: a paused preview holds the moment it was paused on. */
export const showcaseMoved = (c: ShowcaseClock) => c.index > 0 || c.t > 0;

/** Progress through the flight on screen: 0 while it holds on the pad, 1 while it holds at the landing. */
export function showcaseProgress(c: ShowcaseClock): number {
  const f = SHOWCASE_FLIGHTS[c.index]!;
  const u = ((c.t - S.holdBefore) * S.rate) / f.airtime;
  return Math.min(1, Math.max(0, u));
}
