// Pure trick recognition, presets and objectives. No React, no three.
import { computeFlight, type Flight, type TrickInputs } from './flight';
import {
  CLEAN_ROLL,
  CLEAN_YAW,
  gradeOf,
  isLanded,
  rollError as rollErrorOf,
  ROLL_TOLERANCE,
  turns,
  yawError as yawErrorOf,
  YAW_TOLERANCE,
  type Grade,
} from './landing';

// The landing rule lives in landing.ts (ADR-36), so flight.ts can use it
// without importing this file; re-exported so no other import changes.
export { CLEAN_ROLL, CLEAN_YAW, gradeOf, isLanded, rollError, ROLL_TOLERANCE, sketchAmount, turns, yawError, YAW_TOLERANCE, type Grade } from './landing';

export type TrickId =
  | 'ollie'
  | 'kickflip'
  | 'heelflip'
  | 'double-kickflip'
  | 'double-heelflip'
  | 'pop-shove-it'
  | 'frontside-pop-shove-it'
  | '360-shove-it'
  | 'frontside-360-shove-it'
  | 'varial-flip'
  | 'varial-heelflip'
  | 'inward-heelflip'
  | '360-flip'
  | 'laser-flip'
  | '360-inward-heelflip'
  | 'double-tre'
  | 'unnamed';

export type PresetId =
  | 'kickflip'
  | 'heelflip'
  | 'pop-shove-it'
  | 'frontside-pop-shove-it'
  | 'varial-flip'
  | 'varial-heelflip'
  | '360-flip';

export type Outcome = 'landed' | 'under-rotated' | 'over-rotated';
export type Axis = 'flip' | 'shove';

export interface TrickResult {
  id: TrickId;
  name: string;
  /** Signed whole revolutions: positive kickflip, negative heelflip. */
  flips: number;
  /** Signed half turns: positive backside, negative frontside. */
  halfShoves: number;
  /** Signed degrees, the sign of the flick. */
  rollTotal: number;
  /** Signed degrees, the sign of the scoop. */
  yawTotal: number;
  /** Signed degrees from the nearest whole revolution (total minus target). */
  rollError: number;
  /** Signed degrees from the nearest half turn (total minus target). */
  yawError: number;
  airtime: number;
  peak: number;
  landed: boolean;
  /** Clean, sketchy or bail (ADR-63). `landed` is true for the first two. */
  grade: Grade;
  /** Under or over against the direction of rotation (isUnderRotated), not the raw sign of the error. */
  outcome: Outcome;
  /** Axis that failed (the one furthest past its tolerance), or null when landed. */
  failedAxis: Axis | null;
  /** Signed error on the failed axis in degrees, 0 when landed. */
  failedBy: number;
}

/**
 * Signed (flips, half shoves) to a name (ADR-30, 2026-11-04). Positive flips
 * are kickflips, negative heelflips; positive half shoves are backside,
 * negative frontside. A flip and a shove that turn the same way are the
 * varials (kickflip with backside, heelflip with frontside); the opposite
 * pairs are the inward heelflips. A kickflip with a frontside shove (1,-1)
 * and (1,-2) is unnamed since ADR-41 (2026-11-05): the hardflip and the 360
 * hardflip were removed because the public sources do not pin down either
 * the board's path or the feet (docs/research/2026-11-05/hardflip.md).
 */
const NAMED: Record<string, { id: TrickId; name: string }> = {
  '0,0': { id: 'ollie', name: 'Ollie' },
  '1,0': { id: 'kickflip', name: 'Kickflip' },
  '-1,0': { id: 'heelflip', name: 'Heelflip' },
  '2,0': { id: 'double-kickflip', name: 'Double kickflip' },
  '-2,0': { id: 'double-heelflip', name: 'Double heelflip' },
  '0,1': { id: 'pop-shove-it', name: 'Pop shove-it' },
  '0,-1': { id: 'frontside-pop-shove-it', name: 'Frontside pop shove-it' },
  '0,2': { id: '360-shove-it', name: '360 shove-it' },
  '0,-2': { id: 'frontside-360-shove-it', name: 'Frontside 360 shove-it' },
  '1,1': { id: 'varial-flip', name: 'Varial flip' },
  '-1,-1': { id: 'varial-heelflip', name: 'Varial heelflip' },
  '-1,1': { id: 'inward-heelflip', name: 'Inward heelflip' },
  '1,2': { id: '360-flip', name: '360 flip' },
  '-1,-2': { id: 'laser-flip', name: 'Laser flip' },
  '-1,2': { id: '360-inward-heelflip', name: '360 inward heelflip' },
  '2,2': { id: 'double-tre', name: 'Double tre' },
};

