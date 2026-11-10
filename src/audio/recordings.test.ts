// Step 18 (ADR-73): the free recordings, their fallback, the catch and the
// rolling sound. The player runs against a small fake context, as in
// audio.test.ts; the rolling model is checked against the scene's own
// stepRoll, so the ticks land where the picture's joints pass the axles.
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BAY } from '../asset/groundSpec';
import { TRUCK } from '../asset/spec';
import { ART } from '../scene/artDirection';
import { stepRoll, type RollMotion } from '../scene/roll';
import { createTrickStore, GAME_PACE } from '../store';
import { catchIn, rollSound } from '../store/sound';
import { CATCH } from '../sim/feet';
import { createSoundPlayer } from './player';
import { CROSSINGS, jointTicks, rampSeconds, ROLL_MODEL } from './rolling';
import { ENCODING, PITCH_JITTER, RECORDED_KINDS, SOUND_BUDGET, SOUND_DIR, SOUND_FILES, SOUND_SOURCE, TAKES, takeFile } from './soundSpec';
import { ROLL_SOUND, SCUFF_VOICES, slowMotion, SOUNDS } from './sounds';

const ROOT = resolve(__dirname, '../..');

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the recordings (soundSpec.ts)', () => {
  it('are two or three takes of each impact, all built, small, and listed in CREDITS.md', () => {
    let total = 0;
    for (const kind of RECORDED_KINDS) {
      expect(TAKES[kind].length).toBeGreaterThanOrEqual(2);
      expect(TAKES[kind].length).toBeLessThanOrEqual(3);
    }
    const credits = readFileSync(resolve(ROOT, 'public', SOUND_DIR, 'CREDITS.md'), 'utf8');
    for (const file of SOUND_FILES) {
      const bytes = statSync(resolve(ROOT, 'public', SOUND_DIR, file)).size;
      expect(bytes).toBeLessThanOrEqual(SOUND_BUDGET.fileBytes);
      total += bytes;
      expect(credits).toContain(`\`${file}\``);
      expect(file.endsWith(`.${ENCODING.ext}`)).toBe(true);
    }
    expect(total).toBeLessThanOrEqual(SOUND_BUDGET.totalBytes);
    expect(credits).toContain(SOUND_SOURCE.page);
    expect(credits).toContain('CC0');
  });

  it('come from CC0 sources kept in the repo, with the licence beside them', () => {
    const licence = readFileSync(resolve(ROOT, SOUND_SOURCE.dir, 'License.txt'), 'utf8');
    expect(licence).toMatch(/Creative Commons Zero, CC0/);
    for (const kind of RECORDED_KINDS)
      for (const take of TAKES[kind]) {
        expect(take.fade).toBeLessThan(take.length);
        for (const layer of take.layers) {
          expect(statSync(resolve(ROOT, SOUND_SOURCE.dir, layer.file)).size).toBeGreaterThan(0);
          expect(layer.at).toBeLessThan(take.length);
        }
      }
  });
});

/** A decoded recording, named by the file it came from, with `lead` samples of silence first (an MP3 encoder's padding). */
const fakeBuffer = (name: string, lead = 20) => ({
  name,
  sampleRate: 1000,
  length: 300,
  getChannelData: () => Float32Array.from({ length: 300 }, (_, i) => (i < lead ? 0 : 0.5)),
});

/** A fake AudioContext recording what starts when, as in audio.test.ts, plus its params' ramps. */
function fakeContext() {
  const started: { kind: string; at: number; offset?: number; buffer: { name?: string } | null; rate: number; freq: number }[] = [];
  const stopped: unknown[] = [];
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
  const source = (kind: string) => {
    const s = {
      ...node(),
      kind,
      type: 'sine',
      frequency: param(),
      playbackRate: param(),
      buffer: null as { name?: string } | null,
      loop: false,
      onended: null as null | (() => void),
      start: vi.fn((at: number, offset?: number) => started.push({ kind: s.kind, at, offset, buffer: s.buffer, rate: s.playbackRate.value, freq: s.frequency.value })),
      stop: vi.fn((...a: unknown[]) => {
        if (a.length === 0) stopped.push(s);
      }),
    };
    return s;
  };
  const gains: ReturnType<typeof param>[] = [];
  const ctx = {
    state: 'running',
    currentTime: 10,
    sampleRate: 8000,
    destination: node(),
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createGain: vi.fn(() => {
      const gain = param();
      gains.push(gain);
      return { ...node(), gain };
    }),
    createOscillator: vi.fn(() => source('tone')),
    createBufferSource: vi.fn(() => source('buffer')),
    createBiquadFilter: vi.fn(() => ({ ...node(), type: 'lowpass', frequency: param(), Q: param() })),
    createBuffer: vi.fn((_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) })),
    decodeAudioData: vi.fn((bytes: ArrayBuffer) => Promise.resolve(fakeBuffer(new TextDecoder().decode(bytes)))),
  };
  return { ctx, started, stopped, gains };
}

