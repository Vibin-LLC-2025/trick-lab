// Pure flight model for one pop: projectile height plus a phased rotation
// about two axes (ADR-36): the spin ramps up as the feet leave the board, runs
// free at a constant rate, and stops in the catch, where a landed board is
// pressed onto its whole turn. No React, no three. Units: metres, seconds,
// degrees.
import { contactRise } from './boardSection';
import { isLanded, turns } from './landing';

export const G = 9.81;

export interface TrickInputs {
  /** Peak height of the pop, metres. */
  pop: number;
  /** Flip rate about the board's long axis, revolutions per second. */
  flick: number;
  /** Shove rate about the vertical axis, revolutions per second. */
  scoop: number;
}

export interface Flight {
  inputs: TrickInputs;
  /** Airtime, seconds. */
  airtime: number;
  /** Peak height, metres (equal to the pop input). */
  peak: number;
  /** Total roll about the board's long axis, degrees: flick * T * 360, what recognition reads. */
  rollTotal: number;
  /** Total yaw about the vertical axis, degrees: scoop * T * 360, what recognition reads. */
  yawTotal: number;
  /** Whether the totals land (isLanded, the rule recognition uses): the catch presses a landed board flat and square. */
  landed: boolean;
  /** Roll the board ends at, degrees: the nearest whole turn when landed, else rollTotal. */
  rollTarget: number;
  /** Yaw the board ends at, degrees: the nearest half turn when landed, else yawTotal. */
  yawTarget: number;
  /** Free-phase flip rate, revolutions per second, a magnitude (the sign of rollTotal is the direction). */
  flipRate: number;
  /** Free-phase shove rate, revolutions per second, a magnitude (the sign of yawTotal is the direction). */
  shoveRate: number;
}

/** Board pose at one instant. Mutable so the render loop can reuse one object. */
export interface Pose {
  /** Height of the board above its resting height, metres. */
  y: number;
  /** Degrees about the board's long axis. */
  roll: number;
  /** Degrees about world Y. */
  yaw: number;
  /** Cosmetic nose-up degrees. */
  pitch: number;
}

/**
 * Where the board can touch the pad, in its own frame (origin at the deck
 * centre, nose +X, grip +Y; ADR-27, 2026-11-04). src/sim may not import
 * src/asset, so these are copies; flight.test.ts pins them to
 * src/asset/spec.ts, the built deck and src/scene/artDirection.ts.
 * - restY: deck centre above the pad at rest (REST_Y).
 * - wheel: axle centre x (both trucks, plus and minus), height, tread radius,
 *   and the two tread edges across the board (WHEEL.centerZ minus and plus the
 *   flat half of the tread, 0.009): a rolled wheel touches at one of them.
 * - tail: the lowest point of the deck near the tail tip (the bottom of the
 *   tail edge, measured on the built deck), the point that strikes the pad.
 */
export const CONTACT = {
  restY: 0.08425,
  wheel: { x: 0.208, y: -0.05775, radius: 0.0265, z: [0.069, 0.087] },
  tail: { x: -0.396, y: 0.0308 },
} as const;

const W = CONTACT.wheel;
const TL = CONTACT.tail;

/**
 * Nose-up angle at which the tail strikes the pad while the rear wheels still
 * touch it, degrees (32.5 for this board). Rotating about the deck centre by
 * t, a point (x, y) is at height x sin t + y cos t, so the rear tread bottom
 * and the tail are level when A sin t + B cos t = r, with A the tail's lead
 * over the axle and B the axle's drop below the tail.
 */
export const TAIL_STRIKE = (() => {
  const A = -W.x - TL.x;
  const B = W.y - TL.y;
  return ((Math.asin(W.radius / Math.hypot(A, B)) + Math.atan2(-B, A)) * 180) / Math.PI;
})();

/**
 * Nose-up angle at the moment of pop, degrees: the tail-strike angle, so at
 * full pitch the tail is on the pad (ADR-27; was a cosmetic 18 degrees, which
 * this board reaches with the tail still 5 cm up). RESEARCH-FEET.md puts a
 * real ollie's board at 45 degrees or more once the front foot slides, so this
 * is the conservative end.
 */
