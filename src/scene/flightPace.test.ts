// ADR-59 (2026-11-09): what PerfProbe recorded, read once per landing.
import { describe, expect, it } from 'vitest';
import { flightPace } from './flightPace';

const record = (flightId: number, ms: number, n: number) => {
  const frames = { intervals: new Float32Array(900), count: 0, flightId };
  for (let i = 0; i < n; i++) frames.intervals[frames.count++] = ms;
  return frames;
};

describe('flightPace', () => {
  it("reads the landed flight's median frame interval once, then clears the record", () => {
    const frames = record(4, 45, 30);
    expect(flightPace(frames, 4)).toBe(45);
    expect(frames.count).toBe(0);
    expect(flightPace(frames, 4)).toBeNull();
  });

  it("returns nothing for another flight's record, or one too short to judge", () => {
    expect(flightPace(record(3, 45, 30), 4)).toBeNull();
    expect(flightPace(record(4, 45, 5), 4)).toBeNull();
  });
});
