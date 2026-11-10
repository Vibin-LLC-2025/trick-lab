// Plays the sounds of sounds.ts with Web Audio (ADR-58). No React, no three.
// The AudioContext is made on first use: browsers only let it run after a
// user gesture, and the first use is always inside one (the sound switch, or
// a pop or a landing from a click or a key). Where there is no Web Audio
// (jsdom, very old browsers) everything is a no-op. Nodes are made per sound
// (a few each, freed when they end): never in a frame loop.
import type { SoundKind } from '../store';
import { BAR_SOUND, FOLLOWS_SPEED, MASTER_GAIN, slowMotion, SOUNDS, STAGGER, type Voice } from './sounds';

export interface SoundPlayer {
  /** Makes or resumes the audio context. Call from inside a user gesture. */
  unlock(): void;
  /** Plays a sound now, or just after the last one if that was asked for a moment ago. `rate` is the playback speed. */
  play(kind: SoundKind, rate: number): void;
  /**
   * The timing bar by ear (ADR-65), from now: the rising tone, the two ticks
   * and the click on the band, all from one start time on the audio clock.
   * Not staggered behind queued sounds, so the click stays on the band.
   */
  bar(): void;
  /** Cuts the bar's sound: it was released or dropped. */
  stopBar(): void;
  /** Silences every sound playing or queued (sound turned off), the bar's too, and resets the stagger, so the next plays at once. */
  stop(): void;
  /** Closes the audio context. */
  dispose(): void;
}

type MakeContext = () => AudioContext | null;

const browserContext: MakeContext = () => {
  const Ctor = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  return Ctor ? new Ctor() : null;
};

/** One second of white noise, the same every time (a fixed seed), looped by the noise voices. */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 22;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

/** A fast attack to the voice's gain, then an exponential fall to silence. */
function envelope(ctx: AudioContext, gain: number, t: number, dur: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

function voice(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, live: Set<AudioScheduledSourceNode>, v: Voice, start: number, pitch: number, stretch: number) {
  const t = start + v.at * stretch;
  const dur = v.dur * stretch;
  const g = envelope(ctx, v.gain, t, dur);
  g.connect(out);
  let source: AudioScheduledSourceNode;
  let filter: BiquadFilterNode | null = null;
  if (v.kind === 'tone') {
    const osc = ctx.createOscillator();
    osc.type = v.wave;
    osc.frequency.setValueAtTime(v.from * pitch, t);
    if (v.to !== v.from) osc.frequency.exponentialRampToValueAtTime(v.to * pitch, t + dur);
    osc.connect(g);
    source = osc;
  } else {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    filter = ctx.createBiquadFilter();
    filter.type = v.filter;
    filter.frequency.setValueAtTime(v.freq * pitch, t);
    filter.Q.setValueAtTime(v.q, t);
    src.connect(filter);
    filter.connect(g);
    source = src;
  }
  live.add(source);
  source.onended = () => {
    live.delete(source);
    source.disconnect();
    filter?.disconnect();
    g.disconnect();
  };
  source.start(t);
  source.stop(t + dur + 0.02);
}

/** The bar's tone: held for the sweep, with a short fade in and out, rising in pitch all the way. */
function barTone(ctx: AudioContext, out: AudioNode, live: Set<AudioScheduledSourceNode>, start: number) {
  const { wave, from, to, dur, gain } = BAR_SOUND.tone;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.02);
  g.gain.setValueAtTime(gain, start + dur - 0.03);
  g.gain.linearRampToValueAtTime(0.0001, start + dur);
  g.connect(out);
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + dur);
  osc.connect(g);
  live.add(osc);
  osc.onended = () => {
    live.delete(osc);
    osc.disconnect();
    g.disconnect();
  };
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function cut(live: Set<AudioScheduledSourceNode>) {
  for (const source of live) {
    source.onended = null;
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
    source.disconnect();
  }
  live.clear();
}

export function createSoundPlayer(make: MakeContext = browserContext): SoundPlayer {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let last = -Infinity;
  let tried = false;
  // Every voice started and not yet ended, so stop() can cut the ones still queued.
  const live = new Set<AudioScheduledSourceNode>();
  // The timing bar's voices, apart, so a release cuts them and nothing else.
  const barLive = new Set<AudioScheduledSourceNode>();

  const ready = (): AudioContext | null => {
    if (!ctx && !tried) {
      tried = true;
      ctx = make();
      if (ctx) {
        master = ctx.createGain();
        master.gain.value = MASTER_GAIN;
        master.connect(ctx.destination);
        noise = noiseBuffer(ctx);
      }
    }
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  };

  return {
    unlock: () => {
      ready();
    },
    play: (kind, rate) => {
      const c = ready();
      if (!c || !master || !noise) return;
      const start = Math.max(c.currentTime + 0.01, last + STAGGER);
      last = start;
      const { pitch, stretch } = FOLLOWS_SPEED[kind] ? slowMotion(rate) : { pitch: 1, stretch: 1 };
      for (const v of SOUNDS[kind]) voice(c, master, noise, live, v, start, pitch, stretch);
    },
    bar: () => {
      const c = ready();
      if (!c || !master || !noise) return;
      cut(barLive);
      const start = c.currentTime + 0.01;
      barTone(c, master, barLive, start);
      for (const v of [...BAR_SOUND.ticks, ...BAR_SOUND.click]) voice(c, master, noise, barLive, v, start, 1, 1);
    },
    stopBar: () => cut(barLive),
    stop: () => {
      cut(live);
      cut(barLive);
      last = -Infinity;
    },
    dispose: () => {
      live.clear();
      barLive.clear();
      void ctx?.close().catch(() => {});
      ctx = null;
      master = null;
      noise = null;
      tried = false;
      last = -Infinity;
    },
  };
}

let shared: SoundPlayer | null = null;

/** The page's one player, made on first ask. */
export const soundPlayer = (): SoundPlayer => (shared ??= createSoundPlayer());