/** Fetches a file as its own name, so a decoded buffer says which take it is. */
const byName = (file: string) => Promise.resolve(new TextEncoder().encode(file).buffer as ArrayBuffer);
const flush = () => new Promise((r) => setTimeout(r, 0));
const recorded = (started: ReturnType<typeof fakeContext>['started']) => started.filter((s) => s.buffer?.name);

describe('the player with recordings (ADR-73)', () => {
  it('fetches every take once sound is unlocked, and plays one at random, a little off pitch, from its first sound', async () => {
    const { ctx, started } = fakeContext();
    const fetched: string[] = [];
    const randoms = [0.99, 0, 0.5, 0.5];
    const player = createSoundPlayer(() => ctx as unknown as AudioContext, {
      fetchBytes: (f) => (fetched.push(f), byName(f)),
      random: () => randoms.shift() ?? 0.5,
    });
    player.unlock();
    player.unlock();
    await flush();
    expect([...fetched].sort()).toEqual([...SOUND_FILES].sort());
    expect(player.takes('pop')).toBe(TAKES.pop.length);
    player.play('pop', 1);
    const [pop] = recorded(started);
    // The last take (random 0.99), at the top of its pitch range (random 0), skipping the 20 ms lead-in.
    expect(pop!.buffer!.name).toBe(takeFile('pop', TAKES.pop.length - 1));
    expect(pop!.rate).toBeCloseTo(1 - PITCH_JITTER, 9);
    expect(pop!.offset).toBeCloseTo(0.02, 9);
    // No synthesized voices with it.
    expect(started.filter((s) => !s.buffer?.name)).toHaveLength(0);
  });

  it('slows a recording by the same rule as the synthesized sounds, and lays the scuff over a sketchy landing', async () => {
    const { ctx, started } = fakeContext();
    const player = createSoundPlayer(() => ctx as unknown as AudioContext, { fetchBytes: byName, random: () => 0.5 });
    player.unlock();
    await flush();
    player.play('land', 0.25);
    expect(recorded(started)[0]!.rate).toBeCloseTo(slowMotion(0.25).pitch, 9);
    started.length = 0;
    player.play('sketchy', 1);
    expect(recorded(started)[0]!.buffer!.name).toMatch(/^land-/);
    expect(started.filter((s) => !s.buffer?.name)).toHaveLength(SCUFF_VOICES.length);
  });

  it('plays the synthesized sound until the recordings arrive, and for good if they fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { ctx, started } = fakeContext();
    const player = createSoundPlayer(() => ctx as unknown as AudioContext, { fetchBytes: () => Promise.reject(new Error('blocked')) });
    player.play('bail', 1);
    expect(started).toHaveLength(SOUNDS.bail.length);
    await flush();
    expect(warn).toHaveBeenCalled();
    expect(player.takes('bail')).toBe(0);
    started.length = 0;
    player.play('bail', 1);
    expect(recorded(started)).toHaveLength(0);
    expect(started).toHaveLength(SOUNDS.bail.length);
  });

  it('the sound check plays a chosen take, or the synthesized version', async () => {
    const { ctx, started } = fakeContext();
    const player = createSoundPlayer(() => ctx as unknown as AudioContext, { fetchBytes: byName });
    player.unlock();
    await flush();
    player.audition('catch', 1, 1);
    expect(recorded(started)[0]!.buffer!.name).toBe(takeFile('catch', 1));
    expect(recorded(started)[0]!.rate).toBe(1);
    started.length = 0;
    player.audition('catch', null, 1);
    expect(recorded(started)).toHaveLength(0);
    expect(started).toHaveLength(SOUNDS.catch.length);
  });

  it('schedules the catch ahead on the audio clock, and a pause or a scrub cancels it', () => {
    const { ctx, started, stopped } = fakeContext();
    const player = createSoundPlayer(() => ctx as unknown as AudioContext, { fetchBytes: () => new Promise(() => {}) });
    player.unlock();
    player.catchIn(0.3, 1);
    expect(started).toHaveLength(SOUNDS.catch.length);
    expect(Math.min(...started.map((s) => s.at))).toBeCloseTo(10.3, 9);
    player.catchIn(null, 1);
    expect(stopped).toHaveLength(SOUNDS.catch.length);
  });
});

