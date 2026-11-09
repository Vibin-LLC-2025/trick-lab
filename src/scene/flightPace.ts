// The automatic step-down's measuring side (ADR-59): the pace source PerfProbe
// registers with the store. The store asks it once per landing, outside the
// frame loop, so the median's sort never runs in a frame.
import { trickPace } from '../store/pace';

interface Frames {
  intervals: ArrayLike<number>;
  count: number;
  flightId: number;
}

/**
 * The pace of flight `flightId` from what PerfProbe recorded: its median
 * frame interval in ms, or null if the record is another flight's or too
 * short. The record is cleared once read, so a flight is judged once.
 */
export function flightPace(frames: Frames, flightId: number): number | null {
  if (frames.flightId !== flightId) return null;
  const pace = trickPace(frames.intervals, frames.count);
  frames.count = 0;
  frames.flightId = -1;
  return pace;
}
