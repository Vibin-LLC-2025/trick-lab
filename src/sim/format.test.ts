import { describe, expect, it } from 'vitest';
import { CATCH } from './feet';
import { computeFlight, PHASE } from './flight';
import {
  describeAttempt,
  missWhy,
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
  spinReadout,
  STANCE_NOTE,
  valueText,
} from './format';
import { DEFAULT_INPUTS, PRESETS, recognize, resolveTrick } from './tricks';

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
      'Kickflip landed clean. 365 degrees of kickflip, 0 degrees of shove, 0.53 seconds in the air.',
    );
  });

  it('reads the mirror tricks naturally', () => {
    expect(describeResult(resolveTrick({ pop: 0.35, flick: -1.9, scoop: -0.9 }))).toBe(
      'Varial heelflip landed clean. 365 degrees of heelflip, 173 degrees of frontside shove, 0.53 seconds in the air.',
    );
    expect(describeResult(resolveTrick({ pop: 0.15, flick: -1.9, scoop: 0 }))).toBe(
      'Heelflip not landed: flip under-rotated by 121 degrees. 239 degrees of heelflip, 0 degrees of shove, 0.35 seconds in the air.',
    );
  });
});

describe('graded landings in words (ADR-63)', () => {
  it('says clean, or sketchy with the axis, the degrees and which way', () => {
    expect(describeResult(withTotals(365, 0))).toMatch(/^Kickflip landed clean\. /);
    // 18 past a whole flip: landed (inside 30), not clean (outside 10).
    expect(describeResult(withTotals(378, 0))).toBe('Kickflip landed, sketchy: 18 degrees past on the flip. 378 degrees of kickflip, 0 degrees of shove, 0.53 seconds in the air.');
    expect(describeResult(withTotals(-345, 0))).toMatch(/^Heelflip landed, sketchy: 15 degrees short on the flip\. /);
    expect(describeResult(withTotals(0, 168))).toMatch(/^Pop shove-it landed, sketchy: 12 degrees short on the shove\. /);
    // Both axes off: the one further past its clean limit is named.
    expect(describeResult(withTotals(372, 200))).toMatch(/^Varial flip landed, sketchy: 20 degrees past on the shove\. /);
    expect(describeResult(withTotals(395, 0))).toMatch(/^Kickflip not landed: /);
  });

  it('the card names the miss and what to change', () => {
    expect(outcomeCard(withTotals(378, 0))).toEqual({ name: 'Kickflip landed, sketchy', detail: '18 deg past on the flip. Ease the flick a little.' });
    expect(outcomeCard(withTotals(0, -168))).toEqual({
      name: 'Frontside pop shove-it landed, sketchy',
      detail: '12 deg short on the shove. More scoop or more pop gives it time.',
    });
    // An ollie that turned too far to be clean.
    expect(outcomeCard(withTotals(19, 19))).toEqual({ name: 'Ollie landed, sketchy', detail: '19 deg past on the shove. Ease the scoop a little.' });
  });

  it('the feet and the foot steps say a sketchy landing is off the bolts', () => {
    const sketchy = { ...computeFlight(DEFAULT_INPUTS), rollTotal: 378, rollTarget: 360, yawTotal: 0, yawTarget: 0, landed: true };
    const base = { pop: 0.35, flick: 2, scoop: 0 };
    expect(describeScene({ ...base, status: 'done', progress: 1, flight: sketchy, result: recognize(sketchy) })).toContain(
      'Feet landed off the bolts, toward the middle: a sketchy landing.',
    );
    expect(footSteps({ ...base, flight: sketchy }).at(-1)!.text).toBe('Both feet ride the board down, but come down off the bolts, toward the middle: a sketchy landing.');
    const clean = computeFlight({ pop: 0.35, flick: 1.9, scoop: 0 });
    expect(footSteps({ ...base, flight: clean }).at(-1)!.text).toBe('Both feet ride the board down over the bolts and land on the grip.');
  });
});

