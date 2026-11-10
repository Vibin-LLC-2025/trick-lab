// ADR-58 (2026-11-09) and ADR-73 (step 18): the sounds and their player. Web Audio
// does not exist in jsdom, so the player runs against a small fake context
// that records what it is asked to build and when.
import { describe, expect, it, vi } from 'vitest';
import type { SoundKind } from '../store';
import { createSoundPlayer } from './player';
import { BAR } from '../sim/bar';
import { BAR_SOUND, FOLLOWS_SPEED, slowMotion, SOUNDS, STAGGER, type SoundName } from './sounds';

const KINDS: SoundName[] = ['pop', 'catch', 'land', 'sketchy', 'bail', 'letter', 'win', 'lose'];
// Every cue the store can give has a sound.
const CUES: Record<SoundKind, true> = { pop: true, land: true, sketchy: true, bail: true, letter: true, win: true, lose: true };
/** The recordings never arrive: the synthesized sounds play, as before step 18. */
const synthOnly = { fetchBytes: () => new Promise<ArrayBuffer>(() => {}) };

describe('the sounds', () => {
  it.each(KINDS)('%s is a few short voices, audible and never clipping', (kind) => {
    const voices = SOUNDS[kind];
    expect(voices.length).toBeGreaterThan(0);
    for (const v of voices) {
      expect(v.at).toBeGreaterThanOrEqual(0);
      expect(v.dur).toBeGreaterThan(0);
      expect(v.gain).toBeGreaterThan(0);
      expect(v.gain).toBeLessThanOrEqual(1);
      for (const f of v.kind === 'tone' ? [v.from, v.to] : [v.freq]) {
        expect(f).toBeGreaterThanOrEqual(40);
        expect(f).toBeLessThanOrEqual(8000);
      }
    }
    // Over within a second: a sound never trails into the next trick.
    expect(Math.max(...voices.map((v) => v.at + v.dur))).toBeLessThanOrEqual(1);
  });

  it("slows the board's own sounds with slow motion, lower and longer, never below half pitch; the game's keep their pitch", () => {
    expect(slowMotion(1)).toEqual({ pitch: 1, stretch: 1 });
    expect(slowMotion(2)).toEqual({ pitch: 1, stretch: 1 });
    expect(slowMotion(0.25).pitch).toBeCloseTo(0.25 ** 0.35, 9);
    expect(slowMotion(0.25).stretch).toBeCloseTo(1 / 0.25 ** 0.35, 9);
    expect(slowMotion(0.05)).toEqual({ pitch: 0.5, stretch: 2 });
    expect(KINDS.filter((k) => FOLLOWS_SPEED[k])).toEqual(['pop', 'catch', 'land', 'sketchy', 'bail']);
    expect(Object.keys(CUES).every((k) => KINDS.includes(k as SoundName))).toBe(true);
  });
});

/** A decoded recording: `lead` samples of silence, then sound. */
const fakeBuffer = (name: string, lead = 0) => ({
  name,
  sampleRate: 1000,
  length: 300,
  getChannelData: () => Float32Array.from({ length: 300 }, (_, i) => (i < lead ? 0 : 0.5)),
});

/** A fake AudioContext: records sources started (with their type, frequency, start time, offset, buffer and rate) and filters. */
function fakeContext(state: AudioContextState = 'running') {
  const started: { type: string; freq: number; at: number; offset?: number; buffer: unknown; rate: number }[] = [];
  const param = () => {
    const p = {
      value: 0,
      setValueAtTime: vi.fn((v: number) => ((p.value = v), p)),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    };
    return p;
  };
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const source = (type: string) => {
    const s = {
      ...node(),
      type,
      frequency: param(),
      playbackRate: param(),
      buffer: null as unknown,
      loop: false,
      onended: null as null | (() => void),
      start: vi.fn((at: number, offset?: number) => started.push({ type: s.type, freq: s.frequency.value, at, offset, buffer: s.buffer, rate: s.playbackRate.value })),
      stop: vi.fn(),
    };
    return s;
  };
  const ctx = {
    state,
    currentTime: 10,
    sampleRate: 8000,
    destination: node(),
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createGain: vi.fn(() => ({ ...node(), gain: param() })),
    createOscillator: vi.fn(() => source('tone')),
    createBufferSource: vi.fn(() => source('noise')),
    createBiquadFilter: vi.fn(() => ({ ...node(), type: 'lowpass', frequency: param(), Q: param() })),
    createBuffer: vi.fn((_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) })),
    decodeAudioData: vi.fn((bytes: ArrayBuffer) => Promise.resolve(fakeBuffer(new TextDecoder().decode(bytes), 20))),
  };
  return { ctx, started };
}

