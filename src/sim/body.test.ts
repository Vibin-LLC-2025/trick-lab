// The whole rider from the pelvis up (ADR-85): the pose is finite, smooth
// and inside human limits over every input the timing bar can produce, it
// never moves a foot or a leg, regular is goofy's mirror, and the rig is the
// one the scene writes.
import { describe, expect, it } from 'vitest';
import {
  BIND,
  BODY,
  BONE,
  bonePoint,
  describeBody,
  hingeBend,
  MIRROR_BONE,
  MOTION,
  newBodyPose,
  RIDER_BONES,
  writeBindPose,
  writeBodyPose,
  type BodyPose,
  type BoneFrame,
} from './body';
import { newFeetPose, writeFeetPose, type Stance } from './feet';
import { computeFlight, heightAt, PHASE, type Flight, type TrickInputs } from './flight';
import { LEG, newLegsPose, writeLegsPose, type Point3 } from './legs';
import { PRESETS } from './tricks';

const STANCES: Stance[] = ['goofy', 'regular'];
const feet = newFeetPose();
const legs = newLegsPose();
const p = { x: 0, y: 0, z: 0 };
const q = { x: 0, y: 0, z: 0 };
const dot = (a: Point3, b: Point3) => a.x * b.x + a.y * b.y + a.z * b.z;
const dist = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Feet, legs, then the body at u, as FlightDriver calls them. */
function pose(out: BodyPose, inputs: TrickInputs, flight: Flight | null, u: number, stance: Stance = 'goofy') {
  writeFeetPose(feet, inputs, flight, u, stance);
  writeLegsPose(legs, feet, flight, u, inputs, stance);
  return writeBodyPose(out, legs, feet, flight, u, inputs, stance);
}

/**
 * Every preset at the three pops the lab teaches with, and the corners of
 * what the timing bar can produce (rates to about 4.2 rev/s either way,
 * bar.ts ADR-65) at the lowest and highest pops.
 */
const CASES: TrickInputs[] = [
  ...PRESETS.flatMap((pr) => [0.15, 0.35, 0.6].map((pop) => ({ ...pr.inputs, pop }))),
  ...[0.15, 0.6].flatMap((pop) => [-4.2, 4.2].flatMap((flick) => [-4.2, 0, 4.2].map((scoop) => ({ pop, flick, scoop })))),
];
const UPPER = RIDER_BONES.map((_, i) => i).filter((i) => !RIDER_BONES[i]!.startsWith('thigh') && !RIDER_BONES[i]!.startsWith('shin'));

/** Every pose of every case in both stances at 200 steps, with the step before it. */
function sweep(check: (b: BodyPose, before: BodyPose | null, inputs: TrickInputs, flight: Flight, u: number, stance: Stance) => void) {
  const a = newBodyPose();
  const b = newBodyPose();
  for (const inputs of CASES) {
    const flight = computeFlight(inputs);
    for (const stance of STANCES) {
      let cur = a;
      let prev: BodyPose | null = null;
      for (let i = 0; i <= 200; i++) {
        pose(cur, inputs, flight, i / 200, stance);
        check(cur, prev, inputs, flight, i / 200, stance);
        prev = cur;
        cur = cur === a ? b : a;
      }
    }
  }
}

/**
 * How far a frame is from orthonormal and right-handed: the largest error of
 * the axes' lengths, their dot products and X x Y - Z. A number, not
 * expects, so a sweep of a million frames stays fast; the test asserts it once.
 */
const frameError = (f: BoneFrame) => {
  const { x, y, z } = f;
  return Math.max(
    ...[x, y, z].map((ax) => Math.abs(Math.hypot(ax.x, ax.y, ax.z) - 1)),
    Math.abs(dot(x, y)),
    Math.abs(dot(y, z)),
    Math.abs(dot(x, z)),
    Math.abs(x.y * y.z - x.z * y.y - z.x),
    Math.abs(x.z * y.x - x.x * y.z - z.y),
    Math.abs(x.x * y.y - x.y * y.x - z.z),
  );
};