describe('a miss in a game, told against the trick in play (2026-11-13)', () => {
  const kickflip = { id: 'kickflip' as const, name: 'Kickflip', flips: 1, halfShoves: 0 };
  it('says how far short of the called trick a bail is, not the trick it came nearest to', () => {
    const r = recognize(computeFlight({ pop: 0.35, flick: 0.7, scoop: 0 }));
    expect(r.landed).toBe(false);
    expect(describeResult(r)).toMatch(/^Ollie not landed: flip over-rotated/);
    expect(describeAttempt(r, kickflip)).toMatch(/^Kickflip not landed: \d+ degrees short on the flip\. /);
  });
  it('is the plain result for a landing, and with no trick in play', () => {
    const landed = recognize(computeFlight({ pop: 0.35, flick: 1.9, scoop: 0 }));
    expect(describeAttempt(landed, kickflip)).toBe(describeResult(landed));
    const bail = recognize(computeFlight({ pop: 0.35, flick: 0.95, scoop: 0 }));
    expect(describeAttempt(bail, null)).toBe(describeResult(bail));
  });
});

describe('why a go missed, for its notice (ADR-105, the review A13)', () => {
  const kickflip = { id: 'kickflip' as const, name: 'Kickflip', flips: 1, halfShoves: 0 };
  const bail = recognize(computeFlight({ pop: 0.35, flick: 1.0, scoop: 0 }));
  it('names the release and what to change, then how far the trick missed', () => {
    expect(missWhy(bail, kickflip, { missMs: -120, percent: 14 })).toMatch(/^Early: 14 percent less spin, \d+ degrees short on the flip\. Press Pop! a little later\.$/);
    expect(missWhy(bail, kickflip, { missMs: 80, percent: 9 })).toMatch(/^Late: 9 percent more spin, .* Press Pop! a little earlier\.$/);
  });
  it('says it was the sliders when the release was in the band, and only the miss for an exact pop', () => {
    expect(missWhy(bail, kickflip, { missMs: 0, percent: 0 })).toMatch(/^In the band, so it was the sliders: \d+ degrees short on the flip\.$/);
    expect(missWhy(bail, kickflip, null)).toMatch(/^\d+ degrees short on the flip\.$/);
  });
  it('says a sketchy landing does not count on Hard', () => {
    const sketchy = recognize(computeFlight({ pop: 0.35, flick: 2.0, scoop: 0 }));
    expect(sketchy.grade).toBe('sketchy');
    expect(missWhy(sketchy, kickflip, null, true)).toMatch(/^Sketchy: .*, and only clean counts on Hard\.$/);
  });
});