/** Every named trick with its signed flips and half shoves, in table order. The game of SKATE calls from it (ADR-43). */
export const NAMED_TRICKS: readonly { id: TrickId; name: string; flips: number; halfShoves: number }[] = Object.entries(NAMED).map(
  ([key, trick]) => {
    const [flips = 0, halfShoves = 0] = key.split(',').map(Number);
    return { ...trick, flips, halfShoves };
  },
);

/** Direction words per axis (ADR-30): the flip by its trick, the shove by its side. */
export const FLIP_WORDS = { positive: 'kickflip', negative: 'heelflip' } as const;
export const SHOVE_WORDS = { positive: 'backside', negative: 'frontside' } as const;
/** The direction word for a signed value, or '' at zero. */
export const directionWord = (words: { positive: string; negative: string }, v: number): string =>
  v > 0 ? words.positive : v < 0 ? words.negative : '';

/** "2 heelflips", "1 kickflip", "0 flips". */
function flipCount(n: number): string {
  const m = Math.abs(n);
  const word = directionWord(FLIP_WORDS, n) || 'flip';
  return `${m} ${word}${m === 1 ? '' : 's'}`;
}

/** "1 frontside half shove", "3 backside half shoves", "0 half shoves". */
function shoveCount(n: number): string {
  const m = Math.abs(n);
  const word = directionWord(SHOVE_WORDS, n);
  return `${m} ${word ? `${word} ` : ''}half ${m === 1 ? 'shove' : 'shoves'}`;
}

export function nameFor(flips: number, halfShoves: number): { id: TrickId; name: string } {
  return (
    NAMED[`${flips},${halfShoves}`] ?? {
      id: 'unnamed',
      name: `Unnamed (${flipCount(flips)}, ${shoveCount(halfShoves)})`,
    }
  );
}

/**
 * Whether a total fell short of its nearest whole turn (`step` 360 for the
 * flip, 180 for the shove) in its own direction of rotation. A total and its
 * nearest non-zero target always share a sign, so this is a magnitude test;
 * with a target of 0 any rotation is past it, so it is over. The copy
 * (format.ts) uses it too, so under and over read the same both ways.
 */
export const isUnderRotated = (total: number, step: number) => Math.abs(total) < Math.abs(turns(total / step) * step);

export function recognize(flight: Flight): TrickResult {
  const { rollTotal, yawTotal, airtime, peak } = flight;
  const flips = turns(rollTotal / 360);
  const halfShoves = turns(yawTotal / 180);
  const rollError = rollErrorOf(rollTotal);
  const yawError = yawErrorOf(yawTotal);
  const rollExcess = Math.abs(rollError) - ROLL_TOLERANCE;
  const yawExcess = Math.abs(yawError) - YAW_TOLERANCE;
  const landed = isLanded(rollTotal, yawTotal);

  let failedAxis: Axis | null = null;
  let failedBy = 0;
  let outcome: Outcome = 'landed';
  if (!landed) {
    failedAxis = rollExcess >= yawExcess ? 'flip' : 'shove';
    failedBy = failedAxis === 'flip' ? rollError : yawError;
    const under = failedAxis === 'flip' ? isUnderRotated(rollTotal, 360) : isUnderRotated(yawTotal, 180);
    outcome = under ? 'under-rotated' : 'over-rotated';
  }

  return {
    ...nameFor(flips, halfShoves),
    flips,
    halfShoves,
    rollTotal,
    yawTotal,
    rollError,
    yawError,
    airtime,
    peak,
    landed,
    grade: gradeOf(rollTotal, yawTotal),
    outcome,
    failedAxis,
    failedBy,
  };
}

export const resolveTrick = (inputs: TrickInputs) => recognize(computeFlight(inputs));

/**
 * What makes a landing sketchy (ADR-63): the axis furthest past its clean
 * limit, how many degrees it is off, and whether it fell short of its turn or
 * went past it. Null for a clean landing or a bail.
 */
