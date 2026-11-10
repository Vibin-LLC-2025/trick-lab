import { describe, expect, it } from 'vitest';
import { BAR, barFeedback, barMiss, barOff, barScale, barWhen, clampRelease, timedAttempt, type Band } from './bar';
import { cleanSetup, SETTABLE_TRICKS, SKATE_LEVEL_ORDER, SKATE_LEVELS } from './skate';
import { INPUT_LIMITS, resolveTrick } from './tricks';

const NORMAL: Band = SKATE_LEVELS.normal.band;
const kick = { pop: 0.35, flick: 1.9, scoop: 0 };

describe('the timing bar, pure (ADR-65)', () => {
  it('the sweep is a count: two ticks lead evenly into the click on the band', () => {
    expect(BAR.ticksMs).toEqual([0, 400]);
    expect(BAR.centreMs - BAR.ticksMs[1]).toBe(BAR.ticksMs[1] - BAR.ticksMs[0]);
    expect(BAR.centreMs).toBeLessThan(BAR.sweepMs);
  });

  it("every level's band fits in the sweep, spans several frames, and narrows as the level goes up", () => {
    for (const level of SKATE_LEVEL_ORDER) {
      const { halfMs, k } = SKATE_LEVELS[level].band;
      expect(halfMs).toBeGreaterThanOrEqual(50);
      expect(BAR.centreMs - halfMs).toBeGreaterThan(0);
      expect(BAR.centreMs + halfMs).toBeLessThan(BAR.sweepMs);
      expect(k).toBeGreaterThan(0);
      expect(k).toBeLessThan(1);
    }
    expect(SKATE_LEVELS.easy.band.halfMs).toBeGreaterThan(SKATE_LEVELS.normal.band.halfMs);
    expect(SKATE_LEVELS.normal.band.halfMs).toBeGreaterThan(SKATE_LEVELS.hard.band.halfMs);
    expect(SKATE_LEVELS.easy.band.k).toBeLessThan(SKATE_LEVELS.hard.band.k);
  });

  it('inside the band the attempt is exactly the setup', () => {
    for (const ms of [BAR.centreMs - NORMAL.halfMs, BAR.centreMs, BAR.centreMs + NORMAL.halfMs]) {
      expect(barMiss(ms, NORMAL)).toBe(0);
      expect(barScale(ms, NORMAL)).toBe(1);
      expect(timedAttempt(kick, ms, NORMAL)).toEqual(kick);
    }
    // A copy, not the same object: the store's sliders are never handed out.
    expect(timedAttempt(kick, BAR.centreMs, NORMAL)).not.toBe(kick);
  });

  it('early spins less and late spins more, by how far outside the band; the pop height never changes', () => {
    const early = timedAttempt({ pop: 0.35, flick: 1.9, scoop: -0.9 }, BAR.centreMs - NORMAL.halfMs - 100, NORMAL);
    const late = timedAttempt({ pop: 0.35, flick: 1.9, scoop: -0.9 }, BAR.centreMs + NORMAL.halfMs + 100, NORMAL);
    // 100 ms outside on Normal: k 0.6 over half a sweep of 600 ms is 10 percent.
    expect(early).toEqual({ pop: 0.35, flick: expect.closeTo(1.9 * 0.9, 9), scoop: expect.closeTo(-0.9 * 0.9, 9) });
    expect(late).toEqual({ pop: 0.35, flick: expect.closeTo(1.9 * 1.1, 9), scoop: expect.closeTo(-0.9 * 1.1, 9) });
    expect(barMiss(BAR.centreMs - NORMAL.halfMs - 100, NORMAL)).toBe(-100);
    expect(barMiss(BAR.centreMs + NORMAL.halfMs + 100, NORMAL)).toBe(100);
    expect(barOff(BAR.centreMs + 30)).toBe(30);
    // Later is never less spin.
    let last = 0;
    for (let ms = 0; ms <= BAR.sweepMs; ms += 20) {
      const s = barScale(ms, NORMAL);
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
  });

  it('a release outside the sweep is one at its edge; a slider at its limit still over-rotates when released late', () => {
    expect(clampRelease(-50)).toBe(0);
    expect(clampRelease(5000)).toBe(BAR.sweepMs);
    expect(timedAttempt(kick, 5000, NORMAL)).toEqual(timedAttempt(kick, BAR.sweepMs, NORMAL));
    // Not held to the sliders' limits, or a late double flip (flick 3.0) could never miss. The most a release makes is about 4.2 rev/s.
    const hard = SKATE_LEVELS.hard.band;
    const big = timedAttempt({ pop: 0.55, flick: INPUT_LIMITS.flick.max, scoop: INPUT_LIMITS.scoop.min }, BAR.sweepMs, hard);
    expect(big.flick).toBeCloseTo(3 * barScale(BAR.sweepMs, hard), 9);
    expect(big.scoop).toBeCloseTo(-3 * barScale(BAR.sweepMs, hard), 9);
    for (const level of SKATE_LEVEL_ORDER) expect(3 * barScale(BAR.sweepMs, SKATE_LEVELS[level].band)).toBeLessThan(4.2);
    // No spin set stays no spin, and never a negative zero.
    expect(Object.is(timedAttempt({ pop: 0.35, flick: 0, scoop: 0 }, 0, hard).flick, 0)).toBe(true);
  });

  it("every settable trick, from its clean setup on the sliders: on the band's centre it lands clean, at either end of the sweep it bails, on every level", () => {
    for (const level of SKATE_LEVEL_ORDER) {
      const band = SKATE_LEVELS[level].band;
      for (const call of SETTABLE_TRICKS) {
        const setup = cleanSetup(call);
        const centre = resolveTrick(timedAttempt(setup, BAR.centreMs, band));
        expect(centre.id, `${call.id} ${level}`).toBe(call.id);
        expect(centre.grade, `${call.id} ${level}`).toBe('clean');
        // No release by the sweep's end: over-rotated.
        const end = resolveTrick(timedAttempt(setup, BAR.sweepMs, band));
        expect(end.landed && end.id === call.id, `${call.id} ${level} end`).toBe(false);
        // Pop and release at once: under-rotated.
        const start = resolveTrick(timedAttempt(setup, 0, band));
        expect(start.landed && start.id === call.id, `${call.id} ${level} start`).toBe(false);
      }
    }
  });

  it('a kickflip a little late on Normal is still a kickflip, landed sketchy', () => {
    // 60 ms outside the band: 6 percent more flick, about 27 degrees past.
    const r = resolveTrick(timedAttempt(cleanSetup({ flips: 1, halfShoves: 0 }), BAR.centreMs + NORMAL.halfMs + 60, NORMAL));
    expect(r.id).toBe('kickflip');
    expect(r.grade).toBe('sketchy');
  });

  it('says what a release did, so the mistake has a name', () => {
    expect(barFeedback(BAR.centreMs + 40, NORMAL)).toBe('In the band: exactly what you set.');
    expect(barFeedback(BAR.centreMs + NORMAL.halfMs + 40, NORMAL)).toBe('A little late: 4 percent more spin than you set.');
    expect(barFeedback(BAR.centreMs - NORMAL.halfMs - 40, NORMAL)).toBe('A little early: 4 percent less spin than you set.');
    expect(barFeedback(BAR.centreMs + NORMAL.halfMs + 200, NORMAL)).toBe('Late: 20 percent more spin than you set.');
    expect(barFeedback(200, NORMAL)).toBe('Early: 50 percent less spin than you set.');
    // A hair outside is still said as a miss, never as 0 percent.
    expect(barFeedback(BAR.centreMs + NORMAL.halfMs + 2, NORMAL)).toBe('A little late: 1 percent more spin than you set.');
    expect(barFeedback(BAR.sweepMs, NORMAL, true)).toBe('No release, so the bar ran out: 30 percent more spin than you set.');
    expect(barWhen(BAR.centreMs, NORMAL)).toBe('in the band');
    expect(barWhen(BAR.centreMs + NORMAL.halfMs + 10, NORMAL)).toBe('a little late');
    expect(barWhen(100, NORMAL)).toBe('early');
  });
});
