// The flight clock (ADR-3, ADR-4; audit fix 2026-11-04). Pure frame-step
// logic for FlightDriver, kept out of the component so it can be tested with
// a real store and no WebGL. No React, no three.
//
// The store's live playhead (store/playhead.ts) is the one cursor. Every
// action that puts the board somewhere on purpose (pop, pause, resume, scrub,
// reset, landing) writes it, and while a flight plays this step advances it
// every frame. So a remount (a tier change rebuilds the Canvas), a pause
// before the first 10 Hz commit, or a scrub and resume between two frames
// all continue from where the board is, never from a stale store value.

import { advance } from '../sim/flight';
import { playRate, type Playhead, type TrickState } from '../store';

/** Store commits of progress while playing: at most 10 per second (ADR-4). */
export const COMMIT_EVERY = 0.1;
/**
 * The longest step one frame may take while a flight runs continuously: a
 * background tab, a GC pause or a dropped frame advances at most this much.
 * Real frame deltas below it pass through unchanged, so 15, 30 and 60 fps
 * play at the same speed (ADR-3).
 */
export const MAX_STALL = 0.1;

/** What the caller must tell the store after a step. Plain numbers, so a step allocates nothing. */
export const STEP_NONE = 0;
export const STEP_SYNC = 1;
export const STEP_LAND = 2;
export type StepOutcome = typeof STEP_NONE | typeof STEP_SYNC | typeof STEP_LAND;

/** The driver's own clock state: one per mounted driver, mutated in place. */
export interface FlightClock {
  /** Where to pose the board this frame. */
  progress: number;
  /** True while a run of continuous playing frames is under way. False makes the next playing frame a start (delta 0). */
  running: boolean;
  /** The flight the current run belongs to. */
  flightId: number;
  /** Seconds of flight advanced since the last store commit. */
  sinceCommit: number;
}

export const newFlightClock = (): FlightClock => ({ progress: 0, running: false, flightId: -1, sinceCommit: 0 });

type ClockState = Pick<TrickState, 'status' | 'flight' | 'flightId' | 'progress' | 'rate' | 'screen'>;

/**
 * Store transitions that start a new run: a pop, or a resume. Called from a
 * store subscription, so a pause and resume (or a scrub, its commit and a
 * resume) that all happen between two frames still make the next frame a
 * start: the delta that frame carries spans the pause and must not play.
 */
export function noteStoreChange(c: FlightClock, s: ClockState, prev: ClockState) {
  if (s.flightId !== prev.flightId || (s.status === 'playing' && prev.status !== 'playing')) c.running = false;
}

/**
 * One frame. While a flight plays: the first frame of a run (a pop, a resume,
 * a remount) advances by 0, because the R3F clock kept running while the
 * demand loop idled; later frames advance by the real delta, capped at
 * MAX_STALL. The playhead is read and written in place, so an explicit
 * destination an action wrote always wins. Otherwise the store's progress is
 * authoritative and the clock just follows it. Returns what to tell the
 * store; the caller does it, so the step itself has no store side effects
 * beyond the playhead.
 */
export function stepFlightClock(c: FlightClock, head: Playhead, s: ClockState, delta: number): StepOutcome {
  if (s.status !== 'playing' || s.flight === null) {
    c.running = false;
    c.progress = s.progress;
    return STEP_NONE;
  }
  // The actions claim the playhead for the flight they play; one that belongs
  // to another flight (or to none) is stale, so start from the store.
  if (head.flightId !== s.flightId) {
    head.flightId = s.flightId;
    head.progress = s.progress;
    c.running = false;
  }
  let dt = 0;
  if (c.running && c.flightId === s.flightId) {
    dt = Math.min(Math.max(0, delta), MAX_STALL);
  } else {
    c.running = true;
    c.flightId = s.flightId;
    c.sinceCommit = 0;
  }
  // At the playback speed, and in a game at the game's pace too (ADR-78).
  head.progress = advance(head.progress, dt, playRate(s), s.flight.airtime);
  c.progress = head.progress;
  if (c.progress >= 1) return STEP_LAND;
  c.sinceCommit += dt;
  if (c.sinceCommit < COMMIT_EVERY) return STEP_NONE;
  c.sinceCommit = 0;
  return STEP_SYNC;
}

/**
 * One frame of FlightDriver's clock, with the store told what it needs: the
 * landing at progress 1 (`land()` resolves and logs, in the store), or the
 * 10 Hz `syncProgress` commit. Returns the progress to pose from.
 */
export function tickFlightClock(
  c: FlightClock,
  head: Playhead,
  s: ClockState & Pick<TrickState, 'land' | 'syncProgress'>,
  delta: number,
): number {
  const step = stepFlightClock(c, head, s, delta);
  if (step === STEP_LAND) s.land();
  else if (step === STEP_SYNC) s.syncProgress(c.progress);
  return c.progress;
}