export function sketchOf(r: Pick<TrickResult, 'grade' | 'rollError' | 'yawError' | 'rollTotal' | 'yawTotal'>): { axis: Axis; by: number; short: boolean } | null {
  if (r.grade !== 'sketchy') return null;
  const roll = (Math.abs(r.rollError) - CLEAN_ROLL) / (ROLL_TOLERANCE - CLEAN_ROLL);
  const yaw = (Math.abs(r.yawError) - CLEAN_YAW) / (YAW_TOLERANCE - CLEAN_YAW);
  return roll >= yaw
    ? { axis: 'flip', by: Math.abs(r.rollError), short: isUnderRotated(r.rollTotal, 360) }
    : { axis: 'shove', by: Math.abs(r.yawError), short: isUnderRotated(r.yawTotal, 180) };
}

export const DEFAULT_INPUTS: TrickInputs = { pop: 0.35, flick: 0, scoop: 0 };

export type InputKey = keyof TrickInputs;

export const INPUT_LIMITS: Record<InputKey, { min: number; max: number; step: number }> = {
  pop: { min: 0.15, max: 0.6, step: 0.05 },
  // Signed (ADR-30): flick above 0 is a kickflip, below a heelflip; scoop above 0 backside, below frontside.
  flick: { min: -3, max: 3, step: 0.1 },
  scoop: { min: -3, max: 3, step: 0.1 },
};

/** Snap to the slider grid and clamp, so floating point never leaks into state. */
export function snapInput(key: InputKey, value: number): number {
  const { min, max, step } = INPUT_LIMITS[key];
  const clamped = Math.min(max, Math.max(min, value));
  const snapped = min + Math.round((clamped - min) / step) * step;
  // `+ 0` turns -0 (for example -0.04 snapped to the grid) into 0.
  return Number(snapped.toFixed(2)) + 0;
}

export interface Preset {
  id: PresetId;
  label: string;
  key: '1' | '2' | '3' | '4' | '5' | '6' | '7';
  inputs: TrickInputs;
}

// Values from docs/BRIEF.md, verified in tricks.test.ts: each lands at pop
// 0.35 m (T = 0.534 s) and bails at pop 0.15 m (T = 0.350 s). See ADR-5; the
// mirror tricks (a negative flick or scoop) are ADR-30. The hardflip (key 7
// until 2026-11-05) was removed in ADR-41; the 360 flip moved from 8 to 7.
export const PRESETS: readonly Preset[] = [
  { id: 'kickflip', label: 'Kickflip', key: '1', inputs: { pop: 0.35, flick: 1.9, scoop: 0 } },
  { id: 'heelflip', label: 'Heelflip', key: '2', inputs: { pop: 0.35, flick: -1.9, scoop: 0 } },
  { id: 'pop-shove-it', label: 'Pop shove-it', key: '3', inputs: { pop: 0.35, flick: 0, scoop: 0.9 } },
  { id: 'frontside-pop-shove-it', label: 'Frontside shove-it', key: '4', inputs: { pop: 0.35, flick: 0, scoop: -0.9 } },
  { id: 'varial-flip', label: 'Varial flip', key: '5', inputs: { pop: 0.35, flick: 1.9, scoop: 0.9 } },
  { id: 'varial-heelflip', label: 'Varial heelflip', key: '6', inputs: { pop: 0.35, flick: -1.9, scoop: -0.9 } },
  { id: '360-flip', label: '360 flip', key: '7', inputs: { pop: 0.35, flick: 1.9, scoop: 1.9 } },
];

export const presetById = (id: PresetId): Preset => PRESETS.find((p) => p.id === id)!;

/** Objectives: land each preset trick, in preset order. */
export const OBJECTIVES: readonly { id: PresetId; label: string }[] = PRESETS.map((p) => ({
  id: p.id,
  label: `Land a ${p.label.toLowerCase()}`,
}));

export const objectiveLabel = (id: PresetId) => OBJECTIVES.find((o) => o.id === id)!.label;

/** Objectives a result newly completes, given those already done. */
export function newlyCompleted(result: TrickResult, done: readonly PresetId[]): PresetId[] {
  if (!result.landed) return [];
  const hit = OBJECTIVES.find((o) => o.id === result.id);
  return hit && !done.includes(hit.id) ? [hit.id] : [];
}
