// The rider's whole body from the pelvis up, pure (ADR-85, 2026-11-11). The
// shoes stay the contact authority (feet.ts) and the legs reach them
// (legs.ts); the body is posed from the legs' pelvis upward and never moves a
// foot, a hip or a knee. One rig of 17 bones, each written as a frame: an
// origin (the bone's proximal joint) and three unit axes, with the same
// rotation as a quaternion for FlightDriver. No React, no three, no store.
// Units: metres, degrees.
//
// Frame: the board's rest frame, as legs.ts and feet.ts (origin at the deck
// centre at rest, nose +X goofy, up +Y, toe side -Z). The rider faces -Z in
// both stances, so the rider's right is +X in both: the body is the same
// person, and only which foot leads changes. The model works in the goofy
// frame (the front foot is the right one) and mirrors the finished pose
// along X for regular (ADR-25), swapping left and right bones, so regular is
// the exact mirror of goofy.
//
// Bone axes (each frame right-handed, Z = X x Y):
// - spine bones (pelvis, spine, chest, neck, head): Y up the chain, X the
//   rider's right, Z the rider's back;
// - limbs (clavicles, arms, hands, thighs, shins): Y along the bone toward
//   its distal joint, X the hinge axis (elbow, wrist, knee), so a hinge only
//   ever turns about its own X and can never bend backwards.
import type { FeetPose, Stance } from './feet';
import { heightAt, PHASE, type Flight, type TrickInputs } from './flight';
import { sketchAmount } from './landing';
import { LEG, type LegsPose, type Point3 } from './legs';

/**
 * The rig, in skinning order (the GLB's joints, rider.ts's weights and
 * FlightDriver's writes all use this order). L and R are the rider's own left
 * and right.
 */
export const RIDER_BONES = [
  'pelvis',
  'spine',
  'chest',
  'neck',
  'head',
  'clavicleL',
  'upperArmL',
  'forearmL',
  'handL',
  'clavicleR',
  'upperArmR',
  'forearmR',
  'handR',
  'thighL',
  'shinL',
  'thighR',
  'shinR',
] as const;
export type RiderBone = (typeof RIDER_BONES)[number];
/** A bone's index in RIDER_BONES. */
export const BONE = Object.fromEntries(RIDER_BONES.map((b, i) => [b, i])) as Record<RiderBone, number>;

/** Each bone's mirror image (regular, ADR-25): left and right swap, the spine is its own. */
export const MIRROR_BONE: readonly number[] = RIDER_BONES.map((b) => {
  const side = b.endsWith('L') ? 'R' : b.endsWith('R') ? 'L' : null;
  return side ? BONE[(b.slice(0, -1) + side) as RiderBone] : BONE[b];
});

/**
 * Segment lengths for a rider of about 1.75 m (H), metres, with the legs'
 * (LEG in legs.ts). Sources, as for the legs: Drillis and Contini (1966) as
 * tabled in Winter, "Biomechanics and Motor Control of Human Movement", 4th
 * ed. (2009), figure 4.1 (segment lengths as fractions of H), unless marked.
 * - The trunk, hip joint centre to the base of the neck (C7): 0.57. Winter
 *   puts the shoulder joint at 0.818 H (1.43 m) and the hip joint at 0.530 H
 *   (0.93 m); C7 sits about 7 cm above the shoulder joints (an estimate). It
 *   is split into `pelvis` (hip joint centre to L4/L5, 0.10), `spine` (the
 *   lumbar spine to T12, 0.17) and `chest` (T12 to C7, 0.30), the split an
 *   estimate from the vertebral column's lumbar and thoracic heights.
 * - `neck` 0.08: C7 to the skull's base (the atlas joint), about level with
 *   the ear lobes (the cervical spine is longer, but its top sits inside the
 *   skull's outline); the head's top is `head` 0.17 above it, so a standing
 *   rider is 0.93 + 0.57 + 0.08 + 0.17 = 1.75 m.
 * - `clavicle`: from the sternal end (chest-local `from`, an estimate) out to
 *   the shoulder joint, 0.15 long; the shoulder joints end up 0.36 m apart
 *   (Winter's shoulder width 0.259 H = 0.45 m is across the deltoids' outer
 *   edges, about 4.5 cm outside each joint).
 * - `upperArm` 0.32: shoulder to elbow, 0.186 H (0.326 m).
 * - `forearm` 0.26: elbow to wrist, 0.146 H (0.256 m).
 * - `hand` 0.18: wrist to fingertip, 0.108 H (0.189 m); a mitten's tip is a
 *   little short of the longest finger.
 */
