// Plays the sounds with Web Audio (ADR-58, ADR-73). No React, no three. Its
// own chunk, downloaded when sound is first turned on (useSound).
// - The impacts (pop, catch, landing, bail) play free recordings
//   (soundSpec.ts), fetched and decoded once sound is on: a take at random,
//   a little higher or lower each time. Until they arrive, or if one fails,
//   the synthesized version in sounds.ts plays instead.
// - The scuff, a letter and the jingles are synthesized.
// - The rolling sound is synthesized and follows the board's speed, with a
//   tick each time an axle crosses a joint (rolling.ts), scheduled on the
//   audio clock and renewed by a timer, never per frame.
// Where there is no Web Audio (jsdom, very old browsers) everything is a
// no-op. Nodes are made per sound (a few each, freed when they end).
import { audioContext } from './context';
import { jointTicks, rampSeconds, ROLL_MODEL, type RollNow, type Tick } from './rolling';
import { PITCH_JITTER, RECORDED_KINDS, SOUND_DIR, TAKES, takeFile, type RecordedKind } from './soundSpec';
import { BAR_SOUND, FOLLOWS_SPEED, MASTER_GAIN, ROLL_SOUND, SCUFF_VOICES, slowMotion, SOUNDS, STAGGER, type SoundName, type Voice } from './sounds';
import type { RollSound } from '../store/sound';

export interface SoundPlayer {
  /** Makes or resumes the audio context, and starts fetching the recordings. Call from inside a user gesture. */
  unlock(): void;
  /** Plays a sound now, or just after the last one if that was asked for a moment ago. `rate` is the playback speed. */
  play(kind: SoundName, rate: number): void;
  /**
   * The timing bar by ear (ADR-65), from now: the rising tone, the two ticks
   * and the click on the band, all from one start time on the audio clock.
   * Not staggered behind queued sounds, so the click stays on the band.
   */
  bar(): void;
  /** Cuts the bar's sound: it was released or dropped. */
  stopBar(): void;
  /** The catch, `seconds` from now at playback speed `rate`, in place of any already scheduled; null cancels it (a pause, a scrub). */
  catchIn(seconds: number | null, rate: number): void;
  /** The rolling sound: off, or pushing off or slowing from the roll as `now` reads it, at playback speed `rate`. */
  roll(state: RollSound, rate: number, now: () => RollNow): void;
  /** Silences every sound playing or queued (sound turned off), the bar's, the catch and the roll too, and resets the stagger. */
  stop(): void;
  /** Closes the audio context. */
  dispose(): void;
  /** The sound check (ADR-73): one take of a recording, or with `take` null the synthesized version, now. */
  audition(kind: SoundName, take: number | null, rate: number): void;
  /** How many takes of a sound have arrived (0 while fetching, if it failed, or for a synthesized sound). */
  takes(kind: SoundName): number;
}

type MakeContext = () => AudioContext | null;

export interface PlayerOptions {
  /** Fetches a file's bytes; the site's own by default. */
  fetchBytes?: (file: string) => Promise<ArrayBuffer>;
  /** 0 to 1, for the take and its pitch. */
  random?: () => number;
}

const siteBytes = (file: string) =>
  fetch(`${import.meta.env.BASE_URL}${SOUND_DIR}/${file}`).then((r) => {
    if (!r.ok) throw new Error(`${file}: ${r.status}`);
    return r.arrayBuffer();
  });

/** The recording a sound plays, if it has one: a sketchy landing plays the landing's, with the scuff over it. */
const RECORDING_OF: Partial<Record<SoundName, RecordedKind>> = { pop: 'pop', catch: 'catch', land: 'land', sketchy: 'land', bail: 'bail' };

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

/** Seconds of near silence at the start of a decoded file (an MP3 encoder's padding), skipped when it plays so it lands on time. */
function leadIn(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  const limit = Math.min(data.length, Math.round(buffer.sampleRate * 0.1));
  for (let i = 0; i < limit; i++) if (Math.abs(data[i]!) > 0.01) return i / buffer.sampleRate;
  return 0;
}

