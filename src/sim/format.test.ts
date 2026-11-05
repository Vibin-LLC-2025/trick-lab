import { describe, expect, it } from 'vitest';
import { computeFlight } from './flight';
import {
  degReadout,
  describeFeet,
  describeInputs,
  describeResult,
  describeScene,
  displayUnit,
  displayValue,
  footSteps,
  inputDirection,
  outcomeCard,
  STANCE_NOTE,
  valueText,
} from './format';
import { DEFAULT_INPUTS, recognize, resolveTrick } from './tricks';

const withTotals = (rollTotal: number, yawTotal: number) =>
  recognize({ ...computeFlight(DEFAULT_INPUTS), rollTotal, yawTotal });

describe('valueText', () => {
  it('speaks units in full words, with the direction after the magnitude (ADR-30)', () => {
    expect(valueText('pop', 0.35)).toBe('0.35 meters');
    expect(valueText('flick', 1.9)).toBe('1.9 revolutions per second, kickflip');
    expect(valueText('flick', -1.9)).toBe('1.9 revolutions per second, heelflip');
    expect(valueText('scoop', 1)).toBe('1 revolution per second, backside');
    expect(valueText('scoop', -0.9)).toBe('0.9 revolutions per second, frontside');
    expect(valueText('scoop', 0)).toBe('0 revolutions per second');
    expect(valueText('flick', -0)).toBe('0 revolutions per second');
  });
});

describe('slider readout (ADR-30)', () => {
  it('shows the magnitude, then the unit and the direction word; no word at 0.0', () => {
    const shown = (k: 'flick' | 'scoop', v: number) => `${displayValue(k, v)} ${displayUnit(k, v)}`;
    expect(shown('flick', 1.9)).toBe('1.9 rev/s kickflip');
    expect(shown('flick', -1.9)).toBe('1.9 rev/s heelflip');
    expect(shown('scoop', 0.9)).toBe('0.9 rev/s backside');
    expect(shown('scoop', -0.9)).toBe('0.9 rev/s frontside');
    expect(shown('flick', 0)).toBe('0.0 rev/s');
    expect(shown('scoop', -0)).toBe('0.0 rev/s');
    expect(displayValue('pop', 0.35)).toBe('0.35');
    expect(displayUnit('pop', 0.35)).toBe('m');
    expect(inputDirection('pop', 0.35)).toBe('');
  });

  it('names both rates in a sentence, the direction first', () => {
    expect(describeInputs({ pop: 0.35, flick: -1.9, scoop: -0.9 })).toBe(
      'pop 0.35 meters, heelflip flick 1.9 revolutions per second, frontside scoop 0.9 revolutions per second',
    );
    expect(describeInputs({ pop: 0.35, flick: 0, scoop: 0 })).toBe('pop 0.35 meters, flick 0 revolutions per second, scoop 0 revolutions per second');
  });
});

describe('signed degree readouts (ADR-30)', () => {
  it('shows the magnitude with the direction word, none at 0', () => {
    expect(degReadout('flip', 365)).toEqual({ value: '365°', dir: 'kickflip' });
    expect(degReadout('flip', -365)).toEqual({ value: '365°', dir: 'heelflip' });
    expect(degReadout('shove', 173)).toEqual({ value: '173°', dir: 'backside' });
    expect(degReadout('shove', -173)).toEqual({ value: '173°', dir: 'frontside' });
    expect(degReadout('shove', 0)).toEqual({ value: '0°', dir: '' });
    expect(degReadout('flip', -0.4)).toEqual({ value: '0°', dir: '' });
  });
});

describe('announcer text', () => {
  it('matches the brief example for a kickflip, with the direction of each axis', () => {
    expect(describeResult(resolveTrick({ pop: 0.35, flick: 1.9, scoop: 0 }))).toBe(
      'Kickflip landed. 365 degrees of kickflip, 0 degrees of shove, 0.53 seconds in the air.',
    );
  });

  it('reads the mirror tricks naturally', () => {
    expect(describeResult(resolveTrick({ pop: 0.35, flick: -1.9, scoop: -0.9 }))).toBe(
      'Varial heelflip landed. 365 degrees of heelflip, 173 degrees of frontside shove, 0.53 seconds in the air.',
    );
    expect(describeResult(resolveTrick({ pop: 0.15, flick: -1.9, scoop: 0 }))).toBe(
      'Heelflip not landed: flip under-rotated by 121 degrees. 239 degrees of heelflip, 0 degrees of shove, 0.35 seconds in the air.',
    );
  });
});