export const BODY = {
  pelvis: 0.1,
  spine: 0.17,
  chest: 0.3,
  neck: 0.08,
  head: 0.17,
  clavicle: { from: { x: 0.025, y: 0.205, z: -0.035 }, length: 0.15, rise: 3, back: 0.12 },
  upperArm: 0.32,
  forearm: 0.26,
  hand: 0.18,
} as const;

/**
 * The bind pose the GLB is built in (rider.ts): standing with the knees a
 * little bent (the thighs `thigh` degrees forward, the shins as far back, so
 * a deep crouch and a straight leg are equally far from it), the trunk
 * upright, the arms `abd` degrees out from the body and `flex` forward with
 * the elbows bent `elbow`, the head level. Skinning blends least where a
 * pose is nearest the bind, so it sits between the crouch and the air.
 */
export const BIND = { thigh: 20, abd: 42, flex: 8, elbow: 22, wrist: 0 } as const;

/**
 * The motion (ADR-85): keys at five moments of the flight, `knots`
 * (progress): the crouch before the pop, the top of the pop's extension, the
 * air, the end of the catch (PHASE.catch.end), the landing. Between keys a
 * smoothstep, so the pose is continuous and has no kinks. Degrees. Starting
 * values, labelled as estimates, from how skaters move in the coaching
 * sources the feet model cites (docs/RESEARCH-FEET.md) and frame-by-frame
 * reading of ollie and flip trick footage; to refit with the feet and the
 * hips from reference clips (RESEARCH-FEET.md section 4).
 * - `lean`: the trunk's forward fold from vertical, toward the toe side. The
 *   crouch folds it over the toes so the weight is over the board (about
 *   25 degrees with the knees near 90, an estimate); the pop extends it
 *   (Vaughan's ollie analysis has the trunk rising through the pop, an
 *   estimate here); it stays a little folded in the air; the catch and the
 *   landing fold it again to absorb, deeper at the landing as the knees
 *   (legs.ts HIPS.absorb).
 * - `abd`, `flex`: each arm out from the body (abduction, toward the nose or
 *   the tail, along the board) and forward (flexion), from hanging. Low and a
 *   little out in the crouch, swinging up and forward with the pop, out for
 *   balance in the air, coming down in the catch, low and forward at the
 *   landing. `elbow` and `wrist` bend toward the front.
 * - `lead`: the front arm (the nose side) a little higher and more forward
 *   than the back one, as skaters reach toward where they are going.
 * - `pop`: the extension, the air and the catch scale with the pop between
 *   `min` (a 0.15 m pop) and 1 (0.6 m): a small ollie barely moves the arms.
 * - `sketchy`: a sketchy landing (ADR-63) throws the arms out by up to this
 *   much more, for balance.
 * - `bail` (the feet step off to the heel side, feet.ts MOTION.bail): from
 *   the catch's start to the landing the rider stands up out of the trick,
 *   upright with the arms out wide.
 * - `shove`: a shove-it turns the shoulders: first a little against the
 *   board's turn (the board and the body share the pop's spin), then along
 *   with it, back square by the landing. `perRev` degrees per rev/s of scoop,
 *   at most `max`; `spine` of it in the lumbar spine, the rest in the chest. A
 *   flip barely turns the shoulders, so the flick does not.
 * - `look`: the head turns from the chest's forward direction toward the
 *   board by `weight` of the way (the eyes do the rest), at most `max`
 *   degrees from it.
 */
