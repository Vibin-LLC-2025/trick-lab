// ROUGH (step 8): a few tests for the two candidate controls' pure mappings.
import { describe, expect, it } from 'vitest';
import { BAR, barFeedback, barMiss, controlsModeFrom, FLICK_IT, keyAttempt, pointerAttempt, popFromHold, timedAttempt, windUpName } from './controls';
import { airtimeFor } from './flight';
import { cleanSetup, SETTABLE_TRICKS } from './skate';
import { INPUT_LIMITS, presetById, resolveTrick } from './tricks';

describe('A. flick it yourself', () => {
  it('a longer crouch pops higher, from the lowest pop to the highest', () => {
    expect(popFromHold(0)).toBe(INPUT_LIMITS.pop.min);
    expect(popFromHold(FLICK_IT.popFullMs)).toBe(INPUT_LIMITS.pop.max);
    expect(popFromHold(FLICK_IT.popFullMs * 3)).toBe(INPUT_LIMITS.pop.max);
    expect(popFromHold(900)).toBeGreaterThan(popFromHold(600));
  });

  it('a drag right is a kickflip, left a heelflip, down backside, up frontside; nothing dragged is an ollie', () => {
    // The hold that pops 0.35 m, and the drag that turns one flip in that airtime.
    const hold = ((0.35 - INPUT_LIMITS.pop.min) / (INPUT_LIMITS.pop.max - INPUT_LIMITS.pop.min)) * FLICK_IT.popFullMs;
    const one = (1 / airtimeFor(0.35)) * FLICK_IT.pxPerRate;
    expect(resolveTrick(pointerAttempt(hold, one, 0))).toMatchObject({ id: 'kickflip', grade: 'clean' });
    expect(resolveTrick(pointerAttempt(hold, -one, 0))).toMatchObject({ id: 'heelflip', grade: 'clean' });
    expect(resolveTrick(pointerAttempt(hold, 0, one / 2))).toMatchObject({ id: 'pop-shove-it', grade: 'clean' });
    expect(resolveTrick(pointerAttempt(hold, 0, -one / 2))).toMatchObject({ id: 'frontside-pop-shove-it', grade: 'clean' });
    expect(resolveTrick(pointerAttempt(hold, one, one))).toMatchObject({ id: '360-flip', grade: 'clean' });
    expect(resolveTrick(pointerAttempt(hold, 0, 0))).toMatchObject({ id: 'ollie', grade: 'clean' });
    expect(windUpName(pointerAttempt(hold, one, 0))).toBe('Kickflip');
  });

  it('a miss comes from the hand: a drag a fifth too long, or a crouch held too long, does not land clean', () => {
    const hold = ((0.35 - INPUT_LIMITS.pop.min) / (INPUT_LIMITS.pop.max - INPUT_LIMITS.pop.min)) * FLICK_IT.popFullMs;
    const one = (1 / airtimeFor(0.35)) * FLICK_IT.pxPerRate;
    expect(resolveTrick(pointerAttempt(hold, one * 1.2, 0)).grade).toBe('bail');
    expect(resolveTrick(pointerAttempt(hold, one * 1.05, 0)).grade).toBe('sketchy');
    // The same drag after a longer crouch: more airtime, so it over-rotates.
    expect(resolveTrick(pointerAttempt(hold + 300, one, 0)).grade).not.toBe('clean');
  });

  it('never leaves the sliders, however far the drag', () => {
    const wild = pointerAttempt(99_999, 5000, -5000);
    expect(wild).toEqual({ pop: INPUT_LIMITS.pop.max, flick: INPUT_LIMITS.flick.max, scoop: INPUT_LIMITS.scoop.min });
  });

  it('by keyboard each arrow adds for as long as it is held, the same way round', () => {
    const hold = ((0.35 - INPUT_LIMITS.pop.min) / (INPUT_LIMITS.pop.max - INPUT_LIMITS.pop.min)) * FLICK_IT.popFullMs;
    const ms = 1 / airtimeFor(0.35) / FLICK_IT.ratePerMs;
    const none = { left: 0, right: 0, up: 0, down: 0 };
    expect(resolveTrick(keyAttempt(hold, { ...none, right: ms }))).toMatchObject({ id: 'kickflip', grade: 'clean' });
    expect(resolveTrick(keyAttempt(hold, { ...none, left: ms }))).toMatchObject({ id: 'heelflip', grade: 'clean' });
    expect(resolveTrick(keyAttempt(hold, { ...none, down: ms / 2 }))).toMatchObject({ id: 'pop-shove-it', grade: 'clean' });
    expect(resolveTrick(keyAttempt(hold, { ...none, right: ms, left: ms }))).toMatchObject({ id: 'ollie' });
    // The arrows fit inside the crouch: the kickflip's arrow is held for less time than Space.
    expect(ms).toBeLessThan(hold);
  });
});

