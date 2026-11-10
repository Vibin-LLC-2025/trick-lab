// The rolling sound's model (step 18, ADR-73): the board's speed and distance
// as scene/roll.ts moves them (a steady push to the cruise, a steady slow-down
// to a stop, both scaled by the playback speed), and the moments an axle
// crosses a joint in the concrete, so the player can schedule the ticks on
// the audio clock in step with the picture. Pure: no Web Audio, no three.
// Its numbers copy ART.roll, TRUCK.centerX and the ground's BAY, and a test
// checks they still match (rolling.test.ts).

export const ROLL_MODEL = {
  /** m/s, ART.roll.cruise. */
  cruise: 2.4,
  /** Seconds from still to the cruise, ART.roll.pushS. */
  pushS: 0.7,
  /** Seconds from the cruise to a stop, ART.roll.slowS. */
  slowS: 1.3,
  /** The axles' distance from the board's centre, m (TRUCK.centerX). */
  axleX: 0.208,
  /** The joints' spacing along the roll, m (BAY.x); a bay's centre is under the resting board, so joints sit at +-bay / 2. */
  bay: 1.6,
} as const;

/** Where in each bay (distance rolled, mod `bay`) an axle crosses a joint: the front axle first, then the back one a wheelbase later. */
export const CROSSINGS: readonly number[] = [ROLL_MODEL.bay / 2 - ROLL_MODEL.axleX, ROLL_MODEL.bay / 2 + ROLL_MODEL.axleX];

/** The roll at one moment: speed (m/s) and distance (m), as FlightDriver last wrote them. */
export interface RollNow {
  speed: number;
  distance: number;
}

/** Speed change per second of the roll's own time (real time times the playback speed), signed. */
const accelOf = (pushing: boolean) => (pushing ? ROLL_MODEL.cruise / ROLL_MODEL.pushS : -ROLL_MODEL.cruise / ROLL_MODEL.slowS);

/**
 * Seconds of real time until the speed reaches its end (the cruise, or a
 * stop) from `speed`. FlightDriver steps the roll by the frame's time times
 * the playback speed, so in slow motion everything takes 1 / rate as long.
 */
export function rampSeconds(speed: number, pushing: boolean, rate: number): number {
  const target = pushing ? ROLL_MODEL.cruise : 0;
  return Math.abs(target - speed) / Math.abs(accelOf(pushing)) / rate;
}

/** The roll's own seconds until the distance grows by `d` metres, or null if it never does (slowing stops first). */
function rollSecondsToGo(d: number, speed: number, pushing: boolean): number | null {
  if (d <= 0) return 0;
  const a = accelOf(pushing);
  const ramp = Math.abs((pushing ? ROLL_MODEL.cruise : 0) - speed) / Math.abs(a);
  const end = speed + a * ramp;
  const rampDistance = speed * ramp + (a * ramp * ramp) / 2;
  if (d > rampDistance) {
    // Past the ramp: at the cruise the rest goes at constant speed; stopped, never.
    if (end <= 1e-9) return null;
    return ramp + (d - rampDistance) / end;
  }
  // Within the ramp: d = v t + a t^2 / 2.
  return (-speed + Math.sqrt(Math.max(0, speed * speed + 2 * a * d))) / a;
}

/** Real seconds from now until the distance grows by `d` metres at playback speed `rate`, or null if it never does. */
export function secondsToGo(d: number, speed: number, pushing: boolean, rate: number): number | null {
  const t = rollSecondsToGo(d, speed, pushing);
  return t === null ? null : t / rate;
}

/** One tick: real seconds from now, and the board's speed then (m/s, for its loudness). */
export interface Tick {
  at: number;
  speed: number;
}

/**
 * The moments an axle crosses a joint within `horizon` real seconds, in
 * order. Writes into `out` (cleared first) and returns it.
 */
export function jointTicks(now: RollNow, pushing: boolean, rate: number, horizon: number, out: Tick[] = []): Tick[] {
  out.length = 0;
  if (rate <= 0) return out;
  const { bay } = ROLL_MODEL;
  const a = accelOf(pushing);
  const end = pushing ? ROLL_MODEL.cruise : 0;
  const base = Math.floor(now.distance / bay) * bay;
  for (let k = 0; k < 200; k++) {
    for (const c of CROSSINGS) {
      const d = base + k * bay + c - now.distance;
      if (d <= 0) continue;
      const t = secondsToGo(d, now.speed, pushing, rate);
      if (t === null || t > horizon) return out;
      const v = now.speed + a * t * rate;
      out.push({ at: t, speed: pushing ? Math.min(end, v) : Math.max(end, v) });
    }
  }
  return out;
}
