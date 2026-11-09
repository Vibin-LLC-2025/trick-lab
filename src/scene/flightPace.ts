// The automatic step-down's measuring side (ADR-59): what PerfProbe records
// each frame while a flight plays, and the pace source it registers with the
// store. The store asks once per landing, outside the frame loop, so the
// median's sort never runs in a frame.
import { PACE, trickPace } from '../store/pace';
import type { PlaybackStatus, TrickState } from '../store';

export interface TrickFrames {
  /**
   * Frame intervals in ms, made once; its length caps the record. A pool:
   * short flights add to it until together they cover enough time to judge
   * (store/pace.ts), so a quick trick at 2x on a slow device still counts.
   */
  intervals: Float32Array;
  count: number;
  /** The flight being recorded now (-1: none). */
  flightId: number;
  /** Whether the last frame was a playing one of this flight: the next interval is part of it. */
  wasPlaying: boolean;
}

/** An empty record. */
export const newTrickFrames = (max: number): TrickFrames => ({ intervals: new Float32Array(max), count: 0, flightId: -1, wasPlaying: false });

/**
 * One frame of PerfProbe's record (ADR-59): while a flight plays, the frame's
 * interval in ms, added to the pool. The first frame of a run of playing (a
 * pop, a resume, a tab shown again) is left out, since its interval spans
 * the time before it, when nothing played: a new flight, a store playback
 * change (noteFramesStoreChange) or a hidden tab (PerfProbe) ends the run.
 * A stall over `PACE.ignoreOverMs` is never stored: judging leaves it out
 * anyway, and kept in the pool it would take a place for nothing (review of
 * Phase D, 2026-11-09: long stalls filled all 900 places and stopped the
 * step-down for good). No allocation.
 */
export function recordFrame(frames: TrickFrames, status: PlaybackStatus, flightId: number, deltaSeconds: number) {
  const playing = status === 'playing';
  if (playing) {
    if (frames.flightId !== flightId) frames.flightId = flightId;
    else if (frames.wasPlaying && frames.count < frames.intervals.length) {
      const ms = deltaSeconds * 1000;
      if (ms > 0 && ms <= PACE.ignoreOverMs) frames.intervals[frames.count++] = ms;
    }
  }
  frames.wasPlaying = playing && frames.flightId === flightId;
}

/**
 * Ends the run of playing frames on any playback change in the store (a
 * pause, a scrub, a resume, a pop, a landing), even with no frame drawn in
 * between, so the frame after it, which spans the change, is never recorded
 * (review of Phase D, 2026-11-09: a pause, scrub and resume between two
 * frames put an 800 ms interval into a smooth flight). The flight clock does
 * the same (flightClock.ts noteStoreChange).
 */
export function noteFramesStoreChange(frames: TrickFrames, s: Pick<TrickState, 'status' | 'flightId'>, prev: Pick<TrickState, 'status' | 'flightId'>) {
  if (s.status !== prev.status || s.flightId !== prev.flightId) frames.wasPlaying = false;
}

/**
 * The pace to judge at the landing of flight `flightId`: the median frame
 * interval in ms of the pool, once it covers enough time (store/pace.ts),
 * then the pool starts again; null if the record is not this flight's (it
 * drew no playing frame: a pop resolved at once) or the pool is still short,
 * in which case it carries on into the next flight. A full pool is emptied
 * whatever it gave, so new evidence can always come in.
 */
export function flightPace(frames: TrickFrames, flightId: number): number | null {
  if (frames.flightId !== flightId) return null;
  frames.flightId = -1;
  frames.wasPlaying = false;
  const pace = trickPace(frames.intervals, frames.count);
  if (pace !== null || frames.count >= frames.intervals.length) frames.count = 0;
  return pace;
}
