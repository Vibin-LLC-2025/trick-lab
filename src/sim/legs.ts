// The rider's lower body from the feet, pure (ADR-37, 2026-11-05). The shoes
// stay the contact authority (feet.ts): the legs are posed to reach them and
// never move them. A hip trajectory (the rider's own jump), then a two-bone
// IK per leg from the hip joint to the ankle joint, with a knee pole forward
// toward the toe side. No React, no three, no store. Units: metres, degrees.
//
// Frame: the board's rest frame, the same as FeetPose (feet.ts): origin at
// the deck centre at rest, nose +X (goofy), up +Y, toe side -Z, heel side +Z.
// The rider faces -Z, so the knees bend toward -Z in both stances, and the
// hips sit side by side along X. Regular (ADR-25) mirrors the hips along X
// with the feet; the feet arrive already mirrored, so the ankles, the knee
// poles (which follow the toes) and the IK need nothing more.
import { CATCH, DECK_TOP, LAND_Y, PAD_Y, writeStance, newFeetPose, type FeetPose, type FootPose, type Stance } from './feet';
import { PHASE, type Flight, type TrickInputs } from './flight';

/**
 * Segment lengths for a rider of about 1.75 m (H), metres. Sources:
 * - thigh 0.43: hip joint to knee, 0.245 H, Drillis and Contini (1966) as
 *   tabled in Winter, "Biomechanics and Motor Control of Human Movement",
 *   4th ed. (2009), figure 4.1 (0.429 m).
 * - shank 0.42: knee to ankle joint, 0.246 H in the same table (0.43 m);
 *   0.42 is used, a centimetre shorter, so a 0.6 m pop's crouch still bends
 *   the knees inside the table's spread.
 * - ankleHeight 0.08: ankle joint above the sole's bottom: 0.039 H to the
 *   floor barefoot in the same table (0.068 m), plus about 1.5 cm of shoe
 *   sole under the heel.
 * - ankleBack 0.06: ankle joint behind the sole centre toward the heel. The
 *   joint is about a quarter of the foot's length from the heel (Winter's
 *   figure puts it over the rear of the foot); in the 0.285 m shoe that is
 *   about 6 cm behind the centre. An estimate.
 * - hipWidth 0.18: between the two hip joint centres. Bell, Pedersen and
 *   Brand (1990), J. Biomech. 23(6): each hip joint centre 14 percent of the
 *   inter-ASIS width medial of its ASIS, so 0.72 times a 0.25 m inter-ASIS
 *   width.
 * - reachMargin: the reach clamp keeps the hip-to-ankle distance at least
 *   this fraction under thigh plus shank (2 percent leaves about 23 degrees
 *   of knee bend, never a locked knee).
 */
export const LEG = {
  thigh: 0.43,
  shank: 0.42,
  ankleHeight: 0.08,
  ankleBack: 0.06,
  hipWidth: 0.18,
  reachMargin: 0.02,
} as const;

/**
 * The hip trajectory (ADR-37). Starting values, to refit from reference data
 * with the feet (RESEARCH-FEET.md section 4).
 * - z: the pelvis sits this far toward the heel side (+Z) of the deck centre
 *   (a crouch puts the hips back over the heels).
 * - crouch: hip joints above the ankle line (DECK_TOP + ankleHeight) before
 *   the pop: about 90 degrees of knee bend.
 * - ride: the same in the riding stance before the wind-up (ADR-86): rolling
 *   along in a game before the go, the knees a little bent (45 to 53
 *   degrees, an estimate from how skaters ride: loose, ready, not locked).
 *   The readiness (0 riding, 1 crouched) blends `ride` to `crouch`.
 * - absorb: hip joints above the landed ankles at progress 1 (the landing
 *   bend, about 80 degrees), held after it.
 * - jump: the hips' rise at their peak is `perPop` times the pop plus
 *   `extra`, at `peakAt` of the airtime, a little after the board's peak
 *   (0.5): ease-out up from the crouch, ease-in down to the absorb.
 * - shift: the pelvis moves along X from the middle of the stance (between
 *   the two feet as writeStance places them) to over the board's centre,
 *   where the feet land on the bolts, over this window.
 * - poleToe: the knee pole is -Z (forward, toward the toe side) plus this
 *   much of the shoe's own toe direction, so a knee tracks its toes.
 * - bailFollow (ADR-90): in a bail the pelvis goes with the feet as they step
 *   off to the heel side, this much of the way from `z` to over the middle
 *   of the two feet, from the bail's start to the landing, so the rider steps
 *   off the board instead of leaving its legs splayed out from under it; and
 *   it follows them through the recovery step after touchdown.
 */
