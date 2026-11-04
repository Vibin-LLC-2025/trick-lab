import { describe, expect, it } from 'vitest';
import { GLUE_COLOR, PLY_COLORS, TEXTURES, WHEEL_BANDS } from './spec';
import { bandStart, gripGrey, gripTint, hexToRgb, mulberry32, plyPixels, wheelPixels, type Pixels } from './textures';

const hexAt = (p: Pixels, row: number, col = 0) => {
  const i = (row * p.width + col) * 3;
  return '#' + [p.rgb[i]!, p.rgb[i + 1]!, p.rgb[i + 2]!].map((c) => c.toString(16).padStart(2, '0')).join('');
};

describe('seeded noise', () => {
  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(20261104);
    const b = mulberry32(20261104);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(1)()).not.toBe(xs[0]);
  });
});

describe('grip grit (DESIGN.md 7.3)', () => {
  const grip = gripGrey();

  it('is the same every build', () => {
    expect(gripGrey().grey).toEqual(grip.grey);
  });

  it('is a 512 px tile, near black with a few bright grains', () => {
    expect(grip.width).toBe(TEXTURES.grip.width);
    expect(grip.grey).toHaveLength(512 * 512);
    const values = Array.from(grip.grey);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    // Stored as the blue channel: fill 28, mean near #20 (the design's #1e1e20).
    expect(mean).toBeGreaterThan(28);
    expect(mean).toBeLessThan(38);
    const sorted = values.sort((a, b) => a - b);
    expect(sorted[0]!).toBeGreaterThanOrEqual(25);
    expect(sorted[Math.floor(sorted.length * 0.99)]!).toBeLessThan(0x60);
    expect(sorted[sorted.length - 1]!).toBeGreaterThan(0x50);
  });

  it('tints the grey map back to the recipe fill #1a1a1c', () => {
    const [r, g, b] = gripTint();
    expect(b).toBe(1);
    const lin = (c: number) => ((c / 255 + 0.055) / 1.055) ** 2.4;
    const toSrgb = (l: number) => Math.round((1.055 * l ** (1 / 2.4) - 0.055) * 255);
    expect(toSrgb(lin(28) * r)).toBe(26);
    expect(toSrgb(lin(28) * g)).toBe(26);
  });
});

describe('ply stripes (DESIGN.md 7.3)', () => {
  const ply = plyPixels();

  it('has seven plies top to bottom with glue lines between them', () => {
    expect([ply.width, ply.height]).toEqual([16, 128]);
    const starts = Array.from({ length: 7 }, (_, k) => bandStart(k, 7, 128));
    expect(starts).toEqual([0, 18, 37, 55, 73, 91, 110]);
    starts.forEach((row, k) => expect(hexAt(ply, row)).toBe(PLY_COLORS[k]));
    for (const row of starts.slice(1)) expect(hexAt(ply, row - 1, 7)).toBe(GLUE_COLOR);
    expect(hexAt(ply, 127)).toBe(PLY_COLORS[6]);
    expect(hexAt(ply, 64)).toBe('#7a2e1c');
  });
});

describe('wheel bands (DESIGN.md 7.5)', () => {
  const wheel = wheelPixels();

  it('puts one colour band per lathe segment', () => {
    const starts = Array.from({ length: 15 }, (_, k) => bandStart(k, 15, 256));
    expect(starts).toEqual([0, 17, 34, 51, 68, 85, 102, 119, 137, 154, 171, 188, 205, 222, 239]);
    expect(hexAt(wheel, 0)).toBe(WHEEL_BANDS.race);
    expect(hexAt(wheel, 8)).toBe(WHEEL_BANDS.shield);
    expect(hexAt(wheel, 16)).toBe(WHEEL_BANDS.race);
    expect(hexAt(wheel, 17)).toBe(WHEEL_BANDS.race);
    expect(hexAt(wheel, 40)).toBe(WHEEL_BANDS.urethane);
    expect(hexAt(wheel, 102)).toBe(WHEEL_BANDS.shoulder);
    expect(hexAt(wheel, 128)).toBe(WHEEL_BANDS.tread);
    expect(hexAt(wheel, 137)).toBe(WHEEL_BANDS.shoulder);
    expect(hexAt(wheel, 222)).toBe(WHEEL_BANDS.race);
    expect(hexAt(wheel, 247)).toBe(WHEEL_BANDS.shield);
    expect(hexAt(wheel, 255)).toBe(WHEEL_BANDS.race);
  });

  it('parses hex colours', () => {
    expect(hexToRgb('#e0532c')).toEqual([224, 83, 44]);
  });
});
