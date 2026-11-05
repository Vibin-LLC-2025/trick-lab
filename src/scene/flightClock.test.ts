import { describe, expect, it } from 'vitest';
import { createTrickStore } from '../store';
import { COMMIT_EVERY, MAX_STALL, newFlightClock, noteStoreChange, tickFlightClock } from './flightClock';

/**
 * A real store and FlightDriver's clock without WebGL: the same subscription
 * and the same per-frame tick the driver runs, so these drive the real
 * actions (pause, scrub, resume, reset, land) between real frame steps.
 */
function rig(store = createTrickStore(() => 0)) {
  let clock = newFlightClock();
  let unsubscribe = store.subscribe((s, prev) => noteStoreChange(clock, s, prev));
  const frame = (delta: number) => tickFlightClock(clock, store.playhead, store.getState(), delta);
  const frames = (n: number, delta: number) => {
    let p = 0;
    for (let i = 0; i < n; i += 1) p = frame(delta);
    return p;
  };
  /** A tier change rebuilds the Canvas: a fresh driver, a fresh clock, the same store. */
  const remount = () => {
    unsubscribe();
    clock = newFlightClock();
    unsubscribe = store.subscribe((s, prev) => noteStoreChange(clock, s, prev));
  };
  return { store, frame, frames, remount, s: () => store.getState() };
}

const HZ60 = 1 / 60;
const scrubs = (s: { events: { type: string; payload: unknown }[] }) =>
  s.events.filter((e) => e.type === 'playback.scrubbed').map((e) => e.payload);

describe('flight clock: the live playhead is the one cursor', () => {
  it('five 60 Hz frames before the first commit, then pause, keeps the pose', () => {
    const r = rig();
    r.s().applyPreset('kickflip');
    r.s().popTrick();
    const airtime = r.s().flight!.airtime;
    r.frame(HZ60); // the pop's first frame starts the run
    const p = r.frames(5, HZ60);
    expect(p).toBeCloseTo((5 * HZ60) / airtime, 9);
    // No commit yet (5 frames are 83 ms): the store still says 0.
    expect(r.s().progress).toBe(0);
    r.s().togglePause();
    expect(r.s().status).toBe('paused');
    expect(r.s().progress).toBe(p);
    // Paused frames pose where the board was, not at the last commit.
    expect(r.frame(HZ60)).toBe(p);
    expect(r.frame(2)).toBe(p);
  });

  it('resume continues from the paused pose and the wait does not play', () => {
    const r = rig();
    r.s().popTrick();
    const airtime = r.s().flight!.airtime;
    r.frame(HZ60);
    const p = r.frames(4, HZ60);
    r.s().togglePause();
    r.frame(HZ60);
    r.s().togglePause();
    expect(r.s().status).toBe('playing');
    // The first frame after a resume carries the whole pause as its delta.
    expect(r.frame(3)).toBe(p);
    expect(r.frame(HZ60)).toBeCloseTo(p + HZ60 / airtime, 9);
  });

  it('a scrub while playing logs from where the board was, and its destination is posed', () => {
    const r = rig();
    r.s().popTrick();
    r.frame(HZ60);
    const p = r.frames(9, HZ60);
    // 150 ms in: one 10 Hz commit, already behind the board.
    expect(r.s().progress).toBeGreaterThan(0);
    expect(r.s().progress).toBeLessThan(p);
    r.s().scrub(0.6);
    r.s().commitScrub();
    expect(scrubs(r.s())).toEqual([{ from: Math.round(p * 100), to: 60 }]);
    expect(r.frame(HZ60)).toBe(0.6);
  });

  it('a committed scrub destination wins, even with an immediate resume and no paused frame', () => {
    const r = rig();
    r.s().popTrick();
    const airtime = r.s().flight!.airtime;
    r.frame(HZ60);
    r.frames(3, HZ60);
    // Scrub, release and resume, all between two frames.
    r.s().scrub(0.5);
    r.s().commitScrub();
    r.s().togglePause();
    expect(r.s().status).toBe('playing');
    expect(r.frame(0.08)).toBe(0.5);
    expect(r.frame(HZ60)).toBeCloseTo(0.5 + HZ60 / airtime, 9);
  });

  it('a remount while playing continues from the playhead, not the last commit', () => {
    const r = rig();
    r.s().popTrick();
    r.frame(HZ60);
    const p = r.frames(5, HZ60);
    expect(r.s().progress).toBe(0);
    r.remount();
    // The new driver's first frame starts a run: same place, no jump either way.
    expect(r.frame(0.05)).toBe(p);
    expect(r.frame(HZ60)).toBeGreaterThan(p);
  });

  it('a remount while paused poses the paused progress', () => {
    const r = rig();
    r.s().popTrick();
    r.frame(HZ60);
    const p = r.frames(5, HZ60);
    r.s().togglePause();
    r.remount();
    expect(r.frame(HZ60)).toBe(p);
  });

  it('a new pop and a reset ignore a stale playhead', () => {
    const r = rig();
    r.s().popTrick();
    r.frame(HZ60);
    r.frames(10, HZ60);
    r.s().land();
    expect(r.frame(HZ60)).toBe(1);
    r.s().popTrick();
    expect(r.frame(0.5)).toBe(0);

    r.frames(10, HZ60);
    r.s().togglePause();
    r.s().resetSession();
    expect(r.frame(HZ60)).toBe(0);
    r.s().popTrick();
    expect(r.frame(HZ60)).toBe(0);

    // A playhead left on another flight is replaced by the store's progress.
    r.store.playhead.flightId = r.s().flightId - 1;
    r.store.playhead.progress = 0.9;
    expect(r.frame(HZ60)).toBe(0);
    expect(r.store.playhead.flightId).toBe(r.s().flightId);
  });

  it('two stores keep separate cursors', () => {
    const a = rig();
    const b = rig();
    a.s().popTrick();
    b.s().popTrick();
    a.frame(HZ60);
    b.frame(HZ60);
    const pa = a.frames(6, HZ60);
    const pb = b.frames(2, HZ60);
    expect(pa).toBeGreaterThan(pb);
    expect(a.store.playhead.progress).toBe(pa);
    expect(b.store.playhead.progress).toBe(pb);
    b.s().togglePause();
    expect(b.s().progress).toBe(pb);
    expect(a.s().status).toBe('playing');
  });

  it('commits to the store at most 10 times a second, never every frame', () => {
    for (const hz of [15, 30, 60, 144]) {
      const r = rig();
      r.s().setRate(0.25); // a long flight: about 2.1 s
      r.s().popTrick();
      let notifications = 0;
      let lastCommit = 0;
      let t = 0;
      let minGap = Infinity;
      r.store.subscribe((s, prev) => {
        if (s.progress === prev.progress || s.status !== 'playing') return;
        notifications += 1;
        minGap = Math.min(minGap, t - lastCommit);
        lastCommit = t;
      });
      r.frame(1 / hz);
      while (r.s().status === 'playing') {
        t += 1 / hz;
        r.frame(1 / hz);
      }
      expect(r.s().status).toBe('done');
      expect(notifications).toBeGreaterThan(0);
      expect(notifications).toBeLessThanOrEqual(Math.floor(t / COMMIT_EVERY));
      expect(minGap).toBeGreaterThanOrEqual(COMMIT_EVERY - 1e-9);
    }
  });

  it('lands exactly once, through the store, when progress reaches 1', () => {
    const r = rig();
    r.s().applyPreset('kickflip');
    r.s().popTrick();
    r.frame(HZ60);
    while (r.s().status === 'playing') r.frame(HZ60);
    expect(r.s().status).toBe('done');
    expect(r.s().result?.id).toBe('kickflip');
    r.frame(HZ60);
    expect(r.s().events.filter((e) => e.type === 'trick.resolved')).toHaveLength(1);
  });
});

