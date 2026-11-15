import { describe, expect, it } from 'vitest';
import { recognize } from '../sim/tricks';
import { ART } from './artDirection';
import { RECOVER } from '../sim/settle';
import { cycleSeconds, newShowcaseClock, SHOWCASE_FLIGHTS, SHOWCASE_STILL, showcaseAfter, showcaseFlight, showcaseLeadIn, showcaseMoved, showcaseProgress, showcaseReady, stepShowcase } from './showcase';

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

describe("the preview's rider between tricks (2026-11-13)", () => {
  const S = ART.showcase;
  it('rides with no flight before the pop, sinking into the crouch by it', () => {
    const c = newShowcaseClock();
    expect(showcaseMoved(c)).toBe(false);
    expect(showcaseLeadIn(c)).toBe(true);
    expect(showcaseReady(c)).toBe(0);
    c.t = S.holdBefore / 2;
    expect(showcaseReady(c)).toBeCloseTo(0.5, 9);
    c.t = S.holdBefore;
    expect(showcaseLeadIn(c)).toBe(false);
    expect(showcaseReady(c)).toBe(1);
    expect(showcaseMoved(c)).toBe(true);
  });

  it("recovers after touchdown on the flight's own clock, and the hold lasts the whole recovery", () => {
    const c = newShowcaseClock();
    const f = showcaseFlight(c);
    c.t = S.holdBefore + f.airtime / S.rate;
    expect(showcaseAfter(c)).toBeCloseTo(0, 9);
    c.t += 0.4;
    expect(showcaseAfter(c)).toBeCloseTo(0.4 * S.rate, 9);
    // Every trick in the preview lands, and its rider has stood back up before the next trick's hold.
    expect(S.holdAfter * S.rate).toBeGreaterThanOrEqual(RECOVER.landed.stand[1]);
  });
});
