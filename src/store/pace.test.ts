// ADR-59 (2026-11-09): the automatic step-down. The pace of a trick, the rule
// that calls a tier choppy, and the store action that steps down.
import { beforeEach, describe, expect, it } from 'vitest';
import { createTrickStore } from '.';
import { lowerTier, PACE, ranChoppy, trickPace } from './pace';
import { capQuality } from './quality';
import { QUALITY_STEP_KEY, STEP_DOWN_ANNOUNCEMENT } from './ui';

const frames = (ms: number, n = 30) => new Array<number>(n).fill(ms);

describe("a trick's pace", () => {
  it('is the median frame interval, so a hitch does not make a smooth trick choppy', () => {
    expect(trickPace(frames(16.7), 30)).toBeCloseTo(16.7, 6);
    expect(trickPace([...frames(16, 20), 120, 120, 120], 23)).toBe(16);
    expect(trickPace([10, 20, 30, 40, ...frames(25, 10)], 14)).toBe(25);
  });

  it('leaves out one-off stalls over a second and nothing-frames, and judges by the time covered, not a frame count', () => {
    expect(trickPace([5000, ...frames(50, 12)], 13)).toBe(50);
    expect(trickPace([0, ...frames(20, 13)], 14)).toBe(20);
    // A slow device's short trick is judged: 0.53 s at 20 frames a second is about 10 intervals.
    expect(trickPace(frames(50, 10), 10)).toBe(50);
    // Even at 5 frames a second.
    expect(trickPace(frames(200, 3), 3)).toBe(200);
    // Too little to judge: under 250 ms covered, or a single interval.
    expect(trickPace(frames(16, 10), 10)).toBeNull();
    expect(trickPace([600], 1)).toBeNull();
    expect(PACE.minCoveredMs).toBe(250);
    // Only the first `count` are this trick's.
    expect(trickPace([...frames(20, 13), ...frames(90, 12)], 13)).toBe(20);
  });

  it('calls a tier choppy when two of its three tricks ran under 25 frames a second', () => {
    expect(ranChoppy([45, 50, 16])).toBe(true);
    expect(ranChoppy([45, 16, 17])).toBe(false);
    expect(ranChoppy([40, 40, 40])).toBe(false);
  });

  it('steps High to Medium, Medium to Low, and Low nowhere; a cap only ever lowers the pick', () => {
    expect(lowerTier('high')).toBe('medium');
    expect(lowerTier('medium')).toBe('low');
    expect(lowerTier('low')).toBeNull();
    expect(capQuality('high', 'medium')).toBe('medium');
    expect(capQuality('low', 'medium')).toBe('low');
    expect(capQuality('high', null)).toBe('high');
    expect(capQuality('high', 'nonsense')).toBe('high');
  });
});

describe('noteTrickPace (the store decides)', () => {
  beforeEach(() => localStorage.clear());

  const autoStore = (quality: 'high' | 'medium' | 'low') => {
    const store = createTrickStore(() => 1000);
    store.setState({ quality, qualityAuto: true, paces: [], paceJudged: false });
    return store;
  };

  it('steps the device pick down one tier after choppy tricks, says what to announce, remembers it, and logs nothing', () => {
    const store = autoStore('high');
    expect(store.getState().noteTrickPace(55)).toBeNull();
    expect(store.getState().noteTrickPace(60)).toBeNull();
    expect(store.getState().quality).toBe('high');
    expect(store.getState().noteTrickPace(16)).toBe(STEP_DOWN_ANNOUNCEMENT.medium);
    const s = store.getState();
    expect(s.quality).toBe('medium');
    expect(s.qualityAuto).toBe(true);
    expect(localStorage.getItem(QUALITY_STEP_KEY)).toBe('medium');
    expect(s.events).toEqual([]);
    // The next visit starts there (the device would pick High again).
    const next = createTrickStore(() => 1000);
    expect(capQuality('high', localStorage.getItem(QUALITY_STEP_KEY))).toBe('medium');
    expect(['medium', 'low']).toContain(next.getState().quality);
    // And the new tier is judged afresh: still choppy steps it to Low.
    const said = [70, 70, 70].map((ms) => store.getState().noteTrickPace(ms));
    expect(store.getState().quality).toBe('low');
    expect(said).toEqual([null, null, STEP_DOWN_ANNOUNCEMENT.low]);
  });

  it('keeps a tier whose first tricks ran smoothly, and stops judging it', () => {
    const store = autoStore('high');
    for (const ms of [17, 16, 18]) store.getState().noteTrickPace(ms);
    expect(store.getState().paceJudged).toBe(true);
    for (const ms of [90, 90, 90]) store.getState().noteTrickPace(ms);
    expect(store.getState().quality).toBe('high');
  });

  it('leaves a tier the student chose alone, and Low (nowhere lower)', () => {
    const chosen = createTrickStore(() => 1000);
    chosen.getState().setQuality('high');
    for (const ms of [90, 90, 90]) chosen.getState().noteTrickPace(ms);
    expect(chosen.getState().quality).toBe('high');
    const low = autoStore('low');
    for (const ms of [90, 90, 90]) low.getState().noteTrickPace(ms);
    expect(low.getState().quality).toBe('low');
    expect(localStorage.getItem(QUALITY_STEP_KEY)).toBeNull();
  });
});

describe('the step-down at a landing (ADR-59)', () => {
  beforeEach(() => localStorage.clear());

  it("judges each landed flight's pace from the scene and says a step-down in the landing's own announcement", () => {
    const store = createTrickStore(() => 1000);
    store.setState({ quality: 'high', qualityAuto: true, paces: [], paceJudged: false });
    const asked: number[] = [];
    store.getState().setPaceSource((flightId) => {
      asked.push(flightId);
      return 60;
    });
    store.getState().applyPreset('kickflip');
    for (let i = 0; i < 3; i++) {
      store.getState().popTrick();
      store.getState().land();
    }
    expect(asked).toEqual([1, 2, 3]);
    const s = store.getState();
    expect(s.quality).toBe('medium');
    expect(s.announcement.message).toMatch(/^Kickflip landed\. .*Tricks were running slowly on this device, so quality is now medium\. You can change it in View\.$/);
    expect(s.events.map((e) => e.type).filter((t) => !['preset.applied', 'trick.popped', 'trick.resolved', 'objective.completed'].includes(t))).toEqual([]);
  });

  it('asks nothing of a pop resolved at once, and judges nothing with no scene', () => {
    const store = createTrickStore(() => 1000);
    store.setState({ quality: 'high', qualityAuto: true });
    store.getState().popTrick();
    store.getState().land();
    expect(store.getState().paces).toEqual([]);
  });
});