export const HIPS = {
  z: 0.05,
  crouch: 0.62,
  ride: 0.79,
  absorb: 0.62,
  jump: { perPop: 1.0, extra: 0.1, peakAt: 0.55 },
  shift: { start: 0.2, end: CATCH.back },
  poleToe: 0.5,
  bailFollow: 0.25,
} as const;

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/**
 * One leg segment as FlightDriver applies it: the proximal joint (hip for the
 * thigh, knee for the shank), the unit direction toward the distal joint and
 * the length. A capsule built along +Y from 0 to `length` turned from +Y onto
 * (dx, dy, dz) and placed at (x, y, z) covers the segment; it is round, so the
 * twist about its own axis does not matter.
 */
export interface Segment {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  length: number;
}

export interface LegPose {
  /** Hip joint centre. */
  hip: Point3;
  knee: Point3;
  /** Where the IK put the ankle: the target unless the clamp could not reach it. */
  ankle: Point3;
  /** The ankle joint from the shoe's pose: sole centre plus ankleHeight along the sole's normal, minus ankleBack along its toe. */
  target: Point3;
  /** Knee pole, unit, horizontal. */
  pole: Point3;
  thigh: Segment;
  shank: Segment;
}

export interface LegsPose {
  /** Midpoint of the two hip joints. */
  pelvis: Point3;
  front: LegPose;
  back: LegPose;
  /** How far the reach clamp lowered the hips at this pose, metres (0 when it did not engage). */
  clamped: number;
}

const point = (): Point3 => ({ x: 0, y: 0, z: 0 });
const segment = (length: number): Segment => ({ x: 0, y: 0, z: 0, dx: 0, dy: -1, dz: 0, length });
const legPose = (): LegPose => ({
  hip: point(),
  knee: point(),
  ankle: point(),
  target: point(),
  pole: point(),
  thigh: segment(LEG.thigh),
  shank: segment(LEG.shank),
});
export const newLegsPose = (): LegsPose => ({ pelvis: point(), front: legPose(), back: legPose(), clamped: 0 });

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const smooth = (a: number, b: number, u: number) => {
  const s = clamp01((u - a) / (b - a));
  return s * s * (3 - 2 * s);
};
const D2R = Math.PI / 180;

/** The ankle line before the pop: the sole on the grip plus the ankle height. */
const ANKLE_REST = DECK_TOP + LEG.ankleHeight;
/** Thigh plus shank, less the margin: the farthest the clamp lets a hip be from its ankle. */
export const MAX_REACH = (LEG.thigh + LEG.shank) * (1 - LEG.reachMargin);

/**
 * Height of the hip joints before the reach clamp, rest frame (ADR-37): the
 * crouch at progress 0 and with no flight, an ease-out rise to the jump's
 * top at HIPS.jump.peakAt, an ease-in fall to the absorb at progress 1
 * (above the landed ankles, or the pad's for a bail), held after it.
 * Continuous, with a level top. Allocation-free. With no flight, `ready`
 * (ADR-86, 0 riding to 1 crouched, 1 when left out) blends the riding
 * stance's height into the crouch's; a flight always leaves the crouch.
 */
export function hipHeight(flight: Flight | null, u: number, ready = 1): number {
  const crouch = ANKLE_REST + HIPS.crouch;
  if (!flight) return ANKLE_REST + HIPS.ride + (HIPS.crouch - HIPS.ride) * clamp01(ready);
  const p = clamp01(u);
  const J = HIPS.jump;
  const top = crouch + flight.peak * J.perPop + J.extra;
  if (p <= J.peakAt) {
    const s = 1 - p / J.peakAt;
    return crouch + (top - crouch) * (1 - s * s);
  }
  const land = (flight.landed ? LAND_Y.front.square : PAD_Y) + LEG.ankleHeight + HIPS.absorb;
  const s = (p - J.peakAt) / (1 - J.peakAt);
  return land + (top - land) * (1 - s * s);
}