describe('B. sliders plus a timing bar', () => {
  const kickflip = presetById('kickflip').inputs;

  it('inside the band you get exactly what you set, on every level', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      for (const ms of [BAR.centreMs, BAR.centreMs - BAR.half[level], BAR.centreMs + BAR.half[level]]) {
        expect(barMiss(ms, level)).toBe(0);
        expect(timedAttempt(kickflip, ms, level)).toEqual(kickflip);
      }
      // Every settable trick lands clean from its clean setup with a release at the centre.
      for (const t of SETTABLE_TRICKS) expect(resolveTrick(timedAttempt(cleanSetup(t), BAR.centreMs, level)), t.id).toMatchObject({ id: t.id, grade: 'clean' });
    }
    expect(BAR.half.hard).toBeLessThan(BAR.half.normal);
    expect(BAR.half.normal).toBeLessThan(BAR.half.easy);
  });

  it('early under-rotates and late over-rotates, more the further out; the pop is never changed', () => {
    const early = timedAttempt(kickflip, 300, 'normal');
    const late = timedAttempt(kickflip, BAR.sweepMs, 'normal');
    expect(early.flick).toBeLessThan(kickflip.flick);
    expect(late.flick).toBeGreaterThan(kickflip.flick);
    expect(early.pop).toBe(kickflip.pop);
    expect(late.pop).toBe(kickflip.pop);
    expect(resolveTrick(early)).toMatchObject({ landed: false, outcome: 'under-rotated' });
    expect(resolveTrick(late)).toMatchObject({ landed: false, outcome: 'over-rotated' });
    // Just outside the band: still landed, no longer clean.
    const justLate = BAR.centreMs + BAR.half.normal + 50;
    expect(resolveTrick(timedAttempt(kickflip, justLate, 'normal')).grade).toBe('sketchy');
    expect(barMiss(justLate, 'normal')).toBe(50);
    expect(barMiss(BAR.centreMs - BAR.half.normal - 50, 'normal')).toBe(-50);
    // No release is a release at the sweep's end.
    expect(timedAttempt(kickflip, BAR.sweepMs * 4, 'normal')).toEqual(late);
  });

  it('says what the release did', () => {
    expect(barFeedback(BAR.centreMs, 'normal')).toBe('In the band.');
    expect(barFeedback(BAR.centreMs + BAR.half.normal + 30, 'normal')).toBe('A little late: more spin than you set.');
    expect(barFeedback(200, 'normal')).toBe('Early: less spin than you set.');
  });
});

describe('the URL switch', () => {
  it('reads ?controls=flick and ?controls=bar, and nothing else', () => {
    expect(controlsModeFrom('?controls=flick')).toBe('flick');
    expect(controlsModeFrom('?debug&controls=bar')).toBe('bar');
    expect(controlsModeFrom('?controls=other')).toBeNull();
    expect(controlsModeFrom('')).toBeNull();
  });
});
