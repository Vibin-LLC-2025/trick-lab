import { Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { BAY, GROUND_TEXTURES, PLANE, PLANE_BAYS } from '../asset/groundSpec';
import { WHEEL } from '../asset/spec';
import { COMPUTER_DELAY_MS } from '../ui/Skate';
import { BAR } from '../sim/bar';
import { ART } from './artDirection';
import { groundPerMetre, PUSH_ACCEL, SLOW_DECEL, slideCount, slideTexture, stepRoll, wheelPerMetre, writeSlides, type RollMotion } from './roll';

const R = ART.roll;
const motion = (speed = 0): RollMotion => ({ speed, distance: 0, running: true });

/** Steps `m` for `seconds` in frames of `dt`, returning how many frames until it reported a stop (or -1). */
function run(m: RollMotion, pushing: boolean, seconds: number, dt = 1 / 120) {
  let stoppedAt = -1;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) if (stepRoll(m, pushing, dt) && stoppedAt < 0) stoppedAt = i;
  return stoppedAt;
}

describe('the roll (step 12, ADR-67)', () => {
  it('pushes to the cruise in pushS and holds it', () => {
    const m = motion();
    run(m, true, R.pushS / 2);
    expect(m.speed).toBeCloseTo(R.cruise / 2, 6);
    run(m, true, R.pushS);
    expect(m.speed).toBe(R.cruise);
    // From a stop the push covers half the cruise times its time.
    const n = motion();
    run(n, true, R.pushS);
    expect(n.distance).toBeCloseTo((R.cruise * R.pushS) / 2, 6);
  });

  it('slows from the cruise to a stop in slowS, and says so once it has stopped', () => {
    const m = motion(R.cruise);
    const at = run(m, false, R.slowS + 0.5);
    expect(m.speed).toBe(0);
    expect(at * (1 / 120)).toBeCloseTo(R.slowS, 1);
    expect(m.distance).toBeCloseTo((R.cruise * R.slowS) / 2, 6);
  });

  it('travels the same distance at any frame rate', () => {
    for (const pushing of [true, false]) {
      const a = motion(pushing ? 0 : R.cruise);
      const b = motion(pushing ? 0 : R.cruise);
      run(a, pushing, 2, 1 / 30);
      run(b, pushing, 2, 1 / 144);
      expect(a.distance).toBeCloseTo(b.distance, 6);
    }
  });

  it('reports a stop for a board slowed before it ever moved', () => {
    expect(stepRoll(motion(), false, 1 / 60)).toBe(true);
  });

  it('a timed pop leaves at the cruise, and the computer stops and pushes off inside its wait', () => {
    expect(R.pushS * 1000).toBeLessThan(BAR.centreMs);
    expect((R.slowS + R.pushS) * 1000).toBeLessThan(COMPUTER_DELAY_MS);
    expect(PUSH_ACCEL).toBeGreaterThan(SLOW_DECEL);
  });

  it('the wheel turns once per circumference', () => {
    expect(R.wheelRadius).toBe(WHEEL.radius);
    expect(wheelPerMetre() * 2 * Math.PI * WHEEL.radius).toBeCloseTo(1, 12);
  });
});

describe('sliding textures (ADR-67)', () => {
  it('moves a texture by its repeat per metre, from its own base, and puts it back', () => {
    const t = new Texture();
    t.offset.x = 0.25;
    t.repeat.x = 12.5;
    const stop = slideTexture(t, groundPerMetre(t.repeat.x, PLANE.x));
    writeSlides(1);
    expect(t.offset.x).toBeCloseTo(0.25 + 12.5 / PLANE.x, 12);
    stop();
    expect(t.offset.x).toBe(0.25);
    expect(slideCount()).toBe(0);
  });

  it('a second registration of one texture is a no-op, and its base is the first one', () => {
    const t = new Texture();
    const stop = slideTexture(t, 1);
    writeSlides(0.3);
    const again = slideTexture(t, 1);
    expect(slideCount()).toBe(1);
    again();
    expect(slideCount()).toBe(1);
    stop();
    // A later mount (a tier change) starts from the base, not from where the last roll left it.
    t.offset.x = 0.7;
    const later = slideTexture(t, 1);
    writeSlides(0);
    expect(t.offset.x).toBe(0);
    later();
  });

  it('never shows the wrap: every ground map is in the same place a whole number of its tiles later', () => {
    // The ground's maps repeat every 1, 2 and 3 bays along the board; 6 bays (9.6 m) is a whole number of each.
    const period = 6 * BAY.x;
    const maps = Object.values(GROUND_TEXTURES).map((m) => {
      const t = new Texture();
      t.repeat.x = PLANE_BAYS.x / m.bays[0];
      return t;
    });
    const stops = maps.map((t) => slideTexture(t, groundPerMetre(t.repeat.x, PLANE.x)));
    for (const d of [0.37, 5.1, 123.4]) {
      writeSlides(d);
      const here = maps.map((t) => t.offset.x);
      writeSlides(d + period);
      maps.forEach((t, i) => {
        const apart = Math.abs(t.offset.x - here[i]!) % 1;
        expect(Math.min(apart, 1 - apart)).toBeCloseTo(0, 9);
      });
    }
    stops.forEach((s) => s());
  });

  it('keeps every offset in one texture width, however far it rolls', () => {
    const t = new Texture();
    const stop = slideTexture(t, wheelPerMetre());
    writeSlides(1e6 + 0.123);
    expect(t.offset.x).toBeGreaterThanOrEqual(0);
    expect(t.offset.x).toBeLessThan(1);
    stop();
  });
});
