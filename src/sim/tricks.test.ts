import { describe, expect, it } from 'vitest';
import { computeFlight } from './flight';
import {
  DEFAULT_INPUTS,
  gradeOf,
  isLanded,
  isUnderRotated,
  newlyCompleted,
  presetById,
  nameFor,
  OBJECTIVES,
  PRESETS,
  recognize,
  resolveTrick,
  sketchAmount,
  sketchOf,
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
    expect(resolveTrick(presetById('kickflip').inputs).rollTotal).toBeCloseTo(365, 0);
    expect(resolveTrick(presetById('pop-shove-it').inputs).yawTotal).toBeCloseTo(173, 0);
    expect(resolveTrick(presetById('360-flip').inputs).yawTotal).toBeCloseTo(365, 0);
    // The mirrors (ADR-30): the same magnitudes, the other sign.
    expect(resolveTrick(presetById('heelflip').inputs).rollTotal).toBeCloseTo(-365, 0);
    expect(resolveTrick(presetById('frontside-pop-shove-it').inputs).yawTotal).toBeCloseTo(-173, 0);
  });

  it('a mirror preset bails the same way as its original: under-rotated, by the same amount, signed the other way', () => {
    const pairs = [
      ['kickflip', 'heelflip'],
      ['pop-shove-it', 'frontside-pop-shove-it'],
      ['varial-flip', 'varial-heelflip'],
    ] as const;
    for (const [a, b] of pairs) {
      const ra = resolveTrick({ ...presetById(a).inputs, pop: 0.15 });
      const rb = resolveTrick({ ...presetById(b).inputs, pop: 0.15 });
      expect(rb.outcome).toBe('under-rotated');
      expect(rb.failedAxis).toBe(ra.failedAxis);
      expect(rb.failedBy).toBeCloseTo(-ra.failedBy, 10);
    }
  });

  it('the bonus is reachable: a kickflip lands at pop 0.20 m with more flick', () => {
    const r = resolveTrick({ pop: 0.2, flick: 2.5, scoop: 0 });
    expect(r.id).toBe('kickflip');
    expect(r.landed).toBe(true);
  });

  it('keys 1 to 7 map to the presets in order (the hardflip was 7 until ADR-41)', () => {
    expect(PRESETS.map((p) => p.key)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(PRESETS.map((p) => [p.label, p.inputs.flick, p.inputs.scoop])).toEqual([
      ['Kickflip', 1.9, 0],
      ['Heelflip', -1.9, 0],
      ['Pop shove-it', 0, 0.9],
      ['Frontside shove-it', 0, -0.9],
      ['Varial flip', 1.9, 0.9],
      ['Varial heelflip', -1.9, -0.9],
      ['360 flip', 1.9, 1.9],
    ]);
    expect(OBJECTIVES.map((o) => o.label)).toEqual([
      'Land a kickflip',
      'Land a heelflip',
      'Land a pop shove-it',
      'Land a frontside shove-it',
      'Land a varial flip',
      'Land a varial heelflip',
      'Land a 360 flip',
    ]);
  });
});

