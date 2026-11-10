import { describe, expect, it } from 'vitest';
import { buildBoard } from '../asset/board';
import { REST_Y } from '../asset/spec';
import { contactRise, restingRoll } from './boardSection';

const D2R = Math.PI / 180;

/** The real board's rise above rest when it lies rolled by `roll` with no pitch: its lowest vertex on the pad. */
function realRise(level: 'medium' | 'high', roll: number): number {
  const c = Math.cos(roll * D2R);
  const s = Math.sin(roll * D2R);
  let low = Infinity;
  for (const g of Object.values(buildBoard(level).parts)) {
    const a = g.getAttribute('position');
    // Both signs of z: the roll may go either way.
    for (let i = 0; i < a.count; i++) low = Math.min(low, a.getY(i) * c - a.getZ(i) * s, a.getY(i) * c + a.getZ(i) * s);
  }
  return -low - REST_Y;
}

describe('the board end on (ADR-68)', () => {
  it('rests where the built boards rest, at every roll, within 0.1 mm', () => {
    for (const level of ['medium', 'high'] as const) {
      // The higher of the two boards decides; each is within a millimetre of it.
      for (let roll = 0; roll <= 360; roll += 5) {
        const real = realRise(level, roll);
        expect(contactRise(roll), `${level} at ${roll}`).toBeGreaterThanOrEqual(real - 1e-4);
        expect(contactRise(roll) - real, `${level} at ${roll}`).toBeLessThan(0.001);
      }
    }
    // And exactly the higher of the two.
    for (let roll = 0; roll <= 180; roll += 15) {
      const both = Math.max(realRise('medium', roll), realRise('high', roll));
      expect(Math.abs(contactRise(roll) - both), `at ${roll}`).toBeLessThan(1e-4);
    }
  }, 120_000);

  it('is at rest with the wheels down, up on a rail, and down on the kicks upside down', () => {
    expect(contactRise(0)).toBe(0);
    expect(contactRise(360)).toBe(0);
    expect(contactRise(90)).toBeCloseTo(0.0178, 3);
    expect(contactRise(-90)).toBeCloseTo(contactRise(90), 12);
    expect(contactRise(180)).toBeCloseTo(-0.039, 3);
  });

  it('rests at the nearest quarter turn', () => {
    expect([restingRoll(40), restingRoll(50), restingRoll(-130), restingRoll(211.5), restingRoll(-10)]).toEqual([0, 90, -90, 180, 0]);
  });
});