export const POP_PITCH = TAIL_STRIKE;
/**
 * Fraction of airtime by which the tail has snapped and the nose is fully up.
 * Matches the feet model's pop window (MOTION.pop.end in feet.ts, tested).
 */
export const POP_RISE_BY = 0.05;
/** Fraction of airtime by which the board has levelled out. */
export const LEVEL_BY = 0.35;

/**
 * Phases of the rotation, fractions of the airtime (ADR-36, 2026-11-05).
 * Starting values from the coaching sources, to refit from reference data
 * (RESEARCH-FEET.md section 4 item 11). One source of truth: feet.ts and
 * format.ts read them (flight.ts never imports feet.ts).
 * - pop: the tail strike, equal to POP_RISE_BY and MOTION.pop.end.
 * - flipUp: the roll rate ramps from 0 to full while the front foot drags off
 *   the nose (the little toe leaves the heel-side rail by 0.16, ADR-33).
 * - shoveUp: the yaw rate ramps from 0 to full during the scoop.
 * - catch: the feet come down on the board; the rate decays to 0 and a landed
 *   board is pressed onto its whole turn and half turn.
 */
export const PHASE = {
  pop: { end: 0.05 },
  flipUp: { start: 0.06, end: 0.16 },
  shoveUp: { start: 0, end: 0.1 },
  catch: { start: 0.64, end: 0.76 },
} as const;

/** A window of progress, fractions of the airtime. */
export interface Window {
  readonly start: number;
  readonly end: number;
}

const clamp01 = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u);

/** 0 before a, 1 after b, smooth between. */
const smooth = (a: number, b: number, u: number) => {
  const s = clamp01((u - a) / (b - a));
  return s * s * (3 - 2 * s);
};

/**
 * Peak of the rotation rate for an up window, as a multiple of the total per
 * unit progress (W in ADR-36): the rate w(u) = W * ramp(u) * (1 - decay(u))
 * integrates to 1 over the flight when 1 / W = mid(catch) - mid(up), since a
 * smoothstep integrates to half its window. About 1.69 for the flip, 1.54
 * for the shove.
 */
export const spinPeak = (up: Window) => 1 / ((PHASE.catch.start + PHASE.catch.end) / 2 - (up.start + up.end) / 2);

/** The integral of a smoothstep from 0 to s (s in 0 to 1): s^3 - s^4 / 2. */
const smoothIntegral = (s: number) => s * s * s - (s * s * s * s) / 2;

/**
 * R(u), the fraction of the free rotation done by progress u for an up window
 * (ADR-36): the integral of the rate, a smoothstep ramp over `up`, constant
 * W between, and W times 1 minus a smoothstep over PHASE.catch. 0 up to
 * up.start, exactly 1 from PHASE.catch.end. Closed form in three pieces, no
 * loop, allocation-free.
 */
export function spinFraction(up: Window, u: number): number {
  const C = PHASE.catch;
  if (u <= up.start) return 0;
  if (u >= C.end) return 1;
  const W = spinPeak(up);
  const ramp = up.end - up.start;
  if (u < up.end) return W * ramp * smoothIntegral((u - up.start) / ramp);
  if (u <= C.start) return W * (ramp / 2 + (u - up.end));
  const len = C.end - C.start;
  const t = (u - C.start) / len;
  return W * (ramp / 2 + (C.start - up.end) + len * (t - smoothIntegral(t)));
}

/**
 * One axis at progress p: the free rotation, total * R(p), and for a landed
 * flight minus its residual error over the catch (a smoothstep), so the board
 * ends exactly on `target` at PHASE.catch.end and holds it. A failed flight
 * is not corrected and ends at its total, as before ADR-36. `+ 0` keeps -0
 * out of the pose.
 */
function spinAt(total: number, target: number, landed: boolean, up: Window, p: number): number {
  if (p >= PHASE.catch.end) return (landed ? target : total) + 0;
  const free = total * spinFraction(up, p);
  return (landed ? free - (total - target) * smooth(PHASE.catch.start, PHASE.catch.end, p) : free) + 0;
}

