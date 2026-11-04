import { describe, expect, it } from 'vitest';
import { computeFlight } from './flight';
import {
  DEFAULT_INPUTS,
  newlyCompleted,
  nameFor,
  OBJECTIVES,
  PRESETS,
  recognize,
  resolveTrick,
  snapInput,
} from './tricks';

/** Builds a flight with exact rotation totals, independent of the rate inputs. */
const withTotals = (rollTotal: number, yawTotal: number) => ({
  ...computeFlight(DEFAULT_INPUTS),
  rollTotal,
  yawTotal,
});

describe('presets', () => {
  it.each(PRESETS.map((p) => [p.label, p] as const))('%s lands with the default pop (0.35 m)', (_label, preset) => {
    expect(preset.inputs.pop).toBe(DEFAULT_INPUTS.pop);
    const r = resolveTrick(preset.inputs);
    expect(r.id).toBe(preset.id);
    expect(r.landed).toBe(true);
    expect(r.outcome).toBe('landed');
  });

  it.each(PRESETS.map((p) => [p.label, p] as const))('%s bails if the pop drops to 0.15 m', (_label, preset) => {
    const r = resolveTrick({ ...preset.inputs, pop: 0.15 });
    expect(r.landed).toBe(false);
    expect(r.outcome).toBe('under-rotated');
  });

  it('matches the numbers quoted in the brief', () => {
    expect(resolveTrick(PRESETS[0]!.inputs).rollTotal).toBeCloseTo(365, 0);
    expect(resolveTrick(PRESETS[1]!.inputs).yawTotal).toBeCloseTo(173, 0);
    expect(resolveTrick(PRESETS[3]!.inputs).yawTotal).toBeCloseTo(365, 0);
  });

  it('the bonus is reachable: a kickflip lands at pop 0.20 m with more flick', () => {
    const r = resolveTrick({ pop: 0.2, flick: 2.5, scoop: 0 });
    expect(r.id).toBe('kickflip');
    expect(r.landed).toBe(true);
  });

  it('keys 1 to 4 map to the presets in order', () => {
    expect(PRESETS.map((p) => p.key)).toEqual(['1', '2', '3', '4']);
    expect(OBJECTIVES.map((o) => o.label)).toEqual([
      'Land a kickflip',
      'Land a pop shove-it',
      'Land a varial flip',
      'Land a 360 flip',
    ]);
  });
});

describe('naming table', () => {
  it.each([
    [0, 0, 'Ollie'],
    [1, 0, 'Kickflip'],
    [0, 1, 'Pop shove-it'],
    [1, 1, 'Varial flip'],
    [1, 2, '360 flip'],
    [0, 2, '360 shove-it'],
    [2, 0, 'Double kickflip'],
    [2, 2, 'Double tre'],
    [2, 1, 'Unnamed (2 flips, 1 half shove)'],
    [0, 3, 'Unnamed (0 flips, 3 half shoves)'],
    [1, 4, 'Unnamed (1 flip, 4 half shoves)'],
  ])('(%i flips, %i half shoves) is %s', (flips, halfShoves, name) => {
    expect(nameFor(flips, halfShoves).name).toBe(name);
  });

  it('the default inputs are an ollie', () => {
    const r = resolveTrick(DEFAULT_INPUTS);
    expect(r.id).toBe('ollie');
    expect(r.landed).toBe(true);
  });
});

describe('tolerances and under/over detection', () => {
  it('lands within 30 degrees of flip and 25 degrees of shove', () => {
    expect(recognize(withTotals(390, 0)).landed).toBe(true);
    expect(recognize(withTotals(330, 205)).landed).toBe(true);
    expect(recognize(withTotals(391, 0)).landed).toBe(false);
    expect(recognize(withTotals(360, 206)).landed).toBe(false);
  });

  it('reports under-rotation on the flip axis with the signed error', () => {
    const r = recognize(withTotals(300, 0));
    expect(r.id).toBe('kickflip');
    expect(r.outcome).toBe('under-rotated');
    expect(r.failedAxis).toBe('flip');
    expect(r.failedBy).toBeCloseTo(-60, 10);
  });

  it('reports over-rotation on the shove axis', () => {
    const r = recognize(withTotals(360, 220));
    expect(r.id).toBe('varial-flip');
    expect(r.outcome).toBe('over-rotated');
    expect(r.failedAxis).toBe('shove');
    expect(r.failedBy).toBeCloseTo(40, 10);
  });

  it('blames the axis furthest past its tolerance when both fail', () => {
    const r = recognize(withTotals(300, 150)); // flip 30 past, shove 5 past
    expect(r.failedAxis).toBe('flip');
    const s = recognize(withTotals(330, 120)); // flip within, shove 35 past
    expect(s.failedAxis).toBe('shove');
    expect(s.outcome).toBe('under-rotated');
  });
});

describe('objectives', () => {
  it('a landed preset trick completes its objective once', () => {
    const r = resolveTrick(PRESETS[2]!.inputs);
    expect(newlyCompleted(r, [])).toEqual(['varial-flip']);
    expect(newlyCompleted(r, ['varial-flip'])).toEqual([]);
  });

  it('a bail or a non-preset trick completes nothing', () => {
    expect(newlyCompleted(resolveTrick({ ...PRESETS[0]!.inputs, pop: 0.15 }), [])).toEqual([]);
    expect(newlyCompleted(resolveTrick(DEFAULT_INPUTS), [])).toEqual([]);
  });
});

describe('snapInput', () => {
  it('snaps to the slider step and clamps to the range', () => {
    expect(snapInput('pop', 0.33)).toBe(0.35);
    expect(snapInput('pop', 0.05)).toBe(0.15);
    expect(snapInput('flick', 1.9000000001)).toBe(1.9);
    expect(snapInput('scoop', 4)).toBe(3);
  });
});