/**
 * The ankle joint of a shoe, into `out`. The shoe's rotation is FlightDriver's
 * Euler 'YZX' (yaw about Y, then pitch about the shoe's Z, then roll about
 * its X, the roll times the shoe's outside-edge sign `edge`), so its up axis
 * is Ry Rz Rx (0, 1, 0) and its toe axis Ry Rz (1, 0, 0).
 */
function writeAnkle(out: Point3, f: FootPose, edge: 1 | -1) {
  const r = f.roll * edge * D2R;
  const p = f.pitch * D2R;
  const y = f.yaw * D2R;
  const cr = Math.cos(r);
  const sr = Math.sin(r);
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const H = LEG.ankleHeight;
  const B = LEG.ankleBack;
  out.x = f.x + H * (-cr * sp * cy + sr * sy) - B * cp * cy;
  out.y = f.y + H * cr * cp - B * sp;
  out.z = f.z + H * (cr * sp * sy + sr * cy) + B * cp * sy;
}

/** Knee pole for a shoe, unit and horizontal: forward (-Z) plus HIPS.poleToe of its toe direction (cos yaw, 0, -sin yaw). */
function writePole(out: Point3, f: FootPose) {
  const y = f.yaw * D2R;
  const x = HIPS.poleToe * Math.cos(y);
  const z = -1 - HIPS.poleToe * Math.sin(y);
  const n = Math.hypot(x, z);
  out.x = x / n;
  out.y = 0;
  out.z = z / n;
}

/** The highest a hip joint at (hx, hz) can sit and still be MAX_REACH from `t`. */
function reachTop(hx: number, hz: number, t: Point3): number {
  const h2 = (hx - t.x) * (hx - t.x) + (hz - t.z) * (hz - t.z);
  const R2 = MAX_REACH * MAX_REACH;
  return h2 >= R2 ? t.y : t.y + Math.sqrt(R2 - h2);
}

function writeSegment(s: Segment, from: Point3, to: Point3) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const n = Math.hypot(dx, dy, dz);
  s.x = from.x;
  s.y = from.y;
  s.z = from.z;
  s.dx = dx / n;
  s.dy = dy / n;
  s.dz = dz / n;
}

/**
 * Two-bone IK, allocation-free: the knee from the hip, the ankle target, the
 * two lengths and the pole. With D the hip-to-target distance (held inside
 * what the lengths can span), the knee is `a` along the hip-to-target line
 * and `b` along the pole's part perpendicular to it, a^2 + b^2 = thigh^2, so
 * it always bends toward the pole and never backwards. The shank then points
 * from the knee at the target and is exactly `shank` long; when the target
 * is in reach (the clamp makes sure it is) its end is the target.
 */
export function solveLeg(leg: LegPose) {
  const L1 = LEG.thigh;
  const L2 = LEG.shank;
  const h = leg.hip;
  const t = leg.target;
  let ux = t.x - h.x;
  let uy = t.y - h.y;
  let uz = t.z - h.z;
  const D = Math.hypot(ux, uy, uz);
  if (D < 1e-9) {
    ux = 0;
    uy = -1;
    uz = 0;
  } else {
    ux /= D;
    uy /= D;
    uz /= D;
  }
  const Dc = Math.min(L1 + L2 - 1e-9, Math.max(Math.abs(L1 - L2) + 1e-9, D));
  const a = (L1 * L1 - L2 * L2 + Dc * Dc) / (2 * Dc);
  const b = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const P = leg.pole;
  const k = P.x * ux + P.y * uy + P.z * uz;
  let vx = P.x - k * ux;
  let vy = P.y - k * uy;
  let vz = P.z - k * uz;
  let n = Math.hypot(vx, vy, vz);
  if (n < 1e-9) {
    // Pole along the leg (never with a horizontal pole and a hanging leg): bend toward -Z.
    vx = 0;
    vy = uz;
    vz = -uy;
    n = Math.hypot(vy, vz) || 1;
  }
  vx /= n;
  vy /= n;
  vz /= n;
  const kn = leg.knee;
  kn.x = h.x + ux * a + vx * b;
  kn.y = h.y + uy * a + vy * b;
  kn.z = h.z + uz * a + vz * b;
  writeSegment(leg.thigh, h, kn);
  writeSegment(leg.shank, kn, t);
  const s = leg.shank;
  leg.ankle.x = kn.x + s.dx * L2;
  leg.ankle.y = kn.y + s.dy * L2;
  leg.ankle.z = kn.z + s.dz * L2;
}

