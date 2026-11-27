// The sky (ADR-52), as pure functions: no three, so the tests read the same
// numbers the dome (skyDome.ts) and the environment map
// (outdoorEnvironment.ts) are built from. Colours are sRGB bytes; elevation
// and azimuth in degrees (0 elevation is the horizon, 90 the zenith).
import { hexToRgb, mulberry32 } from '../asset/textures';
import type { Theme } from '../store';
import { ART } from './artDirection';

export type Rgb = [number, number, number];
const S = ART.sky;

export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * The sky's colour at an elevation: the horizon haze, a band above it, the
 * zenith, each theme's own (ART.sky.colors). At and below the horizon it is
 * the horizon colour, which is also the fog's (ART.fog), so the far ground
 * fades into the sky without a seam.
 */
export function skyRgb(theme: Theme, elevation: number): Rgb {
  const c = S.colors[theme];
  const horizon = hexToRgb(c.horizon) as Rgb;
  if (elevation <= 0) return horizon;
  const band = hexToRgb(c.band) as Rgb;
  const zenith = hexToRgb(c.zenith) as Rgb;
  const e = Math.min(elevation, 90) / 90;
  if (e < S.bandAt) return mixRgb(horizon, band, smooth(e / S.bandAt));
  return mixRgb(band, zenith, smooth(clamp01((e - S.bandAt) / (1 - S.bandAt))) ** S.exponent);
}

/** The sun's azimuth in degrees (0 is +Z, turning toward +X, as on the dome): the key light's, seen from its target. */
export function sunAzimuth(): number {
  const L = ART.lights.directional;
  return (Math.atan2(L.position[0] - L.target[0], L.position[2] - L.target[2]) * 180) / Math.PI;
}

/**
 * The sun's glow on the haze (ART.sky.glow, 2026-11-22): a warm brightening of
 * the sky low on the horizon under the key light, falling off with the angle
 * from its centre (a Gaussian `width` degrees wide) round a brighter `core`
 * (the sun just under the horizon), so the sky shows where the light comes
 * from. 0 to 1: how far the sky there leans toward the glow's colour, the two
 * combined as light is (1 - (1 - haze)(1 - core)).
 */
export function glowAmount(theme: Theme, elevation: number, azimuth: number): number {
  const G = S.glow;
  const deg = Math.PI / 180;
  const e0 = G.elevation * deg;
  const a0 = sunAzimuth() * deg;
  const e = Math.max(elevation, 0) * deg;
  const a = azimuth * deg;
  // The angle between the two directions on the sphere.
  const cos = Math.sin(e) * Math.sin(e0) + Math.cos(e) * Math.cos(e0) * Math.cos(a - a0);
  const angle = Math.acos(Math.min(1, Math.max(-1, cos))) / deg;
  const haze = G.strength[theme] * Math.exp(-((angle / G.width) ** 2));
  const core = G.core.strength[theme] * Math.exp(-((angle / G.core.width) ** 2));
  return 1 - (1 - haze) * (1 - core);
}

/** The sky's colour at an elevation and azimuth: `skyRgb` with the sun's glow on it. */
export const glowSkyRgb = (theme: Theme, elevation: number, azimuth: number): Rgb =>
  mixRgb(skyRgb(theme, elevation), hexToRgb(S.glow.color[theme]) as Rgb, glowAmount(theme, elevation, azimuth));

/** One block of the city on the horizon: where it starts and how wide, degrees of azimuth; its roof, and a lower setback on its second half (1 for none). */
export interface Block {
  start: number;
  width: number;
  height: number;
  setback: number;
}

/**
 * A faint city round the horizon (ART.sky.skyline): blocks a few degrees wide,
 * each a random height in its range, some with a lower setback, laid edge to
 * edge round the whole circle from a fixed seed, so every visit draws the
 * same city. The last block is cut to close the circle.
 */
export function skylineBlocks(): Block[] {
  const L = S.skyline;
  const rand = mulberry32(L.seed);
  const blocks: Block[] = [];
  let start = 0;
  while (start < 360) {
    const width = Math.min(L.width[0] + rand() * (L.width[1] - L.width[0]), 360 - start);
    const height = L.height[0] + rand() * (L.height[1] - L.height[0]);
    const setback = rand() < L.setbackChance ? L.setback[0] + rand() * (L.setback[1] - L.setback[0]) : 1;
    blocks.push({ start, width, height, setback });
    start += width;
  }
  return blocks;
}

/**
 * The city's colour at an elevation: the sky there, leaning toward the theme's `city` tint by `skyline.strength`. Faint on purpose.
 * Given an azimuth, the sky behind it carries the sun's glow, so the blocks under the sun are lit with the haze.
 */
export const cityRgb = (theme: Theme, elevation: number, azimuth?: number): Rgb =>
  mixRgb(azimuth === undefined ? skyRgb(theme, elevation) : glowSkyRgb(theme, elevation, azimuth), hexToRgb(S.colors[theme].city) as Rgb, S.skyline.strength);