describe('outcome card copy (DESIGN.md section 4)', () => {
  it('landed', () => {
    expect(outcomeCard(withTotals(365, 0))).toEqual({
      name: 'Kickflip landed clean',
      detail: '365 deg kickflip, 0 deg shove, 0.53 s in the air.',
    });
  });

  it('landed mirror tricks name each direction', () => {
    expect(outcomeCard(withTotals(-365, -173))).toEqual({
      name: 'Varial heelflip landed clean',
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
    expect(outcomeCard(withTotals(9, 7))).toEqual({
      name: 'Ollie landed clean',
      detail: '9 deg kickflip, 7 deg backside shove, 0.53 s in the air.',
    });
    expect(outcomeCard(withTotals(-9, -7)).detail).toBe('9 deg heelflip, 7 deg frontside shove, 0.53 s in the air.');
    // One axis alone is enough to drop the phrase.
    expect(outcomeCard(withTotals(0, -7)).detail).toBe('0 deg flip, 7 deg frontside shove, 0.53 s in the air.');
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
    // After the catch (ADR-36) the feet are on the board, riding it down; a bail is not.
    expect(describeScene({ ...base, status: 'paused', progress: PHASE.catch.end, flight: landed })).toContain('Feet on the board, riding it down.');
    expect(describeScene({ ...base, status: 'paused', progress: 0.9, flight: bailed })).toContain('Feet in the air above the board.');
    expect(describeScene({ ...base, status: 'done', progress: 1, flight: landed })).toContain('Feet landed on the bolts.');
    expect(describeScene({ ...base, status: 'done', progress: 1, flight: bailed })).toContain('a bail.');
    expect(describeScene({ ...base, feetVisible: false, status: 'idle', progress: 0, flight: null })).not.toContain('foot');
  });
});

// ADR-37 (2026-11-05): one sentence about the legs, only with the feet.
describe('the legs in the scene description', () => {
  const base = { pop: 0.35, flick: 1.9, scoop: 0, result: null, feetVisible: true };
  const landed = computeFlight({ pop: 0.35, flick: 1.9, scoop: 0 });

  it('says crouched, tucked, catching and absorbing after the feet', () => {
    const idle = describeScene({ ...base, status: 'idle', progress: 0, flight: null });
    expect(idle).toContain('Legs crouched, knees bent, ready to pop.');
    expect(idle.indexOf('Legs crouched')).toBeGreaterThan(idle.indexOf('Front foot'));
    expect(describeScene({ ...base, status: 'playing', progress: 0.4, flight: landed })).toContain('Knees tucked up in the air.');
    expect(describeScene({ ...base, status: 'paused', progress: 0.7, flight: landed })).toContain('Legs reach down to catch the board.');
    expect(describeScene({ ...base, status: 'done', progress: 1, flight: landed })).toContain('Knees bent, absorbing the landing.');
  });

  it('says nothing about legs when they or the feet are hidden', () => {
    expect(describeScene({ ...base, legsVisible: false, status: 'idle', progress: 0, flight: null })).not.toMatch(/Legs|Knees/);
    expect(describeScene({ ...base, feetVisible: false, status: 'idle', progress: 0, flight: null })).not.toMatch(/Legs|Knees/);
  });

  it('adds what the whole body does after the legs when the rider shows (ADR-85), and nothing about it otherwise', () => {
    const idle = describeScene({ ...base, riderShown: true, status: 'idle', progress: 0, flight: null });
    expect(idle).toContain('Legs crouched, knees bent, ready to pop. The rider crouches over the board, arms low, eyes on the board.');
    expect(describeScene({ ...base, riderShown: true, status: 'playing', progress: 0.4, flight: landed })).toContain('Arms out for balance, the rider watches the board below.');
    expect(describeScene({ ...base, riderShown: true, status: 'done', progress: 1, flight: landed })).toContain('The rider rides it out, body folded and arms low.');
    expect(describeScene({ ...base, status: 'idle', progress: 0, flight: null })).not.toContain('The rider');
    expect(describeScene({ ...base, riderShown: true, legsVisible: false, status: 'idle', progress: 0, flight: null })).not.toContain('The rider');
  });

  it("says the rider rides along before a game's wind-up (ADR-86), and crouches once it winds up or with the legs alone", () => {
    const riding = 'Knees a little bent, riding along. The rider rides along, standing tall, arms loose, looking ahead past the nose.';
    expect(describeScene({ ...base, riderShown: true, windUp: 'ride', status: 'idle', progress: 0, flight: null })).toContain(riding);
    expect(describeScene({ ...base, riderShown: true, windUp: 'wait', status: 'idle', progress: 0, flight: null })).toContain(riding);
    expect(describeScene({ ...base, riderShown: true, windUp: 'crouch', status: 'idle', progress: 0, flight: null })).toContain('Legs crouched, knees bent, ready to pop.');
    expect(describeScene({ ...base, windUp: 'ride', status: 'idle', progress: 0, flight: null })).toContain('Legs crouched, knees bent, ready to pop.');
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
    expect(describeScene({ ...base, status: 'done', progress: 1, flight, result: first })).toContain('Last trick: Kickflip landed clean.');
    const second = computeFlight({ pop: 0.35, flick: 0, scoop: 0.9 });
    expect(describeScene({ ...base, status: 'playing', progress: 0.1, flight: second, result: null })).toMatch(/Waiting for this trick to land\.$/);
    expect(describeScene({ ...base, status: 'done', progress: 1, flight: second, result: recognize(second) })).toContain(
      'Last trick: Pop shove-it landed clean.',
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

  // Changed on purpose (2026-11-05, ADR-36): the lift now ends at the catch,
  // a landed trick has a catch step, and the last step rides the board down
  // (was "Both feet come back over the bolts and land on the grip.").
  it('scripts a kickflip in order: pop, slide, flick forward out and up, lift, catch, ride it down onto the bolts', () => {
    expect(texts(0.35, 1.9, 0)).toEqual([
      'Back foot snaps the tail down off the ball of the foot: the pop.',
      'Front foot drags up the grip on its outside edge toward the nose, 10 cm.',
      'Front foot flicks forward, out and up off the heel-side corner of the nose, 19 cm.',
      'Both feet lift 8 cm clear while the board turns under them.',
      'Both feet catch the board at about 70 percent of the flight and press it flat.',
      'Both feet ride the board down over the bolts and land on the grip.',
    ]);
  });

  it('times the steps by the flight phases: in the air to the catch, the catch, then down; a bail has no catch', () => {
    // The presets, and the kickflip with a frontside scoop (the hardflip preset until ADR-41), still on the sliders.
    for (const { inputs } of [...PRESETS, { inputs: { pop: 0.35, flick: 1.9, scoop: -0.9 } }]) {
      const s = steps(inputs.pop, inputs.flick, inputs.scoop);
      const lift = s.find((x) => x.text.startsWith('Both feet lift'))!;
      const caught = s.filter((x) => x.text.startsWith('Both feet catch the board'));
      expect(caught).toHaveLength(1);
      expect(lift.end).toBe(PHASE.catch.start);
      expect(caught[0]!.start).toBe(PHASE.catch.start);
      expect(caught[0]!.end).toBe(PHASE.catch.end);
      expect(s.at(-1)!.start).toBe(CATCH.back);
      expect(s.at(-1)!.end).toBe(1);
      const bail = steps(0.15, inputs.flick, inputs.scoop);
      expect(bail.some((x) => x.text.includes('catch'))).toBe(false);
      expect(bail.at(-1)!.start).toBe(PHASE.catch.start);
      expect(bail.find((x) => x.text.startsWith('Both feet lift'))!.end).toBe(PHASE.catch.start);
    }
    // An ollie's feet never leave the board, so there is nothing to catch: they ride it to the end of the catch, then land.
    const ollie = steps(0.35, 0, 0);
    expect(ollie.some((x) => x.text.includes('catch'))).toBe(false);
    expect(ollie.find((x) => x.text.startsWith('Both feet stay'))!.end).toBe(PHASE.catch.end);
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
      'Both feet catch the board at about 70 percent of the flight and press it flat.',
      'Both feet ride the board down over the bolts and land on the grip.',
    ]);
    expect(texts(0.35, -0.4, 0)).toContain('Front foot kicks off the toe-side corner of the nose, but only 6 cm: it barely reaches the rail.');
    expect(texts(0.15, -1.9, 0).at(-1)).toBe('The board does not come round in time: both feet step off to the heel side, a bail.');
  });

  it('scripts the frontside scoop forward in front of the toes, and composes it with a kickflip (the hardflip until ADR-41)', () => {
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

describe('spin in the air (ADR-36)', () => {
  it('reads the free-phase rates, omitting an axis that does not turn', () => {
    expect(spinReadout(computeFlight({ pop: 0.35, flick: 1.9, scoop: 0 }))).toBe('3.2 rev/s flip in the air');
    expect(spinReadout(computeFlight({ pop: 0.35, flick: 0, scoop: -0.9 }))).toBe('1.4 rev/s shove in the air');
    expect(spinReadout(computeFlight({ pop: 0.35, flick: -1.9, scoop: -0.9 }))).toBe('3.2 rev/s flip, 1.4 rev/s shove in the air');
    expect(spinReadout(computeFlight({ pop: 0.35, flick: 1.9, scoop: 1.9 }))).toBe('3.2 rev/s flip, 2.9 rev/s shove in the air');
    expect(spinReadout(computeFlight({ pop: 0.35, flick: 0, scoop: 0 }))).toBeNull();
    expect(spinReadout({ flipRate: 0.04, shoveRate: 0 })).toBeNull();
  });
});