describe('outcome card copy (DESIGN.md section 4)', () => {
  it('landed', () => {
    expect(outcomeCard(withTotals(365, 0))).toEqual({
      name: 'Kickflip landed',
      detail: '365 deg kickflip, 0 deg shove, 0.53 s in the air.',
    });
  });

  it('landed mirror tricks name each direction', () => {
    expect(outcomeCard(withTotals(-365, -173))).toEqual({
      name: 'Varial heelflip landed',
      detail: '365 deg heelflip, 173 deg frontside shove, 0.53 s in the air.',
    });
    expect(outcomeCard(withTotals(365, -173)).detail).toBe('365 deg kickflip, 173 deg frontside shove, 0.53 s in the air.');
  });

  it('under and over read against the direction of rotation for a heelflip and a frontside shove', () => {
    expect(outcomeCard(withTotals(-312, 0))).toEqual({
      name: 'Heelflip not landed',
      detail: 'Under-rotated by 48 deg of flip. More flick or more pop gives it time.',
    });
    expect(outcomeCard(withTotals(-408, 0)).detail).toBe('Over-rotated by 48 deg of flip. Ease the flick a little.');
    expect(outcomeCard(withTotals(0, -211))).toEqual({
      name: 'Frontside pop shove-it not landed',
      detail: 'Over-rotated by 31 deg of shove. Ease the scoop a little.',
    });
    expect(outcomeCard(withTotals(-320, -208)).detail).toBe('Under-rotated 40 deg of flip, over-rotated 28 deg of shove.');
  });

  it('ollie', () => {
    expect(outcomeCard(withTotals(0, 0)).detail).toBe('No rotation, 0.53 s in the air. Add flick or scoop to try a trick.');
    // Totals that round to 0 still read as no rotation.
    expect(outcomeCard(withTotals(0.4, -0.4)).detail).toBe('No rotation, 0.53 s in the air. Add flick or scoop to try a trick.');
  });

  it('an ollie inside the tolerances that turned shows its degrees, never "No rotation" (audit fix, 2026-11-04)', () => {
    expect(outcomeCard(withTotals(19, 19))).toEqual({
      name: 'Ollie landed',
      detail: '19 deg kickflip, 19 deg backside shove, 0.53 s in the air.',
    });
    expect(outcomeCard(withTotals(-19, -19)).detail).toBe('19 deg heelflip, 19 deg frontside shove, 0.53 s in the air.');
    // One axis alone is enough to drop the phrase.
    expect(outcomeCard(withTotals(0, -12)).detail).toBe('0 deg flip, 12 deg frontside shove, 0.53 s in the air.');
    expect(outcomeCard(withTotals(7, 0)).detail).toBe('7 deg kickflip, 0 deg shove, 0.53 s in the air.');
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

describe('feet in words', () => {
  it('describes the stance from the inputs', () => {
    expect(describeFeet({ pop: 0.35, flick: 0, scoop: 0 })).toBe('Front foot across the board just behind the front bolts; back foot on its ball across the tail, heel up.');
    expect(describeFeet({ pop: 0.35, flick: 1.9, scoop: 0.9 })).toBe(
      'Front foot just behind the front bolts, turned 39 degrees toward the nose with the heel over the heel-side edge; back foot on its ball across the tail, toes toward the toe-side edge to scoop.',
    );
  });

  it('follows the flight: in the air, then on the bolts or bailed', () => {
    const base = { pop: 0.35, flick: 1.9, scoop: 0, result: null, feetVisible: true };
    const landed = computeFlight({ pop: 0.35, flick: 1.9, scoop: 0 });
    const bailed = computeFlight({ pop: 0.15, flick: 1.9, scoop: 0 });
    expect(describeScene({ ...base, status: 'idle', progress: 0, flight: null })).toContain('Front foot just behind the front bolts, turned 42 degrees');
    expect(describeScene({ ...base, status: 'playing', progress: 0.4, flight: landed })).toContain('Feet in the air above the board.');
    expect(describeScene({ ...base, status: 'done', progress: 1, flight: landed })).toContain('Feet landed on the bolts.');
    expect(describeScene({ ...base, status: 'done', progress: 1, flight: bailed })).toContain('a bail.');
    expect(describeScene({ ...base, feetVisible: false, status: 'idle', progress: 0, flight: null })).not.toContain('foot');
  });
});

describe('the last trick in the scene description (audit fix, 2026-11-04)', () => {
  const base = { pop: 0.35, flick: 1.9, scoop: 0, feetVisible: true };
  const flight = computeFlight({ pop: 0.35, flick: 1.9, scoop: 0 });
  const first = recognize(flight);

  it('says no trick before the first pop', () => {
    expect(describeScene({ ...base, status: 'idle', progress: 0, flight: null, result: null })).toMatch(/No trick popped yet\.$/);
  });

  it('a popped flight without a result is waiting to land, playing or paused', () => {
    for (const status of ['playing', 'paused'] as const) {
      const text = describeScene({ ...base, status, progress: 0.4, flight, result: null });
      expect(text).toMatch(/Waiting for this trick to land\.$/);
      expect(text).not.toContain('No trick popped yet');
    }
  });

  it('a second pop after a landed trick is waiting too, then reads the new result', () => {
    expect(describeScene({ ...base, status: 'done', progress: 1, flight, result: first })).toContain('Last trick: Kickflip landed.');
    const second = computeFlight({ pop: 0.35, flick: 0, scoop: 0.9 });
    expect(describeScene({ ...base, status: 'playing', progress: 0.1, flight: second, result: null })).toMatch(/Waiting for this trick to land\.$/);
    expect(describeScene({ ...base, status: 'done', progress: 1, flight: second, result: recognize(second) })).toContain(
      'Last trick: Pop shove-it landed.',
    );
  });
});

describe('stance in words (ADR-24, ADR-25)', () => {
  const base = { pop: 0.35, flick: 1.9, scoop: 0, result: null, status: 'idle' as const, progress: 0, flight: null };

  it('says goofy by default, with the nose to the right and the shove counterclockwise', () => {
    const text = describeScene(base);
    expect(text).toContain('Goofy stance, nose to the right, heel side toward the camera.');
    expect(text).toContain('counterclockwise seen from above');
    expect(describeScene({ ...base, stance: 'goofy' })).toBe(text);
  });

  it('says regular with the nose to the left and the shove clockwise; the flick direction reads the same', () => {
    const text = describeScene({ ...base, stance: 'regular' });
    expect(text).toContain('Regular stance, nose to the left, heel side toward the camera.');
    expect(text).toContain('scoop swings the tail behind the heels for backside, clockwise seen from above');
    expect(text).toContain('Flick rolls the grip toward the heel side');
    expect(text).not.toContain('Goofy');
    // The feet are described relative to the rider, so the stance words do not change them.
    expect(text).toContain('turned 42 degrees toward the nose with the heel over the heel-side edge');
  });
});

describe('both directions in words (ADR-30)', () => {
  it('names both flip directions and both shove directions in each stance', () => {
    expect(STANCE_NOTE.goofy).toBe(
      'Goofy stance, nose to the right, heel side toward the camera. Flick rolls the grip toward the heel side for a kickflip, toward the toe side for a heelflip; scoop swings the tail behind the heels for backside, counterclockwise seen from above, and in front of the toes for frontside, clockwise.',
    );
    expect(STANCE_NOTE.regular).toContain('behind the heels for backside, clockwise seen from above, and in front of the toes for frontside, counterclockwise.');
  });

  it('describes the heelflip and frontside setups', () => {
    expect(describeFeet({ pop: 0.35, flick: -1.9, scoop: 0 })).toBe(
      'Front foot across the board just behind the front bolts, toes hanging over the toe-side edge for a heelflip; back foot on its ball across the tail, heel up.',
    );
    expect(describeFeet({ pop: 0.35, flick: 0, scoop: -0.9 })).toBe(
      'Front foot across the board just behind the front bolts; back foot on its ball toward the heel side of the tail, to scoop frontside.',
    );
  });
});

describe('foot steps (DESIGN.md 8.5)', () => {
  const steps = (pop: number, flick: number, scoop: number) => footSteps({ flight: null, pop, flick, scoop });
  const texts = (pop: number, flick: number, scoop: number) => steps(pop, flick, scoop).map((x) => x.text);

  it('scripts a kickflip in order: pop, slide, flick forward out and up, lift, land on the bolts', () => {
    expect(texts(0.35, 1.9, 0)).toEqual([
      'Back foot snaps the tail down off the ball of the foot: the pop.',
      'Front foot drags up the grip on its outside edge toward the nose, 10 cm.',
      'Front foot flicks forward, out and up off the heel-side corner of the nose, 19 cm.',
      'Both feet lift 8 cm clear while the board turns under them.',
      'Both feet come back over the bolts and land on the grip.',
    ]);
  });

  it('keeps an ollie on the board and adds the scoop for a shove-it', () => {
    expect(texts(0.35, 0, 0)).toContain('Both feet stay on the board as it levels out and rises with them.');
    expect(texts(0.35, 0, 0).some((t) => t.includes('flicks'))).toBe(false);
    expect(texts(0.35, 0, 0.9)).toContain('Back foot scoops the tail back behind the heels, 9 cm toward the heel side.');
  });

  it('shows bad inputs: a weak flick barely reaches the rail, a low pop bails', () => {
    expect(texts(0.35, 0.4, 0)).toContain('Front foot flicks off the heel-side corner of the nose, but only 4 cm: it barely reaches the rail.');
    expect(texts(0.15, 1.9, 1.9).at(-1)).toBe('The board does not come round in time: both feet step off to the heel side, a bail.');
    expect(texts(0.35, 0, 3)).toContain('Back foot scoops the tail back behind the heels, 25 cm toward the heel side, as hard as it goes.');
  });

  it('scripts a heelflip: a shorter slide, then the kick off the toe-side corner, heel last', () => {
    expect(texts(0.35, -1.9, 0)).toEqual([
      'Back foot snaps the tail down off the ball of the foot: the pop.',
      'Front foot slides up the grip toward the nose, 8 cm.',
      'Front foot kicks forward and out off the toe-side corner of the nose, heel last, 27 cm.',
      'Both feet lift 8 cm clear while the board turns under them.',
      'Both feet come back over the bolts and land on the grip.',
    ]);
    expect(texts(0.35, -0.4, 0)).toContain('Front foot kicks off the toe-side corner of the nose, but only 6 cm: it barely reaches the rail.');
    expect(texts(0.15, -1.9, 0).at(-1)).toBe('The board does not come round in time: both feet step off to the heel side, a bail.');
  });

  it('scripts the frontside scoop forward in front of the toes, and composes a hardflip', () => {
    expect(texts(0.35, 0, -0.9)).toContain('Back foot slices the tail forward in front of the toes, 9 cm toward the toe side.');
    expect(texts(0.35, 0, -3)).toContain('Back foot slices the tail forward in front of the toes, 25 cm toward the toe side, as hard as it goes.');
    const hard = texts(0.35, 1.9, -0.9);
    expect(hard).toContain('Back foot slices the tail forward in front of the toes, 9 cm toward the toe side.');
    expect(hard.some((t) => t.startsWith('Front foot flicks forward, out and up off the heel-side corner'))).toBe(true);
  });

  it('follows the flight on screen, not the live sliders, and times every step inside the airtime', () => {
    const flight = computeFlight({ pop: 0.35, flick: 0, scoop: 0.9 });
    const shown = footSteps({ flight, pop: 0.35, flick: 1.9, scoop: 0 });
    expect(shown.some((x) => x.text.includes('scoops'))).toBe(true);
    expect(shown.some((x) => x.text.includes('flicks'))).toBe(false);
    for (const x of shown) {
      expect(x.start).toBeGreaterThanOrEqual(0);
      expect(x.end).toBeLessThanOrEqual(1);
      expect(x.end).toBeGreaterThan(x.start);
    }
  });
});
