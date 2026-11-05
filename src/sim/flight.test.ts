import { describe, expect, it } from 'vitest';
import { buildDeck } from '../asset/deck';
import { REST_Y, WHEEL } from '../asset/spec';
import { ART } from '../scene/artDirection';
import {
  advance,
  airtimeFor,
  computeFlight,
  CONTACT,
  contactLift,
  heightAt,
  LEVEL_BY,
  pitchAt,
  poseAt,
  POP_PITCH,
  POP_RISE_BY,
  TAIL_STRIKE,
  writePose,
} from './flight';
import { MOTION } from './feet';

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
  // Changed on purpose (2026-11-04): pitchAt(0) used to be POP_PITCH, so
  // scrubbing the timeline back to 0 after a trick showed the board tilted
  // instead of at rest. Progress 0 is now level, the nose is fully up at the
  // end of the feet model's pop window, and level again by 35 percent.
  it('is level at progress 0, so 0 percent is exactly the rest pose', () => {
    expect(pitchAt(0)).toBe(0);
    expect(pitchAt(-1)).toBe(0);
    const f = computeFlight({ pop: 0.35, flick: 1.9, scoop: 0.9 });
    expect(poseAt(f, 0)).toEqual({ y: 0, roll: 0, yaw: 0, pitch: 0 });
  });

  it('peaks at POP_PITCH at the end of the pop window and is level by 35 percent', () => {
    expect(POP_RISE_BY).toBe(MOTION.pop.end);
    expect(pitchAt(POP_RISE_BY)).toBe(POP_PITCH);
    expect(pitchAt(0.025)).toBeGreaterThan(POP_PITCH / 2);
    expect(pitchAt(0.2)).toBeGreaterThan(0);
    expect(pitchAt(0.2)).toBeLessThan(POP_PITCH);
    expect(pitchAt(LEVEL_BY)).toBe(0);
    expect(pitchAt(0.8)).toBe(0);
    expect(pitchAt(1)).toBe(0);
    let max = 0;
    for (let i = 0; i <= 1000; i++) max = Math.max(max, pitchAt(i / 1000));
    expect(max).toBe(POP_PITCH);
  });

  it('has no kink at the peak (slope under 1 degree per unit progress on both sides, against 720 at the snap)', () => {
    const h = 1e-5;
    const left = (pitchAt(POP_RISE_BY) - pitchAt(POP_RISE_BY - h)) / h;
    const right = (pitchAt(POP_RISE_BY + h) - pitchAt(POP_RISE_BY)) / h;
    expect(Math.abs(left)).toBeLessThan(1);
    expect(Math.abs(right)).toBeLessThan(1);
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

// ADR-27 (2026-11-04): the pop pivots the board on its tail contact.
describe('tail-pivot pop', () => {
  const D2R = Math.PI / 180;
  /** Every vertex of the built high-detail deck, board frame. */
  const deckPoints = (() => {
    const out: [number, number, number][] = [];
    for (const g of Object.values(buildDeck('high').groups)) {
      const a = g.getAttribute('position');
      for (let i = 0; i < a.count; i++) out.push([a.getX(i), a.getY(i), a.getZ(i)]);
    }
    return out;
  })();
  /** Lowest deck point, relative to the deck centre, for a board rolled about its long axis, then pitched nose up (YZX, ADR-32). */
  const deckLowest = (pitch: number, roll: number) => {
    const sp = Math.sin(pitch * D2R), cp = Math.cos(pitch * D2R), sr = Math.sin(roll * D2R), cr = Math.cos(roll * D2R);
    let m = Infinity;
    for (const [x, y, z] of deckPoints) m = Math.min(m, x * sp + (y * cr - z * sr) * cp);
    return m;
  };

  it('declares contact numbers that match the asset and the scene', () => {
    expect(CONTACT.restY).toBeCloseTo(REST_Y, 9);
    expect(CONTACT.restY).toBeCloseTo(ART.board.restY, 9);
    expect(CONTACT.wheel.x).toBe(WHEEL.centerX);
    expect(CONTACT.wheel.y).toBe(WHEEL.centerY);
    expect(CONTACT.wheel.radius).toBe(WHEEL.radius);
    // The flat of the tread: the profile is at full radius out to 9 mm either side of the wheel centre.
    const flat = WHEEL.profile.filter(([r]) => r === WHEEL.radius).map(([, z]) => z);
    expect(CONTACT.wheel.z[0]).toBeCloseTo(WHEEL.centerZ + Math.min(...flat), 9);
    expect(CONTACT.wheel.z[1]).toBeCloseTo(WHEEL.centerZ + Math.max(...flat), 9);
    // The primitive board (Low, fallback) has its axles on the same line, so it pivots on the same wheels.
    expect(ART.board.wheels.x).toBe(CONTACT.wheel.x);
    expect(ART.board.wheels.y - ART.board.wheels.radius + ART.board.primitiveLift).toBeCloseTo(-CONTACT.restY, 6);
  });

  it('puts the tail contact where the built deck meets the pad at the strike, within 1 mm', () => {
    const lowest = deckLowest(TAIL_STRIKE, 0);
    expect(CONTACT.tail.x * Math.sin(TAIL_STRIKE * D2R) + CONTACT.tail.y * Math.cos(TAIL_STRIKE * D2R)).toBeCloseTo(lowest, 3);
    // At the strike the tail and the rear wheels are both on the pad.
    expect(POP_PITCH).toBe(TAIL_STRIKE);
    expect(TAIL_STRIKE).toBeGreaterThan(30);
    expect(TAIL_STRIKE).toBeLessThan(35);
    expect(lowest + contactLift(TAIL_STRIKE, 0) + CONTACT.restY).toBeCloseTo(0, 3);
  });

  it('is exactly the rest pose at 0 and rests on the pad at 1', () => {
    for (const inputs of [{ pop: 0.35, flick: 1.9, scoop: 0.9 }, { pop: 0.15, flick: 3, scoop: 3 }]) {
      const f = computeFlight(inputs);
      expect(poseAt(f, 0)).toEqual({ y: 0, roll: 0, yaw: 0, pitch: 0 });
      expect(poseAt(f, 1).y).toBe(0);
    }
    expect(contactLift(0, 0)).toBe(0);
  });

  it('keeps nothing under the pad in the pop and has the tail on it at full pitch', () => {
    for (const inputs of [
      { pop: 0.15, flick: 0, scoop: 0 },
      { pop: 0.35, flick: 1.9, scoop: 0 },
      { pop: 0.35, flick: 1.9, scoop: 1.9 },
      { pop: 0.6, flick: 3, scoop: 3 },
    ]) {
      const f = computeFlight(inputs);
      for (let i = 0; i <= 35; i++) {
        const p = poseAt(f, i / 100);
        // Wheels and tail from the contact model; the deck itself from the built mesh.
        expect(p.y + 1e-9).toBeGreaterThanOrEqual(contactLift(p.pitch, p.roll));
        expect(p.y + CONTACT.restY + deckLowest(p.pitch, p.roll)).toBeGreaterThan(-0.002);
      }
      const strike = poseAt(f, POP_RISE_BY);
      // Lowest point on the pad: the board pivoted, it did not jump.
      expect(strike.y - contactLift(strike.pitch, strike.roll)).toBeCloseTo(0, 9);
    }
    // With no roll the struck point is the tail, level with the rear wheels.
    const ollie = poseAt(computeFlight({ pop: 0.35, flick: 0, scoop: 0 }), POP_RISE_BY);
    const tail = CONTACT.tail.x * Math.sin(ollie.pitch * D2R) + CONTACT.tail.y * Math.cos(ollie.pitch * D2R);
    expect(ollie.y + tail - -CONTACT.restY).toBeCloseTo(0, 6);
  });

  it('rises the whole way to the peak, never past it, and keeps the parabola after it', () => {
    for (const pop of [0.15, 0.35, 0.6]) {
      const f = computeFlight({ pop, flick: 1.9, scoop: 0.9 });
      let prev = 0;
      for (let i = 1; i <= 500; i++) {
        const y = poseAt(f, i / 1000).y;
        expect(y).toBeGreaterThanOrEqual(prev - 1e-6);
        expect(y).toBeLessThanOrEqual(pop + 1e-12);
        prev = y;
      }
      expect(poseAt(f, 0.5).y).toBeCloseTo(pop, 12);
      for (const u of [0.5, 0.6, 0.8, 0.95, 1]) expect(poseAt(f, u).y).toBe(heightAt(pop, u));
      // The pivot lifts the deck centre ahead of the plain parabola early on.
      expect(poseAt(f, 0.02).y).toBeGreaterThan(heightAt(pop, 0.02) + 0.03);
    }
  });

  it('writes into the given object (no allocation per call)', () => {
    const out = { y: 0, roll: 0, yaw: 0, pitch: 0 };
    const f = computeFlight({ pop: 0.35, flick: 1.9, scoop: 0.9 });
    for (const u of [0, 0.03, 0.2, 0.7]) expect(writePose(out, f, u)).toBe(out);
  });
});
