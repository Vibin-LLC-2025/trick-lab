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

/** Cosmetic nose-up angle at the moment of pop, degrees. */
export const POP_PITCH = 18;
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

/** Nose up POP_PITCH at u = 0, eased (quadratic) to level at u = LEVEL_BY, then level. */
export const pitchAt = (u: number) => {
  const s = clamp01(u / LEVEL_BY);
  return POP_PITCH * (1 - s) * (1 - s);
};

/**
 * Writes the pose at progress u (0 to 1 of airtime) into `out` and returns it.
 * Allocation-free so the render loop can call it every frame. With no flight
 * the board is at rest. At u = 1 the board has landed, so pitch is 0.
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
  out.y = heightAt(flight.peak, p);
  out.roll = flight.rollTotal * p;
  out.yaw = flight.yawTotal * p;
  out.pitch = pitchAt(p);
  return out;
}

export const poseAt = (flight: Flight | null, u: number): Pose =>
  writePose({ y: 0, roll: 0, yaw: 0, pitch: 0 }, flight, u);

/** Advance progress by a real-time delta at a playback rate, capped at 1. */
export const advance = (progress: number, dtSeconds: number, rate: number, airtime: number) =>
  airtime <= 0 ? 1 : Math.min(1, progress + (dtSeconds * rate) / airtime);
