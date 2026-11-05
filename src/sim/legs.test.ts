import { describe, expect, it } from 'vitest';
import { CATCH, newFeetPose, writeFeetPose, writeStance, type FeetPose, type Stance } from './feet';
import { computeFlight, PHASE, type Flight, type TrickInputs } from './flight';
import {
  describeLegs,
  HIPS,
  hipHeight,
  kneeBend,
  LEG,
  MAX_REACH,
  newLegsPose,
  writeLegsPose,
  type LegPose,
  type LegsPose,
  type Point3,
} from './legs';
import { PRESETS } from './tricks';

const STANCES: Stance[] = ['goofy', 'regular'];
const dist = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const feet = newFeetPose();

/** Feet then legs at u, as FlightDriver calls them. */
function pose(out: LegsPose, inputs: TrickInputs, flight: Flight | null, u: number, stance: Stance = 'goofy', f: FeetPose = feet) {
  writeFeetPose(f, inputs, flight, u, stance);
  return writeLegsPose(out, f, flight, u, inputs, stance);
}

/**
 * Every preset, plus the kickflip with a frontside scoop (the hardflip preset
 * until ADR-41, 2026-11-05, still on the sliders), at the three pops the lab
 * teaches with (lands at 0.35, bails at 0.15, the highest 0.6).
 */
const KICKFLIP_FRONTSIDE: TrickInputs = { pop: 0.35, flick: 1.9, scoop: -0.9 };
const SWEPT: TrickInputs[] = [...PRESETS.map((p) => p.inputs), KICKFLIP_FRONTSIDE];
const CASES: TrickInputs[] = SWEPT.flatMap((inputs) => [0.15, 0.35, 0.6].map((pop) => ({ ...inputs, pop })));
/** The input that drives the reach clamp hardest (a sweep of the whole input range, 2026-11-05). */
const REACH: TrickInputs = { pop: 0.6, flick: 2, scoop: -3 };