describe('naming table', () => {
  it.each([
    [0, 0, 'ollie', 'Ollie'],
    [1, 0, 'kickflip', 'Kickflip'],
    [-1, 0, 'heelflip', 'Heelflip'],
    [2, 0, 'double-kickflip', 'Double kickflip'],
    [-2, 0, 'double-heelflip', 'Double heelflip'],
    [0, 1, 'pop-shove-it', 'Pop shove-it'],
    [0, -1, 'frontside-pop-shove-it', 'Frontside pop shove-it'],
    [0, 2, '360-shove-it', '360 shove-it'],
    [0, -2, 'frontside-360-shove-it', 'Frontside 360 shove-it'],
    [1, 1, 'varial-flip', 'Varial flip'],
    // ADR-41 (2026-11-05): no longer named the hardflip and the 360 hardflip.
    [1, -1, 'unnamed', 'Unnamed (1 kickflip, 1 frontside half shove)'],
    [-1, -1, 'varial-heelflip', 'Varial heelflip'],
    [-1, 1, 'inward-heelflip', 'Inward heelflip'],
    [1, 2, '360-flip', '360 flip'],
    [1, -2, 'unnamed', 'Unnamed (1 kickflip, 2 frontside half shoves)'],
    [-1, -2, 'laser-flip', 'Laser flip'],
    [-1, 2, '360-inward-heelflip', '360 inward heelflip'],
    [2, 2, 'double-tre', 'Double tre'],
    [2, 1, 'unnamed', 'Unnamed (2 kickflips, 1 backside half shove)'],
    [-2, -1, 'unnamed', 'Unnamed (2 heelflips, 1 frontside half shove)'],
    [0, 3, 'unnamed', 'Unnamed (0 flips, 3 backside half shoves)'],
    [1, 4, 'unnamed', 'Unnamed (1 kickflip, 4 backside half shoves)'],
    [-1, -4, 'unnamed', 'Unnamed (1 heelflip, 4 frontside half shoves)'],
    [-3, 0, 'unnamed', 'Unnamed (3 heelflips, 0 half shoves)'],
    [-2, 2, 'unnamed', 'Unnamed (2 heelflips, 2 backside half shoves)'],
  ])('(%i flips, %i half shoves) is %s, %s', (flips, halfShoves, id, name) => {
    expect(nameFor(flips, halfShoves)).toEqual({ id, name });
  });

  it('names the signed flight: negative flick is a heelflip, negative scoop frontside', () => {
    expect(recognize(withTotals(-365, 0)).id).toBe('heelflip');
    expect(recognize(withTotals(365, -173)).name).toBe('Unnamed (1 kickflip, 1 frontside half shove)');
    expect(recognize(withTotals(-365, 173)).id).toBe('inward-heelflip');
    expect(recognize(withTotals(-365, -365)).id).toBe('laser-flip');
    expect(resolveTrick({ pop: 0.35, flick: -1.9, scoop: 1.9 }).id).toBe('360-inward-heelflip');
    expect(resolveTrick({ pop: 0.35, flick: 1.9, scoop: -1.9 }).name).toBe('Unnamed (1 kickflip, 2 frontside half shoves)');
    expect(resolveTrick({ pop: 0.35, flick: 0, scoop: -1.9 }).id).toBe('frontside-360-shove-it');
    expect(resolveTrick({ pop: 0.35, flick: -3, scoop: 0 }).id).toBe('double-heelflip');
  });

  it('rounds symmetrically: half a turn either way is a whole turn, and nothing names itself -0', () => {
    expect(recognize(withTotals(180, 0)).flips).toBe(1);
    expect(recognize(withTotals(-180, 0)).flips).toBe(-1);
    expect(recognize(withTotals(0, -90)).halfShoves).toBe(-1);
    const small = recognize(withTotals(-10, -10));
    expect(Object.is(small.flips, 0)).toBe(true);
    expect(Object.is(small.halfShoves, 0)).toBe(true);
    expect(small.id).toBe('ollie');
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

  it('decides under or over against the direction of rotation, keeping the signed error', () => {
    // Short of a heelflip: -300 is 60 short of -360, the error is +60.
    const short = recognize(withTotals(-300, 0));
    expect(short.id).toBe('heelflip');
    expect(short.outcome).toBe('under-rotated');
    expect(short.failedBy).toBeCloseTo(60, 10);
    // Past a heelflip: -420 is 60 past -360, the error is -60.
    const past = recognize(withTotals(-420, 0));
    expect(past.outcome).toBe('over-rotated');
    expect(past.failedBy).toBeCloseTo(-60, 10);
    // Short and past of a frontside half shove.
    expect(recognize(withTotals(0, -150)).outcome).toBe('under-rotated');
    expect(recognize(withTotals(0, -210)).outcome).toBe('over-rotated');
    // Rotation that rounds to no turn at all is past it, either way.
    expect(recognize(withTotals(-40, 0)).outcome).toBe('over-rotated');
    expect(recognize(withTotals(40, 0)).outcome).toBe('over-rotated');
  });

  it('isUnderRotated is a magnitude test against the nearest turn', () => {
    expect(isUnderRotated(300, 360)).toBe(true);
    expect(isUnderRotated(-300, 360)).toBe(true);
    expect(isUnderRotated(420, 360)).toBe(false);
    expect(isUnderRotated(-420, 360)).toBe(false);
    expect(isUnderRotated(-150, 180)).toBe(true);
    expect(isUnderRotated(-20, 180)).toBe(false);
  });

  it('lands a heelflip within the same tolerances as a kickflip', () => {
    expect(recognize(withTotals(-390, 0)).landed).toBe(true);
    expect(recognize(withTotals(-330, -205)).landed).toBe(true);
    expect(recognize(withTotals(-391, 0)).landed).toBe(false);
    expect(recognize(withTotals(-360, -206)).landed).toBe(false);
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
    const r = resolveTrick(presetById('varial-flip').inputs);
    expect(newlyCompleted(r, [])).toEqual(['varial-flip']);
    expect(newlyCompleted(r, ['varial-flip'])).toEqual([]);
  });

  it('a landed mirror trick completes its own objective, not the original', () => {
    expect(newlyCompleted(resolveTrick(presetById('heelflip').inputs), ['kickflip'])).toEqual(['heelflip']);
    expect(newlyCompleted(resolveTrick(presetById('frontside-pop-shove-it').inputs), ['pop-shove-it'])).toEqual(['frontside-pop-shove-it']);
    // An inward heelflip is not a preset: it lands but completes nothing.
    const inward = resolveTrick({ pop: 0.35, flick: -1.9, scoop: 0.9 });
    expect(inward.id).toBe('inward-heelflip');
    expect(inward.landed).toBe(true);
    expect(newlyCompleted(inward, [])).toEqual([]);
    // Nor does the kickflip with a frontside scoop, the hardflip preset until ADR-41: it still lands, unnamed.
    const kickFs = resolveTrick({ pop: 0.35, flick: 1.9, scoop: -0.9 });
    expect(kickFs.id).toBe('unnamed');
    expect(kickFs.landed).toBe(true);
    expect(newlyCompleted(kickFs, [])).toEqual([]);
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

  it('snaps negatives to the same grid and clamps at -3', () => {
    expect(snapInput('flick', -1.9000000001)).toBe(-1.9);
    expect(snapInput('flick', -1.94)).toBe(-1.9);
    expect(snapInput('scoop', -0.86)).toBe(-0.9);
    expect(snapInput('scoop', -4)).toBe(-3);
    expect(snapInput('flick', -3)).toBe(-3);
  });

  it('never returns -0', () => {
    for (const v of [-0, -0.04, -0.0000001, 0.04, 1e-12, -1e-12]) {
      expect(Object.is(snapInput('flick', v), 0)).toBe(true);
      expect(Object.is(snapInput('scoop', v), 0)).toBe(true);
    }
  });

  it('every grid value from -3 to 3 snaps to itself', () => {
    for (let i = -30; i <= 30; i++) {
      const v = Number((i / 10).toFixed(1)) + 0;
      expect(snapInput('flick', v)).toBe(v);
    }
  });
});

describe('graded landings (ADR-63)', () => {
  it('every preset lands clean at pop 0.35 m and bails at 0.15 m', () => {
    for (const p of PRESETS) {
      expect(resolveTrick(p.inputs).grade, p.id).toBe('clean');
      expect(resolveTrick({ ...p.inputs, pop: 0.15 }).grade, p.id).toBe('bail');
    }
  });

  it('clean is inside 10 degrees of flip and 8 of shove; sketchy is the rest of a landing; isLanded is unchanged', () => {
    const at = (rollTotal: number, yawTotal: number) => recognize({ ...computeFlight({ pop: 0.35, flick: 0, scoop: 0 }), rollTotal, yawTotal });
    expect(at(370, 0)).toMatchObject({ landed: true, grade: 'clean' });
    expect(at(370.1, 0)).toMatchObject({ landed: true, grade: 'sketchy' });
    expect(at(390, 0)).toMatchObject({ landed: true, grade: 'sketchy' });
    expect(at(390.1, 0)).toMatchObject({ landed: false, grade: 'bail' });
    expect(at(0, 188)).toMatchObject({ landed: true, grade: 'clean' });
    expect(at(0, 188.1)).toMatchObject({ landed: true, grade: 'sketchy' });
    expect(at(0, 205)).toMatchObject({ landed: true, grade: 'sketchy' });
    expect(at(0, 205.1)).toMatchObject({ landed: false, grade: 'bail' });
    // Either axis outside its clean limit makes it sketchy; mirrors grade the same.
    expect(at(-350, -172).grade).toBe('clean');
    expect(at(-349, -172).grade).toBe('sketchy');
    expect(at(-350, -171).grade).toBe('sketchy');
    for (const [roll, yaw] of [[365, 0], [378, 0], [395, 0], [0, 200], [0, 206]] as const) {
      expect(at(roll, yaw).landed).toBe(isLanded(roll, yaw));
      expect(gradeOf(roll, yaw) !== 'bail').toBe(isLanded(roll, yaw));
    }
  });

  it('how sketchy runs from 0 at the clean limit to 1 at the edge of landing, and names the worse axis', () => {
    expect(sketchAmount(370, 0)).toBe(0);
    expect(sketchAmount(380, 0)).toBeCloseTo(0.5, 10);
    expect(sketchAmount(390, 0)).toBeCloseTo(1, 10);
    expect(sketchAmount(0, 196.5)).toBeCloseTo(0.5, 10);
    expect(sketchAmount(400, 0)).toBe(0);
    const at = (rollTotal: number, yawTotal: number) => recognize({ ...computeFlight({ pop: 0.35, flick: 0, scoop: 0 }), rollTotal, yawTotal });
    expect(sketchOf(at(365, 0))).toBeNull();
    expect(sketchOf(at(395, 0))).toBeNull();
    expect(sketchOf(at(378, 0))).toEqual({ axis: 'flip', by: 18, short: false });
    expect(sketchOf(at(345, 0))).toEqual({ axis: 'flip', by: 15, short: true });
    expect(sketchOf(at(-345, 0))).toEqual({ axis: 'flip', by: 15, short: true });
    expect(sketchOf(at(372, 200))).toEqual({ axis: 'shove', by: 20, short: false });
  });
});
