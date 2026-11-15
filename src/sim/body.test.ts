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
  RIDE,
  RIDER_BONES,
  writeBindPose,
  writeBodyPose,
  type BodyPose,
  type BoneFrame,
} from './body';
import { newFeetPose, writeFeetPose, type FootPose, type Stance } from './feet';
import { computeFlight, heightAt, PHASE, type Flight, type TrickInputs } from './flight';
import { HIPS, LEG, newLegsPose, writeLegsPose, type Point3 } from './legs';
import { landingSeconds, newSettle, RECOVER, SETTLE, slideWay, writeBailFeet, writeSettle } from './settle';
import { PRESETS } from './tricks';

const STANCES: Stance[] = ['goofy', 'regular'];
const feet = newFeetPose();
const legs = newLegsPose();
const p = { x: 0, y: 0, z: 0 };
const q = { x: 0, y: 0, z: 0 };
const dot = (a: Point3, b: Point3) => a.x * b.x + a.y * b.y + a.z * b.z;
const dist = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Feet, legs, then the body at u, as FlightDriver calls them; `ready` the wind-up's readiness (ADR-86). */
function pose(out: BodyPose, inputs: TrickInputs, flight: Flight | null, u: number, stance: Stance = 'goofy', ready?: number, t?: number) {
  writeFeetPose(feet, inputs, flight, u, stance);
  writeLegsPose(legs, feet, flight, u, inputs, stance, ready, t);
  return writeBodyPose(out, legs, feet, flight, u, inputs, stance, ready, t);
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
const UPPER = RIDER_BONES.map((_, i) => i).filter((i) => !/^(thigh|shin|foot)/.test(RIDER_BONES[i]!));
/** The feet (2026-11-13) sit on the ankles, which are the shoes' (feet.ts): how fast they move is the feet model's, tested there. */
const NOT_FEET = RIDER_BONES.map((_, i) => i).filter((i) => !RIDER_BONES[i]!.startsWith('foot'));

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

describe("the feet (2026-11-13): what the jeans' cuff and the sock hang from", () => {
  const bind = writeBindPose(newBodyPose());
  /** The world's up in the bind shin's axes: where a level shoe's up sits for a neutral ankle. */
  const s0 = bind.bones[BONE.shinR]!;
  const neutral = { x: s0.x.y, y: s0.y.y, z: s0.z.y };
  const inFrame = (f: BoneFrame, l: Point3) => ({
    x: f.x.x * l.x + f.y.x * l.y + f.z.x * l.z,
    y: f.x.y * l.x + f.y.y * l.y + f.z.y * l.z,
    z: f.x.z * l.x + f.y.z * l.y + f.z.z * l.z,
  });
  const ofFrame = (f: BoneFrame, w: Point3) => ({ x: dot(w, f.x), y: dot(w, f.y), z: dot(w, f.z) });
  /** A shoe's up as FlightDriver turns it: Euler 'YZX', the roll times the outside-edge sign. */
  const shoeUp = (f: FootPose, edge: number) => {
    const r = (f.roll * edge * Math.PI) / 180;
    const pt = (f.pitch * Math.PI) / 180;
    const y = (f.yaw * Math.PI) / 180;
    return {
      x: -Math.cos(r) * Math.sin(pt) * Math.cos(y) + Math.sin(r) * Math.sin(y),
      y: Math.cos(r) * Math.cos(pt),
      z: Math.cos(r) * Math.sin(pt) * Math.sin(y) + Math.sin(r) * Math.cos(y),
    };
  };

  it("binds each foot on its ankle with its shin's axes", () => {
    for (const [shin, foot] of [
      [BONE.shinL, BONE.footL],
      [BONE.shinR, BONE.footR],
    ] as const) {
      const s = bind.bones[shin]!;
      const f = bind.bones[foot]!;
      expect(dist(f.o, bonePoint(p, s, 0, LEG.shank, 0))).toBeLessThan(1e-12);
      for (const k of ['x', 'y', 'z', 'w'] as const) expect(f.q[k]).toBeCloseTo(s.q[k], 12);
      expect(f.o.y).toBeCloseTo(LEG.ankleHeight, 12);
    }
  });

  it("sits on the ankle with the shoe's up, turned from the shin by a swing alone (no twist to wring the hem)", () => {
    let swung = 0;
    sweep((b, _before, _inputs, _flight, _u, stance) => {
      const regular = stance === 'regular';
      // Goofy leads with the right foot; regular is its mirror. Outside-edge signs as legs.ts takes them.
      for (const [shoe, edge, shin, foot] of [
        [feet.front, regular ? -1 : 1, regular ? BONE.shinL : BONE.shinR, regular ? BONE.footL : BONE.footR],
        [feet.back, regular ? 1 : -1, regular ? BONE.shinR : BONE.shinL, regular ? BONE.footR : BONE.footL],
      ] as const) {
        const s = b.bones[shin]!;
        const f = b.bones[foot]!;
        expect(dist(f.o, bonePoint(q, s, 0, LEG.shank, 0))).toBeLessThan(1e-9);
        const up = shoeUp(shoe, edge);
        const got = inFrame(f, neutral);
        expect(dist(got, up)).toBeLessThan(1e-9);
        // The turn's axis (the shin's neutral up across the shoe's) is the same in the shin's axes and the foot's.
        const a = inFrame(s, neutral);
        const w = { x: a.y * up.z - a.z * up.y, y: a.z * up.x - a.x * up.z, z: a.x * up.y - a.y * up.x };
        const n = Math.hypot(w.x, w.y, w.z);
        if (n < 1e-6) continue;
        swung = Math.max(swung, (Math.asin(Math.min(1, n)) * 180) / Math.PI);
        const unitW = { x: w.x / n, y: w.y / n, z: w.z / n };
        expect(dist(inFrame(f, ofFrame(s, unitW)), unitW)).toBeLessThan(1e-9);
      }
    });
    // The flight swings the shin far over the shoe: the case the feet are for.
    expect(swung).toBeGreaterThan(45);
  });
});

describe('the rig (ADR-85)', () => {
  it('has 19 bones, each with one mirror, so the scene writes a fixed list', () => {
    expect(RIDER_BONES).toHaveLength(19);
    expect(new Set(RIDER_BONES).size).toBe(19);
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

  it('keeps every joint inside human limits: elbows and knees never bend backwards, the spine folds 0 to 45 degrees', () => {
    sweep((b) => {
      for (const [u, f] of [
        [BONE.upperArmL, BONE.forearmL],
        [BONE.upperArmR, BONE.forearmR],
      ] as const) {
        const upper = b.bones[u]!;
        const fore = b.bones[f]!;
        const bend = hingeBend(upper, fore);
        // Never straight: at least the riding stance's loose bend (ADR-86).
        expect(bend).toBeGreaterThanOrEqual(RIDE.elbow - 1e-6);
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
      // 45 since ADR-107 (2026-11-13): the trunk folds over the feet in the tuck and the landing, as in a deep squat,
      // where the trunk leans 40 to 50 degrees from vertical; 35 left the chest behind a seat that sits back (ADR-99).
      expect(lean).toBeLessThanOrEqual(45);
      // The spine takes the rest of the fold from the pelvis: up to about 31 degrees at the deepest (ADR-107), inside its 40 to 60 of flexion.
      expect(hingeBend(b.bones[BONE.pelvis]!, chest)).toBeLessThanOrEqual(32);
      // The head turns from the chest at most MOTION.look.max, with the neck taking half.
      expect(hingeBend(chest, b.bones[BONE.head]!)).toBeLessThanOrEqual(MOTION.look.max + 1e-6);
      // And never looks further down than MOTION.look.pitch from the horizon (2026-11-13), the chin off the chest.
      const down = (Math.asin(Math.max(-1, Math.min(1, b.bones[BONE.head]!.z.y))) * 180) / Math.PI;
      expect(down).toBeLessThanOrEqual(MOTION.look.pitch + 1e-6);
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

  it('stands up out of a bail catching its balance: elbows bent, each arm its own way, coming down as it steps onto the pad (ADR-86)', () => {
    const b = newBodyPose();
    const bail = { pop: 0.15, flick: 1.9, scoop: 0 };
    const flight = computeFlight(bail);
    expect(flight.landed).toBe(false);
    const handY = (i: number) => b.bones[i]!.o.y;
    const B = MOTION.bail;
    for (const stance of STANCES) {
      // Goofy's front arm is the right one; regular mirrors it onto the left.
      const [front, back] = stance === 'goofy' ? [BONE.handR, BONE.handL] : [BONE.handL, BONE.handR];
      const [frontUpper, frontFore] = stance === 'goofy' ? [BONE.upperArmR, BONE.forearmR] : [BONE.upperArmL, BONE.forearmL];
      const [backUpper, backFore] = stance === 'goofy' ? [BONE.upperArmL, BONE.forearmL] : [BONE.upperArmR, BONE.forearmR];
      pose(b, bail, flight, B.peakAt, stance);
      const peak = [handY(front), handY(back)];
      // Out for balance: the front hand higher than the back one, both elbows well bent, never a scarecrow's straight arms.
      expect(peak[0]! - peak[1]!).toBeGreaterThan(0.08);
      expect(hingeBend(b.bones[frontUpper]!, b.bones[frontFore]!)).toBeGreaterThan(45);
      expect(hingeBend(b.bones[backUpper]!, b.bones[backFore]!)).toBeGreaterThan(35);
      expect(Math.abs(b.bones[frontUpper]!.y.x)).toBeLessThan(0.85);
      pose(b, bail, flight, 1, stance);
      const c = b.bones[BONE.chest]!;
      // The fold whichever way the shoulders are turned (the bail turns them toward the nose, ADR-107).
      expect((Math.acos(c.y.y) * 180) / Math.PI).toBeCloseTo(B.lean, 6);
      // Down as the rider settles: both hands lower at the landing than at the peak, still bent and still not mirror images.
      expect(handY(front)).toBeLessThan(peak[0]! - 0.1);
      expect(handY(back)).toBeLessThan(peak[1]!);
      expect(hingeBend(b.bones[frontUpper]!, b.bones[frontFore]!)).toBeGreaterThan(55);
      expect(Math.abs(handY(front) - handY(back))).toBeGreaterThan(0.02);
    }
  });

  describe('the riding stance and the wind-up (ADR-86)', () => {
    const inputs = PRESETS[0]!.inputs;
    /** The chest's fold from vertical, degrees, whichever way the shoulders are turned (RIDE.twist). */
    const chestLean = (b: BodyPose) => (Math.acos(b.bones[BONE.chest]!.y.y) * 180) / Math.PI;
    /** The head's forward (-Z) turned toward the nose, degrees, goofy frame (the nose +X): positive toward the nose. */
    const headToNose = (b: BodyPose, stance: Stance) => {
      const h = b.bones[BONE.head]!;
      return (Math.atan2((stance === 'goofy' ? 1 : -1) * -h.z.x, h.z.z) * 180) / Math.PI;
    };

    it('is the crouch exactly at readiness 1 and when left out, so the pop leaves from the same pose', () => {
      const a = newBodyPose();
      const b = newBodyPose();
      for (const stance of STANCES) {
        pose(a, inputs, null, 0, stance);
        pose(b, inputs, null, 0, stance, 1);
        for (let i = 0; i < RIDER_BONES.length; i++) {
          expect(b.bones[i]!.o).toEqual(a.bones[i]!.o);
          expect(b.bones[i]!.q).toEqual(a.bones[i]!.q);
        }
        // The first frame of a flight is that crouch whatever the readiness was: a flight ignores it.
        const flight = computeFlight(inputs);
        pose(b, inputs, flight, 0, stance, 0);
        for (let i = 0; i < RIDER_BONES.length; i++) expect(dist(b.bones[i]!.o, a.bones[i]!.o)).toBeLessThan(1e-9);
      }
    });

    it('rides taller and more upright, arms loose, the head toward the nose, the shoes untouched', () => {
      const r = newBodyPose();
      const c = newBodyPose();
      for (const stance of STANCES) {
        pose(c, inputs, null, 0, stance, 1);
        const crouchSole = { ...feet.front };
        pose(r, inputs, null, 0, stance, 0);
        expect(feet.front).toEqual(crouchSole);
        // The pelvis higher by the riding stance's height (the reach clamp leaves it alone there).
        expect(r.bones[BONE.pelvis]!.o.y - c.bones[BONE.pelvis]!.o.y).toBeCloseTo(HIPS.ride - HIPS.crouch, 6);
        expect(chestLean(r)).toBeCloseTo(RIDE.lean, 6);
        expect(chestLean(c)).toBeCloseTo(MOTION.lean[0], 6);
        expect(headToNose(r, stance)).toBeGreaterThan(30);
        expect(Math.abs(headToNose(c, stance))).toBeLessThan(15);
        // Loose arms: the hands lower than in the crouch's carry, relative to the shoulders.
        const drop = (b: BodyPose) => b.bones[BONE.upperArmR]!.o.y - b.bones[BONE.handR]!.o.y;
        expect(drop(r)).toBeGreaterThan(drop(c));
      }
      // Regular is goofy's mirror.
      const g = newBodyPose();
      pose(g, inputs, null, 0, 'goofy', 0.4);
      pose(r, inputs, null, 0, 'regular', 0.4);
      for (let i = 0; i < RIDER_BONES.length; i++) {
        const m = r.bones[MIRROR_BONE[i]!]!.o;
        const o = g.bones[i]!.o;
        expect(Math.hypot(m.x + o.x, m.y - o.y, m.z - o.z)).toBeLessThan(1e-9);
      }
    });

    it('moves smoothly from riding to the crouch: small steps of readiness, small moves, every frame valid', () => {
      const a = newBodyPose();
      const b = newBodyPose();
      for (const stance of STANCES) {
        pose(a, inputs, null, 0, stance, 0);
        for (let i = 1; i <= 200; i++) {
          pose(b, inputs, null, 0, stance, i / 200);
          for (let k = 0; k < RIDER_BONES.length; k++) {
            expect(dist(a.bones[k]!.o, b.bones[k]!.o)).toBeLessThan(0.01);
            const q1 = a.bones[k]!.q;
            const q2 = b.bones[k]!.q;
            expect(Math.abs(q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w)).toBeGreaterThan(Math.cos((2 * Math.PI) / 180 / 2));
          }
          a.bones.forEach((f, k) => {
            const t = b.bones[k]!;
            f.o = { ...t.o };
            f.q = { ...t.q };
          });
        }
      }
    });
  });

  describe('the riding sway (2026-11-13)', () => {
    const inputs = PRESETS[0]!.inputs;
    const a = newBodyPose();
    const b = newBodyPose();
    const most = (x: BodyPose, y: BodyPose) => Math.max(...x.bones.map((f, i) => dist(f.o, y.bones[i]!.o)));

    it('is never quite still riding along: the riding clock moves the arms, the trunk and the hips a little', () => {
      for (const stance of STANCES) {
        pose(a, inputs, null, 0, stance, 0, 0);
        let widest = 0;
        let pelvis = 0;
        for (let t = 0.25; t <= 12; t += 0.25) {
          pose(b, inputs, null, 0, stance, 0, t);
          widest = Math.max(widest, most(a, b));
          pelvis = Math.max(pelvis, Math.abs(b.bones[BONE.pelvis]!.o.y - a.bones[BONE.pelvis]!.o.y));
        }
        // A sway, not a dance: some joint moves 3 to 15 cm, the hips bob by the legs' HIPS.bob.
        expect(widest).toBeGreaterThan(0.03);
        expect(widest).toBeLessThan(0.15);
        expect(pelvis).toBeCloseTo(HIPS.bob.height, 3);
      }
    });

    it('opens the shoulders toward the nose while riding (RIDE.twist), square again in the crouch', () => {
      const facing = (x: BodyPose) => x.bones[BONE.chest]!.z.x;
      pose(a, inputs, null, 0, 'goofy', 0, 0);
      pose(b, inputs, null, 0, 'goofy', 1, 0);
      // The chest's back axis (+Z) leans toward the tail (-X, goofy) as its front turns to the nose.
      expect(facing(a)).toBeLessThan(-0.1);
      expect(Math.abs(facing(b))).toBeLessThan(1e-9);
    });

    it('fades out with the wind-up: crouched, the clock moves nothing, so the crouch a pop leaves from never jumps', () => {
      for (const stance of STANCES) {
        pose(a, inputs, null, 0, stance, 1, 0);
        for (const t of [0.7, 3.3, 9.1]) {
          pose(b, inputs, null, 0, stance, 1, t);
          expect(most(a, b)).toBeLessThan(1e-12);
        }
        // And a flight ignores the clock.
        const flight = computeFlight(inputs);
        pose(a, inputs, flight, 0.3, stance, 1, 0);
        pose(b, inputs, flight, 0.3, stance, 1, 5.5);
        expect(most(a, b)).toBeLessThan(1e-12);
      }
    });
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

describe('the recovery after touchdown in a game (ADR-96, 2026-11-13)', () => {
  const settled = newSettle();
  /** The rider `after` seconds since touchdown, as FlightDriver poses it: a bail's feet from the landing, the rest at progress 1. */
  function recover(out: BodyPose, inputs: TrickInputs, flight: Flight, after: number, stance: Stance) {
    if (flight.landed) writeFeetPose(feet, inputs, flight, 1, stance);
    else writeBailFeet(feet, inputs, flight, writeSettle(settled, flight, after), stance);
    writeLegsPose(legs, feet, flight, 1, inputs, stance, 1, 0, after);
    return writeBodyPose(out, legs, feet, flight, 1, inputs, stance, 1, 0, after);
  }
  const LANDS = CASES.filter((c) => computeFlight(c).landed);
  const BAILS = CASES.filter((c) => !computeFlight(c).landed);
  const a = newBodyPose();
  const b = newBodyPose();
  const most = (x: BodyPose, y: BodyPose) => Math.max(...x.bones.map((f, i) => dist(f.o, y.bones[i]!.o)));
  const mostBody = (x: BodyPose, y: BodyPose) => Math.max(...NOT_FEET.map((i) => dist(x.bones[i]!.o, y.bones[i]!.o)));
  const chestLean = (x: BodyPose) => Math.acos(x.bones[BONE.chest]!.y.y) / (Math.PI / 180);

  it('moves on from the landing without a jump: no joint more than 2 cm in 1/120 s, from touchdown to the end pose', () => {
    expect(LANDS.length).toBeGreaterThan(5);
    expect(BAILS.length).toBeGreaterThan(5);
    for (const inputs of [...LANDS, ...BAILS]) {
      const flight = computeFlight(inputs);
      for (const stance of STANCES) {
        // Touchdown with no recovery is the landing's pose as it always was.
        recover(a, inputs, flight, 0, stance);
        writeFeetPose(feet, inputs, flight, 1, stance);
        if (flight.landed) expect(most(a, pose(b, inputs, flight, 1, stance))).toBeLessThan(1e-12);
        const end = landingSeconds(flight);
        for (let t = 1 / 120; t <= end + 1e-9; t += 1 / 120) {
          recover(b, inputs, flight, t, stance);
          expect(mostBody(a, b)).toBeLessThan(0.02);
          recover(a, inputs, flight, t, stance);
        }
        // The landing's end pose (Infinity once it has played out) is where the recovery got to.
        recover(b, inputs, flight, Infinity, stance);
        expect(most(a, b)).toBeLessThan(1e-9);
        for (const f of b.bones) expect(Number.isFinite(f.o.x + f.o.y + f.o.z + f.q.w)).toBe(true);
      }
    }
  });

  it('after a clean landing gives a little more at the knees, then stands back up into the riding stance', () => {
    for (const inputs of LANDS) {
      const flight = computeFlight(inputs);
      recover(a, inputs, flight, 0, 'goofy');
      const touchdown = a.bones[BONE.pelvis]!.o.y;
      recover(b, inputs, flight, RECOVER.landed.dipAt, 'goofy');
      expect(b.bones[BONE.pelvis]!.o.y).toBeLessThan(touchdown - RECOVER.landed.dip * 0.5);
      recover(b, inputs, flight, Infinity, 'goofy');
      // The riding stance's height over the landed ankles (legs.ts HIPS.ride, from the absorb).
      expect(b.bones[BONE.pelvis]!.o.y - touchdown).toBeCloseTo(HIPS.ride - HIPS.absorb, 2);
      // The trunk as it rides (RIDE.lean, the shoulders open toward the nose), not folded over the landing.
      expect(chestLean(b)).toBeCloseTo(RIDE.lean, -1);
      expect(chestLean(b)).toBeLessThan(chestLean(a) - 8);
    }
  });

  it('after a bail stumbles, then stands over its feet, arms down, looking at where the board slid to', () => {
    const way: [number, number] = [0, 0];
    for (const inputs of BAILS) {
      const flight = computeFlight(inputs);
      recover(a, inputs, flight, 0, 'goofy');
      const touchdown = a.bones[BONE.pelvis]!.o.y;
      // The stumble: lower, and the trunk further forward, than at touchdown.
      recover(b, inputs, flight, RECOVER.bail.dipAt, 'goofy');
      expect(b.bones[BONE.pelvis]!.o.y).toBeLessThan(touchdown - RECOVER.bail.dip * 0.5);
      expect(chestLean(b)).toBeGreaterThan(chestLean(a) + 5);
      // Standing: taller, the pelvis over the middle of the ankles, the trunk nearly upright.
      recover(b, inputs, flight, Infinity, 'goofy');
      const pel = b.bones[BONE.pelvis]!.o;
      expect(pel.y).toBeGreaterThan(touchdown + 0.08);
      expect(Math.abs(pel.x - (feet.front.x + feet.back.x) / 2)).toBeLessThan(0.02);
      expect(Math.abs(pel.z - (feet.front.z + feet.back.z) / 2)).toBeLessThan(0.02);
      expect(chestLean(b)).toBeLessThan(15);
      // The arms down by its sides: both hands well below the shoulders' base.
      const chestTop = bonePoint(p, b.bones[BONE.chest]!, 0, BODY.chest, 0).y;
      expect(b.bones[BONE.handL]!.o.y).toBeLessThan(chestTop - 0.4);
      expect(b.bones[BONE.handR]!.o.y).toBeLessThan(chestTop - 0.4);
      // The head turned down toward the board's resting place (settle.ts), within the look's limit.
      slideWay(way, flight);
      const kick = SETTLE.bail.forwardM + (SETTLE.bail.acrossM - SETTLE.bail.forwardM) * Math.abs(way[1]);
      const head = b.bones[BONE.head]!;
      q.x = kick * way[0] - head.o.x;
      q.y = -head.o.y;
      q.z = kick * way[1] - SETTLE.bail.sideM - head.o.z;
      const n = Math.hypot(q.x, q.y, q.z);
      const facing = -(head.z.x * q.x + head.z.y * q.y + head.z.z * q.z) / n;
      expect(facing).toBeGreaterThan(Math.cos((MOTION.look.max + 15) * (Math.PI / 180)));
    }
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
    expect(describeBody(1, bailed)).toBe('The rider stands beside the board, arms coming down as it catches its balance.');
    expect(describeBody(0, null, true)).toBe('The rider rides along, standing tall, arms loose, looking ahead past the nose.');
    // Once a game's landing has played out, the rider is back up (ADR-96).
    expect(describeBody(1, landed, false, true)).toBe('The rider stands back up and rides away, arms loose.');
    expect(describeBody(1, bailed, false, true)).toBe('The rider stands up beside the board, arms down, looking at where it slid to.');
    for (let u = 0; u <= 1; u += 0.05) expect(describeBody(u, landed)).not.toContain(String.fromCharCode(0x2014));
  });
});