export const MOTION = {
  knots: [0, 0.2, 0.45, PHASE.catch.end, 1],
  lean: [26, 10, 15, 22, 30],
  abd: [16, 44, 50, 36, 22],
  flex: [16, 48, 30, 24, 28],
  elbow: [34, 34, 48, 50, 50],
  wrist: [12, 8, 8, 10, 14],
  lead: { abd: 6, flex: 10 },
  pop: { min: 0.55 },
  sketchy: { abd: 20, flex: 8 },
  bail: { lean: 4, abd: 74, flex: 6, elbow: 20, wrist: 4 },
  shove: { perRev: 5, max: 14, against: 1, follow: 0.6, spine: 0.4 },
  look: { weight: 0.7, max: 50 },
} as const;

/** One bone's pose: its proximal joint, its three axes and the same rotation as a quaternion. */
export interface BoneFrame {
  o: Point3;
  x: Point3;
  y: Point3;
  z: Point3;
  q: { x: number; y: number; z: number; w: number };
}

export interface BodyPose {
  /** One frame per bone, in RIDER_BONES order. */
  bones: BoneFrame[];
}

const point = (): Point3 => ({ x: 0, y: 0, z: 0 });
const frame = (): BoneFrame => ({ o: point(), x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 }, q: { x: 0, y: 0, z: 0, w: 1 } });
export const newBodyPose = (): BodyPose => ({ bones: RIDER_BONES.map(frame) });

