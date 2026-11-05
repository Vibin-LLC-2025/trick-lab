import { describe, expect, it } from 'vitest';
import { DECK_WEAR, GLUE_COLOR, KICK, OUTLINE, PLY_COLORS, TEXTURES, TEXTURES_HIGH, WHEEL_BANDS, WHEEL_HIGH_BAND_KINDS } from './spec';
import { halfWidth } from './deck';
import {
  bandStart,
  deckBottomPoint,
  deckWear,
  downsample2,
  gripGrey,
  gripHigh,
  gripTint,
  greyFromField,
  hexToRgb,
  mulberry32,
  normalMapFromHeight,
  plyPixels,
  plyPixelsHigh,
  wheelPixels,
  wearDeckBottom,
  wheelPixelsHigh,
  type Pixels,
} from './textures';

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

describe('high-tier textures (quality tiers, 2026-11-04)', () => {
  const high = gripHigh();

  it('builds a 1024 px RGB grip with the same fill and a similar mean to the medium tile', () => {
    expect([high.color.width, high.color.height]).toEqual([1024, 1024]);
    expect(high.lift).toHaveLength(1024 * 1024);
    const blue = Array.from({ length: high.color.width * high.color.height }, (_, i) => high.color.rgb[i * 3 + 2]!);
    const mean = blue.reduce((a, b) => a + b, 0) / blue.length;
    expect(mean).toBeGreaterThan(28);
    expect(mean).toBeLessThan(38);
    // Red and green sit two levels under blue (the #1a1a1c lean) wherever nothing clips.
    expect(high.color.rgb[0]! + 2).toBe(high.color.rgb[2]!);
    expect(gripHigh().color.rgb).toEqual(high.color.rgb);
  });

  it('derives a tangent-space normal map: flat ground is (128, 128, 255), bumps tilt it', () => {
    const flat = normalMapFromHeight(new Float32Array(16), 4, 4);
    expect(Array.from(flat.rgb.subarray(0, 3))).toEqual([128, 128, 255]);
    const bump = new Float32Array(16);
    bump[5] = 10; // column 1, row 1
    const n = normalMapFromHeight(bump, 4, 4, 0.05);
    const at = (x: number, y: number) => Array.from(n.rgb.subarray((y * 4 + x) * 3, (y * 4 + x) * 3 + 3));
    // Left of the bump the surface rises to the right, so the normal leans left (red below 128).
    expect(at(0, 1)[0]!).toBeLessThan(128);
    expect(at(2, 1)[0]!).toBeGreaterThan(128);
    // Above the bump (lower row index) the surface rises down the image, so the normal leans up the image: glTF +Y, green above 128.
    expect(at(1, 0)[1]!).toBeGreaterThan(128);
    expect(at(1, 2)[1]!).toBeLessThan(128);
    expect(at(3, 3)).toEqual([128, 128, 255]);
    const map = normalMapFromHeight(downsample2(high.lift, 1024, 1024), 512, 512);
    expect([map.width, map.height]).toEqual([512, 512]);
    let b = 0;
    for (let i = 2; i < map.rgb.length; i += 3) b += map.rgb[i]!;
    expect(b / (512 * 512)).toBeGreaterThan(200);
  });

  it('box-filters the lift field 2 x 2', () => {
    expect(Array.from(downsample2(new Float32Array([1, 3, 5, 7]), 2, 2))).toEqual([4]);
  });

  it('keeps the seven plies at 32 x 256 and jitters columns, not glue lines', () => {
    const ply = plyPixelsHigh();
    expect([ply.width, ply.height]).toEqual([32, 256]);
    const start = bandStart(3, 7, 256);
    expect(hexAt(ply, start)).not.toBe(hexAt(ply, start, 9));
    expect(hexAt(ply, bandStart(1, 7, 256) - 1, 5)).toBe(GLUE_COLOR);
    expect(plyPixelsHigh().rgb).toEqual(ply.rgb);
  });

  it('paints one band per high lathe segment, with the bearing in the first five', () => {
    const wheel = wheelPixelsHigh();
    expect([wheel.width, wheel.height]).toEqual([64, 512]);
    const n = WHEEL_HIGH_BAND_KINDS.length;
    expect(hexAt(wheel, bandStart(0, n, 512))).toBe(WHEEL_BANDS.race);
    expect(hexAt(wheel, bandStart(2, n, 512))).toBe(WHEEL_BANDS.shield);
    expect(hexAt(wheel, bandStart(6, n, 512))).toBe(WHEEL_BANDS.core);
    expect(hexAt(wheel, bandStart(13, n, 512))).toBe(WHEEL_BANDS.tread);
    expect(hexAt(wheel, 511)).toBe(WHEEL_BANDS.race);
  });
});