describe('the rolling sound (ADR-73)', () => {
  it('copies the scene: the roll speeds of ART.roll, the axles of TRUCK and the joints of BAY', () => {
    expect(ROLL_MODEL.cruise).toBe(ART.roll.cruise);
    expect(ROLL_MODEL.pushS).toBe(ART.roll.pushS);
    expect(ROLL_MODEL.slowS).toBe(ART.roll.slowS);
    expect(ROLL_MODEL.axleX).toBe(TRUCK.centerX);
    expect(ROLL_MODEL.bay).toBe(BAY.x);
  });

  it.each([
    ['pushing off from still', true, 0, 1],
    ['slowing from the cruise', false, ART.roll.cruise, 1],
    ['pushing in slow motion', true, 0.6, 0.25],
  ] as const)('ticks when an axle crosses a joint as the scene rolls it: %s', (_name, pushing, speed, rate) => {
    // The scene's own model, in small steps, finding each crossing.
    const m: RollMotion = { speed, distance: 3.1, running: true };
    const dt = 1 / 2000;
    const seen: number[] = [];
    const where = (d: number) => d - Math.floor(d / ROLL_MODEL.bay) * ROLL_MODEL.bay;
    for (let t = 0; t < 2; t += dt) {
      const before = m.distance;
      stepRoll(m, pushing, dt * rate);
      for (const c of CROSSINGS) {
        const a = where(before);
        const b = where(m.distance);
        if ((a < c && b >= c) || (a > b && (c > a || c <= b))) seen.push(t + dt);
      }
    }
    const ticks = jointTicks({ speed, distance: 3.1 }, pushing, rate, 2);
    expect(ticks.length).toBe(seen.length);
    ticks.forEach((tick, i) => expect(tick.at).toBeCloseTo(seen[i]!, 2));
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('a stopped board never ticks, and at the cruise the axles tick a wheelbase apart, a bay at a time', () => {
    expect(jointTicks({ speed: 0, distance: 0 }, false, 1, 5)).toEqual([]);
    const ticks = jointTicks({ speed: ART.roll.cruise, distance: 0 }, true, 1, 2);
    const gaps = ticks.slice(1).map((t, i) => t.at - ticks[i]!.at);
    expect(gaps[0]).toBeCloseTo((2 * TRUCK.centerX) / ART.roll.cruise, 9);
    expect(gaps[0]! + gaps[1]!).toBeCloseTo(BAY.x / ART.roll.cruise, 9);
    expect(rampSeconds(0, true, 0.5)).toBeCloseTo(ART.roll.pushS / 0.5, 9);
  });

  it('follows the roll: pushing schedules the ticks and the swell, off fades, and sound off tears it down', () => {
    vi.useFakeTimers();
    const { ctx, started, stopped } = fakeContext();
    const player = createSoundPlayer(() => ctx as unknown as AudioContext, { fetchBytes: () => new Promise(() => {}) });
    player.unlock();
    const now = { speed: 1.2, distance: 0.2 };
    player.roll('push', 1, () => now);
    const expected = jointTicks(now, true, 1, ROLL_SOUND.horizon).filter((t) => t.speed / ROLL_MODEL.cruise >= 0.05);
    // Two looping noise layers, and each tick's voices at its time.
    const loops = started.filter((s) => s.at === 10);
    expect(loops.length).toBeGreaterThanOrEqual(2);
    const tickStarts = started.filter((s) => s.at > 10).map((s) => s.at);
    expect(tickStarts).toHaveLength(expected.length * ROLL_SOUND.tick.length);
    expect(Math.min(...tickStarts)).toBeCloseTo(10 + expected[0]!.at, 9);
    // Renewed by a timer from the roll as it is then.
    started.length = 0;
    now.distance = 2.6;
    vi.advanceTimersByTime(ROLL_SOUND.renew * 1000);
    expect(started.filter((s) => s.at > 10).length).toBeGreaterThan(0);
    // In the air: the ticks go, the layers stay to fade.
    const before = stopped.length;
    player.roll('off', 1, () => now);
    expect(stopped.length).toBeGreaterThan(before);
    player.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('what the sound follows in the store (store/sound.ts)', () => {
  it('rolls only on the ground in a game, and times the catch from the flight', () => {
    const store = createTrickStore();
    const s = () => store.getState();
    expect(rollSound(s())).toBe('off');
    store.setState({ skateTaught: true });
    s().setPopMode('exact');
    s().setScreen('skate');
    s().startSkate();
    for (let i = 0; i < 50 && s().skate.first !== 'you'; i++) s().startSkate();
    s().callSkateTrick('kickflip');
    s().setInput('flick', 1.9);
    // Pushing off on the ground, then a pop puts it in the air.
    s().popTrick();
    expect(s().status).toBe('playing');
    expect(rollSound(s())).toBe('off');
    const flight = s().flight!;
    expect(flight.landed).toBe(true);
    // At the game's pace (ADR-78): the catch comes as late as the picture's.
    expect(catchIn(s(), store.playhead)).toBeCloseTo((CATCH.front * flight.airtime) / (s().rate * GAME_PACE), 9);
    s().land();
    expect(catchIn(s(), store.playhead)).toBeNull();
    expect(rollSound(s())).toBe('slow');
  });
});
