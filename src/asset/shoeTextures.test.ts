import { describe, expect, it } from 'vitest';
import { archS, eyelets } from './shoe';
import { SHOE_COLORS, SHOE_TEXTURES, SHOE_WEAR, SOLE_ATLAS, UPPER_ATLAS } from './shoeSpec';
import { solePixels, upperPixels, upperTint, valueNoise } from './shoeTextures';
import { hexToRgb } from './textures';

const upper = upperPixels();
const sole = solePixels();
const pow2 = (n: number) => (n & (n - 1)) === 0;

/** Grey values of the upper map in a window round (t, s) of the shell, `r` pixels each way. */
function shellWindow(t: number, s: number, r: number): number[] {
  const W = upper.width;
  const cx = Math.round(t * W);
  const cy = Math.round(UPPER_ATLAS.shell[0] + s * (UPPER_ATLAS.shell[1] - UPPER_ATLAS.shell[0]));
  const out: number[] = [];
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) out.push(upper.grey[y * W + x]!);
  return out;
}
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

describe('shoe textures (ADR-39)', () => {
  it('are the two 1024 px maps of the budget, powers of two, the upper one grey channel', () => {
    expect([upper.width, upper.height]).toEqual([SHOE_TEXTURES.upper.width, SHOE_TEXTURES.upper.height]);
    expect([sole.width, sole.height]).toEqual([SHOE_TEXTURES.sole.width, SHOE_TEXTURES.sole.height]);
    for (const n of [upper.width, upper.height, sole.width, sole.height]) expect(pow2(n)).toBe(true);
    expect(Math.max(upper.width, sole.width)).toBe(1024);
    expect(upper.grey.length).toBe(upper.width * upper.height);
  });

  it('tints the grey upper map onto the upper colour: blue as stored, red and green scaled down', () => {
    const [r, g, b, a] = upperTint();
    expect(b).toBe(1);
    expect(a).toBe(1);
    expect(r).toBeLessThan(g);
    expect(g).toBeLessThan(1);
  });

  it('wears one broad patch at the lateral forefoot, through to a dark backing at its core, and not on the medial side', () => {
    const P = SHOE_WEAR.patch;
    const lateral = shellWindow(P.t, P.s, 24);
    const medial = shellWindow(P.t, 1 - P.s, 24);
    const backing = hexToRgb(SHOE_COLORS.backing)[2];
    const dark = (v: number[]) => v.filter((g) => g <= backing + 3).length;
    expect(dark(lateral)).toBeGreaterThan(20);
    expect(dark(medial)).toBe(0);
    // The scuffed ring round the core is lighter than the same panel on the other side.
    const ring = shellWindow(P.t + P.rt * 0.6, P.s, 6);
    expect(mean(ring)).toBeGreaterThan(mean(shellWindow(P.t + P.rt * 0.6, 1 - P.s, 6)) + 2);
  });

  it('gives the suede a fine nap that does not repeat: a spread of a few levels, two windows never equal', () => {
    const a = shellWindow(0.3, 0.12, 10);
    const b = shellWindow(0.3 + 64 / 1024, 0.12, 10);
    const sd = Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2)));
    expect(sd).toBeGreaterThan(0.5);
    expect(sd).toBeLessThan(5);
    expect(a).not.toEqual(b);
    expect(valueNoise(3.5, 7.25, 1)).not.toBe(valueNoise(3.5 + 64, 7.25, 1));
  });

  it('marks the eyelet holes dark under the rims', () => {
    const backing = hexToRgb(SHOE_COLORS.backing)[2];
    for (const e of eyelets()) expect(shellWindow(e.t, archS(e.c), 0)[0]).toBe(backing);
  });

  it('scuffs the foxing at the lateral forefoot more than at the medial heel', () => {
    const W = sole.width;
    const row = Math.round((SOLE_ATLAS.wall[0] + SOLE_ATLAS.wall[1]) / 2);
    const lum = (u: number) => {
      let s = 0;
      for (let dx = -8; dx <= 8; dx++) {
        const i = (row * W + Math.round(u * W) + dx) * 3;
        s += sole.rgb[i]! + sole.rgb[i + 1]! + sole.rgb[i + 2]!;
      }
      return s;
    };
    expect(lum(SHOE_WEAR.foxing.at[0])).toBeLessThan(lum(0.85));
  });

  it('carries a waffle tread on the underside: grooves and lands in the tread band', () => {
    const W = sole.width;
    const groove = hexToRgb(SHOE_COLORS.treadGroove);
    const land = hexToRgb(SHOE_COLORS.tread);
    let grooves = 0, lands = 0;
    const y = Math.round((SOLE_ATLAS.tread[0] + SOLE_ATLAS.tread[1]) / 2);
    for (let x = 300; x < 700; x++) {
      const i = (y * W + x) * 3;
      const g = sole.rgb[i + 1]!;
      if (g < (groove[1] + land[1]) / 2) grooves++;
      else lands++;
    }
    expect(grooves).toBeGreaterThan(20);
    expect(lands).toBeGreaterThan(grooves);
  });
});
