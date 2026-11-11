// The landing zones on the game's flick and scoop sliders (ADR-83), pure: for
// a trick to do and a pop height, the stretch of each slider that lands that
// trick, and the stretch inside it that lands it clean. The same rule as
// recognition and the flight's catch (landing.ts): a rate turns the board
// rate * airtime * 360 degrees, and the trick lands when that is within the
// tolerance of the trick's own turn. Pop moves the zones: a higher pop is a
// longer airtime, so the same turn needs a lower rate. No React, no three.
import { airtimeFor } from './flight';
import { CLEAN_ROLL, CLEAN_YAW, ROLL_TOLERANCE, rollError, turns, YAW_TOLERANCE, yawError } from './landing';
import { INPUT_LIMITS } from './tricks';

/** The two sliders that have zones. Pop has none: on its own it never decides a landing. */
export type ZoneKey = 'flick' | 'scoop';

/** A stretch of a slider, in its own units (rev/s, signed as the slider is). */
export interface Span {
  from: number;
  to: number;
}

/** One slider's zone: the rates that land the trick, and the clean part inside them (null when none of it is on the slider). */
export interface Zone extends Span {
  clean: Span | null;
}

/** Each slider's zone, or null where the whole zone lies past the slider's end (pop higher, or lower). */
export type Zones = Record<ZoneKey, Zone | null>;

/** Where a slider's value is against its zone: inside the clean part, inside the landing zone, or outside. */
export type ZonePlace = 'clean' | 'landing' | null;

/** A trick's turn on each axis: whole flips, and half shoves. */
interface Turns {
  flips: number;
  halfShoves: number;
}

/** Per axis: the trick's turn in degrees, the landing tolerance, the clean limit, the error about the nearest turn and its step. */
const AXIS = {
  flick: { target: (t: Turns) => t.flips * 360, step: 360, land: ROLL_TOLERANCE, clean: CLEAN_ROLL, error: rollError },
  scoop: { target: (t: Turns) => t.halfShoves * 180, step: 180, land: YAW_TOLERANCE, clean: CLEAN_YAW, error: yawError },
} as const;

/** The rates whose turn is within `tol` degrees of `target`, held to the slider; null when none of them is on it. */
function span(key: ZoneKey, target: number, tol: number, airtime: number): Span | null {
  const { min, max } = INPUT_LIMITS[key];
  const perRate = airtime * 360;
  const from = Math.max(min, (target - tol) / perRate);
  const to = Math.min(max, (target + tol) / perRate);
  return from <= to ? { from, to } : null;
}

/** The zones of a trick at a pop height. */
export function landingZones(trick: Turns, pop: number): Zones {
  const T = airtimeFor(pop);
  const zone = (key: ZoneKey): Zone | null => {
    const a = AXIS[key];
    const land = span(key, a.target(trick), a.land, T);
    return land ? { ...land, clean: span(key, a.target(trick), a.clean, T) } : null;
  };
  return { flick: zone('flick'), scoop: zone('scoop') };
}

/**
 * Where a slider's value is against its zone, by the landing rule itself
 * (isLanded, gradeOf), not the zone's rounded ends: the turn must round to
 * the trick's own turn and sit within the tolerance of it.
 */
export function zonePlace(key: ZoneKey, trick: Turns, pop: number, value: number): ZonePlace {
  const a = AXIS[key];
  const total = value * airtimeFor(pop) * 360;
  if (turns(total / a.step) * a.step !== a.target(trick)) return null;
  const err = Math.abs(a.error(total));
  return err <= a.clean ? 'clean' : err <= a.land ? 'landing' : null;
}

/** What a slider's spoken value gains (ADR-83): ", in the landing zone", ", clean", or nothing outside it. */
export const ZONE_WORDS: Record<'clean' | 'landing', string> = { clean: 'clean', landing: 'in the landing zone' };
