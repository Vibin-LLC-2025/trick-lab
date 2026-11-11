import { describe, expect, it } from 'vitest';
import { computeFlight } from './flight';
import { forecastText } from './format';
import { gradeOf, isLanded } from './landing';
import { lessonSetup, SETTABLE_TRICKS, type SkateCall } from './skate';
import { INPUT_LIMITS, recognize } from './tricks';
import { landingZones, zonePlace } from './zones';

const POPS = [0.15, 0.25, 0.35, 0.45, 0.55, 0.6];
/** Far smaller than a slider step, far larger than the rounding in the zone's ends. */
const EPS = 1e-9;
const kickflip = SETTABLE_TRICKS.find((t) => t.id === 'kickflip')!;
const heelflip = SETTABLE_TRICKS.find((t) => t.id === 'heelflip')!;
const shove = SETTABLE_TRICKS.find((t) => t.id === 'pop-shove-it')!;
const doubleFlip = SETTABLE_TRICKS.find((t) => t.id === 'double-kickflip')!;

/** The other rate held at the trick's own exact rate, so only the slider under test decides. */
function exact(t: SkateCall, pop: number) {
  const T = computeFlight({ pop, flick: 0, scoop: 0 }).airtime;
  return { pop, flick: t.flips / T, scoop: t.halfShoves / 2 / T };
}

describe('the landing zones (ADR-83)', () => {
  it('end exactly where the landing rule does, for every trick at every pop: just inside lands as the trick, just outside does not', () => {
    for (const t of SETTABLE_TRICKS) {
      for (const pop of POPS) {
        const zones = landingZones(t, pop);
        for (const key of ['flick', 'scoop'] as const) {
          const zone = zones[key];
          if (!zone) continue;
          const at = (v: number) => recognize(computeFlight({ ...exact(t, pop), [key]: v }));
          const { min, max } = INPUT_LIMITS[key];
          for (const edge of [zone.from, zone.to]) {
            const inward = edge === zone.from ? EPS : -EPS;
            const inside = at(edge + inward);
            expect(inside.landed && inside.id === t.id, `${t.id} ${key} ${pop} inside ${edge}`).toBe(true);
            // An end held to the slider's limit has nothing past it on the slider.
            if (edge > min && edge < max) {
              const outside = at(edge - inward);
              expect(outside.landed && outside.id === t.id, `${t.id} ${key} ${pop} outside ${edge}`).toBe(false);
            }
          }
          if (zone.clean) {
            expect(zone.clean.from).toBeGreaterThanOrEqual(zone.from);
            expect(zone.clean.to).toBeLessThanOrEqual(zone.to);
            const edgeGrade = (v: number) => {
              const f = computeFlight({ ...exact(t, pop), [key]: v });
              return gradeOf(f.rollTotal, f.yawTotal);
            };
            expect(edgeGrade(zone.clean.from + EPS)).toBe('clean');
            expect(edgeGrade(zone.clean.to - EPS)).toBe('clean');
            if (zone.clean.from > min) expect(edgeGrade(zone.clean.from - EPS)).toBe('sketchy');
            if (zone.clean.to < max) expect(edgeGrade(zone.clean.to + EPS)).toBe('sketchy');
          }
        }
      }
    }
  });

  it('a kickflip at 0.35 m: three of the flick slider\'s stops land it and one is clean, and the scoop\'s zone is round 0', () => {
    const z = landingZones(kickflip, 0.35);
    const stops = (from: number, to: number) => {
      const out: number[] = [];
      for (let i = -30; i <= 30; i++) if (i / 10 >= from && i / 10 <= to) out.push(i / 10);
      return out;
    };
    expect(stops(z.flick!.from, z.flick!.to)).toEqual([1.8, 1.9, 2]);
    expect(stops(z.flick!.clean!.from, z.flick!.clean!.to)).toEqual([1.9]);
    expect(z.scoop!.from).toBeCloseTo(-z.scoop!.to, 12);
    expect(stops(z.scoop!.from, z.scoop!.to)).toEqual([-0.1, 0, 0.1]);
    // A heelflip's is the mirror image.
    const h = landingZones(heelflip, 0.35);
    expect(h.flick!.from).toBeCloseTo(-z.flick!.to, 12);
    expect(h.flick!.to).toBeCloseTo(-z.flick!.from, 12);
  });

  it('move when pop moves: a higher pop needs less rate for the same turn', () => {
    const low = landingZones(kickflip, 0.25).flick!;
    const high = landingZones(kickflip, 0.55).flick!;
    expect(high.from).toBeLessThan(low.from);
    expect(high.to).toBeLessThan(low.to);
    expect(landingZones(shove, 0.55).scoop!.from).toBeLessThan(landingZones(shove, 0.25).scoop!.from);
  });

  it('are not drawn where they lie past the slider\'s end, and the forecast says to pop higher', () => {
    // A double flip needs 3.7 rev/s of flick from 0.35 m: off the slider, whose end is 3.
    expect(landingZones(doubleFlip, 0.35).flick).toBeNull();
    expect(landingZones(doubleFlip, 0.6).flick).not.toBeNull();
    expect(forecastText({ pop: 0.35, flick: 3, scoop: 0 }, doubleFlip)).toBe(
      'This makes: a bail: 143 degrees short on the flip. Pop higher: the flick slider cannot reach the double kickflip from here.',
    );
    // From its setup it is on the slider and clean.
    expect(forecastText(lessonSetup(doubleFlip), doubleFlip)).toBe('This makes: double kickflip, clean.');
  });

  it('say where a value is by the landing rule itself: clean, in the landing zone, or outside', () => {
    expect(zonePlace('flick', kickflip, 0.35, 1.9)).toBe('clean');
    expect(zonePlace('flick', kickflip, 0.35, 1.8)).toBe('landing');
    expect(zonePlace('flick', kickflip, 0.35, 2.0)).toBe('landing');
    expect(zonePlace('flick', kickflip, 0.35, 1.7)).toBeNull();
    // The right amount the wrong way is outside: a heelflip is not a kickflip.
    expect(zonePlace('flick', kickflip, 0.35, -1.9)).toBeNull();
    expect(zonePlace('scoop', kickflip, 0.35, 0)).toBe('clean');
    expect(zonePlace('scoop', kickflip, 0.35, 0.1)).toBe('landing');
    // Every stop agrees with the flight's own landing and grade.
    for (const t of SETTABLE_TRICKS) {
      for (const pop of POPS) {
        for (let i = -30; i <= 30; i++) {
          const v = i / 10;
          const f = computeFlight({ ...exact(t, pop), flick: v });
          const place = zonePlace('flick', t, pop, v);
          const right = isLanded(f.rollTotal, f.yawTotal) && recognize(f).id === t.id;
          expect(place !== null, `${t.id} ${pop} ${v}`).toBe(right);
          if (place) expect(place === 'clean').toBe(gradeOf(f.rollTotal, f.yawTotal) === 'clean');
        }
      }
    }
  });
});

