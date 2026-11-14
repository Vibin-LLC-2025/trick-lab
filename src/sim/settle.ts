// Landings with weight (step 13, ADR-68): what the board and the rider do
// after the wheels touch down in a game, as one pure function of the flight
// and the seconds since the landing. The board, its shadow, the shoes, the
// legs and the scene's text all read it, so they cannot disagree.
//
// - clean: nothing here. The board rolls on straight and slows to a stop
//   (the roll, ADR-67), with the feet on the bolts as they landed.
// - sketchy: the board rocks once onto its back wheels (nose up, pivoting on
//   the rear axle, so the back wheels stay on the pad) and swerves a little to
//   one side, and the rider rides it: the shoes and legs move with the board.
// - bail: the board falls over onto the side it is nearest (wheels down, a
//   rail, or upside down on its kicks), rolling over its own edge so its
//   lowest point stays on the pad, and is kicked away from the feet along
//   its own length (ADR-92): the end that points away from the side they
//   stepped off to leads, so a crooked board never sweeps under them. The
//   feet stay where they stepped down, and come down off a board that leaves
//   them no faster than they would fall.
//
// Frame: goofy, the board's rest frame (x along the board, nose +X, y up from
// the deck centre at rest, z across, the feet bail to +Z). The scene maps it
// for a regular rider. Pure: no React, no three, no allocation in writeSettle.
import { contactRise, restingRoll } from './boardSection';
import { footLift } from './boardVolume';
import { mirrorFoot, newFeetPose, writeFeetIntent, type FeetPose, type FootPose, type Stance } from './feet';
import { CONTACT, rollAt, yawAt, type Flight } from './flight';
import { gradeOf, type Grade } from './landing';

/**
 * The timings and sizes, for the owner's list of changes (decision 26). Seconds and metres.
 * - sketchy: `rockDeg` nose up at the top of the rock, over `rockS`; the
 *   swerve turns up to `swerveDeg` and back over `swerveS`, ending `sideM` to
 *   one side (the kickflip side's way for a kickflip, the other for a heelflip).
 * - bail: a fall through 90 degrees takes `fallS` (less for less, as a fall
 *   from rest goes with the square root of the angle); the board is kicked
 *   along its own length, the end pointing away from the feet first
 *   (straight on along the nose when it is within `straightDeg` of
 *   straight): `forwardM` when it lies along the way it was going, down to
 *   `acrossM` when it lies across it, so it stops short of the kerb behind;
 *   and `sideM` further away from them, fastest at once and
 *   slowing to a stop over `slideS` (ADR-92). A shoe the board leaves comes
 *   down no faster than it would fall (`drop`: `g` m/s^2, looking back
 *   `lookS` seconds at times `stepS` apart). `step` (ADR-90): the rider catches
 *   its balance after touching down, a short recovery step: the back foot
 *   lifts (`lift` metres at most), steps `backX` along the deck and `backZ`
 *   further out over `stepS` seconds from `delayS`, and both feet turn a
 *   little more toward the nose (`backYaw`, `frontYaw` degrees), the front
 *   one pivoting where it stands. 2026-11-13 (ADR-96): `backX` 0.13, from 0,
 *   so the step brings the back foot in toward the front one and the rider
 *   stands up from the bail on a natural stance, not on the board's wide one.
 */
export const SETTLE = {
  sketchy: { rockDeg: 5, rockS: 0.5, swerveDeg: 7, swerveS: 1.0, sideM: 0.05 },
  bail: {
    fallS: 0.4,
    minFallS: 0.12,
    slideS: 1.1,
    forwardM: 0.6,
    acrossM: 0.4,
    sideM: 0.15,
    straightDeg: 10,
    drop: { g: 9.8, lookS: 0.3, stepS: 1 / 60 },
    step: { delayS: 0.06, stepS: 0.36, lift: 0.04, backX: 0.13, backZ: 0.07, backYaw: -12, frontYaw: -4 },
  },
} as const;

/**
 * Where the landing has the board (and the rider, when riding), on top of
 * the flight's end pose: a rigid move of `pitch` (nose up) about the pivot,
 * then `yaw` (the flight's yaw sign) about the vertical through the deck
 * centre, then `forward` along the nose and `side` along +Z. For a bail the
 * board's own `roll` and `rise` (above rest) replace the flight's.
 */
