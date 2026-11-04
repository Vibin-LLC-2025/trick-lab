// Pure trick recognition, presets and objectives. No React, no three.
import { computeFlight, type Flight, type TrickInputs } from './flight';

/** A landing needs the flip within this many degrees of a whole revolution. */
export const ROLL_TOLERANCE = 30;
/** A landing needs the shove within this many degrees of a half turn. */
export const YAW_TOLERANCE = 25;

export type TrickId =
  | 'ollie'
  | 'kickflip'
  | 'pop-shove-it'
  | 'varial-flip'
  | '360-flip'
  | '360-shove-it'
  | 'double-kickflip'
  | 'double-tre'
  | 'unnamed';

export type PresetId = 'kickflip' | 'pop-shove-it' | 'varial-flip' | '360-flip';

export type Outcome = 'landed' | 'under-rotated' | 'over-rotated';
export type Axis = 'flip' | 'shove';

export interface TrickResult {
  id: TrickId;
  name: string;
  flips: number;
  halfShoves: number;
  rollTotal: number;
  yawTotal: number;
  rollError: number;
  yawError: number;
  airtime: number;
  peak: number;
  landed: boolean;
  outcome: Outcome;
  /** Axis that failed (the one furthest past its tolerance), or null when landed. */
  failedAxis: Axis | null;
  /** Signed error on the failed axis in degrees, 0 when landed. */
  failedBy: number;
}

const NAMED: Record<string, { id: TrickId; name: string }> = {
  '0,0': { id: 'ollie', name: 'Ollie' },
  '1,0': { id: 'kickflip', name: 'Kickflip' },
  '0,1': { id: 'pop-shove-it', name: 'Pop shove-it' },
  '1,1': { id: 'varial-flip', name: 'Varial flip' },
  '1,2': { id: '360-flip', name: '360 flip' },
  '0,2': { id: '360-shove-it', name: '360 shove-it' },
  '2,0': { id: 'double-kickflip', name: 'Double kickflip' },
  '2,2': { id: 'double-tre', name: 'Double tre' },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function nameFor(flips: number, halfShoves: number): { id: TrickId; name: string } {
  return (
    NAMED[`${flips},${halfShoves}`] ?? {
      id: 'unnamed',
      name: `Unnamed (${plural(flips, 'flip', 'flips')}, ${plural(halfShoves, 'half shove', 'half shoves')})`,
    }
  );
}

export function recognize(flight: Flight): TrickResult {
  const { rollTotal, yawTotal, airtime, peak } = flight;
  // Inputs are never negative, so Math.round is symmetric enough here.
  const flips = Math.round(rollTotal / 360);
  const halfShoves = Math.round(yawTotal / 180);
  const rollError = rollTotal - flips * 360;
  const yawError = yawTotal - halfShoves * 180;
  const rollExcess = Math.abs(rollError) - ROLL_TOLERANCE;
  const yawExcess = Math.abs(yawError) - YAW_TOLERANCE;
  const landed = rollExcess <= 0 && yawExcess <= 0;

  let failedAxis: Axis | null = null;
  let failedBy = 0;
  if (!landed) {
    failedAxis = rollExcess >= yawExcess ? 'flip' : 'shove';
    failedBy = failedAxis === 'flip' ? rollError : yawError;
  }
  const outcome: Outcome = landed ? 'landed' : failedBy < 0 ? 'under-rotated' : 'over-rotated';

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
    outcome,
    failedAxis,
    failedBy,
  };
}

export const resolveTrick = (inputs: TrickInputs) => recognize(computeFlight(inputs));

export const DEFAULT_INPUTS: TrickInputs = { pop: 0.35, flick: 0, scoop: 0 };

export type InputKey = keyof TrickInputs;

export const INPUT_LIMITS: Record<InputKey, { min: number; max: number; step: number }> = {
  pop: { min: 0.15, max: 0.6, step: 0.05 },
  flick: { min: 0, max: 3, step: 0.1 },
  scoop: { min: 0, max: 3, step: 0.1 },
};

/** Snap to the slider grid and clamp, so floating point never leaks into state. */
export function snapInput(key: InputKey, value: number): number {
  const { min, max, step } = INPUT_LIMITS[key];
  const clamped = Math.min(max, Math.max(min, value));
  const snapped = min + Math.round((clamped - min) / step) * step;
  return Number(snapped.toFixed(2));
}

export interface Preset {
  id: PresetId;
  label: string;
  key: '1' | '2' | '3' | '4';
  inputs: TrickInputs;
}

// Values from docs/BRIEF.md, verified in tricks.test.ts: each lands at pop
// 0.35 m (T = 0.534 s) and bails at pop 0.15 m (T = 0.350 s). See ADR-5.
export const PRESETS: readonly Preset[] = [
  { id: 'kickflip', label: 'Kickflip', key: '1', inputs: { pop: 0.35, flick: 1.9, scoop: 0 } },
  { id: 'pop-shove-it', label: 'Pop shove-it', key: '2', inputs: { pop: 0.35, flick: 0, scoop: 0.9 } },
  { id: 'varial-flip', label: 'Varial flip', key: '3', inputs: { pop: 0.35, flick: 1.9, scoop: 0.9 } },
  { id: '360-flip', label: '360 flip', key: '4', inputs: { pop: 0.35, flick: 1.9, scoop: 1.9 } },
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