describe('the forecast under the sliders (ADR-83)', () => {
  const at = (flick: number, scoop = 0, pop = 0.35) => ({ pop, flick, scoop });

  it('says what the sliders make against the trick to do, from the same flight and recognition', () => {
    expect(forecastText(at(1.9), kickflip)).toBe('This makes: kickflip, clean.');
    expect(forecastText(at(1.8), kickflip)).toBe('This makes: kickflip, sketchy: 14 degrees short on the flip.');
    expect(forecastText(at(2.0), kickflip)).toBe('This makes: kickflip, sketchy: 25 degrees past on the flip.');
    expect(forecastText(at(1.7), kickflip)).toBe('This makes: a bail: 33 degrees short on the flip.');
    expect(forecastText(at(2.1), kickflip)).toBe('This makes: a bail: 44 degrees past on the flip.');
    expect(forecastText(at(1.9, 0.5), kickflip)).toBe('This makes: a bail: 96 degrees past on the shove.');
    expect(forecastText(at(-1.9), kickflip)).toBe('This makes: heelflip, not the kickflip you need.');
    expect(forecastText(at(0), kickflip)).toBe('This makes: ollie, not the kickflip you need.');
    expect(forecastText(at(1.9, 1), kickflip)).toBe('This makes: varial flip, not the kickflip you need.');
    expect(forecastText(at(-1), kickflip)).toBe('This makes: a bail: the flip turns the wrong way.');
    expect(forecastText(at(0, 0.9), shove)).toBe('This makes: pop shove-it, clean.');
  });

  it('on Hard says a sketchy landing will not count', () => {
    expect(forecastText(at(1.8), kickflip, true)).toBe('This makes: kickflip, sketchy: 14 degrees short on the flip. Only clean counts on Hard.');
    expect(forecastText(at(1.9), kickflip, true)).toBe('This makes: kickflip, clean.');
  });

  it('with no trick to do yet, says what the sliders make on their own', () => {
    expect(forecastText(at(-1.9), null)).toBe('This makes: heelflip, clean.');
    expect(forecastText(at(0), null)).toBe('This makes: ollie, clean.');
    expect(forecastText(at(1.0), null)).toBe('This makes: a bail: 168 degrees short on the flip.');
  });

  it('agrees with recognition for every trick from its setup', () => {
    for (const t of SETTABLE_TRICKS) expect(forecastText(lessonSetup(t), t), t.id).toBe(`This makes: ${t.name.charAt(0).toLowerCase()}${t.name.slice(1)}, clean.`);
  });
});