export interface Settle {
  grade: Grade;
  forward: number;
  side: number;
  yaw: number;
  pitch: number;
  pivotX: number;
  pivotY: number;
  /** The feet and legs move with the board (clean, sketchy), or stay where they stepped down (bail). */
  riding: boolean;
  /** Bail only: the board's roll and its deck centre's rise above rest. The flight's end values otherwise. */
  roll: number;
  rise: number;
  /** Bail only: the rider's recovery step after touchdown, 0 to 1 (SETTLE.bail.step). 0 otherwise. */
  step: number;
  /** Seconds since touchdown (Infinity for the end pose). */
  t: number;
}

export const newSettle = (): Settle => ({ grade: 'clean', forward: 0, side: 0, yaw: 0, pitch: 0, pivotX: 0, pivotY: 0, riding: true, roll: 0, rise: 0, step: 0, t: 0 });

/** The rear axle, the pivot of a sketchy landing's rock: the back wheels stay on the pad. */
const REAR_AXLE = { x: -CONTACT.wheel.x, y: CONTACT.wheel.y } as const;

const clamp01 = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u);
const D2R = Math.PI / 180;

/**
 * The way a bailed board is kicked, a unit vector [x, z] in the goofy frame:
 * along its own length (its nose points (cos yaw, -sin yaw)), the end that
 * points away from the feet (-Z) leading; within SETTLE.bail.straightDeg of
 * straight, on along the way it was going (+X). Into `out`.
 */
export function slideWay(out: [number, number], flight: Flight): [number, number] {
  const yaw = yawAt(flight, 1) * D2R;
  let x = Math.cos(yaw);
  let z = -Math.sin(yaw);
  const nearlyStraight = Math.abs(z) < Math.sin(SETTLE.bail.straightDeg * D2R);
  if (nearlyStraight ? x < 0 : z > 0) {
    x = -x;
    z = -z;
  }
  out[0] = x + 0;
  out[1] = z + 0;
  return out;
}
const way: [number, number] = [0, 0];

/** How long a bailing board takes to fall from the flight's end roll onto its resting side. */
export function fallSeconds(flight: Flight): number {
  const B = SETTLE.bail;
  const from = rollAt(flight, 1);
  const turn = Math.abs(restingRoll(from) - from);
  return turn === 0 ? 0 : Math.max(B.minFallS, B.fallS * Math.sqrt(turn / 90));
}

/** How long the board's own landing plays, seconds: 0 for a clean landing, which has nothing of its own. */
export function settleSeconds(flight: Flight): number {
  const g = gradeOf(flight.rollTotal, flight.yawTotal);
  if (g === 'clean') return 0;
  if (g === 'sketchy') return Math.max(SETTLE.sketchy.rockS, SETTLE.sketchy.swerveS);
  return Math.max(fallSeconds(flight), SETTLE.bail.slideS);
}

/**
 * The rider's recovery after touchdown in a game (ADR-96, 2026-11-13),
 * seconds since the wheels touched (the landing's clock, so the game's pace
 * slows it as it slows the flight). Until then the rider held the landing's
 * pose: squatting in the absorb after a clean landing until the next go, and
 * after a bail standing stock still, legs apart and arms out, while the board
 * slid away.
 * - `landed` (clean and sketchy): the knees give `dip` metres more, at most
 *   `dipAt` after touchdown (the drop the absorb started carries on and
 *   slows, so the hips never stop dead), then the rider stands back up into
 *   the riding stance between `stand` [from, to] (legs.ts HIPS.ride, body.ts
 *   RIDE), riding away loose as it rode in.
 * - `bail`: stepped off onto the pad, the rider stumbles, the knees `dip`
 *   deeper at `dipAt` and the trunk and arms thrown forward and out
 *   (body.ts MOTION.bail.stumble), then gathers itself between `stand`:
 *   the hips up to `height` over the ankles and over the middle of the feet,
 *   the trunk upright, the arms down, the head turned to where the board
 *   went.
 */
export const RECOVER = {
  landed: { dip: 0.03, dipAt: 0.07, stand: [0.1, 0.55] },
  bail: { dip: 0.07, dipAt: 0.12, stand: [0.22, 0.9], height: 0.78 },
} as const;