/** The quaternion turns +Y onto the frame's Y axis (three's rotation of a vector by a unit quaternion). */
function quatY(f: BoneFrame) {
  const { x, y, z, w } = f.q;
  return { x: 2 * (x * y - w * z), y: 1 - 2 * (x * x + z * z), z: 2 * (y * z + w * x) };
}

describe('the rig (ADR-85)', () => {
  it('has 17 bones, each with one mirror, so the scene writes a fixed list', () => {
    expect(RIDER_BONES).toHaveLength(17);
    expect(new Set(RIDER_BONES).size).toBe(17);
    for (let i = 0; i < RIDER_BONES.length; i++) expect(MIRROR_BONE[MIRROR_BONE[i]!]).toBe(i);
    expect(RIDER_BONES[MIRROR_BONE[BONE.handL]!]).toBe('handR');
    expect(MIRROR_BONE[BONE.chest]).toBe(BONE.chest);
  });

  it('binds a 1.75 m rider standing, symmetric, the feet on the ground', () => {
    const b = writeBindPose(newBodyPose());
    const top = bonePoint(p, b.bones[BONE.head]!, 0, BODY.head, 0);
    // The knees are bent BIND.thigh degrees each way, so a little under 1.75.
    const bent = (LEG.thigh + LEG.shank) * (1 - Math.cos((BIND.thigh * Math.PI) / 180));
    expect(top.y).toBeCloseTo(1.75 - bent, 2);
    for (let i = 0; i < RIDER_BONES.length; i++) {
      const f = b.bones[i]!;
      const m = b.bones[MIRROR_BONE[i]!]!;
      expect(frameError(f)).toBeLessThan(1e-9);
      expect(f.o.x).toBeCloseTo(-m.o.x, 9);
      expect(f.o.y).toBeCloseTo(m.o.y, 9);
      expect(f.y.x).toBeCloseTo(-m.y.x, 9);
    }
    const ankle = bonePoint(q, b.bones[BONE.shinR]!, 0, LEG.shank, 0);
    expect(ankle.y).toBeCloseTo(LEG.ankleHeight, 9);
  });
});