describe('the player', () => {
  it('makes no audio context until it is first needed, and none at all without Web Audio', () => {
    const make = vi.fn(() => null);
    const player = createSoundPlayer(make);
    expect(make).not.toHaveBeenCalled();
    player.play('pop', 1);
    player.unlock();
    expect(make).toHaveBeenCalledTimes(1);
  });

  it("plays a sound's voices at once, and staggers one asked for straight after so each is heard", () => {
    const { ctx, started } = fakeContext();
    const player = createSoundPlayer(() => ctx as unknown as AudioContext, synthOnly);
    player.play('land', 1);
    expect(started).toHaveLength(SOUNDS.land.length);
    const first = Math.min(...started.map((s) => s.at));
    expect(first).toBeCloseTo(10.01, 9);
    started.length = 0;
    player.play('letter', 1);
    expect(Math.min(...started.map((s) => s.at))).toBeCloseTo(first + STAGGER, 9);
  });

  it("lowers the board's sounds in slow motion, and leaves the game's alone", () => {
    const { ctx, started } = fakeContext();
    const player = createSoundPlayer(() => ctx as unknown as AudioContext, synthOnly);
    player.play('pop', 0.25);
    const tone = SOUNDS.pop.find((v) => v.kind === 'tone')!;
    expect(started.find((s) => s.type === 'sine')!.freq).toBeCloseTo((tone.kind === 'tone' ? tone.from : 0) * slowMotion(0.25).pitch, 6);
    started.length = 0;
    player.play('win', 0.25);
    const win = SOUNDS.win[0]!;
    expect(started[0]!.freq).toBeCloseTo(win.kind === 'tone' ? win.from : 0, 6);
  });

  it('stops every voice still queued and resets the stagger, so the next sound plays at once (review of Phase D)', () => {
    const { ctx, started } = fakeContext();
    const stops: unknown[] = [];
    const createOscillator = ctx.createOscillator;
    const createBufferSource = ctx.createBufferSource;
    ctx.createOscillator = vi.fn(() => {
      const s = createOscillator();
      s.stop.mockImplementation((...a: unknown[]) => stops.push(a));
      return s;
    });
    ctx.createBufferSource = vi.fn(() => {
      const s = createBufferSource();
      s.stop.mockImplementation((...a: unknown[]) => stops.push(a));
      return s;
    });
    const player = createSoundPlayer(() => ctx as unknown as AudioContext, synthOnly);
    player.play('land', 1);
    player.play('letter', 1);
    player.play('lose', 1);
    const voices = SOUNDS.land.length + SOUNDS.letter.length + SOUNDS.lose.length;
    // Each voice is told when to stop as it is scheduled.
    expect(stops).toHaveLength(voices);
    player.stop();
    // ...and stopped again, now, by stop().
    expect(stops).toHaveLength(2 * voices);
    expect(stops.slice(voices).every((a) => (a as unknown[]).length === 0)).toBe(true);
    started.length = 0;
    player.play('pop', 1);
    expect(Math.min(...started.map((s) => s.at))).toBeCloseTo(10.01, 9);
  });

  it('the timing bar by ear (ADR-65): a tone that rises for the whole sweep, two ticks, and a higher click on the band', () => {
    const { tone, ticks, click } = BAR_SOUND;
    expect(tone.dur).toBe(BAR.sweepMs / 1000);
    expect(tone.to).toBeGreaterThan(tone.from);
    expect(ticks.map((t) => t.at)).toEqual([0, 0.4]);
    expect(click.every((v) => v.at === BAR.centreMs / 1000)).toBe(true);
    // Evenly spaced: tick, tick, pop.
    expect(click[0]!.at - ticks[1]!.at).toBeCloseTo(ticks[1]!.at - ticks[0]!.at, 9);
    expect(click[0]!.from).toBeGreaterThan(ticks[0]!.from);
    // Quiet enough to sit under the pop that follows.
    for (const v of [tone, ...ticks, ...click]) expect(v.gain).toBeLessThanOrEqual(0.25);
  });

  it('schedules the bar from one start time on the audio clock, even with other sounds queued, so the click is on the band', () => {
    const { ctx, started } = fakeContext();
    const player = createSoundPlayer(() => ctx as unknown as AudioContext, synthOnly);
    // A landing, a letter and a jingle were just asked for: the queue is staggered well past now.
    player.play('land', 1);
    player.play('letter', 1);
    player.play('lose', 1);
    started.length = 0;
    player.bar();
    const start = 10.01;
    const at = started.map((s) => s.at).sort((a, b) => a - b);
    expect(started).toHaveLength(1 + BAR_SOUND.ticks.length + BAR_SOUND.click.length);
    expect(at[0]).toBeCloseTo(start, 9);
    expect(at.filter((t) => Math.abs(t - start) < 1e-9)).toHaveLength(2);
    expect(at.filter((t) => Math.abs(t - (start + 0.4)) < 1e-9)).toHaveLength(1);
    expect(at.filter((t) => Math.abs(t - (start + BAR.centreMs / 1000)) < 1e-9)).toHaveLength(BAR_SOUND.click.length);
    // The queue is not moved by the bar: the next queued sound still follows the jingle.
    started.length = 0;
    player.play('pop', 1);
    expect(Math.min(...started.map((s) => s.at))).toBeCloseTo(10.01 + 3 * STAGGER, 9);
  });

  it("cuts the bar's voices on release and nothing else; turning sound off cuts them too", () => {
    const { ctx } = fakeContext();
    const stops: unknown[][] = [];
    const createOscillator = ctx.createOscillator;
    const createBufferSource = ctx.createBufferSource;
    ctx.createOscillator = vi.fn(() => {
      const s = createOscillator();
      s.stop.mockImplementation((...a: unknown[]) => stops.push(a));
      return s;
    });
    ctx.createBufferSource = vi.fn(() => {
      const s = createBufferSource();
      s.stop.mockImplementation((...a: unknown[]) => stops.push(a));
      return s;
    });
    const player = createSoundPlayer(() => ctx as unknown as AudioContext, synthOnly);
    const barVoices = 1 + BAR_SOUND.ticks.length + BAR_SOUND.click.length;
    player.play('land', 1);
    player.bar();
    const scheduled = SOUNDS.land.length + barVoices;
    expect(stops).toHaveLength(scheduled);
    player.stopBar();
    // Only the bar's voices were stopped now (a stop with no time).
    expect(stops.slice(scheduled)).toHaveLength(barVoices);
    expect(stops.slice(scheduled).every((a) => a.length === 0)).toBe(true);
    // Nothing left to cut.
    player.stopBar();
    expect(stops).toHaveLength(scheduled + barVoices);
    player.bar();
    player.stop();
    expect(stops).toHaveLength(scheduled + barVoices + barVoices + SOUNDS.land.length + barVoices);
  });

  it('goes round with the bar (ADR-78): each lap is a sweep after the last, from the one start time, until it is cut', () => {
    vi.useFakeTimers();
    try {
      const { ctx, started } = fakeContext();
      const player = createSoundPlayer(() => ctx as unknown as AudioContext, synthOnly);
      const lapVoices = 1 + BAR_SOUND.ticks.length + BAR_SOUND.click.length;
      const sweep = BAR.sweepMs / 1000;
      const start = 10.01;
      const clicks = () => started.filter((s) => s.type === 'tone' && s.freq === BAR_SOUND.click[0]!.from).map((s) => s.at);
      player.bar();
      expect(started).toHaveLength(lapVoices);
      // The audio clock runs on to a moment before the next lap; the timer puts it on the clock then.
      const step = (seconds: number) => {
        ctx.currentTime += seconds;
        vi.advanceTimersByTime(seconds * 1000);
      };
      // The first lap starts 10 ms after now, so the second is due a sweep after that.
      step(sweep - BAR_SOUND.lapLead + 0.011);
      expect(started).toHaveLength(2 * lapVoices);
      step(sweep);
      expect(started).toHaveLength(3 * lapVoices);
      // Every lap's click is on the band, whole sweeps from the first start: no drift.
      const expected = [0, 1, 2].map((k) => start + k * sweep + BAR.centreMs / 1000);
      clicks().forEach((at, i) => expect(at).toBeCloseTo(expected[i]!, 9));
      // A release cuts the laps to come as well.
      player.stopBar();
      step(sweep * 3);
      expect(started).toHaveLength(3 * lapVoices);
      // And so does turning sound off.
      player.bar();
      player.stop();
      step(sweep * 3);
      expect(started).toHaveLength(4 * lapVoices);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resumes a suspended context (the browser holds audio until a gesture), and closes it when done', () => {
    const { ctx } = fakeContext('suspended');
    const player = createSoundPlayer(() => ctx as unknown as AudioContext, synthOnly);
    player.unlock();
    expect(ctx.resume).toHaveBeenCalled();
    player.dispose();
    expect(ctx.close).toHaveBeenCalled();
  });
});