/** The stance before the pop, for the pelvis's starting x (reused, allocation-free). */
const stanceFeet = newFeetPose();

/**
 * Writes both legs at progress u into `out` and returns it, for feet already
 * posed by writeFeetPose with the same flight, progress and stance (the feet
 * are read, never changed). Allocation-free so FlightDriver can call it every
 * frame. With no flight the rider crouches over the stance for the live
 * inputs; with a flight the pelvis follows the flight's own inputs, as the
 * feet do. Steps: the ankle targets from the shoes; the pelvis (x from the
 * middle of the stance to the board's centre, HIPS.z, hipHeight); the reach
 * clamp, which lowers the pelvis just enough that neither hip joint is more
 * than MAX_REACH from its ankle; the knee poles; the IK. `ready` is the
 * wind-up's readiness for the pose with no flight (hipHeight, ADR-86).
 */
export function writeLegsPose(
  out: LegsPose,
  feet: FeetPose,
  flight: Flight | null,
  u: number,
  inputs: TrickInputs,
  stance: Stance = 'goofy',
  ready = 1,
): LegsPose {
  const regular = stance === 'regular';
  const sx = regular ? -1 : 1;
  // Outside-edge signs as FlightDriver applies the shoes (goofy front +1, back -1; regular the other way).
  writeAnkle(out.front.target, feet.front, regular ? -1 : 1);
  writeAnkle(out.back.target, feet.back, regular ? 1 : -1);
  writePole(out.front.pole, feet.front);
  writePole(out.back.pole, feet.back);

  const p = flight ? clamp01(u) : 0;
  writeStance(stanceFeet, flight ? flight.inputs : inputs);
  const middle = (stanceFeet.front.x + stanceFeet.back.x) / 2;
  const cx = sx * middle * (1 - (flight ? smooth(HIPS.shift.start, HIPS.shift.end, p) : 0));
  // A bail's step off (ADR-90): the pelvis over the stepping feet; HIPS.z for every landing and before the bail.
  const off = flight && !flight.landed ? smooth(PHASE.catch.start, 1, p) * HIPS.bailFollow : 0;
  const cz = HIPS.z + ((feet.front.z + feet.back.z) / 2 - HIPS.z) * off;
  const half = LEG.hipWidth / 2;
  const fx = cx + sx * half;
  const bx = cx - sx * half;
  const free = hipHeight(flight, p, ready);
  const cy = Math.min(free, reachTop(fx, cz, out.front.target), reachTop(bx, cz, out.back.target));
  out.clamped = free - cy;
  out.pelvis.x = cx;
  out.pelvis.y = cy;
  out.pelvis.z = cz;
  setPoint(out.front.hip, fx, cy, cz);
  setPoint(out.back.hip, bx, cy, cz);
  solveLeg(out.front);
  solveLeg(out.back);
  return out;
}

function setPoint(o: Point3, x: number, y: number, z: number) {
  o.x = x;
  o.y = y;
  o.z = z;
}

/** Knee bend in degrees: 0 for a straight leg, the angle between the thigh and the shank. */
export const kneeBend = (leg: LegPose) => {
  const t = leg.thigh;
  const s = leg.shank;
  const c = t.dx * s.dx + t.dy * s.dy + t.dz * s.dz;
  return Math.acos(Math.max(-1, Math.min(1, c))) / D2R;
};

/**
 * One sentence for #scene-description (format.ts), from the same phases the
 * hips follow: crouched before the pop, tucked in the air, reaching down in
 * the catch, bent at the landing; riding along, a little bent, before a
 * game's wind-up (`riding`, ADR-86).
 */
export function describeLegs(u: number, flight: Flight | null, riding = false): string {
  if (!flight && riding) return 'Knees a little bent, riding along.';
  if (!flight || u <= 0) return 'Legs crouched, knees bent, ready to pop.';
  if (u >= 1) return flight.landed ? 'Knees bent, absorbing the landing.' : 'Knees bent, landing on the pad beside the board.';
  if (u < PHASE.catch.start) return 'Knees tucked up in the air.';
  return flight.landed ? 'Legs reach down to catch the board.' : 'Legs reach down beside the board.';
}