describe('the pose over the whole input range (ADR-85)', () => {
  it('is finite, its frames orthonormal and right-handed, the quaternion the frame', () => {
    let finite = true;
    let frame = 0;
    let quat = 0;
    sweep((b) => {
      for (const f of b.bones) {
        finite &&= [f.o.x, f.o.y, f.o.z, f.q.x, f.q.y, f.q.z, f.q.w].every(Number.isFinite);
        frame = Math.max(frame, frameError(f));
        quat = Math.max(quat, dist(quatY(f), f.y));
      }
    });
    expect(finite).toBe(true);
    expect(frame).toBeLessThan(1e-9);
    expect(quat).toBeLessThan(1e-9);
  });

  it('is continuous: no upper-body joint moves more than 3 cm about the pelvis or turns more than 4 degrees in half a percent of the flight', () => {
    // The pelvis is the legs' (legs.ts), which can move up to 5.3 cm in that
    // step at 4.2 rev/s each way (its reach clamp); the body rides it.
    // Measured 2026-11-11: 2.3 cm (a hand) at most.
    let step = 0;
    let turn = 0;
    sweep((b, before) => {
      if (!before) return;
      const a = b.bones[BONE.pelvis]!.o;
      const pc = before.bones[BONE.pelvis]!.o;
      for (const i of UPPER) {
        const o = b.bones[i]!.o;
        const e = before.bones[i]!.o;
        step = Math.max(step, Math.hypot(o.x - a.x - (e.x - pc.x), o.y - a.y - (e.y - pc.y), o.z - a.z - (e.z - pc.z)));
        const c = Math.abs(dot(b.bones[i]!.q as unknown as Point3, before.bones[i]!.q as unknown as Point3) + b.bones[i]!.q.w * before.bones[i]!.q.w);
        turn = Math.max(turn, (2 * Math.acos(Math.min(1, c)) * 180) / Math.PI);
      }
    });
    expect(step).toBeLessThan(0.03);
    expect(turn).toBeLessThan(4);
  });

  it('keeps every joint inside human limits: elbows and knees never bend backwards, the spine folds 0 to 35 degrees', () => {
    sweep((b) => {
      for (const [u, f] of [
        [BONE.upperArmL, BONE.forearmL],
        [BONE.upperArmR, BONE.forearmR],
      ] as const) {
        const upper = b.bones[u]!;
        const fore = b.bones[f]!;
        const bend = hingeBend(upper, fore);
        expect(bend).toBeGreaterThanOrEqual(MOTION.bail.elbow - 1e-6);
        expect(bend).toBeLessThanOrEqual(90);
        // A hinge turns about its own X only: the forearm stays in the plane the upper arm's Z spans.
        expect(Math.abs(dot(fore.y, upper.x))).toBeLessThan(1e-9);
        // Forward, never backwards: the forearm leans toward the upper arm's +Z, the pole's side (forward and up).
        expect(dot(fore.y, upper.z)).toBeGreaterThan(0);
      }
      for (const [t, s] of [
        [BONE.thighL, BONE.shinL],
        [BONE.thighR, BONE.shinR],
      ] as const) {
        const thigh = b.bones[t]!;
        const shin = b.bones[s]!;
        // The knee's hinge is shared, and the shin swings back (+Z of the thigh's frame is forward, so behind it).
        expect(dist(thigh.x, shin.x)).toBeLessThan(1e-9);
        expect(dot(shin.y, thigh.z)).toBeLessThan(0);
      }
      const chest = b.bones[BONE.chest]!;
      const lean = (Math.atan2(-chest.y.z, chest.y.y) * 180) / Math.PI;
      expect(lean).toBeGreaterThanOrEqual(0);
      expect(lean).toBeLessThanOrEqual(35);
      expect(hingeBend(b.bones[BONE.pelvis]!, chest)).toBeLessThanOrEqual(20);
      // The head turns from the chest at most MOTION.look.max, with the neck taking half.
      expect(hingeBend(chest, b.bones[BONE.head]!)).toBeLessThanOrEqual(MOTION.look.max + 1e-6);
    });
  });

  it('keeps the hands out of the torso and above the board', () => {
    // Measured 2026-11-11: a hand at least 41 cm from the spine's axis and 49 cm above the deck's centre.
    let torso = Infinity;
    let board = Infinity;
    sweep((b, _before, _inputs, flight, u) => {
      const a = b.bones[BONE.pelvis]!.o;
      const top = bonePoint(q, b.bones[BONE.chest]!, 0, BODY.chest, 0);
      for (const h of [BONE.handL, BONE.handR])
        for (const t of [0, BODY.hand / 2, BODY.hand]) {
          bonePoint(p, b.bones[h]!, 0, t, 0);
          const v = { x: top.x - a.x, y: top.y - a.y, z: top.z - a.z };
          const s = Math.max(0, Math.min(1, ((p.x - a.x) * v.x + (p.y - a.y) * v.y + (p.z - a.z) * v.z) / dot(v, v)));
          torso = Math.min(torso, Math.hypot(p.x - a.x - s * v.x, p.y - a.y - s * v.y, p.z - a.z - s * v.z));
          board = Math.min(board, p.y - heightAt(flight.peak, u));
        }
    });
    // The hoodie is at most 20 cm from the spine's axis, the board's farthest point 13 cm from its centre.
    expect(torso).toBeGreaterThan(0.3);
    expect(board).toBeGreaterThan(0.3);
  });

  it('never moves a foot or a leg: the thighs and shins are the legs\' own segments', () => {
    sweep((b, _before, inputs, flight, u, stance) => {
      const before = JSON.stringify(feet);
      writeLegsPose(legs, feet, flight, u, inputs, stance);
      expect(JSON.stringify(feet)).toBe(before);
      const front = stance === 'regular' ? 'L' : 'R';
      const back = stance === 'regular' ? 'R' : 'L';
      for (const [side, leg] of [
        [front, legs.front],
        [back, legs.back],
      ] as const) {
        const thigh = b.bones[BONE[`thigh${side}`]]!;
        const shin = b.bones[BONE[`shin${side}`]]!;
        expect(dist(thigh.o, leg.hip)).toBeLessThan(1e-9);
        expect(dist(shin.o, leg.knee)).toBeLessThan(1e-9);
        expect(dist(bonePoint(p, shin, 0, LEG.shank, 0), leg.ankle)).toBeLessThan(1e-9);
      }
      expect(dist(b.bones[BONE.pelvis]!.o, legs.pelvis)).toBeLessThan(1e-9);
    });
  });

  it('mirrors goofy for regular, left and right swapped', () => {
    const g = newBodyPose();
    const r = newBodyPose();
    for (const inputs of CASES)
      for (const u of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
        const flight = computeFlight(inputs);
        pose(g, inputs, flight, u, 'goofy');
        pose(r, inputs, flight, u, 'regular');
        for (let i = 0; i < RIDER_BONES.length; i++) {
          const a = g.bones[i]!;
          const m = r.bones[MIRROR_BONE[i]!]!;
          expect(m.o.x).toBeCloseTo(-a.o.x, 9);
          expect(m.o.y).toBeCloseTo(a.o.y, 9);
          expect(m.o.z).toBeCloseTo(a.o.z, 9);
          expect(m.y.x).toBeCloseTo(-a.y.x, 9);
          expect(m.y.z).toBeCloseTo(a.y.z, 9);
          expect(m.x.x).toBeCloseTo(a.x.x, 9);
        }
      }
  });

  it('is the idle crouch at progress 0, so a pop never jumps', () => {
    const idle = newBodyPose();
    const popped = newBodyPose();
    for (const inputs of CASES)
      for (const stance of STANCES) {
        pose(idle, inputs, null, 0, stance);
        pose(popped, inputs, computeFlight(inputs), 0, stance);
        for (let i = 0; i < RIDER_BONES.length; i++) {
          expect(dist(idle.bones[i]!.o, popped.bones[i]!.o)).toBeLessThan(1e-9);
          expect(dist(idle.bones[i]!.y, popped.bones[i]!.y)).toBeLessThan(1e-9);
        }
      }
  });

  it('crouches with the trunk folded over the toes, rises with the pop, and folds again to absorb the landing', () => {
    const b = newBodyPose();
    const kickflip = PRESETS.find((pr) => pr.id === 'kickflip')!.inputs;
    const flight = computeFlight(kickflip);
    const lean = (u: number) => {
      const c = pose(b, kickflip, flight, u).bones[BONE.chest]!;
      return (Math.atan2(-c.y.z, c.y.y) * 180) / Math.PI;
    };
    const shoulder = (u: number) => pose(b, kickflip, flight, u).bones[BONE.upperArmR]!.o.z;
    expect(lean(0)).toBeGreaterThan(20);
    expect(shoulder(0)).toBeLessThan(-0.05);
    expect(lean(0.2)).toBeLessThan(lean(0) - 8);
    expect(lean(1)).toBeGreaterThan(lean(0.45));
    // The arms: low in the crouch, up with the pop, out in the air, down again by the landing.
    const handY = (u: number) => {
      const r = pose(b, kickflip, flight, u);
      return bonePoint(p, r.bones[BONE.handR]!, 0, 0, 0).y - r.bones[BONE.upperArmR]!.o.y;
    };
    expect(handY(0.3)).toBeGreaterThan(handY(0) + 0.15);
    expect(handY(1)).toBeLessThan(handY(0.45));
  });

  it('turns the shoulders a little against a shove-it and then with it, by the scoop\'s sign, square again at the landing; a flip barely turns them', () => {
    const b = newBodyPose();
    const twist = (inputs: TrickInputs, u: number, stance: Stance = 'goofy') => {
      const c = pose(b, inputs, computeFlight(inputs), u, stance).bones[BONE.chest]!;
      return (Math.atan2(-c.x.z, c.x.x) * 180) / Math.PI;
    };
    const bs = { pop: 0.35, flick: 0, scoop: 1.9 };
    const fs = { pop: 0.35, flick: 0, scoop: -1.9 };
    expect(twist(bs, 0.15)).toBeLessThan(-5);
    expect(twist(bs, 0.66)).toBeGreaterThan(3);
    expect(twist(fs, 0.15)).toBeGreaterThan(5);
    expect(twist(bs, 1)).toBeCloseTo(0, 6);
    expect(Math.abs(twist({ pop: 0.35, flick: 1.9, scoop: 0 }, 0.3))).toBeLessThan(1e-6);
    // Regular mirrors the turn.
    expect(twist(bs, 0.15, 'regular')).toBeCloseTo(-twist(bs, 0.15), 6);
    expect(Math.abs(twist({ pop: 0.6, flick: 0, scoop: 4.2 }, 0.15))).toBeLessThanOrEqual(MOTION.shove.max + 1e-6);
  });

  it('stands up out of a bail with the arms out wide', () => {
    const b = newBodyPose();
    const bail = { pop: 0.15, flick: 1.9, scoop: 0 };
    const flight = computeFlight(bail);
    expect(flight.landed).toBe(false);
    const c = pose(b, bail, flight, 1).bones[BONE.chest]!;
    expect((Math.atan2(-c.y.z, c.y.y) * 180) / Math.PI).toBeCloseTo(MOTION.bail.lean, 6);
    const arm = b.bones[BONE.upperArmR]!.y;
    // Out along the board, near horizontal.
    expect(arm.x).toBeGreaterThan(0.85);
  });

  it('returns out and keeps its objects, so FlightDriver allocates nothing', () => {
    const out = newBodyPose();
    const bones = out.bones;
    const first = out.bones[0]!;
    const o = first.o;
    expect(pose(out, PRESETS[0]!.inputs, computeFlight(PRESETS[0]!.inputs), 0.4)).toBe(out);
    expect(out.bones).toBe(bones);
    expect(out.bones[0]).toBe(first);
    expect(out.bones[0]!.o).toBe(o);
  });
});

describe('describeBody (ADR-85)', () => {
  it('says what the body does in each phase, a sentence each, no em-dash', () => {
    const landed = computeFlight({ pop: 0.35, flick: 1.9, scoop: 0 });
    const bailed = computeFlight({ pop: 0.15, flick: 1.9, scoop: 0 });
    expect(describeBody(0, null)).toBe('The rider crouches over the board, arms low, eyes on the board.');
    expect(describeBody(0.1, landed)).toBe('The rider rises with the pop, arms swinging up.');
    expect(describeBody(0.4, landed)).toBe('Arms out for balance, the rider watches the board below.');
    expect(describeBody(PHASE.catch.start, landed)).toBe('Arms come down as the rider folds to catch the board.');
    expect(describeBody(1, landed)).toBe('The rider rides it out, body folded and arms low.');
    expect(describeBody(0.9, bailed)).toBe('Arms out, the rider steps down beside the board.');
    expect(describeBody(1, bailed)).toBe('The rider stands up beside the board, arms out wide.');
    for (let u = 0; u <= 1; u += 0.05) expect(describeBody(u, landed)).not.toContain(String.fromCharCode(0x2014));
  });
});
