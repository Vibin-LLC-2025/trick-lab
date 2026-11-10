// The sounds (ADR-58, 2026-11-09; step 12 of docs/PLAN-LOOK-FEEL-PERF.md):
// synthesized in the browser with Web Audio, so nothing is downloaded and
// nothing is licensed. Pure data and arithmetic here (no Web Audio, no
// React): each sound is a few voices, a tone sweeping between two pitches or
// a burst of filtered noise, each with a fast attack and an exponential
// decay. player.ts turns them into audio nodes. Times are seconds, pitches
// hertz, gains 0 to 1 before the master gain.
import { BAR } from '../sim/bar';
import type { SoundKind } from '../store';

export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth';

/** A tone gliding from `from` to `to` hertz. */
export interface Tone {
  kind: 'tone';
  wave: Wave;
  from: number;
  to: number;
  at: number;
  dur: number;
  gain: number;
}

/** White noise through one filter. */
export interface Noise {
  kind: 'noise';
  filter: 'lowpass' | 'bandpass' | 'highpass';
  freq: number;
  q: number;
  at: number;
  dur: number;
  gain: number;
}

export type Voice = Tone | Noise;

const tone = (wave: Wave, from: number, to: number, at: number, dur: number, gain: number): Tone => ({ kind: 'tone', wave, from, to, at, dur, gain });
const noise = (filter: Noise['filter'], freq: number, q: number, at: number, dur: number, gain: number): Noise => ({ kind: 'noise', filter, freq, q, at, dur, gain });

/** Notes for the game's two jingles. */
const C4 = 261.63;
const E4 = 329.63;
const G4 = 392;
const B3 = 246.94;
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

export const SOUNDS: Record<SoundKind, readonly Voice[]> = {
  /** The tail striking the ground: a dry, woody tock with a low thump. */
  pop: [noise('bandpass', 1600, 1.2, 0, 0.07, 0.5), noise('highpass', 3500, 0.7, 0.004, 0.03, 0.15), tone('sine', 220, 90, 0, 0.09, 0.55)],
  /** Four wheels down, the back truck a moment after the front: two clacks over a thud. */
  land: [noise('lowpass', 1200, 0.7, 0, 0.12, 0.55), noise('lowpass', 1500, 0.7, 0.035, 0.08, 0.35), tone('sine', 140, 60, 0, 0.16, 0.6)],
  /** The board clattering away: knocks, then a scrape. */
  bail: [
    noise('bandpass', 900, 0.8, 0, 0.35, 0.4),
    noise('bandpass', 1400, 1, 0.12, 0.18, 0.3),
    tone('triangle', 180, 70, 0, 0.4, 0.25),
    noise('lowpass', 600, 0.6, 0.25, 0.3, 0.25),
  ],
  /** A sticker slapped on: a short, flat smack. */
  letter: [noise('lowpass', 2200, 0.5, 0, 0.06, 0.45), tone('square', 300, 150, 0, 0.08, 0.12)],
  /** A rising arpeggio. */
  win: [tone('triangle', C5, C5, 0, 0.14, 0.28), tone('triangle', E5, E5, 0.11, 0.14, 0.28), tone('triangle', G5, G5, 0.22, 0.14, 0.28), tone('triangle', C6, C6, 0.33, 0.32, 0.28)],
  /** A falling one that sags at the end. */
  lose: [tone('triangle', G4, G4, 0, 0.2, 0.25), tone('triangle', E4, E4, 0.17, 0.2, 0.25), tone('triangle', C4, C4, 0.34, 0.2, 0.25), tone('triangle', C4, B3, 0.51, 0.45, 0.25)],
};

/** The board's own sounds follow slow motion; the game's (a letter, the jingles) do not. */
export const FOLLOWS_SPEED: Record<SoundKind, boolean> = { pop: true, land: true, bail: true, letter: false, win: false, lose: false };

/**
 * Slow motion for a sound (ADR-58): at a playback speed below 1x the board's
 * sounds come lower and longer, as slowed-down audio does, by speed^0.35,
 * but never below half pitch (twice as long), so 0.05x still sounds like a
 * skateboard. 1x and faster play as recorded.
 */
export function slowMotion(rate: number): { pitch: number; stretch: number } {
  const pitch = Math.max(0.5, Math.min(1, rate ** 0.35));
  return { pitch, stretch: 1 / pitch };
}

/**
 * The timing bar by ear (ADR-65): a quiet tone that rises across the whole
 * sweep, a tick as the bar starts and one halfway to the band, and a higher
 * click on the band's centre. The three are evenly spaced (BAR in
 * sim/bar.ts), so the bar is a count: tick, tick, pop. Times are seconds
 * from the bar's start; player.ts schedules them on the audio clock from one
 * start time, never through the staggered queue, so the click is on the band.
 */
export const BAR_SOUND = {
  /** Held for the sweep, not decaying: the player gives it a short fade in and out. */
  tone: { wave: 'sine' as Wave, from: 196, to: 392, dur: BAR.sweepMs / 1000, gain: 0.1 },
  ticks: BAR.ticksMs.map((ms) => tone('square', 660, 660, ms / 1000, 0.045, 0.16)),
  click: [tone('square', 1320, 1320, BAR.centreMs / 1000, 0.07, 0.22), noise('highpass', 3000, 0.7, BAR.centreMs / 1000, 0.03, 0.12)],
} as const;

/** Seconds between two sounds asked for at once (a landing, a letter, the game's end), so each is heard. */
export const STAGGER = 0.22;

/** The master gain: sounds sit under speech from a screen reader. */
export const MASTER_GAIN = 0.6;