describe('flight clock: frame timing (ADR-3)', () => {
  /** Progress after `seconds` of frames at `hz`, after the pop's own first frame. */
  const after = (hz: number, seconds: number, rate: number) => {
    const r = rig();
    r.s().setRate(rate);
    r.s().popTrick();
    r.frame(1 / hz);
    return { p: r.frames(Math.round(seconds * hz), 1 / hz), airtime: r.s().flight!.airtime };
  };

  it('the same elapsed time gives the same progress at 15, 30 and 60 fps', () => {
    for (const [seconds, rate] of [
      [0.4, 1],
      [1, 0.5],
    ] as const) {
      const { p: p60, airtime } = after(60, seconds, rate);
      expect(p60).toBeCloseTo((seconds * rate) / airtime, 9);
      expect(after(30, seconds, rate).p).toBeCloseTo(p60, 9);
      expect(after(15, seconds, rate).p).toBeCloseTo(p60, 9);
    }
  });

  it('the first frame of a pop advances 0, whatever idle time its delta carries', () => {
    const r = rig();
    r.s().popTrick();
    expect(r.frame(5)).toBe(0);
    expect(r.s().status).toBe('playing');
  });

  it('a 2 s stall mid-flight advances one capped step, not the landing', () => {
    const r = rig();
    r.s().setRate(0.25);
    r.s().popTrick();
    const airtime = r.s().flight!.airtime;
    r.frame(HZ60);
    const p = r.frames(3, HZ60);
    expect(r.frame(2)).toBeCloseTo(p + (MAX_STALL * 0.25) / airtime, 9);
    expect(r.s().status).toBe('playing');
  });
});