/** How long a game's landing plays, seconds: the board's own (settleSeconds) or the rider's recovery, the longer. */
export function landingSeconds(flight: Flight): number {
  const R = flight.landed ? RECOVER.landed : RECOVER.bail;
  return Math.max(settleSeconds(flight), R.stand[1]);
}

/**
 * How far the rider has stood back up `after` seconds since touchdown, 0 at
 * the landing's pose to 1 standing (the recovery's own smoothstep, as legs.ts
 * and body.ts pose it). The game's camera lifts with it as it does for a rider
 * riding along (SceneCamera's riding lift, 2026-11-13), so a recovered rider's
 * head stays in the shot.
 */
export function recoveredBy(flight: Flight, after: number): number {
  const [a, b] = (flight.landed ? RECOVER.landed : RECOVER.bail).stand;
  const u = Math.min(1, Math.max(0, (after - a) / (b - a)));
  return u * u * (3 - 2 * u);
}

/**
 * Writes the landing `t` seconds after touchdown into `out` and returns it
 * (Infinity, or any t past settleSeconds, is the end pose). Allocation-free.
 */
export function writeSettle(out: Settle, flight: Flight, t: number): Settle {
  const g = gradeOf(flight.rollTotal, flight.yawTotal);
  const time = t > 0 ? t : 0;
  out.grade = g;
  out.forward = 0;
  out.side = 0;
  out.yaw = 0;
  out.pitch = 0;
  out.pivotX = REAR_AXLE.x;
  out.pivotY = REAR_AXLE.y;
  out.riding = g !== 'bail';
  out.roll = rollAt(flight, 1);
  out.rise = 0;
  out.step = 0;
  out.t = time;
  if (g === 'sketchy') {
    const S = SETTLE.sketchy;
    const rock = clamp01(time / S.rockS);
    const swerve = clamp01(time / S.swerveS);
    // Its own way for each flick direction: a kickflip swerves one way, a heelflip the other.
    const way = flight.rollTotal < 0 ? -1 : 1;
    out.pitch = S.rockDeg * Math.sin(Math.PI * rock);
    out.yaw = way * S.swerveDeg * Math.sin(Math.PI * swerve);
    out.side = way * S.sideM * (1 - Math.cos(Math.PI * swerve)) * 0.5;
  } else if (g === 'bail') {
    const B = SETTLE.bail;
    const from = out.roll;
    const to = restingRoll(from);
    const fall = fallSeconds(flight);
    // Falling from rest: the angle goes with the square of the time.
    const f = fall === 0 ? 1 : clamp01(time / fall);
    out.roll = from + (to - from) * f * f;
    out.rise = contactRise(out.roll);
    // Kicked away: fastest at once, slowing to a stop; the distance is 1 - (1 - s)^3 of the way.
    const s = clamp01(time / B.slideS);
    const slid = 1 - (1 - s) * (1 - s) * (1 - s);
    slideWay(way, flight);
    const kick = B.forwardM + (B.acrossM - B.forwardM) * Math.abs(way[1]);
    out.forward = kick * way[0] * slid + 0;
    out.side = (kick * way[1] - B.sideM) * slid + 0;
    out.step = clamp01((time - B.step.delayS) / B.step.stepS);
  }
  return out;
}

/** Reused by writeBailFeet (no allocation): the board's pose, a foot in the sliding board's frame, the landing and the feet a moment ago. */
const bailBoard = { y: 0, roll: 0, yaw: 0, pitch: 0 };
const moved: FootPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
const before = newSettle();
const stepped = newFeetPose();
const lifts: [number, number] = [0, 0];

/** How far foot `f` must rise to clear the board of a bail where `s` has it (the slide taken off the foot instead). */
function liftOff(f: FootPose, edge: 1 | -1, s: Settle): number {
  moved.x = f.x - s.forward;
  moved.y = f.y;
  moved.z = f.z - s.side;
  moved.yaw = f.yaw;
  moved.pitch = f.pitch;
  moved.roll = f.roll;
  return footLift(moved, edge, bailBoard, 1);
}

/** The recovery step (ADR-90) at `step` (0 to 1), onto feet the model stepped down: smooth in and out, the back foot up and over, the front one turning where it stands. */
function writeStep(out: FeetPose, step: number) {
  const S = SETTLE.bail.step;
  const k = step * step * (3 - 2 * step);
  out.back.x += S.backX * k;
  out.back.z += S.backZ * k;
  out.back.y += S.lift * Math.sin(Math.PI * step);
  out.back.yaw += S.backYaw * k;
  out.front.yaw += S.frontYaw * k;
}