/** Roll about the board's long axis at progress u, degrees (ADR-36). Allocation-free. */
export const rollAt = (flight: Flight, u: number) =>
  spinAt(flight.rollTotal, flight.rollTarget, flight.landed, PHASE.flipUp, clamp01(u));
/** Yaw about world Y at progress u, degrees (ADR-36). Allocation-free. */
export const yawAt = (flight: Flight, u: number) =>
  spinAt(flight.yawTotal, flight.yawTarget, flight.landed, PHASE.shoveUp, clamp01(u));

/** T = 2 * sqrt(2h / g): the up and down halves of a vertical throw to height h. */
export const airtimeFor = (pop: number) => 2 * Math.sqrt((2 * pop) / G);

export function computeFlight(inputs: TrickInputs): Flight {
  const T = airtimeFor(inputs.pop);
  const rollTotal = inputs.flick * T * 360;
  const yawTotal = inputs.scoop * T * 360;
  const landed = isLanded(rollTotal, yawTotal);
  return {
    inputs: { ...inputs },
    airtime: T,
    peak: inputs.pop,
    rollTotal,
    yawTotal,
    landed,
    rollTarget: landed ? turns(rollTotal / 360) * 360 : rollTotal,
    yawTarget: landed ? turns(yawTotal / 180) * 180 : yawTotal,
    flipRate: spinPeak(PHASE.flipUp) * Math.abs(inputs.flick),
    shoveRate: spinPeak(PHASE.shoveUp) * Math.abs(inputs.scoop),
  };
}

/** y(t) = h * (1 - (2t/T - 1)^2), written with progress u = t / T. */
export const heightAt = (peak: number, u: number) => {
  const k = 2 * clamp01(u) - 1;
  return peak * (1 - k * k);
};

/**
 * Level at u = 0 (so progress 0 is exactly the rest pose, 2026-11-04), nose up
 * to POP_PITCH by u = POP_RISE_BY (ease-out quadratic: the tail snap), then
 * back to level at u = LEVEL_BY (1 - smoothstep), then level. Both halves have
 * zero slope at the peak, so there is no kink, and the descent also arrives
 * at level with zero slope.
 */
export const pitchAt = (u: number) => {
  const p = clamp01(u);
  if (p <= POP_RISE_BY) {
    const s = p / POP_RISE_BY;
    return POP_PITCH * s * (2 - s);
  }
  const s = clamp01((p - POP_RISE_BY) / (LEVEL_BY - POP_RISE_BY));
  return POP_PITCH * (1 - s) * (1 - s) * (1 + 2 * s);
};

const D2R = Math.PI / 180;

/**
 * How far the deck centre must rise so that no wheel and not the tail is
 * below the pad, for a board rolled `roll` degrees about its own long axis
 * and pitched `pitch` degrees nose up (the 'YZX' order of ADR-32: the flip
 * is about the pitched long axis; yaw does not change heights). A point
 * (x, y, z) ends at height x sin p + (y cos r - z sin r) cos p; a tread edge
 * circle of radius R, its axle along (sin p sin r, -cos p sin r, cos r), has
 * its lowest point R sqrt(1 - cos^2 p sin^2 r) below its centre. 0 at rest.
 * Allocation-free.
 */
export function contactLift(pitch: number, roll: number): number {
  const sp = Math.sin(pitch * D2R);
  const cp = Math.cos(pitch * D2R);
  const sr = Math.sin(roll * D2R);
  const cr = Math.cos(roll * D2R);
  const tilt = cp * sr;
  const drop = W.radius * Math.sqrt(1 - tilt * tilt);
  // Index loops and no literals: this runs every frame (CLAUDE.md rule 6).
  let lowest = TL.x * sp + TL.y * cr * cp;
  const rear = -W.x * sp + W.y * cr * cp - drop;
  const front = W.x * sp + W.y * cr * cp - drop;
  const axle = Math.min(rear, front);
  for (let i = 0; i < W.z.length; i++) {
    // Either side of the board: plus or minus z, whichever the roll lowers.
    lowest = Math.min(lowest, axle - Math.abs(W.z[i]! * tilt));
  }
  const lift = -CONTACT.restY - lowest;
  // Below a micrometre is rounding at rest, so progress 0 stays exactly 0.
  return lift > 1e-6 ? lift : 0;
}

