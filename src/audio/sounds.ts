// The synthesized sounds (ADR-58, 2026-11-09; step 12 of
// docs/PLAN-LOOK-FEEL-PERF.md). Since step 18 (ADR-73) the impacts (pop,
// catch, landing, bail) play free recordings (soundSpec.ts) and these are
// their fallback, used until the recordings arrive or if one fails; the
// scuff, the roll, a letter and the jingles are synthesized only. Pure data and arithmetic here (no Web Audio, no
// React): each sound is a few voices, a tone sweeping between two pitches or
// a burst of filtered noise, each with a fast attack and an exponential
// decay. player.ts turns them into audio nodes. Times are seconds, pitches
// hertz, gains 0 to 1 before the master gain.
import { BAR } from '../sim/bar';
import type { SoundKind } from '../store';

/** Everything the player plays: the store's cues, and the catch, which it schedules from the flight's timing (ADR-73). */
export type SoundName = SoundKind | 'catch';

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

/**
 * A knock on wood (ADR-73): a few ringing tones at a wooden bar's partials
 * (1, 2.76 and 5.4 times the lowest), the higher ones dying faster, over a
 * short click of noise. In place of one sliding beep.
 */
function knock(base: number, at: number, dur: number, gain: number, click = 2400): Voice[] {
  return [
    tone('sine', base, base * 0.97, at, dur, gain),
    tone('sine', base * 2.76, base * 2.76, at, dur * 0.55, gain * 0.5),
    tone('sine', base * 5.4, base * 5.4, at, dur * 0.3, gain * 0.25),
    noise('bandpass', click, 1.1, at, 0.025, gain * 0.7),
  ];
}

/** The scuff of a sketchy landing (ADR-73): wheels and soles scraping the concrete for a moment. Synthesized only: the free packs have no good scrape. */
const SCUFF: readonly Voice[] = [noise('bandpass', 1300, 0.6, 0.05, 0.28, 0.3), noise('highpass', 3200, 0.7, 0.07, 0.2, 0.1)];

/** Notes for the game's two jingles. */
const C4 = 261.63;
const E4 = 329.63;
const G4 = 392;
const B3 = 246.94;
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

const LAND: readonly Voice[] = [...knock(150, 0, 0.18, 0.5, 1500), ...knock(175, 0.035, 0.12, 0.3, 1800), noise('lowpass', 900, 0.7, 0, 0.12, 0.4)];

export const SOUNDS: Record<SoundName, readonly Voice[]> = {
  /** The tail striking the ground: a sharp wooden knock. */
  pop: [...knock(420, 0, 0.11, 0.45, 2800), tone('sine', 200, 90, 0, 0.08, 0.35)],
  /** The shoes slapping onto the grip: soft and gritty, well under the pop. */
  catch: [noise('bandpass', 1800, 0.8, 0, 0.05, 0.22), tone('sine', 190, 120, 0, 0.05, 0.12)],
  /** Four wheels down, the back truck a moment after the front: two knocks over a thud. */
  land: LAND,
  /** A landing that only just held: the landing, and a scuff after it. */
  sketchy: [...LAND, ...SCUFF],
  /** The board clattering away: a knock, two smaller bounces, then a scrape. */
  bail: [...knock(300, 0, 0.16, 0.45), ...knock(360, 0.14, 0.1, 0.28), ...knock(330, 0.31, 0.08, 0.16), noise('lowpass', 700, 0.6, 0.4, 0.3, 0.2)],
  /** A sticker slapped on: a short, flat smack. */
  letter: [noise('lowpass', 2200, 0.5, 0, 0.06, 0.45), tone('square', 300, 150, 0, 0.08, 0.12)],
  /** A rising arpeggio. */
  win: [tone('triangle', C5, C5, 0, 0.14, 0.28), tone('triangle', E5, E5, 0.11, 0.14, 0.28), tone('triangle', G5, G5, 0.22, 0.14, 0.28), tone('triangle', C6, C6, 0.33, 0.32, 0.28)],
  /** A falling one that sags at the end. */
  lose: [tone('triangle', G4, G4, 0, 0.2, 0.25), tone('triangle', E4, E4, 0.17, 0.2, 0.25), tone('triangle', C4, C4, 0.34, 0.2, 0.25), tone('triangle', C4, B3, 0.51, 0.45, 0.25)],
};

/** The board's own sounds follow slow motion; the game's (a letter, the jingles) do not. */
export const FOLLOWS_SPEED: Record<SoundName, boolean> = { pop: true, catch: true, land: true, sketchy: true, bail: true, letter: false, win: false, lose: false };

/** The scuff alone, played over a sketchy landing's recording (the recordings have no scuff of their own). */
export const SCUFF_VOICES = SCUFF;

/**
 * The rolling sound (ADR-73): synthesized, since wheels on concrete are close
 * to filtered hiss, and it has to follow the board's speed exactly, which a
 * looped recording can't. Two noise layers, a mid hiss and a low rumble,
 * whose filter and gain go from `still` to `cruise` with the speed
 * (ROLL_MODEL.cruise in rolling.ts), and a tick each time an axle crosses a
 * joint in the concrete, as loud as the speed allows.
 */
export const ROLL_SOUND = {
  hiss: { filter: 'bandpass' as const, q: 0.7, freq: { still: 320, cruise: 950 }, gain: { still: 0, cruise: 0.13 } },
  rumble: { filter: 'lowpass' as const, q: 0.5, freq: { still: 80, cruise: 170 }, gain: { still: 0, cruise: 0.22 } },
  /** Each joint: a clack and a small thump, at full gain at the cruise. */
  tick: [noise('bandpass', 2100, 1.4, 0, 0.03, 0.22), tone('sine', 130, 85, 0, 0.045, 0.18)],
  /** Seconds the layers take to fade when the wheels leave the ground or the roll is held. */
  fade: 0.06,
  /** Seconds of ticks scheduled ahead, and how often the schedule is renewed (a timer, never a frame). */
  horizon: 2,
  renew: 1,
} as const;

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
 * The bar goes round until it is released (ADR-78) and the count with it:
 * each lap is scheduled `lapLead` seconds before it is due.
 */
export const BAR_SOUND = {
  /** Seconds ahead of a lap that it is put on the audio clock: well over a busy frame or a late timer, well under a sweep. */
  lapLead: 0.25,
  /** Held for the sweep, not decaying: the player gives it a short fade in and out. */
  tone: { wave: 'sine' as Wave, from: 196, to: 392, dur: BAR.sweepMs / 1000, gain: 0.1 },
  ticks: BAR.ticksMs.map((ms) => tone('square', 660, 660, ms / 1000, 0.045, 0.16)),
  click: [tone('square', 1320, 1320, BAR.centreMs / 1000, 0.07, 0.22), noise('highpass', 3000, 0.7, BAR.centreMs / 1000, 0.03, 0.12)],
} as const;

/** Seconds between two sounds asked for at once (a landing, a letter, the game's end), so each is heard. */
export const STAGGER = 0.22;

/** The master gain: sounds sit under speech from a screen reader. */
export const MASTER_GAIN = 0.6;
