// The landing rule, pure: whether a flight with these rotation totals lands,
// and by how much it misses. Shared by recognition (tricks.ts), the flight's
// catch (flight.ts, ADR-36) and the feet (feet.ts), so all three decide land
// or bail the same way. Imports nothing, so flight.ts can use it without an
// import cycle through tricks.ts.

/** A landing needs the flip within this many degrees of a whole revolution. */
export const ROLL_TOLERANCE = 30;
/** A landing needs the shove within this many degrees of a half turn. */
export const YAW_TOLERANCE = 25;
/** A clean landing (ADR-63) has the flip within this many degrees of a whole revolution. */
export const CLEAN_ROLL = 10;
/** A clean landing has the shove within this many degrees of a half turn. */
export const CLEAN_YAW = 8;

/**
 * How a flight ended (ADR-63). Clean: inside both clean limits. Sketchy:
 * landed (isLanded), but outside a clean limit. Bail: not landed.
 */
export type Grade = 'clean' | 'sketchy' | 'bail';

/**
 * Symmetric round to the nearest whole number of turns: Math.round sends -0.5
 * toward +infinity, so a heelflip would round differently from its kickflip
 * mirror. `+ 0` turns -0 into 0, so a naming key is never "-0,0".
 */
export const turns = (x: number) => Math.sign(x) * Math.round(Math.abs(x)) + 0;
/** Signed error about the nearest whole revolution (flip): total minus target. */
export const rollError = (rollTotal: number) => rollTotal - turns(rollTotal / 360) * 360;
/** Signed error about the nearest half turn (shove): total minus target. */
export const yawError = (yawTotal: number) => yawTotal - turns(yawTotal / 180) * 180;

/**
 * Whether a flight with these totals lands: both axes within tolerance.
 * Allocation-free, so the feet model (src/sim/feet.ts) can ask every frame.
 */
export const isLanded = (rollTotal: number, yawTotal: number) =>
  Math.abs(rollError(rollTotal)) <= ROLL_TOLERANCE && Math.abs(yawError(yawTotal)) <= YAW_TOLERANCE;

/**
 * How far a landed flight is from clean, 0 to 1 (ADR-63): 0 inside both clean
 * limits, rising to 1 where the worse axis reaches its landing tolerance.
 * Continuous, so the feet's sketchy offset (feet.ts) grows from nothing. 0
 * for a flight that does not land (it bails instead). Allocation-free.
 */
export function sketchAmount(rollTotal: number, yawTotal: number): number {
  if (!isLanded(rollTotal, yawTotal)) return 0;
  const roll = (Math.abs(rollError(rollTotal)) - CLEAN_ROLL) / (ROLL_TOLERANCE - CLEAN_ROLL);
  const yaw = (Math.abs(yawError(yawTotal)) - CLEAN_YAW) / (YAW_TOLERANCE - CLEAN_YAW);
  const worst = Math.max(roll, yaw);
  return worst <= 0 ? 0 : worst >= 1 ? 1 : worst;
}

/** The grade of a flight with these totals. `isLanded` still decides land or bail; this only splits the landings. */
export const gradeOf = (rollTotal: number, yawTotal: number): Grade =>
  !isLanded(rollTotal, yawTotal) ? 'bail' : sketchAmount(rollTotal, yawTotal) > 0 ? 'sketchy' : 'clean';
