// ADR-59 (2026-11-09): what PerfProbe records per frame, and the pace read
// once per landing. The regression at the end drives the real store and the
// real flight clock (FlightDriver's) through frames at a given rate, with the
// recording PerfProbe does in the same frame, so a slow device is judged as
// it would be in the browser (review of Phase D, 2026-11-09).
import { describe, expect, it } from 'vitest';
import { createTrickStore } from '../store';
import { newFlightClock, noteStoreChange, tickFlightClock } from './flightClock';
import { flightPace, recordFrame, type TrickFrames } from './flightPace';

const empty = (): TrickFrames => ({ intervals: new Float32Array(900), count: 0, flightId: -1, wasPlaying: false });

const record = (flightId: number, ms: number, n: number) => {
  const frames = empty();
  frames.flightId = flightId;
  for (let i = 0; i < n; i++) frames.intervals[frames.count++] = ms;
  return frames;
};

describe('recordFrame', () => {
  it('records each playing frame after the first, afresh for each new flight', () => {
    const f = empty();
    recordFrame(f, 'idle', 0, 5);
    // The pop's first frame spans the idle time before it: left out.
    recordFrame(f, 'playing', 1, 3);
    recordFrame(f, 'playing', 1, 0.05);
    recordFrame(f, 'playing', 1, 0.05);
    expect(f.flightId).toBe(1);
    expect([...f.intervals.slice(0, f.count)]).toEqual([50, 50].map((v) => Math.fround(v)));
    // A new flight starts a new record.
    recordFrame(f, 'playing', 2, 0.02);
    expect(f.count).toBe(0);
    expect(f.flightId).toBe(2);
  });

  it('keeps the record through a pause and leaves out the frame that spans it', () => {
    const f = empty();
    recordFrame(f, 'playing', 1, 1);
    recordFrame(f, 'playing', 1, 0.04);
    recordFrame(f, 'paused', 1, 0.04);
    recordFrame(f, 'paused', 1, 2);
    recordFrame(f, 'playing', 1, 3);
    recordFrame(f, 'playing', 1, 0.04);
    expect(f.count).toBe(2);
    expect(Math.max(...f.intervals.slice(0, f.count))).toBeLessThan(41);
  });

  it('leaves out the frame after a hidden tab (PerfProbe clears wasPlaying then)', () => {
    const f = empty();
    recordFrame(f, 'playing', 1, 1);
    recordFrame(f, 'playing', 1, 0.02);
    f.wasPlaying = false;
    recordFrame(f, 'playing', 1, 0.7);
    recordFrame(f, 'playing', 1, 0.02);
    expect([...f.intervals.slice(0, f.count)].map(Math.round)).toEqual([20, 20]);
  });
});

describe('flightPace', () => {
  it("reads the landed flight's median frame interval once, then clears the record", () => {
    const frames = record(4, 45, 30);
    expect(flightPace(frames, 4)).toBe(45);
    expect(frames.count).toBe(0);
    expect(flightPace(frames, 4)).toBeNull();
  });

  it("returns nothing for another flight's record, or one too short to judge", () => {
    expect(flightPace(record(3, 45, 30), 4)).toBeNull();
    expect(flightPace(record(4, 45, 1), 4)).toBeNull();
  });
});

describe('the step-down on a slow device, end to end (ADR-59)', () => {
  /** Three kickflips at `fps`, the flight clock and the record stepped together each frame as in the browser. */
  function threeTricksAt(fps: number) {
    const store = createTrickStore(() => 1000);
    store.setState({ quality: 'high', qualityAuto: true, paces: [], paceJudged: false });
    const frames = empty();
    store.getState().setPaceSource((flightId) => flightPace(frames, flightId));
    const clock = newFlightClock();
    store.subscribe((s, prev) => noteStoreChange(clock, s, prev));
    const dt = 1 / fps;
    store.getState().applyPreset('kickflip');
    for (let trick = 0; trick < 3; trick++) {
      // Idle frames between tricks, then the pop.
      for (let i = 0; i < 3; i++) recordFrame(frames, store.getState().status, store.getState().flightId, dt);
      store.getState().popTrick();
      for (let i = 0; i < 1000 && store.getState().status === 'playing'; i++) {
        // FlightDriver's frame (it may land), then PerfProbe's.
        const s = store.getState();
        tickFlightClock(clock, store.playhead, s, dt);
        const after = store.getState();
        recordFrame(frames, after.status, after.flightId, dt);
      }
      expect(store.getState().status).toBe('done');
    }
    return store.getState();
  }

  it.each([20, 15, 10, 5])('steps High down to Medium at %i frames a second', (fps) => {
    const s = threeTricksAt(fps);
    expect(s.quality).toBe('medium');
    expect(s.announcement.message).toMatch(/Tricks were running slowly on this device, so quality is now medium\./);
  });

  it.each([60, 30])('keeps High at %i frames a second, and stops judging it', (fps) => {
    const s = threeTricksAt(fps);
    expect(s.quality).toBe('high');
    expect(s.paceJudged).toBe(true);
  });
});
