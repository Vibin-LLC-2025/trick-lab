// Plain-language text for the announcer, aria-valuetext, readouts and the
// scene description. Pure so the store and the UI phrase things the same way.
import type { Flight, TrickInputs } from './flight';
import { ROLL_TOLERANCE, YAW_TOLERANCE, type InputKey, type TrickResult } from './tricks';

export const INPUT_NAMES: Record<InputKey, string> = { pop: 'Pop', flick: 'Flick', scoop: 'Scoop' };
export const INPUT_UNITS: Record<InputKey, string> = { pop: 'm', flick: 'rev/s', scoop: 'rev/s' };

/** Number shown next to a slider: pop with 2 decimals, rates with 1. */
export const displayValue = (key: InputKey, v: number) => (key === 'pop' ? v.toFixed(2) : v.toFixed(1));

/** aria-valuetext: "0.35 meters", "1.9 revolutions per second". */
export function valueText(key: InputKey, v: number): string {
  if (key === 'pop') return `${v.toFixed(2)} meters`;
  const n = Number(v.toFixed(1));
  return `${n} ${n === 1 ? 'revolution' : 'revolutions'} per second`;
}

export const describeInputs = (i: TrickInputs) =>
  `pop ${valueText('pop', i.pop)}, flick ${valueText('flick', i.flick)}, scoop ${valueText('scoop', i.scoop)}`;

export const deg = (d: number) => Math.round(d);
export const seconds = (s: number) => s.toFixed(2);
const degWord = (d: number) => `${Math.abs(deg(d))} ${Math.abs(deg(d)) === 1 ? 'degree' : 'degrees'}`;

/** "Kickflip landed. 365 degrees of flip, 0 degrees of shove, 0.53 seconds in the air." */
export function describeResult(r: TrickResult): string {
  const totals = `${degWord(r.rollTotal)} of flip, ${degWord(r.yawTotal)} of shove, ${seconds(r.airtime)} seconds in the air.`;
  if (r.landed) return `${r.name} landed. ${totals}`;
  return `${r.name} not landed: ${r.failedAxis} ${r.outcome} by ${degWord(r.failedBy)}. ${totals}`;
}

const HINT: Record<'flip' | 'shove', Record<'under' | 'over', string>> = {
  flip: { under: 'More flick or more pop gives it time.', over: 'Ease the flick a little.' },
  shove: { under: 'More scoop or more pop gives it time.', over: 'Ease the scoop a little.' },
};

/**
 * Outcome card copy (docs/DESIGN.md section 4). The card is scanned, so it uses
 * "deg" and "s"; the announcer is heard, so it uses full words.
 */
export function outcomeCard(r: TrickResult): { name: string; detail: string } {
  if (r.landed) {
    const detail =
      r.id === 'ollie'
        ? `No rotation, ${seconds(r.airtime)} s in the air. Add flick or scoop to try a trick.`
        : `${deg(r.rollTotal)} deg flip, ${deg(r.yawTotal)} deg shove, ${seconds(r.airtime)} s in the air.`;
    return { name: `${r.name} landed`, detail };
  }
  const off = [
    { axis: 'flip' as const, err: r.rollError, fails: Math.abs(r.rollError) > ROLL_TOLERANCE },
    { axis: 'shove' as const, err: r.yawError, fails: Math.abs(r.yawError) > YAW_TOLERANCE },
  ].filter((a) => a.fails);
  const dir = (err: number) => (err < 0 ? 'under' : 'over');
  const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
  const detail =
    off.length === 2
      ? `${off.map((a, i) => `${i === 0 ? cap(dir(a.err)) : dir(a.err)}-rotated ${Math.abs(deg(a.err))} deg of ${a.axis}`).join(', ')}.`
      : `${cap(dir(r.failedBy))}-rotated by ${Math.abs(deg(r.failedBy))} deg of ${r.failedAxis}. ${HINT[r.failedAxis!][dir(r.failedBy)]}`;
  return { name: `${r.name} not landed`, detail };
}

/** Text equivalent of the 3D view for #scene-description. */
/**
 * The rotation convention in words (ADR-10), so a screen-reader user gets the
 * same directions a sighted user sees from the default camera.
 */
export const STANCE_NOTE =
  'Regular stance, nose to the right, toe side toward the camera. Flick rolls the grip toward the heel side, the kickflip direction. Scoop spins the tail behind the heels, clockwise seen from above, the backside shove-it direction.';

export function describeScene(s: {
  status: 'idle' | 'playing' | 'paused' | 'done';
  progress: number;
  flight: Flight | null;
  result: TrickResult | null;
  pop: number;
  flick: number;
  scoop: number;
}): string {
  const board =
    s.status === 'playing'
      ? 'Skateboard in the air.'
      : s.status === 'paused'
        ? `Skateboard paused in the air at ${Math.round(s.progress * 100)} percent of the flight.`
        : s.status === 'done' && s.flight
          ? s.progress >= 1
            ? 'Skateboard back on the pad at its landing pose.'
            : `Skateboard frozen at ${Math.round(s.progress * 100)} percent of the flight.`
          : 'Skateboard resting flat on a concrete pad, grip side up.';
  const inputs = `Inputs: ${describeInputs(s)}.`;
  const last = s.result ? `Last trick: ${describeResult(s.result)}` : 'No trick popped yet.';
  return `${board} ${STANCE_NOTE} ${inputs} ${last}`;
}