describe('leg lengths and the IK (ADR-37)', () => {
  it('keeps the thigh and shank lengths at 200 steps of every preset, both stances, and reaches the ankle', () => {
    const out = newLegsPose();
    for (const inputs of [...CASES, REACH]) {
      const flight = computeFlight(inputs);
      for (const stance of STANCES) {
        for (let i = 0; i <= 200; i++) {
          const l = pose(out, inputs, flight, i / 200, stance);
          for (const leg of [l.front, l.back]) {
            expect(Math.abs(dist(leg.hip, leg.knee) - LEG.thigh)).toBeLessThan(1e-6);
            expect(Math.abs(dist(leg.knee, leg.ankle) - LEG.shank)).toBeLessThan(1e-6);
            // The clamp keeps every ankle in reach, so the IK lands on it.
            expect(dist(leg.ankle, leg.target)).toBeLessThan(1e-6);
            expect(dist(leg.hip, leg.target)).toBeLessThanOrEqual(MAX_REACH + 1e-9);
            // The segments the scene applies: start at the joint, unit direction to the next.
            expect(Math.hypot(leg.thigh.dx, leg.thigh.dy, leg.thigh.dz)).toBeCloseTo(1, 9);
            expect(leg.thigh.x + leg.thigh.dx * leg.thigh.length).toBeCloseTo(leg.knee.x, 9);
            expect(leg.shank.y + leg.shank.dy * leg.shank.length).toBeCloseTo(leg.ankle.y, 9);
          }
        }
      }
    }
  });

  it('always bends the knee toward its pole, forward of the hip-ankle line (never backwards)', () => {
    const out = newLegsPose();
    const offLine = (leg: LegPose) => {
      const ux = leg.ankle.x - leg.hip.x;
      const uy = leg.ankle.y - leg.hip.y;
      const uz = leg.ankle.z - leg.hip.z;
      const n = Math.hypot(ux, uy, uz);
      const kx = leg.knee.x - leg.hip.x;
      const ky = leg.knee.y - leg.hip.y;
      const kz = leg.knee.z - leg.hip.z;
      const along = (kx * ux + ky * uy + kz * uz) / n;
      // The knee's offset from the line, along the pole.
      return (kx - (along * ux) / n) * leg.pole.x + (ky - (along * uy) / n) * leg.pole.y + (kz - (along * uz) / n) * leg.pole.z;
    };
    let least = Infinity;
    for (const inputs of [...CASES, REACH, { pop: 0.6, flick: -3, scoop: 3 }, { pop: 0.15, flick: 3, scoop: -3 }]) {
      const flight = computeFlight(inputs);
      for (const stance of STANCES) {
        for (let i = 0; i <= 200; i++) {
          const l = pose(out, inputs, flight, i / 200, stance);
          for (const leg of [l.front, l.back]) {
            least = Math.min(least, offLine(leg));
            // Forward is the toe side, -Z, in both stances: the rider faces -Z.
            expect(leg.pole.z).toBeLessThan(0);
          }
        }
      }
    }
    // Measured 2026-11-05: at least 8.2 cm off the line, at the clamp's straightest leg.
    expect(least).toBeGreaterThan(0.05);
  });

  // Measured 2026-11-05 over the whole input range (pop 0.15 to 0.6, flick and
  // scoop -3 to 3 by 0.5): the clamp engages only for hard frontside scoops at
  // high pops, where the back foot slices away toward the toe side while the
  // hips rise, by up to 8.0 cm at REACH, u 0.114. It is a min of continuous
  // heights, so it has a corner, not a step: through it the pelvis moves with
  // the back ankle it is held to (9.1 mm per 0.001 of progress at most, the
  // ankle 8.9 mm: the scoop's own speed plus the clearance lift), never more
  // than that ankle's step plus the free hips' own step, and it lets go
  // again by u 0.16.
  it('engages the reach clamp without a jump', () => {
    const out = newLegsPose();
    const flight = computeFlight(REACH);
    let clamped = 0;
    let worst = 0;
    let prevPelvis = { x: 0, y: 0, z: 0 };
    let prevAnkles = [prevPelvis, prevPelvis];
    let prevFree = 0;
    for (let i = 0; i <= 1000; i++) {
      const u = i / 1000;
      const l = pose(out, REACH, flight, u);
      clamped = Math.max(clamped, l.clamped);
      const ankles = [{ ...l.front.target }, { ...l.back.target }];
      const free = hipHeight(flight, u);
      if (i > 0) {
        const step = dist(l.pelvis, prevPelvis);
        const ankle = Math.max(dist(ankles[0]!, prevAnkles[0]!), dist(ankles[1]!, prevAnkles[1]!));
        worst = Math.max(worst, step);
        expect(step).toBeLessThanOrEqual(1.1 * ankle + Math.abs(free - prevFree) + 1e-9);
      }
      prevPelvis = { ...l.pelvis };
      prevAnkles = ankles;
      prevFree = free;
    }
    expect(clamped).toBeGreaterThan(0.05);
    expect(worst).toBeLessThan(0.01);
    // With the clamp the leg is nearly straight, never locked.
    for (let i = 0; i <= 200; i++) {
      const l = pose(out, REACH, flight, i / 200);
      expect(Math.min(kneeBend(l.front), kneeBend(l.back))).toBeGreaterThan(22);
    }
  });

  // Measured 2026-11-05 at 1000 steps over every preset at pops 0.15, 0.35
  // and 0.6, both stances: hips 3.5 mm per 0.001 of progress (the landing of
  // a 0.6 m pop), knees 10.9 mm (the back knee in a 0.6 m 360 flip's scoop),
  // ankles 8.8 mm (they are the feet's own motion plus the clearance lift,
  // feet.test.ts bounds those). At 1x playback a frame is about 0.03 of the
  // airtime, so none of it is a jump.
  it('moves continuously: under 5 mm of hip and 12 mm of knee per 0.001 of progress', () => {
    const out = newLegsPose();
    for (const inputs of CASES) {
      const flight = computeFlight(inputs);
      for (const stance of STANCES) {
        let prev: Point3[] = [];
        for (let i = 0; i <= 1000; i++) {
          const l = pose(out, inputs, flight, i / 1000, stance);
          const now = [l.front.hip, l.back.hip, l.front.knee, l.back.knee].map((p) => ({ ...p }));
          if (i > 0) {
            expect(dist(now[0]!, prev[0]!)).toBeLessThan(0.005);
            expect(dist(now[1]!, prev[1]!)).toBeLessThan(0.005);
            expect(dist(now[2]!, prev[2]!)).toBeLessThan(0.012);
            expect(dist(now[3]!, prev[3]!)).toBeLessThan(0.012);
          }
          prev = now;
        }
      }
    }
  });

  it('writes into the given object and returns it (no allocation per call)', () => {
    const out = newLegsPose();
    const { front, back, pelvis } = out;
    const knee = out.front.knee;
    const thigh = out.back.thigh;
    const flight = computeFlight(PRESETS[0]!.inputs);
    writeFeetPose(feet, PRESETS[0]!.inputs, flight, 0.3);
    expect(writeLegsPose(out, feet, flight, 0.3, PRESETS[0]!.inputs)).toBe(out);
    expect(writeLegsPose(out, feet, null, 0, PRESETS[0]!.inputs, 'regular')).toBe(out);
    expect(out.front).toBe(front);
    expect(out.back).toBe(back);
    expect(out.pelvis).toBe(pelvis);
    expect(out.front.knee).toBe(knee);
    expect(out.back.thigh).toBe(thigh);
  });

  it('reads the feet and never changes them', () => {
    const out = newLegsPose();
    const flight = computeFlight(REACH);
    for (const u of [0, 0.114, 0.5, 0.9, 1]) {
      writeFeetPose(feet, REACH, flight, u);
      const before = JSON.stringify(feet);
      writeLegsPose(out, feet, flight, u, REACH);
      expect(JSON.stringify(feet)).toBe(before);
    }
  });

  it('mirrors regular from goofy along X, knees still toward the toe side', () => {
    const g = newLegsPose();
    const r = newLegsPose();
    const fr = newFeetPose();
    for (const inputs of CASES) {
      const flight = computeFlight(inputs);
      for (const u of [0, 0.05, 0.2, 0.5, 0.7, 1]) {
        pose(g, inputs, flight, u, 'goofy');
        pose(r, inputs, flight, u, 'regular', fr);
        for (const leg of ['front', 'back'] as const) {
          for (const j of ['hip', 'knee', 'ankle'] as const) {
            expect(r[leg][j].x).toBeCloseTo(-g[leg][j].x, 9);
            expect(r[leg][j].y).toBeCloseTo(g[leg][j].y, 9);
            expect(r[leg][j].z).toBeCloseTo(g[leg][j].z, 9);
          }
        }
      }
    }
  });
});

