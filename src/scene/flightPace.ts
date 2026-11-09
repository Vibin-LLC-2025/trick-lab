// The automatic step-down's measuring side (ADR-59): what PerfProbe records
// each frame while a flight plays, and the pace source it registers with the
// store. The store asks once per landing, outside the frame loop, so the
// median's sort never runs in a frame.
import { trickPace } from '../store/pace';
import type { PlaybackStatus } from '../store';

export interface TrickFrames {
  /** Frame intervals in ms, made once; its length caps the record. */
  intervals: Float32Array;
  count: number;
  /** The flight the record belongs to (-1: none). */
  flightId: number;
  /** Whether the last frame was a playing one: the next interval is part of the flight. */
  wasPlaying: boolean;
}

/**
 * One frame of PerfProbe's record (ADR-59): while a flight plays, the frame's
 * interval in ms, afresh for each new flight. The first frame of a run of
 * playing (a pop, a resume after a pause, a tab shown again: PerfProbe
 * clears `wasPlaying` then) is left out, since its interval spans the time
 * before it, when nothing was playing. No allocation.
 */
export function recordFrame(frames: TrickFrames, status: PlaybackStatus, flightId: number, deltaSeconds: number) {
  const playing = status === 'playing';
  if (playing) {
    if (frames.flightId !== flightId) {
      frames.flightId = flightId;
      frames.count = 0;
    } else if (frames.wasPlaying && frames.count < frames.intervals.length) {
      frames.intervals[frames.count++] = deltaSeconds * 1000;
    }
  }
  frames.wasPlaying = playing;
}

/**
 * The pace of flight `flightId` from what PerfProbe recorded: its median
 * frame interval in ms, or null if the record is another flight's or too
 * short to judge (store/pace.ts). The record is cleared once read, so a
 * flight is judged once.
 */
export function flightPace(frames: TrickFrames, flightId: number): number | null {
  if (frames.flightId !== flightId) return null;
  const pace = trickPace(frames.intervals, frames.count);
  frames.count = 0;
  frames.flightId = -1;
  return pace;
}
