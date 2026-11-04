import { describe, expect, it } from 'vitest';
import { computeFlight } from './flight';
import { describeResult, outcomeCard, valueText } from './format';
import { DEFAULT_INPUTS, recognize, resolveTrick } from './tricks';

const withTotals = (rollTotal: number, yawTotal: number) =>
  recognize({ ...computeFlight(DEFAULT_INPUTS), rollTotal, yawTotal });

describe('valueText', () => {
  it('speaks units in full words', () => {
    expect(valueText('pop', 0.35)).toBe('0.35 meters');
    expect(valueText('flick', 1.9)).toBe('1.9 revolutions per second');
    expect(valueText('scoop', 1)).toBe('1 revolution per second');
    expect(valueText('scoop', 0)).toBe('0 revolutions per second');
  });
});

describe('announcer text', () => {
  it('matches the brief example for a kickflip', () => {
    expect(describeResult(resolveTrick({ pop: 0.35, flick: 1.9, scoop: 0 }))).toBe(
      'Kickflip landed. 365 degrees of flip, 0 degrees of shove, 0.53 seconds in the air.',
    );
  });
});

describe('outcome card copy (DESIGN.md section 4)', () => {
  it('landed', () => {
    expect(outcomeCard(withTotals(365, 0))).toEqual({
      name: 'Kickflip landed',
      detail: '365 deg flip, 0 deg shove, 0.53 s in the air.',
    });
  });

  it('ollie', () => {
    expect(outcomeCard(withTotals(0, 0)).detail).toBe('No rotation, 0.53 s in the air. Add flick or scoop to try a trick.');
  });

  it('under-rotated flip', () => {
    expect(outcomeCard(withTotals(312, 0))).toEqual({
      name: 'Kickflip not landed',
      detail: 'Under-rotated by 48 deg of flip. More flick or more pop gives it time.',
    });
  });

  it('over-rotated shove', () => {
    expect(outcomeCard(withTotals(0, 211))).toEqual({
      name: 'Pop shove-it not landed',
      detail: 'Over-rotated by 31 deg of shove. Ease the scoop a little.',
    });
  });

  it('both axes off', () => {
    expect(outcomeCard(withTotals(320, 208))).toEqual({
      name: 'Varial flip not landed',
      detail: 'Under-rotated 40 deg of flip, over-rotated 28 deg of shove.',
    });
  });
});
