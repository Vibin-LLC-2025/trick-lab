import { describe, expect, it } from 'vitest';
import { recognize } from '../sim/tricks';
import { ART } from './artDirection';
import { cycleSeconds, newShowcaseClock, SHOWCASE_FLIGHTS, SHOWCASE_STILL, showcaseFlight, showcaseProgress, stepShowcase } from './showcase';

const S = ART.showcase;

describe('welcome screen preview (ADR-45)', () => {
  it('shows only tricks that land, the ones its list names', () => {
    expect(SHOWCASE_FLIGHTS).toHaveLength(S.tricks.length);
    SHOWCASE_FLIGHTS.forEach((f, i) => {
      const r = recognize(f);
      expect(r.landed, S.tricks[i]).toBe(true);
      expect(r.id).toBe(S.tricks[i]);
    });
    // The still pose is mid-flight, so it shows a trick, not a board on the pad.
    expect(SHOWCASE_STILL.progress).toBeGreaterThan(0.2);
    expect(SHOWCASE_STILL.progress).toBeLessThan(0.8);
  });

  it('holds on the pad, plays the flight slowed, holds at the landing, then moves on', () => {
    const c = newShowcaseClock();
    const first = SHOWCASE_FLIGHTS[0]!;
    // Small steps, as frames are: progress is 0 through the first hold.
    for (let t = 0; t < S.holdBefore - 0.05; t += 0.05) stepShowcase(c, 0.05);
    expect(showcaseProgress(c)).toBe(0);
    // Half the slowed flight later, about half the flight.
    const half = first.airtime / S.rate / 2;
    for (let t = 0; t < half; t += 0.01) stepShowcase(c, 0.01);
    expect(showcaseProgress(c)).toBeGreaterThan(0.4);
    expect(showcaseProgress(c)).toBeLessThan(0.65);
    // Then the landing holds at 1 until the cycle ends.
    while (c.t < cycleSeconds(first) - S.holdAfter / 2) stepShowcase(c, 0.05);
    expect(c.index).toBe(0);
    expect(showcaseProgress(c)).toBe(1);
    while (c.index === 0) stepShowcase(c, 0.05);
    expect(c.index).toBe(1);
    expect(showcaseFlight(c)).toBe(SHOWCASE_FLIGHTS[1]);
    expect(showcaseProgress(c)).toBe(0);
  });

  it('loops round the list, and a long frame (a background tab) advances at most one capped step', () => {
    const c = newShowcaseClock();
    stepShowcase(c, 60);
    expect(c.index).toBe(0);
    expect(c.t).toBeCloseTo(S.maxStep);
    stepShowcase(c, -1);
    expect(c.t).toBeCloseTo(S.maxStep);
    const total = SHOWCASE_FLIGHTS.reduce((sum, f) => sum + cycleSeconds(f), 0);
    for (let t = S.maxStep; t < total; t += 0.05) stepShowcase(c, 0.05);
    expect(c.index).toBe(0);
  });
});
