// ADR-59 (2026-11-09): what PerfProbe records per frame, and the pace read
// once per landing. The regression at the end drives the real store and the
// real flight clock (FlightDriver's) through frames at a given rate, with the
// recording PerfProbe does in the same frame, so a slow device is judged as
// it would be in the browser (review of Phase D, 2026-11-09).
import { describe, expect, it } from 'vitest';
import { createTrickStore } from '../store';
import { newFlightClock, noteStoreChange, tickFlightClock } from './flightClock';
import { flightPace, noteFramesStoreChange, recordFrame, type TrickFrames } from './flightPace';

const empty = (): TrickFrames => ({ intervals: new Float32Array(900), count: 0, flightId: -1, wasPlaying: false });

const record = (flightId: number, ms: number, n: number) => {
  const frames = empty();
  frames.flightId = flightId;
  for (let i = 0; i < n; i++) frames.intervals[frames.count++] = ms;
  return frames;
};

describe('recordFrame', () => {
  it("records each playing frame after the first; a new flight's frames join the pool, its first left out", () => {
    const f = empty();
    recordFrame(f, 'idle', 0, 5);
    // The pop's first frame spans the idle time before it: left out.
    recordFrame(f, 'playing', 1, 3);
    recordFrame(f, 'playing', 1, 0.05);
    recordFrame(f, 'playing', 1, 0.05);
    expect(f.flightId).toBe(1);
    expect([...f.intervals.slice(0, f.count)]).toEqual([50, 50].map((v) => Math.fround(v)));
    // The next flight adds to the pool; its first frame is left out too.
    recordFrame(f, 'playing', 2, 2);
    recordFrame(f, 'playing', 2, 0.02);
    expect(f.flightId).toBe(2);
    expect([...f.intervals.slice(0, f.count)].map(Math.round)).toEqual([50, 50, 20]);
  });

  it('ends the run on any playback change in the store, with no frame drawn in between (review of Phase D)', () => {
    const f = empty();
    recordFrame(f, 'playing', 1, 1);
    recordFrame(f, 'playing', 1, 1 / 60);
    // Pause, scrub and resume between two frames: the store changes, no frame comes.
    noteFramesStoreChange(f, { status: 'paused', flightId: 1 }, { status: 'playing', flightId: 1 });
    noteFramesStoreChange(f, { status: 'playing', flightId: 1 }, { status: 'paused', flightId: 1 });
    // The frame after spans the whole change: left out.
    recordFrame(f, 'playing', 1, 0.8);
    recordFrame(f, 'playing', 1, 1 / 60);
    expect([...f.intervals.slice(0, f.count)].map(Math.round)).toEqual([17, 17]);
    // A change that is not playback (a slider, the theme) leaves the run alone.
    noteFramesStoreChange(f, { status: 'playing', flightId: 1 }, { status: 'playing', flightId: 1 });
    recordFrame(f, 'playing', 1, 1 / 60);
    expect(f.count).toBe(3);
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
  it("reads the pool's median frame interval at a landing once it covers enough time, then empties it", () => {
    const frames = record(4, 45, 30);
    expect(flightPace(frames, 4)).toBe(45);
    expect(frames.count).toBe(0);
    expect(flightPace(frames, 4)).toBeNull();
  });

  it("returns nothing for a flight that drew no playing frame, and carries a short pool into the next flight", () => {
    expect(flightPace(record(3, 45, 30), 4)).toBeNull();
    const short = record(4, 100, 1);
    expect(flightPace(short, 4)).toBeNull();
    expect(short.count).toBe(1);
    // The next flight's frames complete the sample.
    short.flightId = 5;
    short.intervals[short.count++] = 100;
    short.intervals[short.count++] = 100;
    expect(flightPace(short, 5)).toBe(100);
    expect(short.count).toBe(0);
  });
});

describe('the step-down on a slow device, end to end (ADR-59)', () => {
  /**
   * The real store and flight clock with PerfProbe's recording, frame by
   * frame at `fps` as in the browser: FlightDriver's frame (it may land),
   * then PerfProbe's. Kickflip inputs at `pop` height and playback `rate`,
   * up to `tricks` tricks or until the tier steps down. Returns the state
   * and how many tricks it took. `pauseMidway` pauses, scrubs and resumes
   * each flight between two frames, then draws one frame spanning `pauseMs`.
   */
  function playAt(fps: number, { pop = 0.35, rate = 1, tricks = 3, pauseMidway = false, pauseMs = 800 } = {}) {
    const store = createTrickStore(() => 1000);
    store.setState({ quality: 'high', qualityAuto: true, paces: [], paceJudged: false });
    const frames = empty();
    store.getState().setPaceSource((flightId) => flightPace(frames, flightId));
    const clock = newFlightClock();
    store.subscribe((s, prev) => noteStoreChange(clock, s, prev));
    store.subscribe((s, prev) => noteFramesStoreChange(frames, s, prev));
    const dt = 1 / fps;
    store.getState().applyPreset('kickflip');
    store.getState().setInput('pop', pop);
    store.getState().setRate(rate);
    const frame = (delta: number) => {
      tickFlightClock(clock, store.playhead, store.getState(), delta);
      const s = store.getState();
      recordFrame(frames, s.status, s.flightId, delta);
    };
    let played = 0;
    while (played < tricks && store.getState().quality === 'high') {
      for (let i = 0; i < 3; i++) frame(dt);
      store.getState().popTrick();
      for (let i = 0; i < 2; i++) frame(dt);
      if (pauseMidway) {
        store.getState().togglePause();
        store.getState().scrub(0.99);
        store.getState().commitScrub();
        store.getState().togglePause();
        frame(pauseMs / 1000);
      }
      for (let i = 0; i < 5000 && store.getState().status === 'playing'; i++) frame(dt);
      expect(store.getState().status).toBe('done');
      played += 1;
    }
    return { s: store.getState(), played };
  }

  it.each([20, 15, 10, 5])('steps High down to Medium at %i frames a second, on the third trick', (fps) => {
    const { s, played } = playAt(fps);
    expect(s.quality).toBe('medium');
    expect(played).toBe(3);
    expect(s.announcement.message).toMatch(/Tricks were running slowly on this device, so quality is now medium\./);
  });

  it.each([60, 30])('keeps High at %i frames a second, and stops judging it', (fps) => {
    const { s } = playAt(fps);
    expect(s.quality).toBe('high');
    expect(s.paceJudged).toBe(true);
  });

  // Review of Phase D (2026-11-09): short flights each cover under 250 ms on a slow device.
  it.each([
    [20, 0.15, 2],
    [15, 0.15, 2],
    [10, 0.15, 2],
    [10, 0.35, 2],
  ])('pools short flights: at %i fps, a %f m pop at %ix still steps down within a dozen tricks', (fps, pop, rate) => {
    const { s, played } = playAt(fps, { pop, rate, tricks: 12 });
    expect(s.quality).toBe('medium');
    expect(played).toBeLessThanOrEqual(12);
  });

  it.each([60, 30])('never steps a smooth device down for short flights either (%i fps, a 0.15 m pop at 2x)', (fps) => {
    const { s } = playAt(fps, { pop: 0.15, rate: 2, tricks: 12 });
    expect(s.quality).toBe('high');
  });

  // Review of Phase D (2026-11-09): a pause, a scrub and a resume between two frames, on a smooth device.
  it('never counts a pause as a slow frame, even with no frame drawn during it', () => {
    const { s } = playAt(60, { pauseMidway: true, tricks: 6 });
    expect(s.quality).toBe('high');
  });
});