const D2R = Math.PI / 180;
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const smooth = (a: number, b: number, u: number) => {
  const s = clamp01((u - a) / (b - a));
  return s * s * (3 - 2 * s);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 before a, rising smoothly to 1 at m, back to 0 at b. */
const bump = (a: number, m: number, b: number, u: number) => (u <= m ? smooth(a, m, u) : 1 - smooth(m, b, u));

function set(o: Point3, x: number, y: number, z: number) {
  o.x = x;
  o.y = y;
  o.z = z;
}
function copy(o: Point3, a: Point3) {
  o.x = a.x;
  o.y = a.y;
  o.z = a.z;
}
const dot = (a: Point3, b: Point3) => a.x * b.x + a.y * b.y + a.z * b.z;
function normalize(o: Point3) {
  const n = Math.hypot(o.x, o.y, o.z) || 1;
  o.x /= n;
  o.y /= n;
  o.z /= n;
  return o;
}
/** o = a x b (o may not be a or b). */
function cross(o: Point3, a: Point3, b: Point3) {
  set(o, a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  return o;
}
/** o = p + d * k. */
function along(o: Point3, p: Point3, d: Point3, k: number) {
  set(o, p.x + d.x * k, p.y + d.y * k, p.z + d.z * k);
}
/** o = a frame's local vector (lx, ly, lz) in the board frame, a direction (no origin). */
function toWorld(o: Point3, f: BoneFrame, lx: number, ly: number, lz: number) {
  set(o, f.x.x * lx + f.y.x * ly + f.z.x * lz, f.x.y * lx + f.y.y * ly + f.z.y * lz, f.x.z * lx + f.y.z * ly + f.z.z * lz);
}
/** Rodrigues: v turned by `angle` radians about the unit `axis`, into o (o may not be v or axis). */
function rotate(o: Point3, v: Point3, axis: Point3, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = dot(axis, v) * (1 - c);
  set(
    o,
    v.x * c + (axis.y * v.z - axis.z * v.y) * s + axis.x * k,
    v.y * c + (axis.z * v.x - axis.x * v.z) * s + axis.y * k,
    v.z * c + (axis.x * v.y - axis.y * v.x) * s + axis.z * k,
  );
}

/** The quaternion of a frame's rotation (columns x, y, z), Shepperd's method. */
function writeQuat(f: BoneFrame) {
  const m00 = f.x.x, m01 = f.y.x, m02 = f.z.x;
  const m10 = f.x.y, m11 = f.y.y, m12 = f.z.y;
  const m20 = f.x.z, m21 = f.y.z, m22 = f.z.z;
  const t = m00 + m11 + m22;
  const q = f.q;
  if (t > 0) {
    const s = 0.5 / Math.sqrt(t + 1);
    q.w = 0.25 / s;
    q.x = (m21 - m12) * s;
    q.y = (m02 - m20) * s;
    q.z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q.w = (m21 - m12) / s;
    q.x = 0.25 * s;
    q.y = (m01 + m10) / s;
    q.z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q.w = (m02 - m20) / s;
    q.x = (m01 + m10) / s;
    q.y = 0.25 * s;
    q.z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q.w = (m10 - m01) / s;
    q.x = (m02 + m20) / s;
    q.y = (m12 + m21) / s;
    q.z = 0.25 * s;
  }
}

const hintTmp = point();
/** A bone frame from its origin, its Y direction and a hint for X (made perpendicular to Y); Z = X x Y. */
function frameYX(f: BoneFrame, o: Point3, y: Point3, xHint: Point3) {
  copy(f.o, o);
  copy(f.y, y);
  normalize(f.y);
  const k = dot(xHint, f.y);
  set(hintTmp, xHint.x - k * f.y.x, xHint.y - k * f.y.y, xHint.z - k * f.y.z);
  if (Math.hypot(hintTmp.x, hintTmp.y, hintTmp.z) < 1e-9) set(hintTmp, f.y.y, -f.y.x, 0);
  copy(f.x, normalize(hintTmp));
  cross(f.z, f.x, f.y);
  writeQuat(f);
}
/** A bone frame from its origin, its Z direction and a hint for X (made perpendicular to Z); Y = Z x X. */
function frameZX(f: BoneFrame, o: Point3, z: Point3, xHint: Point3) {
  copy(f.o, o);
  copy(f.z, z);
  normalize(f.z);
  const k = dot(xHint, f.z);
  set(hintTmp, xHint.x - k * f.z.x, xHint.y - k * f.z.y, xHint.z - k * f.z.z);
  copy(f.x, normalize(hintTmp));
  cross(f.y, f.z, f.x);
  writeQuat(f);
}

/** A point of a bone, from its local coordinates, into `out`: the joint plus the axes. For tests and the asset. */
export function bonePoint(out: Point3, f: BoneFrame, lx: number, ly: number, lz: number): Point3 {
  set(out, f.o.x + f.x.x * lx + f.y.x * ly + f.z.x * lz, f.o.y + f.x.y * lx + f.y.y * ly + f.z.y * lz, f.o.z + f.x.z * lx + f.y.z * ly + f.z.z * lz);
  return out;
}

/** What the upper body is told for one moment, degrees: the goofy frame, the front arm the right one. */
export interface UpperParams {
  lean: number;
  /** The shoulders' turn about the vertical, positive counterclockwise from above (a backside shove's way, goofy). */
  twist: number;
  abd: [number, number];
  flex: [number, number];
  elbow: [number, number];
  wrist: number;
  /** Where the head looks, goofy board frame. */
  look: Point3;
}
const newParams = (): UpperParams => ({ lean: 0, twist: 0, abd: [0, 0], flex: [0, 0], elbow: [0, 0], wrist: 0, look: point() });

// Scratch, module scope, so a pose allocates nothing.
const g = newBodyPose();
const tA = point();
const tB = point();
const tC = point();
const tD = point();
const tE = point();
const sY = point();
const sX = point();
const bindPelvis = point();
const RIGHT: Point3 = { x: 1, y: 0, z: 0 };

/** One spine bone: Y the vertical folded forward (-Z) by `lean` and turned about the vertical by `yaw`. */
function spineFrame(f: BoneFrame, o: Point3, lean: number, yaw: number) {
  const l = lean * D2R;
  const w = yaw * D2R;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  // Rx(-lean) on (0, 1, 0) is (0, cos, -sin); then Ry(yaw): x' = x cos + z sin, z' = -x sin + z cos.
  set(sY, -Math.sin(l) * sw, Math.cos(l), -Math.sin(l) * cw);
  set(sX, cw, 0, -sw);
  frameYX(f, o, sY, sX);
}

/**
 * One arm (goofy frame) from the chest: the clavicle, the upper arm, the
 * forearm and the hand. `side` +1 for the right, -1 for the left.
 */
function writeArm(chest: BoneFrame, side: 1 | -1, abd: number, flex: number, elbow: number, wrist: number) {
  const C = BODY.clavicle;
  const clav = g.bones[side > 0 ? BONE.clavicleR : BONE.clavicleL]!;
  const upper = g.bones[side > 0 ? BONE.upperArmR : BONE.upperArmL]!;
  const fore = g.bones[side > 0 ? BONE.forearmR : BONE.forearmL]!;
  const hand = g.bones[side > 0 ? BONE.handR : BONE.handL]!;
  // The arm's direction in the chest's own axes: out by abd, then forward by flex.
  const a = abd * D2R;
  const f = flex * D2R;
  const lx = side * Math.sin(a);
  const ly = -Math.cos(a) * Math.cos(f);
  const lz = -Math.cos(a) * Math.sin(f);
  // The clavicle lifts as the arm rises past horizontal's first third (shoulder rhythm, an estimate).
  const raise = Math.acos(Math.max(-1, Math.min(1, -ly)));
  const lift = (C.rise + 18 * smooth(0.5, 2.0, raise)) * D2R;
  bonePoint(tA, chest, side * C.from.x, C.from.y, C.from.z);
  toWorld(tB, chest, side * Math.cos(lift), Math.sin(lift), C.back);
  normalize(tB);
  toWorld(tC, chest, 0, 1, 0);
  cross(tD, tC, tB);
  frameYX(clav, tA, tB, tD);
  // The shoulder joint, then the upper arm.
  along(tA, tA, tB, C.length);
  toWorld(tB, chest, lx, ly, lz);
  normalize(tB);
  // The elbow bends toward the front and a little up (the pole), never backwards.
  toWorld(tC, chest, 0, 0.35, -1);
  const k = dot(tC, tB);
  set(tC, tC.x - k * tB.x, tC.y - k * tB.y, tC.z - k * tB.z);
  if (Math.hypot(tC.x, tC.y, tC.z) < 1e-6) toWorld(tC, chest, 0, 1, 0);
  normalize(tC);
  cross(tD, tB, tC);
  normalize(tD);
  frameYX(upper, tA, tB, tD);
  along(tA, tA, tB, BODY.upperArm);
  rotate(tE, tB, tD, elbow * D2R);
  frameYX(fore, tA, tE, tD);
  along(tA, tA, tE, BODY.forearm);
  rotate(tB, tE, tD, wrist * D2R);
  frameYX(hand, tA, tB, tD);
}

/**
 * The upper body (goofy frame) on the pelvis at `pelvis`: the three spine
 * bones folded by the lean (the pelvis 45 percent of it, the lumbar spine 75,
 * the chest all) and turned by the twist, the neck and the head turned
 * toward `look`, then both arms.
 */
function writeUpper(pelvis: Point3, P: UpperParams) {
  const pel = g.bones[BONE.pelvis]!;
  const spine = g.bones[BONE.spine]!;
  const chest = g.bones[BONE.chest]!;
  const neck = g.bones[BONE.neck]!;
  const head = g.bones[BONE.head]!;
  const S = MOTION.shove.spine;
  spineFrame(pel, pelvis, P.lean * 0.45, 0);
  along(tA, pel.o, pel.y, BODY.pelvis);
  spineFrame(spine, tA, P.lean * 0.75, P.twist * S);
  along(tA, spine.o, spine.y, BODY.spine);
  spineFrame(chest, tA, P.lean, P.twist);
  // The neck's base, and roughly where the head is, for the look.
  along(tA, chest.o, chest.y, BODY.chest);
  along(tB, tA, chest.y, BODY.neck);
  set(tC, P.look.x - tB.x, P.look.y - tB.y, P.look.z - tB.z);
  normalize(tC);
  // Forward is -Z: blend the chest's forward toward the look, then keep it inside `max` of the chest's.
  const L = MOTION.look;
  set(tD, -chest.z.x * (1 - L.weight) + tC.x * L.weight, -chest.z.y * (1 - L.weight) + tC.y * L.weight, -chest.z.z * (1 - L.weight) + tC.z * L.weight);
  normalize(tD);
  const cosMax = Math.cos(L.max * D2R);
  const c = -dot(tD, chest.z);
  if (c < cosMax) {
    // Pull it back toward the chest's forward along the great circle until it is `max` away.
    set(tE, tD.x + chest.z.x * c, tD.y + chest.z.y * c, tD.z + chest.z.z * c);
    normalize(tE);
    const s = Math.sin(L.max * D2R);
    set(tD, -chest.z.x * cosMax + tE.x * s, -chest.z.y * cosMax + tE.y * s, -chest.z.z * cosMax + tE.z * s);
  }
  // The neck takes half the turn: its back axis is minus the mean of the chest's forward and the head's.
  set(tE, chest.z.x - tD.x, chest.z.y - tD.y, chest.z.z - tD.z);
  frameZX(neck, tA, tE, chest.x);
  along(tA, neck.o, neck.y, BODY.neck);
  set(tE, -tD.x, -tD.y, -tD.z);
  frameZX(head, tA, tE, chest.x);
  writeArm(chest, 1, P.abd[0], P.flex[0], P.elbow[0], P.wrist);
  writeArm(chest, -1, P.abd[1], P.flex[1], P.elbow[1], P.wrist);
}

/** A thigh and a shin (goofy frame) from the hip, knee and ankle: Y down each, X the knee's hinge (shin x thigh). */
function writeLeg(thigh: BoneFrame, shin: BoneFrame, hip: Point3, knee: Point3, ankle: Point3) {
  set(tA, knee.x - hip.x, knee.y - hip.y, knee.z - hip.z);
  normalize(tA);
  set(tB, ankle.x - knee.x, ankle.y - knee.y, ankle.z - knee.z);
  normalize(tB);
  cross(tC, tB, tA);
  // legs.ts keeps the knee bent at least about 23 degrees; straight, the hinge is the rider's right.
  if (Math.hypot(tC.x, tC.y, tC.z) < 1e-6) copy(tC, RIGHT);
  normalize(tC);
  frameYX(thigh, hip, tA, tC);
  frameYX(shin, knee, tB, tC);
}

/**
 * Copies the goofy-frame scratch pose into `out`, mirrored along X for
 * regular: each joint's x negated, the axes mirrored as a rotation is (x' =
 * -Mx, y' = My, z' = Mz with M the mirror, so the frame stays right-handed and
 * the same bone of a mirrored mesh lands on it), left and right swapped.
 */
function emit(out: BodyPose, regular: boolean) {
  for (let i = 0; i < RIDER_BONES.length; i++) {
    const src = g.bones[i]!;
    const dst = out.bones[regular ? MIRROR_BONE[i]! : i]!;
    const m = regular ? -1 : 1;
    set(dst.o, m * src.o.x, src.o.y, src.o.z);
    set(dst.x, src.x.x, m * src.x.y, m * src.x.z);
    set(dst.y, m * src.y.x, src.y.y, src.y.z);
    set(dst.z, m * src.z.x, src.z.y, src.z.z);
    dst.q.x = src.q.x;
    dst.q.y = m * src.q.y;
    dst.q.z = m * src.q.z;
    dst.q.w = src.q.w;
  }
}

/** The value of one MOTION track at progress p (the keys smoothstepped), with keys 1 to 3 scaled about the crouch by `amp`. */
function track(keys: readonly number[], p: number, amp: number, land: number): number {
  const K = MOTION.knots;
  const key = (i: number) => (i === 4 ? land : i === 0 ? keys[0]! : keys[0]! + (keys[i]! - keys[0]!) * amp);
  for (let i = 0; i < K.length - 1; i++) {
    if (p <= K[i + 1]!) return lerp(key(i), key(i + 1), smooth(K[i]!, K[i + 1]!, p));
  }
  return land;
}

const params = newParams();
/** Where the head looks on the pad, a little toward the toe side of the stance's middle (goofy frame). */
const LOOK_Z = -0.03;

/**
 * The upper body's parameters at progress u (goofy frame), into `P`. No
 * flight: the crouch, looking at the board between the feet. With a flight:
 * the MOTION keys for its own inputs, the bail blended in, the shove's
 * turn, the head on the board's centre at its height.
 */
export function writeBodyParams(P: UpperParams, feet: FeetPose, flight: Flight | null, u: number, stance: Stance): UpperParams {
  const M = MOTION;
  const p = flight ? clamp01(u) : 0;
  const pop = flight ? flight.inputs.pop : 0.35;
  const amp = M.pop.min + (1 - M.pop.min) * clamp01((pop - 0.15) / 0.45);
  const sk = flight && flight.landed ? sketchAmount(flight.rollTotal, flight.yawTotal) : 0;
  const lean = track(M.lean, p, amp, M.lean[4]);
  let abd = track(M.abd, p, amp, M.abd[4] + M.sketchy.abd * sk);
  let flex = track(M.flex, p, amp, M.flex[4] + M.sketchy.flex * sk);
  let elbow = track(M.elbow, p, amp, M.elbow[4]);
  let wrist = track(M.wrist, p, amp, M.wrist[4]);
  let leanB = lean;
  // The bail: up out of the trick from the catch's start, arms wide (feet.ts MOTION.bail).
  const b = flight && !flight.landed ? smooth(PHASE.catch.start, 1, p) : 0;
  if (b > 0) {
    leanB = lerp(lean, M.bail.lean, b);
    abd = lerp(abd, M.bail.abd, b);
    flex = lerp(flex, M.bail.flex, b);
    elbow = lerp(elbow, M.bail.elbow, b);
    wrist = lerp(wrist, M.bail.wrist, b);
  }
  P.lean = leanB;
  // The lead arm reaches a little more, fading in with the flight's moves and out at the landing.
  const lead = flight ? bump(0, M.knots[1]!, 1, p) : 0;
  P.abd[0] = abd + M.lead.abd * lead;
  P.abd[1] = abd - M.lead.abd * lead * 0.5;
  P.flex[0] = flex + M.lead.flex * lead;
  P.flex[1] = flex - M.lead.flex * lead * 0.5;
  P.elbow[0] = elbow;
  P.elbow[1] = elbow;
  P.wrist = wrist;
  // The shove (goofy: a positive scoop turns the board counterclockwise from above).
  const S = M.shove;
  const scoop = flight ? flight.inputs.scoop : 0;
  const turn = Math.max(-S.max, Math.min(S.max, scoop * S.perRev));
  P.twist = turn * (-S.against * bump(0, 0.15, 0.42, p) + S.follow * bump(0.35, 0.66, 0.97, p));
  // The look: the board between the feet (goofy frame), then its centre as it rises.
  const sx = stance === 'regular' ? -1 : 1;
  const lx = (sx * (feet.front.x + feet.back.x)) / 4;
  const k = flight ? smooth(0, M.knots[1]!, p) : 0;
  set(P.look, lx * (1 - k), flight ? heightAt(flight.peak, p) : 0, LOOK_Z * (1 - k));
  return P;
}

const goofyLegs = { hipF: point(), kneeF: point(), ankleF: point(), hipB: point(), kneeB: point(), ankleB: point(), pelvis: point() };
function unmirror(o: Point3, a: Point3, sx: number) {
  set(o, sx * a.x, a.y, a.z);
}

/**
 * Writes the whole rider at progress u into `out` and returns it, for legs
 * and feet already posed by writeLegsPose and writeFeetPose with the same
 * flight, progress and stance (both read, never changed). Allocation-free so
 * FlightDriver can call it every frame. The thighs and shins are the legs'
 * own segments; the pelvis is the legs' pelvis; the rest follows the MOTION
 * keys from it. Regular is the X mirror of goofy, left and right swapped.
 */
export function writeBodyPose(
  out: BodyPose,
  legs: LegsPose,
  feet: FeetPose,
  flight: Flight | null,
  u: number,
  inputs: TrickInputs,
  stance: Stance = 'goofy',
): BodyPose {
  // The inputs move nothing the legs and feet have not already taken: kept for the legs' signature.
  void inputs;
  const regular = stance === 'regular';
  const sx = regular ? -1 : 1;
  const G = goofyLegs;
  unmirror(G.pelvis, legs.pelvis, sx);
  unmirror(G.hipF, legs.front.hip, sx);
  unmirror(G.kneeF, legs.front.knee, sx);
  unmirror(G.ankleF, legs.front.ankle, sx);
  unmirror(G.hipB, legs.back.hip, sx);
  unmirror(G.kneeB, legs.back.knee, sx);
  unmirror(G.ankleB, legs.back.ankle, sx);
  writeBodyParams(params, feet, flight, u, stance);
  writeUpper(G.pelvis, params);
  // Goofy: the front leg is the right one.
  writeLeg(g.bones[BONE.thighR]!, g.bones[BONE.shinR]!, G.hipF, G.kneeF, G.ankleF);
  writeLeg(g.bones[BONE.thighL]!, g.bones[BONE.shinL]!, G.hipB, G.kneeB, G.ankleB);
  emit(out, regular);
  return out;
}

/**
 * The bind pose (BIND) into `out`: standing on the ground, the soles at y 0
 * and the ankle joints LEG.ankleHeight above them, centred on x and z,
 * facing -Z. rider.ts builds the mesh round these frames and the GLB's
 * inverse bind matrices are their inverses.
 */
export function writeBindPose(out: BodyPose): BodyPose {
  const t = BIND.thigh * D2R;
  const hipY = LEG.ankleHeight + (LEG.thigh + LEG.shank) * Math.cos(t);
  const half = LEG.hipWidth / 2;
  set(bindPelvis, 0, hipY, 0);
  const P = newParams();
  P.lean = 0;
  P.twist = 0;
  P.abd[0] = P.abd[1] = BIND.abd;
  P.flex[0] = P.flex[1] = BIND.flex;
  P.elbow[0] = P.elbow[1] = BIND.elbow;
  P.wrist = BIND.wrist;
  set(P.look, 0, hipY + 0.67, -10);
  writeUpper(bindPelvis, P);
  for (const side of [1, -1] as const) {
    const hip = { x: side * half, y: hipY, z: 0 };
    const knee = { x: side * half, y: hipY - LEG.thigh * Math.cos(t), z: -LEG.thigh * Math.sin(t) };
    const ankle = { x: side * half, y: LEG.ankleHeight, z: knee.z + LEG.shank * Math.sin(t) };
    writeLeg(g.bones[side > 0 ? BONE.thighR : BONE.thighL]!, g.bones[side > 0 ? BONE.shinR : BONE.shinL]!, hip, knee, ankle);
  }
  emit(out, false);
  return out;
}

/** Bend at a hinge, degrees: the angle between a bone's Y and its child's (0 straight). */
export const hingeBend = (a: BoneFrame, b: BoneFrame) => Math.acos(Math.max(-1, Math.min(1, dot(a.y, b.y)))) / D2R;

/**
 * One sentence for #scene-description (format.ts), from the same phases the
 * body follows: crouched before the pop, rising with it, arms out in the
 * air, folding to catch, absorbing the landing; for a bail, up and out
 * beside the board.
 */
export function describeBody(u: number, flight: Flight | null): string {
  if (!flight || u <= 0) return 'The rider crouches over the board, arms low, eyes on the board.';
  if (u >= 1) return flight.landed ? 'The rider rides it out, body folded and arms low.' : 'The rider stands up beside the board, arms out wide.';
  if (u < MOTION.knots[1]!) return 'The rider rises with the pop, arms swinging up.';
  if (u < PHASE.catch.start) return 'Arms out for balance, the rider watches the board below.';
  return flight.landed ? 'Arms come down as the rider folds to catch the board.' : 'Arms out, the rider steps down beside the board.';
}