/** A fast attack to the voice's gain, then an exponential fall to silence. */
function envelope(ctx: AudioContext, gain: number, t: number, dur: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

function voice(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, live: Set<AudioScheduledSourceNode>, v: Voice, start: number, pitch: number, stretch: number, level = 1) {
  const t = start + v.at * stretch;
  const dur = v.dur * stretch;
  const g = envelope(ctx, v.gain * level, t, dur);
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

/** A recording, from `start`, at `pitch` (which also stretches it, as slowed-down audio does). */
function sample(ctx: AudioContext, out: AudioNode, live: Set<AudioScheduledSourceNode>, take: { buffer: AudioBuffer; lead: number }, start: number, pitch: number) {
  const src = ctx.createBufferSource();
  src.buffer = take.buffer;
  src.playbackRate.setValueAtTime(pitch, start);
  src.connect(out);
  live.add(src);
  src.onended = () => {
    live.delete(src);
    src.disconnect();
  };
  src.start(start, take.lead);
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

/** The rolling sound's two layers, made on its first use and kept (silent while the board is still) until sound turns off. */
interface RollLayers {
  sources: AudioBufferSourceNode[];
  hiss: { filter: BiquadFilterNode; gain: GainNode };
  rumble: { filter: BiquadFilterNode; gain: GainNode };
}

/** A layer's filter frequency and gain at `speed`, straight between its still and cruise values. */
const at = (range: { still: number; cruise: number }, speed: number) => range.still + (range.cruise - range.still) * Math.min(1, Math.max(0, speed / ROLL_MODEL.cruise));

export function createSoundPlayer(make: MakeContext = audioContext, options: PlayerOptions = {}): SoundPlayer {
  const fetchBytes = options.fetchBytes ?? siteBytes;
  const random = options.random ?? Math.random;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let last = -Infinity;
  let tried = false;
  let fetching = false;
  // Every voice started and not yet ended, so stop() can cut the ones still queued.
  const live = new Set<AudioScheduledSourceNode>();
  // The timing bar's voices, apart, so a release cuts them and nothing else.
  const barLive = new Set<AudioScheduledSourceNode>();
  // The scheduled catch, apart, so a pause or a scrub cancels it.
  const catchLive = new Set<AudioScheduledSourceNode>();
  // The roll's ticks, rescheduled at each change and renewal.
  const tickLive = new Set<AudioScheduledSourceNode>();
  // Each sound's takes by their number in soundSpec.ts (a hole until it arrives, or if it failed).
  const recordings = new Map<RecordedKind, ({ buffer: AudioBuffer; lead: number } | undefined)[]>();
  const arrived = (kind: RecordedKind) => (recordings.get(kind) ?? []).filter((t) => t !== undefined);
  let layers: RollLayers | null = null;
  let renewTimer: ReturnType<typeof setTimeout> | null = null;
  const ticks: Tick[] = [];

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

  /** Fetches and decodes every take once; a take that fails is left out, and a sound with none plays its synthesized version. */
  const fetchRecordings = (c: AudioContext) => {
    if (fetching) return;
    fetching = true;
    for (const kind of RECORDED_KINDS) {
      TAKES[kind].forEach((_, i) => {
        void fetchBytes(takeFile(kind, i))
          .then((bytes) => c.decodeAudioData(bytes))
          .then((buffer) => {
            if (ctx !== c) return;
            const list = recordings.get(kind) ?? [];
            list[i] = { buffer, lead: leadIn(buffer) };
            recordings.set(kind, list);
          })
          .catch((e: unknown) => console.warn(`trick-lab: a sound could not be loaded, its synthesized version plays instead (${String(e)})`));
      });
    }
  };

  /** Plays `name` from `start`: a recording at random, a little off pitch, or the synthesized voices. `take` picks one (the sound check); null forces the synthesized. */
  const playAt = (c: AudioContext, out: GainNode, n: AudioBuffer, name: SoundName, start: number, rate: number, set: Set<AudioScheduledSourceNode>, take?: number | null) => {
    const { pitch, stretch } = FOLLOWS_SPEED[name] ? slowMotion(rate) : { pitch: 1, stretch: 1 };
    const kind = RECORDING_OF[name];
    const list = kind ? arrived(kind) : [];
    const chosen = take === undefined ? list[Math.min(list.length - 1, Math.floor(random() * list.length))] : take === null || !kind ? undefined : recordings.get(kind)?.[take];
    if (chosen) {
      const pick = chosen;
      const jitter = take === undefined ? 1 + PITCH_JITTER * (2 * random() - 1) : 1;
      sample(c, out, set, pick, start, pitch * jitter);
      if (name === 'sketchy') for (const v of SCUFF_VOICES) voice(c, out, n, set, v, start, pitch, stretch);
      return;
    }
    for (const v of SOUNDS[name]) voice(c, out, n, set, v, start, pitch, stretch);
  };

  const makeLayers = (c: AudioContext, out: GainNode, n: AudioBuffer): RollLayers => {
    const layer = (spec: typeof ROLL_SOUND.hiss | typeof ROLL_SOUND.rumble, offset: number) => {
      const src = c.createBufferSource();
      src.buffer = n;
      src.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = spec.filter;
      filter.Q.value = spec.q;
      filter.frequency.value = spec.freq.still;
      const gain = c.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      // The two layers read the noise from different points, so they do not sound like one.
      src.start(c.currentTime, offset);
      return { src, filter, gain };
    };
    const hiss = layer(ROLL_SOUND.hiss, 0);
    const rumble = layer(ROLL_SOUND.rumble, 0.5);
    return { sources: [hiss.src, rumble.src], hiss, rumble };
  };

  const stopRoll = () => {
    if (renewTimer !== null) clearTimeout(renewTimer);
    renewTimer = null;
    cut(tickLive);
    if (layers) {
      for (const s of layers.sources) {
        try {
          s.stop();
        } catch {
          // Already stopped.
        }
        s.disconnect();
      }
      for (const l of [layers.hiss, layers.rumble]) {
        l.filter.disconnect();
        l.gain.disconnect();
      }
      layers = null;
    }
  };

  const roll: SoundPlayer['roll'] = (state, rate, now) => {
    if (renewTimer !== null) clearTimeout(renewTimer);
    renewTimer = null;
    cut(tickLive);
    const c = ctx;
    if (!c || !master || !noise) return;
    if (state === 'off' && !layers) return;
    layers ??= makeLayers(c, master, noise);
    const t = c.currentTime;
    const { speed, distance } = now();
    const pushing = state === 'push';
    const params = [
      [layers.hiss.filter.frequency, ROLL_SOUND.hiss.freq],
      [layers.hiss.gain.gain, ROLL_SOUND.hiss.gain],
      [layers.rumble.filter.frequency, ROLL_SOUND.rumble.freq],
      [layers.rumble.gain.gain, ROLL_SOUND.rumble.gain],
    ] as const;
    for (const [param] of params) {
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
    }
    if (state === 'off') {
      // The wheels left the ground, or something holds the roll: fade out, and keep the layers for the next push.
      for (const [param, range] of params) if (range === ROLL_SOUND.hiss.gain || range === ROLL_SOUND.rumble.gain) param.linearRampToValueAtTime(0, t + ROLL_SOUND.fade);
      return;
    }
    // From the speed now to the push's cruise or the slow-down's stop, as scene/roll.ts moves it.
    const ramp = rampSeconds(speed, pushing, rate);
    const end = pushing ? ROLL_MODEL.cruise : 0;
    for (const [param, range] of params) {
      param.linearRampToValueAtTime(at(range, speed), t + ROLL_SOUND.fade);
      param.linearRampToValueAtTime(at(range, end), t + Math.max(ROLL_SOUND.fade, ramp));
    }
    for (const tick of jointTicks({ speed, distance }, pushing, rate, ROLL_SOUND.horizon, ticks)) {
      const level = tick.speed / ROLL_MODEL.cruise;
      if (level < 0.05) continue;
      for (const v of ROLL_SOUND.tick) voice(c, master, noise, tickLive, v, t + tick.at, 1, 1, level);
    }
    // Renewed from the roll as FlightDriver has it by then, so the ticks never drift from the picture.
    if (pushing || ramp > ROLL_SOUND.renew) renewTimer = setTimeout(() => roll(state, rate, now), ROLL_SOUND.renew * 1000);
  };

  return {
    unlock: () => {
      const c = ready();
      if (c) fetchRecordings(c);
    },
    play: (kind, rate) => {
      const c = ready();
      if (!c || !master || !noise) return;
      fetchRecordings(c);
      const start = Math.max(c.currentTime + 0.01, last + STAGGER);
      last = start;
      playAt(c, master, noise, kind, start, rate, live);
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
    catchIn: (seconds, rate) => {
      cut(catchLive);
      const c = ctx;
      if (seconds === null || !c || !master || !noise) return;
      playAt(c, master, noise, 'catch', c.currentTime + seconds, rate, catchLive);
    },
    roll,
    stop: () => {
      cut(live);
      cut(barLive);
      cut(catchLive);
      stopRoll();
      last = -Infinity;
    },
    dispose: () => {
      stopRoll();
      live.clear();
      barLive.clear();
      catchLive.clear();
      recordings.clear();
      void ctx?.close().catch(() => {});
      ctx = null;
      master = null;
      noise = null;
      tried = false;
      fetching = false;
      last = -Infinity;
    },
    audition: (kind, take, rate) => {
      const c = ready();
      if (!c || !master || !noise) return;
      fetchRecordings(c);
      playAt(c, master, noise, kind, c.currentTime + 0.01, rate, live, take);
    },
    takes: (kind) => {
      const k = RECORDING_OF[kind];
      return k ? arrived(k).length : 0;
    },
  };
}

let shared: SoundPlayer | null = null;

/** The page's one player, made on first ask. */
export const soundPlayer = (): SoundPlayer => (shared ??= createSoundPlayer());

/** For the sound check (ui/SoundCheck.tsx), which takes them from this chunk rather than importing the spec itself. */
export { RECORDED_KINDS, TAKES } from './soundSpec';
