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
//   lowest point stays on the pad, and slides away from the feet: forward,
//   and away from the side they stepped off to. The feet stay where they
//   stepped down.
//
// Frame: goofy, the board's rest frame (x along the board, nose +X, y up from
// the deck centre at rest, z across, the feet bail to +Z). The scene maps it
// for a regular rider. Pure: no React, no three, no allocation in writeSettle.
import { contactRise, restingRoll } from './boardSection';
import { footLift } from './boardVolume';
import { mirrorFoot, writeFeetIntent, type FeetPose, type FootPose, type Stance } from './feet';
import { CONTACT, rollAt, yawAt, type Flight } from './flight';
import { gradeOf, type Grade } from './landing';

/**
 * The timings and sizes, for the owner's list of changes (decision 26). Seconds and metres.
 * - sketchy: `rockDeg` nose up at the top of the rock, over `rockS`; the
 *   swerve turns up to `swerveDeg` and back over `swerveS`, ending `sideM` to
 *   one side (the kickflip side's way for a kickflip, the other for a heelflip).
 * - bail: a fall through 90 degrees takes `fallS` (less for less, as a fall
 *   from rest goes with the square root of the angle); the slide goes
 *   `forwardM` along the nose and `sideM` away from the feet, slowing
 *   steadily to a stop over `slideS`.
 */
export const SETTLE = {
  sketchy: { rockDeg: 5, rockS: 0.5, swerveDeg: 7, swerveS: 1.0, sideM: 0.05 },
  bail: { fallS: 0.4, minFallS: 0.12, slideS: 1.1, forwardM: 0.6, sideM: 0.15 },
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
}

export const newSettle = (): Settle => ({ grade: 'clean', forward: 0, side: 0, yaw: 0, pitch: 0, pivotX: 0, pivotY: 0, riding: true, roll: 0, rise: 0 });

/** The rear axle, the pivot of a sketchy landing's rock: the back wheels stay on the pad. */
const REAR_AXLE = { x: -CONTACT.wheel.x, y: CONTACT.wheel.y } as const;

const clamp01 = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u);

/** How long a bailing board takes to fall from the flight's end roll onto its resting side. */
export function fallSeconds(flight: Flight): number {
  const B = SETTLE.bail;
  const from = rollAt(flight, 1);
  const turn = Math.abs(restingRoll(from) - from);
  return turn === 0 ? 0 : Math.max(B.minFallS, B.fallS * Math.sqrt(turn / 90));
}

/** How long the landing plays, seconds: 0 for a clean landing, which has nothing of its own. */
export function settleSeconds(flight: Flight): number {
  const g = gradeOf(flight.rollTotal, flight.yawTotal);
  if (g === 'clean') return 0;
  if (g === 'sketchy') return Math.max(SETTLE.sketchy.rockS, SETTLE.sketchy.swerveS);
  return Math.max(fallSeconds(flight), SETTLE.bail.slideS);
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
    // A steady slow-down to a stop: the distance is 1 - (1 - s)^2 of the way.
    const s = clamp01(time / B.slideS);
    const slid = 1 - (1 - s) * (1 - s);
    out.forward = B.forwardM * slid;
    out.side = -B.sideM * slid + 0;
  }
  return out;
}

/** Reused by writeBailFeet (no allocation): the board's pose, and a foot in the sliding board's frame. */
const bailBoard = { y: 0, roll: 0, yaw: 0, pitch: 0 };
const moved: FootPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };

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

/**
 * The feet of a bail while the board falls and slides (ADR-68): where the
 * model steps them down (writeFeetIntent at the landing), cleared against
 * the board where the landing has it now, as the flight's clearance does
 * (ADR-29). A board that lay under a shoe slides out and the shoe comes down
 * to the pad; one that slides under a shoe lifts it, never passes through
 * it. `s` is this landing at this time (writeSettle). Allocation-free.
 */
export function writeBailFeet(out: FeetPose, inputs: Flight['inputs'], flight: Flight, s: Settle, stance: Stance = 'goofy'): FeetPose {
  writeFeetIntent(out, inputs, flight, 1, 'goofy');
  bailBoard.y = s.rise;
  bailBoard.roll = s.roll;
  bailBoard.yaw = yawAt(flight, 1);
  out.front.y += liftOff(out.front, 1, s);
  out.back.y += liftOff(out.back, -1, s);
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

/** The flight's end yaw, for callers that place the board's footprint. */
export const endYaw = (flight: Flight) => yawAt(flight, 1);
