// The timing bar (ADR-65), pure: how the moment a pop is released turns the
// setup into the attempt. The sliders say what the player is going for; Pop
// starts a bar that sweeps for `sweepMs`, round and round until Pop again
// releases it (ADR-78): it never releases itself. Inside the
// level's band around `centreMs` the attempt is exactly the setup. Outside it
// the flick and the scoop scale with how far outside the release was: early
// under-rotates, late over-rotates. The pop height is never changed. The
// computer goes through the same mapping (skate.ts). No React, no three, no
// store.
//
// The scaled rates are not held to the sliders' limits: a setup with a
// slider at its limit (a double flip needs flick 3.0) must still over-rotate
// when it is released late, or a late release could never miss it. The most
// a release can make of a rate is the slider's limit times barScale at the
// sweep's end, about 4.2 rev/s on Hard.
import type { TrickInputs } from './flight';

/**
 * The sweep, ms. The band's centre is two thirds along, so the two ticks
 * that lead into it (at `ticksMs`) and the click on it are evenly spaced:
 * tick, tick, pop.
 */
export const BAR = { sweepMs: 1200, centreMs: 800, ticksMs: [0, 400] } as const;

/** A level's band: half its width in ms, and how hard a miss scales the rates (the scale half a sweep outside the band is 1 plus or minus `k`). */
export interface Band {
  halfMs: number;
  k: number;
}

const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/** A release time inside the sweep: before it is 0, after it is its end. The computer's drawn release is held to it (skate.ts). */
export const clampRelease = (releaseMs: number) => clamp(releaseMs, 0, BAR.sweepMs);

/**
 * Where in its sweep a bar that started `elapsedMs` ago is (ADR-78): the bar
 * goes round, so after the sweep's end it starts again from 0.
 */
export const barLap = (elapsedMs: number) => Math.max(0, elapsedMs) % BAR.sweepMs;

/** How far a release was from the band's centre, signed ms: negative early, positive late. */
export const barOff = (releaseMs: number) => clampRelease(releaseMs) - BAR.centreMs;

/** How far outside the band a release was, signed ms: negative early, positive late, 0 inside. */
export function barMiss(releaseMs: number, band: Band): number {
  const off = barOff(releaseMs);
  return Math.sign(off) * Math.max(0, Math.abs(off) - band.halfMs) + 0;
}

/** What a release multiplies the flick and the scoop by: 1 in the band, less early, more late. */
export const barScale = (releaseMs: number, band: Band) => 1 + (band.k * barMiss(releaseMs, band)) / (BAR.sweepMs / 2);

/** The attempt a release at `releaseMs` makes of the setup `intended`. */
export function timedAttempt(intended: TrickInputs, releaseMs: number, band: Band): TrickInputs {
  const scale = barScale(releaseMs, band);
  if (scale === 1) return { ...intended };
  // "+ 0" so a rate of 0 never comes out as -0.
  return { pop: intended.pop, flick: intended.flick * scale + 0, scoop: intended.scoop * scale + 0 };
}

/** A miss under this many ms outside the band is "a little" early or late. */
const A_LITTLE_MS = 60;

/**
 * What a release did, said so the player can name the mistake: "In the band:
 * exactly what you set.", "A little early: 4 percent less spin than you
 * set.", "Late: 22 percent more spin than you set.".
 */
export function barFeedback(releaseMs: number, band: Band): string {
  const miss = barMiss(releaseMs, band);
  if (miss === 0) return 'In the band: exactly what you set.';
  const percent = Math.max(1, Math.round(Math.abs(barScale(releaseMs, band) - 1) * 100));
  const spin = `${percent} percent ${miss < 0 ? 'less' : 'more'} spin than you set`;
  const when = miss < 0 ? 'early' : 'late';
  return `${Math.abs(miss) < A_LITTLE_MS ? `A little ${when}` : when.charAt(0).toUpperCase() + when.slice(1)}: ${spin}.`;
}

/** The same for the computer's release, in a few words: "in the band", "a little late", "early". */
export function barWhen(releaseMs: number, band: Band): string {
  const miss = barMiss(releaseMs, band);
  if (miss === 0) return 'in the band';
  return `${Math.abs(miss) < A_LITTLE_MS ? 'a little ' : ''}${miss < 0 ? 'early' : 'late'}`;
}
