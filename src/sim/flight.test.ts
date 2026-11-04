import { describe, expect, it } from 'vitest';
import { advance, airtimeFor, computeFlight, heightAt, pitchAt, poseAt, POP_PITCH, writePose } from './flight';

describe('airtime', () => {
  it('is 2 * sqrt(2h / g)', () => {
    expect(airtimeFor(0.35)).toBeCloseTo(0.5342, 4);
    expect(airtimeFor(0.15)).toBeCloseTo(0.3497, 4);
    expect(airtimeFor(0.6)).toBeCloseTo(0.6995, 4);
  });

  it('grows with the square root of height', () => {
    expect(airtimeFor(0.6) / airtimeFor(0.15)).toBeCloseTo(2, 6);
  });
});

describe('height parabola', () => {
  it('starts and ends on the ground and peaks at h halfway', () => {
    expect(heightAt(0.35, 0)).toBe(0);
    expect(heightAt(0.35, 1)).toBe(0);
    expect(heightAt(0.35, 0.5)).toBeCloseTo(0.35, 10);
  });

  it('is symmetric and clamps outside the flight', () => {
    expect(heightAt(0.35, 0.25)).toBeCloseTo(heightAt(0.35, 0.75), 10);
    expect(heightAt(0.35, 0.25)).toBeCloseTo(0.2625, 10);
    expect(heightAt(0.35, -1)).toBe(0);
    expect(heightAt(0.35, 2)).toBe(0);
  });
});

describe('rotation totals', () => {
  it('rollTotal = flick * T * 360 and yawTotal = scoop * T * 360', () => {
    const f = computeFlight({ pop: 0.35, flick: 1.9, scoop: 0.9 });
    expect(f.airtime).toBeCloseTo(0.534, 3);
    expect(f.rollTotal).toBeCloseTo(365.4, 1);
    expect(f.yawTotal).toBeCloseTo(173.1, 1);
    expect(computeFlight({ pop: 0.35, flick: 0, scoop: 1.9 }).yawTotal).toBeCloseTo(365.4, 1);
  });

  it('rotates at a constant rate', () => {
    const f = computeFlight({ pop: 0.35, flick: 2, scoop: 1 });
    expect(poseAt(f, 0.25).roll).toBeCloseTo(f.rollTotal / 4, 10);
    expect(poseAt(f, 0.5).yaw).toBeCloseTo(f.yawTotal / 2, 10);
    expect(poseAt(f, 1).roll).toBeCloseTo(f.rollTotal, 10);
  });
});

describe('pitch (cosmetic)', () => {
  it('is nose up at pop and level by 35 percent of the flight', () => {
    expect(pitchAt(0)).toBe(POP_PITCH);
    expect(pitchAt(0.2)).toBeGreaterThan(0);
    expect(pitchAt(0.2)).toBeLessThan(POP_PITCH);
    expect(pitchAt(0.35)).toBe(0);
    expect(pitchAt(0.8)).toBe(0);
  });
});

describe('writePose', () => {
  it('rests flat with no flight and reuses the output object', () => {
    const out = { y: 9, roll: 9, yaw: 9, pitch: 9 };
    expect(writePose(out, null, 0.5)).toBe(out);
    expect(out).toEqual({ y: 0, roll: 0, yaw: 0, pitch: 0 });
  });

  it('lands level at progress 1', () => {
    const f = computeFlight({ pop: 0.35, flick: 1.9, scoop: 0 });
    const p = poseAt(f, 1);
    expect(p.y).toBe(0);
    expect(p.pitch).toBe(0);
  });
});

describe('advance', () => {
  it('moves progress by dt * rate / T and stops at 1', () => {
    expect(advance(0, 0.1, 1, 0.5)).toBeCloseTo(0.2, 10);
    expect(advance(0, 0.1, 0.25, 0.5)).toBeCloseTo(0.05, 10);
    expect(advance(0.95, 0.1, 1, 0.5)).toBe(1);
    expect(advance(0, 0.1, 1, 0)).toBe(1);
  });
});