describe('deck bottom wear (ADR-40)', () => {
  const { width: W, height: H } = TEXTURES.deckBottom;
  const wear = deckWear(W, H);
  const FIELD = [224, 83, 44] as const;
  /** A flat field with the nose disc and the three tally marks of the design (deck-graphic.svg, at this size). */
  const graphic = (): Pixels => {
    const rgb = new Uint8Array(W * H * 3);
    const s = W / 2048;
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        const disc = Math.hypot(c / s - 1770, r / s - 256) < 170;
        const tally = c / s > 98 && c / s < 252 && Math.abs(r / s - 256) < 110 && (c / s - 98) % 51.3 < 30;
        rgb.set(disc ? [243, 234, 219] : tally ? [23, 24, 26] : FIELD, (r * W + c) * 3);
      }
    return { width: W, height: H, rgb };
  };
  const inside = (c: number, r: number) => {
    const [x, z] = deckBottomPoint(c, r, W, H);
    // The graphic starts at the bevel, 4 mm in from the outline.
    return Math.abs(z) < halfWidth(x) - 0.004;
  };
  const [bareFrom, bareTo] = DECK_WEAR.expose;

  it('is the same every build and the same marks at every resolution (placed in metres)', () => {
    expect(Array.from(deckWear(W, H).mask)).toEqual(Array.from(wear.mask));
    const big = deckWear(2 * W, 2 * H).mask;
    const down = downsample2(big, 2 * W, 2 * H);
    let diff = 0;
    for (let i = 0; i < down.length; i++) diff += Math.abs(down[i]! - wear.mask[i]!);
    expect(diff / down.length).toBeLessThan(0.01);
  });

  it('is mild and local, not noise over the deck: a little bare wood, most of the print untouched', () => {
    let seen = 0, bare = 0, worn = 0;
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        if (!inside(c, r)) continue;
        const m = wear.mask[r * W + c]!;
        seen++;
        if (m > bareTo) bare++;
        if (m > 0.02) worn++;
      }
    expect(bare / seen).toBeGreaterThan(0.001);
    expect(bare / seen).toBeLessThan(0.03);
    expect(worn / seen).toBeLessThan(0.2);
  });

  it('bares wood only along the slide scratches between the trucks and at the nose and tail edges', () => {
    const S = DECK_WEAR.scratches;
    // A scratch is at most half its length times sin(angle) off its centre in x.
    const scratchX = S.x[1] + (S.length[1] / 2) * Math.sin((S.angleDeg * Math.PI) / 180);
    let tips = 0, middle = 0;
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        if (!inside(c, r) || wear.mask[r * W + c]! <= bareFrom) continue;
        const [x] = deckBottomPoint(c, r, W, H);
        const nearTip = x < OUTLINE.tailTip + DECK_WEAR.edge.tail.reach || x > OUTLINE.noseTip - DECK_WEAR.edge.nose.reach;
        expect(nearTip || Math.abs(x) <= scratchX, `bare wood at x ${x.toFixed(3)}`).toBe(true);
        if (nearTip) tips++;
        else middle++;
      }
    expect(tips).toBeGreaterThan(0);
    expect(middle).toBeGreaterThan(0);
    // The scratches stay off the kicks, where the nose disc and the tally marks are.
    expect(scratchX).toBeLessThan(KICK.start);
  });

  it('keeps the nose disc and the tally marks legible', () => {
    const { color } = wearDeckBottom(graphic());
    const src = graphic();
    const s = W / 2048;
    let disc = 0, discChange = 0, n = 0;
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        if (Math.hypot(c / s - 1770, r / s - 256) >= 160) continue;
        const i = (r * W + c) * 3;
        disc += color.rgb[i]!;
        discChange = Math.max(discChange, Math.abs(color.rgb[i]! - src.rgb[i]!));
        n++;
      }
    // The disc stays cream (red channel near 243), changed by at most the grain and a touch of haze.
    expect(disc / n).toBeGreaterThan(235);
    expect(discChange).toBeLessThan(25);
    // The tally marks keep their contrast with the field: ink below 60 in red, field above 180.
    for (const col of [105, 160, 210].map((v) => Math.round(v * s))) {
      const ink = color.rgb[((H / 2) * W + col) * 3]!;
      expect(ink, `tally at column ${col}`).toBeLessThan(60);
    }
    expect(color.rgb[((H / 2) * W + Math.round(280 * s) - 4) * 3]!).toBeGreaterThan(180);
  });

  it('takes the colour and the roughness from the one mask, and the print grain is faint', () => {
    const src = graphic();
    const { color, roughness, wear: w } = wearDeckBottom(src);
    const R = DECK_WEAR.roughness;
    let maxClean = 0;
    for (let i = 0; i < W * H; i++) {
      const m = w.mask[i]!;
      if (m === 0) {
        expect(roughness[i]).toBeCloseTo(R.print, 6);
        maxClean = Math.max(maxClean, Math.abs(color.rgb[i * 3]! - src.rgb[i * 3]!));
      }
      if (m >= bareTo) expect(roughness[i]).toBeCloseTo(R.wood, 6);
      expect(roughness[i]).toBeGreaterThanOrEqual(R.print - 1e-6);
      expect(roughness[i]).toBeLessThanOrEqual(R.wood + 1e-6);
    }
    // Clean print moves by the grain alone: at most DECK_WEAR.grain.print levels.
    expect(maxClean).toBeLessThanOrEqual(DECK_WEAR.grain.print + 0.5);
    expect(maxClean).toBeGreaterThan(0);
    // The high tier stores that roughness at half size: one grey channel, the same field box filtered.
    const T = TEXTURES_HIGH;
    const hi = greyFromField(new Float32Array(T.deckBottom.width * T.deckBottom.height).fill(R.wood), T.deckBottom.width, T.deckBottom.height, T.deckRoughness.width, T.deckRoughness.height);
    expect(hi.grey.every((g) => g === Math.round(R.wood * 255))).toBe(true);
  });
});