describe('the rider crouches, jumps and absorbs (ADR-37)', () => {
  const landed = SWEPT;

  it('crouches at progress 0 over the stance, the same pose as before the pop', () => {
    const idle = newLegsPose();
    const popped = newLegsPose();
    const stand = newFeetPose();
    const f0 = newFeetPose();
    for (const inputs of landed) {
      const flight = computeFlight(inputs);
      for (const stance of STANCES) {
        pose(idle, inputs, null, 0, stance);
        pose(popped, inputs, flight, 0, stance, f0);
        // Progress 0 of a flight is the stance: the feet as writeStance puts them (plus the clearance), the legs identical.
        writeStance(stand, inputs);
        // (x mirrors for regular; z is the same in both stances; the clearance only adds height.)
        for (const foot of ['front', 'back'] as const) {
          expect(Math.abs(f0[foot].x)).toBeCloseTo(Math.abs(stand[foot].x), 9);
          expect(f0[foot].z).toBeCloseTo(stand[foot].z, 9);
          expect(f0[foot].y).toBeGreaterThanOrEqual(stand[foot].y - 1e-9);
        }
        expect(JSON.stringify(popped)).toBe(JSON.stringify(idle));
        expect(idle.clamped).toBe(0);
        for (const leg of [idle.front, idle.back]) {
          // Measured 2026-11-05: 85 to 92 degrees.
          expect(kneeBend(leg)).toBeGreaterThan(80);
          expect(kneeBend(leg)).toBeLessThan(100);
        }
      }
    }
  });

  it('keeps both thighs above the soles of both shoes', () => {
    const out = newLegsPose();
    let least = Infinity;
    for (const inputs of [...CASES, REACH]) {
      const flight = computeFlight(inputs);
      for (const stance of STANCES) {
        for (let i = 0; i <= 200; i++) {
          const l = pose(out, inputs, flight, i / 200, stance);
          const sole = Math.max(feet.front.y, feet.back.y);
          for (const leg of [l.front, l.back]) least = Math.min(least, Math.min(leg.hip.y, leg.knee.y) - sole);
        }
      }
    }
    // Measured 2026-11-05: the lowest knee is 8.2 cm above the higher sole.
    expect(least).toBeGreaterThan(0.05);
  });

  // Measured 2026-11-05 for the eight presets of then (now the seven and
  // the kickflip with a frontside scoop) at pop 0.35: 85 to 92 degrees
  // in the crouch, 64 to 66 at the catch (the legs reach down for the board),
  // 84 at the landing (the absorb), held after it.
  it('reaches for the catch with bent knees, then bends further to absorb the landing', () => {
    const out = newLegsPose();
    for (const inputs of landed) {
      const flight = computeFlight(inputs);
      expect(flight.landed).toBe(true);
      for (const stance of STANCES) {
        pose(out, inputs, flight, CATCH.back, stance);
        const atCatch = [kneeBend(out.front), kneeBend(out.back)];
        pose(out, inputs, flight, 1, stance);
        const atLanding = [kneeBend(out.front), kneeBend(out.back)];
        for (let k = 0; k < 2; k++) {
          expect(atCatch[k]).toBeGreaterThan(55);
          expect(atCatch[k]).toBeLessThan(75);
          expect(atLanding[k]).toBeGreaterThan(75);
          expect(atLanding[k]).toBeLessThan(95);
          expect(atLanding[k]! - atCatch[k]!).toBeGreaterThan(10);
        }
      }
    }
  });

  it('tucks the knees in the air: more bent at the tuck peaks than at the catch', () => {
    const out = newLegsPose();
    for (const inputs of landed) {
      const flight = computeFlight(inputs);
      pose(out, inputs, flight, 0.4);
      const tucked = Math.max(kneeBend(out.front), kneeBend(out.back));
      pose(out, inputs, flight, CATCH.back);
      expect(tucked).toBeGreaterThan(Math.max(kneeBend(out.front), kneeBend(out.back)) + 5);
    }
  });

  it('jumps on its own projectile: crouch at 0, a level top a little after the board peak, the absorb held at 1', () => {
    for (const inputs of CASES) {
      const flight = computeFlight(inputs);
      let best = 0;
      let bestAt = 0;
      let prev = hipHeight(flight, 0);
      for (let i = 1; i <= 1000; i++) {
        const y = hipHeight(flight, i / 1000);
        expect(Math.abs(y - prev)).toBeLessThan(0.005);
        if (y > best) {
          best = y;
          bestAt = i / 1000;
        }
        prev = y;
      }
      expect(hipHeight(flight, 0)).toBe(hipHeight(null, 0));
      expect(bestAt).toBeCloseTo(HIPS.jump.peakAt, 3);
      expect(bestAt).toBeGreaterThan(0.5);
      expect(best - hipHeight(flight, 0)).toBeCloseTo(inputs.pop * HIPS.jump.perPop + HIPS.jump.extra, 9);
      expect(hipHeight(flight, 1.5)).toBe(hipHeight(flight, 1));
    }
  });
});

describe('legs in words (ADR-37)', () => {
  const landed = computeFlight(PRESETS[0]!.inputs);
  const bailed = computeFlight({ ...PRESETS[0]!.inputs, pop: 0.15 });

  it('follows the hips: crouched, tucked, reaching for the catch, absorbing', () => {
    expect(describeLegs(0, null)).toBe('Legs crouched, knees bent, ready to pop.');
    expect(describeLegs(0, landed)).toBe('Legs crouched, knees bent, ready to pop.');
    expect(describeLegs(0.3, landed)).toBe('Knees tucked up in the air.');
    expect(describeLegs(PHASE.catch.start, landed)).toBe('Legs reach down to catch the board.');
    expect(describeLegs(1, landed)).toBe('Knees bent, absorbing the landing.');
    expect(describeLegs(0.9, bailed)).toBe('Legs reach down beside the board.');
    expect(describeLegs(1, bailed)).toBe('Knees bent, landing on the pad beside the board.');
    for (const u of [0, 0.3, 0.7, 1]) {
      expect(describeLegs(u, landed)).not.toMatch(/foot|feet/i);
      expect(describeLegs(u, landed)).not.toContain(String.fromCharCode(0x2014));
    }
  });
});
