import { describe, expect, it } from 'vitest';
import { PACE } from '../store/pace';
import { adaptiveOn, newAdaptive, noteAdaptiveSample, resetAdaptive, scaledDpr, scaleFor, stepAdaptive, windowQuantile, type AdaptiveState } from './adaptiveResolution';
import { ART } from './artDirection';

const A = ART.adaptive;
const CHOPPY = PACE.choppyMs;

/** A controller for `tier` made active on the game screen at time 0. */
function started(tier = 'high', source: 'gpu' | 'interval' = 'gpu') {
  const st = newAdaptive(A, source);
  resetAdaptive(st, tier, source);
  stepAdaptive(st, A, 0, 'skate', tier, true, CHOPPY);
  return st;
}

/** Feeds `n` samples of `ms` and steps once at `now`; returns whether the scale changed. */
function feedAndStep(st: AdaptiveState, ms: number, now: number, opts: { n?: number; tier?: string; screen?: string; quiet?: boolean } = {}) {
  for (let i = 0; i < (opts.n ?? A.minSamples); i++) noteAdaptiveSample(st, ms);
  return stepAdaptive(st, A, now, opts.screen ?? 'skate', opts.tier ?? 'high', opts.quiet ?? true, CHOPPY);
}

describe('adaptive resolution (ADR-109)', () => {
  it('acts only on the game screen, on High and Medium', () => {
    expect(adaptiveOn('skate', 'high')).toBe(true);
    expect(adaptiveOn('skate', 'medium')).toBe(true);
    expect(adaptiveOn('skate', 'low')).toBe(false);
    expect(adaptiveOn('lab', 'high')).toBe(false);
    expect(adaptiveOn('home', 'high')).toBe(false);
  });

  it('never moves in the lab, on the welcome screen or on Low, however slow the frames', () => {
    for (const [screen, tier] of [
      ['lab', 'high'],
      ['home', 'high'],
      ['lab', 'medium'],
      ['home', 'medium'],
      ['skate', 'low'],
    ] as const) {
      const st = newAdaptive(A);
      resetAdaptive(st, tier, 'gpu');
      for (let t = 0; t <= 60_000; t += 1000) expect(feedAndStep(st, 20, t, { screen, tier })).toBe(false);
      expect(st.scale).toBe(1);
    }
  });

  it('lowers a step when the GPU is over the tier target', () => {
    const st = started('high');
    expect(feedAndStep(st, 6, A.minGapMs)).toBe(true);
    expect(st.scale).toBeCloseTo(1 - A.step);
    const medium = started('medium');
    // 3.5 ms is inside High's 4 but over Medium's 3.
    expect(feedAndStep(medium, 3.5, A.minGapMs, { tier: 'medium' })).toBe(true);
    const high = started('high');
    expect(feedAndStep(high, 3.5, A.minGapMs)).toBe(false);
  });

  it('waits for enough new samples and changes only at a quiet moment', () => {
    const st = started('high');
    expect(feedAndStep(st, 6, A.minGapMs, { n: A.minSamples - 1 })).toBe(false);
    expect(feedAndStep(st, 6, A.minGapMs, { n: 1, quiet: false })).toBe(false);
    expect(st.scale).toBe(1);
    expect(stepAdaptive(st, A, A.minGapMs + 16, 'skate', 'high', true, CHOPPY)).toBe(true);
  });

  it('keeps the minimum time between two changes, and after it starts', () => {
    const st = started('high');
    expect(feedAndStep(st, 6, A.minGapMs - 1)).toBe(false);
    expect(feedAndStep(st, 6, A.minGapMs)).toBe(true);
    expect(feedAndStep(st, 6, 2 * A.minGapMs - 1)).toBe(false);
    expect(feedAndStep(st, 6, 2 * A.minGapMs)).toBe(true);
    expect(st.scale).toBeCloseTo(1 - 2 * A.step);
  });

  it('stops at the floor, and the pixel ratio stays inside the device and the cap', () => {
    const st = started('high');
    for (let i = 1; i <= 20; i++) feedAndStep(st, 9, i * A.minGapMs);
    expect(st.scale).toBeCloseTo(A.floor);
    expect(feedAndStep(st, 9, 30 * A.minGapMs)).toBe(false);
    // High's cap 1.5 on a 2x display: never under 1.125; Medium's 1.25: never under 0.9375.
    expect(scaledDpr(ART.quality.high.dpr, 2, A.floor)).toBeCloseTo(1.125);
    expect(scaledDpr(ART.quality.medium.dpr, 2, A.floor)).toBeCloseTo(0.9375);
    // Never above the device's own ratio, or the cap.
    expect(scaledDpr(ART.quality.high.dpr, 1, 1)).toBe(1);
    expect(scaledDpr(ART.quality.high.dpr, 3, 1)).toBe(1.5);
    expect(scaledDpr(ART.quality.high.dpr, 1.25, 0.9)).toBeCloseTo(1.125);
  });

  it('rises again with headroom, never above the cap', () => {
    const st = started('high');
    feedAndStep(st, 6, A.minGapMs);
    feedAndStep(st, 6, 2 * A.minGapMs);
    expect(st.level).toBe(2);
    expect(feedAndStep(st, 2, 3 * A.minGapMs)).toBe(true);
    expect(feedAndStep(st, 2, 4 * A.minGapMs)).toBe(true);
    expect(st.scale).toBe(1);
    expect(feedAndStep(st, 1, 5 * A.minGapMs)).toBe(false);
    expect(st.scale).toBe(1);
  });

  it('does not go back and forth on a signal hovering at the threshold', () => {
    // A frame whose GPU time is half pixels, half fixed (the shadow map, the passes), at the lowering threshold at
    // the full cap, with noise round it: a step down leaves it just under the threshold, where a controller that
    // raised as soon as it was under would go back and forth every `minGapMs`.
    const st = started('high');
    const atCap = A.targetMs.high * A.lowerAbove;
    let changes = 0;
    let i = 0;
    for (let t = 16; t <= 600_000; t += 16) {
      if (t % 64 === 0) {
        const noise = ((i++ * 7919) % 21) / 100 - 0.1;
        noteAdaptiveSample(st, (atCap + noise) * (0.5 + 0.5 * st.scale * st.scale));
      }
      if (stepAdaptive(st, A, t, 'skate', 'high', true, CHOPPY)) changes += 1;
    }
    expect(changes).toBeLessThanOrEqual(1);
    expect(st.scale).toBeGreaterThanOrEqual(1 - A.step - 1e-9);
  });

  it('leaves frames over the choppy line to the tier step-down', () => {
    const st = started('high');
    expect(feedAndStep(st, CHOPPY + 5, A.minGapMs)).toBe(false);
    expect(st.scale).toBe(1);
  });

  it('starts again at the full cap on a tier change', () => {
    const st = started('high');
    feedAndStep(st, 6, A.minGapMs);
    expect(scaleFor(st, 'high')).toBeLessThan(1);
    expect(scaleFor(st, 'medium')).toBe(1);
    expect(stepAdaptive(st, A, 3 * A.minGapMs, 'skate', 'medium', true, CHOPPY)).toBe(true);
    expect(st.scale).toBe(1);
    expect(st.count).toBe(0);
    // And it judges afresh on the new tier, after the minimum time from its start.
    expect(feedAndStep(st, 6, 3 * A.minGapMs + 1, { tier: 'medium' })).toBe(false);
  });

  it('forgets the lab frames: leaving the game empties the window and keeps the scale', () => {
    const st = started('high');
    feedAndStep(st, 6, A.minGapMs);
    const kept = st.scale;
    feedAndStep(st, 2, 2 * A.minGapMs, { screen: 'lab' });
    expect(st.count).toBe(0);
    expect(st.scale).toBe(kept);
    // Back in the game it waits the minimum time again before judging.
    expect(feedAndStep(st, 2, 2 * A.minGapMs + 1)).toBe(false);
    expect(feedAndStep(st, 2, 3 * A.minGapMs + 1)).toBe(true);
  });

  it('without GPU timing, lowers on a missed refresh and never raises', () => {
    const st = started('high', 'interval');
    expect(feedAndStep(st, 16.7, A.minGapMs)).toBe(false);
    expect(feedAndStep(st, 25, 2 * A.minGapMs)).toBe(true);
    for (let i = 3; i < 10; i++) expect(feedAndStep(st, 8, i * A.minGapMs)).toBe(false);
    expect(st.scale).toBeCloseTo(1 - A.step);
  });

  it('reads the quantile of the newest window of samples', () => {
    const st = newAdaptive(A);
    for (let i = 1; i <= A.window; i++) noteAdaptiveSample(st, i);
    expect(windowQuantile(st, 0.9)).toBe(Math.floor(0.9 * A.window) + 1);
    for (let i = 0; i < A.window; i++) noteAdaptiveSample(st, 100);
    expect(windowQuantile(st, 0.5)).toBe(100);
    noteAdaptiveSample(st, 0);
    noteAdaptiveSample(st, Number.NaN);
    expect(st.count).toBe(A.window);
  });
});