const copyFoot = (to: FootPose, from: FootPose) => {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
  to.yaw = from.yaw;
  to.pitch = from.pitch;
  to.roll = from.roll;
};

/** How far the board of landing `s` lifts each shoe of `feet` (stepped down, `aim`, plus the step `s` has), into `lifts`. */
function boardLifts(aim: FeetPose, flight: Flight, s: Settle) {
  copyFoot(stepped.front, aim.front);
  copyFoot(stepped.back, aim.back);
  writeStep(stepped, s.step);
  bailBoard.y = s.rise;
  bailBoard.roll = s.roll;
  bailBoard.yaw = yawAt(flight, 1);
  lifts[0] = liftOff(stepped.front, 1, s);
  lifts[1] = liftOff(stepped.back, -1, s);
}

/**
 * The board's lift of each shoe at fixed times since touchdown, every
 * SETTLE.bail.drop.stepS, for one flight: a cache of boardLifts, so a frame
 * works out only the times it has not seen. The numbers are the same
 * whenever they are worked out; only the work is saved.
 */
const GRID = { flight: null as Flight | null, inputs: null as Flight['inputs'] | null, front: new Float64Array(160), back: new Float64Array(160) };

function gridLifts(aim: FeetPose, inputs: Flight['inputs'], flight: Flight, j: number) {
  if (GRID.flight !== flight || GRID.inputs !== inputs) {
    GRID.flight = flight;
    GRID.inputs = inputs;
    GRID.front.fill(NaN);
    GRID.back.fill(NaN);
  }
  if (Number.isNaN(GRID.front[j]!)) {
    boardLifts(aim, flight, writeSettle(before, flight, j * SETTLE.bail.drop.stepS));
    GRID.front[j] = lifts[0];
    GRID.back[j] = lifts[1];
  }
  lifts[0] = GRID.front[j]!;
  lifts[1] = GRID.back[j]!;
}

/**
 * The feet of a bail while the board falls and slides (ADR-68): where the
 * model steps them down (writeFeetIntent at the landing), cleared against
 * the board where the landing has it now, as the flight's clearance does
 * (ADR-29). A board that slides under a shoe lifts it, never passes through
 * it; one that leaves a shoe lets it come down to the pad no faster than it
 * would fall (ADR-92): the shoe is as high as the board lifted it at any
 * moment in the last SETTLE.bail.drop.lookS seconds, less how far it would
 * have fallen since. `s` is this landing at this time (writeSettle).
 * Allocation-free.
 */
export function writeBailFeet(out: FeetPose, inputs: Flight['inputs'], flight: Flight, s: Settle, stance: Stance = 'goofy'): FeetPose {
  writeFeetIntent(out, inputs, flight, 1, 'goofy');
  boardLifts(out, flight, s);
  let front = lifts[0];
  let back = lifts[1];
  const D = SETTLE.bail.drop;
  if (Number.isFinite(s.t)) {
    const last = Math.min(Math.floor(s.t / D.stepS), GRID.front.length - 1);
    for (let j = Math.max(0, Math.ceil((s.t - D.lookS) / D.stepS)); j <= last; j++) {
      gridLifts(out, inputs, flight, j);
      const ago = s.t - j * D.stepS;
      const fallen = 0.5 * D.g * ago * ago;
      if (lifts[0] - fallen > front) front = lifts[0] - fallen;
      if (lifts[1] - fallen > back) back = lifts[1] - fallen;
    }
  }
  writeStep(out, s.step);
  out.front.y += front;
  out.back.y += back;
  if (stance === 'regular') {
    mirrorFoot(out.front);
    mirrorFoot(out.back);
  }
  return out;
}

/** What the board rests on once a bail has settled. */
export type RestSide = 'wheels' | 'rail' | 'grip';

/** The side a bailed board ends on (wheels down when the flip was fine and only the shove was off). */
export function restSide(flight: Flight): RestSide {
  const quarter = ((restingRoll(rollAt(flight, 1)) / 90) % 4 + 4) % 4;
  return quarter === 0 ? 'wheels' : quarter === 2 ? 'grip' : 'rail';
}