/**
 * Height of the deck centre above its rest height at progress p, metres
 * (ADR-27). The pop is a pivot on the pad, then a throw:
 * - Up to POP_RISE_BY the board pivots nose up with its lowest point (the
 *   rear wheels, then the tail at full pitch) on the pad: the centre rises by
 *   the contact lift alone.
 * - From the strike to the peak it is airborne: the rising half of the
 *   projectile parabola, rescaled to run from the height at the strike to the
 *   peak. It rises the whole way, never overshoots the peak, meets the
 *   unchanged parabola at the top with zero slope, and the airtime and peak
 *   are unchanged. The fall is the parabola itself, so the landing at u = 1
 *   is exactly the rest height.
 * - Until LEVEL_BY the contact lift is also a floor, so a rolled or pitched
 *   board never dips into the pad.
 * - A board that does not land comes down on whatever it lands on (ADR-68):
 *   on the way down its lowest point never goes below the pad (contactRise),
 *   and a board that would rest lower than it does wheels down (upside down,
 *   on its kicks) sinks to that height as it falls, so a bail ends resting
 *   on a rail or the kicks, neither through the pad nor above it. A landed
 *   board is level and square by then, so this never touches it.
 * `roll` is the board's roll at p (rollAt, ADR-36), which writePose has
 * already worked out.
 */
function boardHeightAt(flight: Flight, p: number, pitch: number, roll: number): number {
  const pivot = contactLift(pitch, roll);
  if (p <= POP_RISE_BY) return pivot;
  const h = heightAt(flight.peak, p);
  if (p >= 0.5) {
    if (flight.landed) return h;
    const rest = contactRise(roll);
    const sink = rest < 0 ? rest * (1 - h / flight.peak) : 0;
    return Math.max(h + sink, rest);
  }
  const atStrike = contactLift(POP_PITCH, rollAt(flight, POP_RISE_BY));
  const fromStrike = heightAt(flight.peak, POP_RISE_BY);
  const k = Math.max(0, flight.peak - atStrike) / (flight.peak - fromStrike);
  const thrown = atStrike + (h - fromStrike) * k;
  return p < LEVEL_BY ? Math.max(pivot, thrown) : thrown;
}

/**
 * Writes the pose at progress u (0 to 1 of airtime) into `out` and returns it.
 * Allocation-free so the render loop can call it every frame. With no flight
 * the board is at rest. At u = 0 it is exactly the rest pose; at u = 1 the
 * board has landed, so pitch is 0 and y is 0. Roll and yaw follow the phased
 * profile (rollAt, yawAt; ADR-36), so a landed board is flat and square from
 * PHASE.catch.end. `y` is the deck centre's rise,
 * including the tail-pivot lift of the pop (ADR-27), so it is not heightAt
 * in the first third of the airtime.
 */
export function writePose(out: Pose, flight: Flight | null, u: number): Pose {
  if (!flight) {
    out.y = 0;
    out.roll = 0;
    out.yaw = 0;
    out.pitch = 0;
    return out;
  }
  const p = clamp01(u);
  out.pitch = pitchAt(p);
  out.roll = rollAt(flight, p);
  out.yaw = yawAt(flight, p);
  out.y = boardHeightAt(flight, p, out.pitch, out.roll);
  return out;
}

export const poseAt = (flight: Flight | null, u: number): Pose =>
  writePose({ y: 0, roll: 0, yaw: 0, pitch: 0 }, flight, u);

/** Advance progress by a real-time delta at a playback rate, capped at 1. */
export const advance = (progress: number, dtSeconds: number, rate: number, airtime: number) =>
  airtime <= 0 ? 1 : Math.min(1, progress + (dtSeconds * rate) / airtime);
