// Pure flight model for one pop: projectile height plus constant-rate rotation
// about two axes. No React, no three. Units: metres, seconds, degrees.

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
  /** Total roll about the board's long axis by landing, degrees. */
  rollTotal: number;
  /** Total yaw about the vertical axis by landing, degrees. */
  yawTotal: number;
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

/** T = 2 * sqrt(2h / g): the up and down halves of a vertical throw to height h. */
export const airtimeFor = (pop: number) => 2 * Math.sqrt((2 * pop) / G);

export function computeFlight(inputs: TrickInputs): Flight {
  const T = airtimeFor(inputs.pop);
  return {
    inputs: { ...inputs },
    airtime: T,
    peak: inputs.pop,
    rollTotal: inputs.flick * T * 360,
    yawTotal: inputs.scoop * T * 360,
  };
}

const clamp01 = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u);

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
 */
function boardHeightAt(flight: Flight, p: number, pitch: number): number {
  const pivot = contactLift(pitch, flight.rollTotal * p);
  if (p <= POP_RISE_BY) return pivot;
  const h = heightAt(flight.peak, p);
  if (p >= 0.5) return h;
  const atStrike = contactLift(POP_PITCH, flight.rollTotal * POP_RISE_BY);
  const fromStrike = heightAt(flight.peak, POP_RISE_BY);
  const k = Math.max(0, flight.peak - atStrike) / (flight.peak - fromStrike);
  const thrown = atStrike + (h - fromStrike) * k;
  return p < LEVEL_BY ? Math.max(pivot, thrown) : thrown;
}

/**
 * Writes the pose at progress u (0 to 1 of airtime) into `out` and returns it.
 * Allocation-free so the render loop can call it every frame. With no flight
 * the board is at rest. At u = 0 it is exactly the rest pose; at u = 1 the
 * board has landed, so pitch is 0 and y is 0. `y` is the deck centre's rise,
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
  out.y = boardHeightAt(flight, p, out.pitch);
  out.roll = flight.rollTotal * p;
  out.yaw = flight.yawTotal * p;
  return out;
}

export const poseAt = (flight: Flight | null, u: number): Pose =>
  writePose({ y: 0, roll: 0, yaw: 0, pitch: 0 }, flight, u);

/** Advance progress by a real-time delta at a playback rate, capped at 1. */
export const advance = (progress: number, dtSeconds: number, rate: number, airtime: number) =>
  airtime <= 0 ? 1 : Math.min(1, progress + (dtSeconds * rate) / airtime);
