// The welcome screen's preview (ADR-45): preset tricks on a loop, in slow
// motion, posed by FlightDriver. Pure frame-step logic, kept out of the
// component so it can be tested with no WebGL. No React, no three. The
// preview never touches the store's flight, so it logs and scores nothing.

import { computeFlight, type Flight } from '../sim/flight';
import { presetById, PRESETS, type PresetId } from '../sim/tricks';
import { ART } from './artDirection';

const S = ART.showcase;

/** The preview's flights, computed once at load (never in a frame). Every one lands (tricks.test.ts checks the presets). */
export const SHOWCASE_FLIGHTS: readonly Flight[] = S.tricks.map((id) => computeFlight(presetById(id).inputs));

/**
 * The product shots' pose (scripts/shot, 2026-11-22): with `?debug&pose=360-flip@0.5`
 * in the address the still pose is that preset at that progress, so a shot can
 * hold any trick at any moment. Without `debug`, an unknown trick or a progress
 * outside 0 to 1 it is null: every real visit keeps the art-directed still.
 */
export function checkPose(search: string): { id: PresetId; progress: number } | null {
  const q = new URLSearchParams(search);
  if (!q.has('debug')) return null;
  const m = /^([a-z0-9-]+)@([0-9.]+)$/.exec(q.get('pose') ?? '');
  if (!m) return null;
  const preset = PRESETS.find((p) => p.id === m[1]);
  const progress = Number(m[2]);
  if (!preset || !Number.isFinite(progress) || progress < 0 || progress > 1) return null;
  return { id: preset.id, progress };
}

const SEARCH = typeof location === 'undefined' ? '' : location.search;
const POSE = checkPose(SEARCH);

/** A product shot with the skate spot behind the rider on the welcome screen too: `&spot` beside a valid `pose` (scripts/shot, 2026-11-22). */
export const SHOT_SPOT = POSE !== null && new URLSearchParams(SEARCH).has('spot');

/** The still pose for reduced motion, the Low tier and a failed view (or a product shot's pose, `checkPose`). */
export const SHOWCASE_STILL = POSE
  ? { flight: computeFlight(presetById(POSE.id).inputs), progress: POSE.progress }
  : { flight: SHOWCASE_FLIGHTS[S.still.trick]!, progress: S.still.progress };

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
