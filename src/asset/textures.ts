// Deterministic texture pixels from docs/DESIGN.md 7.3 and 7.5. Pure: returns
// RGB bytes (row 0 is the top row of the image, the glTF convention). The deck
// graphic is not here: it is rasterized from assets/source/deck-graphic.svg by
// the build script.
import {
  GLUE_COLOR,
  GRIP_NORMAL_SLOPE,
  GRIP_RECIPE,
  GRIP_RECIPE_HIGH,
  PLY_COLORS,
  PLY_GRAIN,
  TEXTURES,
  TEXTURES_HIGH,
  WHEEL_BANDS,
  WHEEL_HIGH_BAND_KINDS,
  type WheelBandKind,
} from './spec';

export interface Pixels {
  width: number;
  height: number;
  /** 3 bytes per pixel, sRGB. */
  rgb: Uint8Array;
}

/** One byte per pixel, sRGB grey. */
export interface GreyPixels {
  width: number;
  height: number;
  grey: Uint8Array;
}

/** mulberry32: tiny, fast, seedable; the same seed gives the same texture on every machine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/**
 * Grip grit (7.3): near-black fill with a blue lean, per-pixel jitter, 60,000
 * soft grains (most dim, a few bright) and 1,500 single-pixel glints. All
 * coordinates wrap, so the tile repeats without a seam.
 *
 * The recipe moves all three channels together, so the image is stored as one
 * grey channel holding the blue value (fill 28); the build tints red and green
 * down with the material's base colour factor (gripTint) to land the fill on
 * #1a1a1c. Same picture, a third of the PNG bytes (an RGB grip alone was
 * 218 KB and pushed the GLB over its 300 KB budget).
 */
export function gripGrey(): GreyPixels {
  const { width: W, height: H } = TEXTURES.grip;
  const lift = gripLift(GRIP_RECIPE, W, H);
  const grey = new Uint8Array(W * H);
  for (let i = 0; i < lift.length; i++) grey[i] = clampByte(GRIP_RECIPE.fill[2] + lift[i]!);
  return { width: W, height: H, grey };
}

export type GripRecipe = typeof GRIP_RECIPE | typeof GRIP_RECIPE_HIGH;

/** The grit height field (lift per pixel, before the fill colour) for a recipe on a W x H tile. */
export function gripLift(R: GripRecipe, W: number, H: number): Float32Array {
  const rand = mulberry32(R.seed);
  // One lift value per pixel; the fill colour is added at the end, so all three channels move together.
  const lift = new Float32Array(W * H);
  for (let i = 0; i < lift.length; i++) lift[i] = Math.floor(rand() * (2 * R.jitter + 1)) - R.jitter;

  for (let g = 0; g < R.grains; g++) {
    const cx = rand() * W;
    const cy = rand() * H;
    const pick = rand();
    let radius: number = R.grainRadii[R.grainRadii.length - 1]![0];
    let acc = 0;
    for (const [r, w] of R.grainRadii) {
      acc += w;
      if (pick < acc) {
        radius = r;
        break;
      }
    }
    const r = rand();
    const L = R.lift.base + R.lift.scale * r * r;
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (dist >= radius) continue;
        const i = (((y % H) + H) % H) * W + (((x % W) + W) % W);
        lift[i]! += L * (1 - dist / radius);
      }
    }
  }
  for (let g = 0; g < R.glints; g++) {
    const i = Math.floor(rand() * H) * W + Math.floor(rand() * W);
    lift[i]! += R.glintLift;
  }
  return lift;
}

/** High grip colour (1024 px, RGB, the fill applied to all three channels) and its lift field. */
export function gripHigh(): { color: Pixels; lift: Float32Array } {
  const { width: W, height: H } = TEXTURES_HIGH.grip;
  const lift = gripLift(GRIP_RECIPE_HIGH, W, H);
  const rgb = new Uint8Array(W * H * 3);
  const [fr, fg, fb] = GRIP_RECIPE_HIGH.fill;
  for (let i = 0; i < lift.length; i++) {
    rgb[i * 3] = clampByte(fr + lift[i]!);
    rgb[i * 3 + 1] = clampByte(fg + lift[i]!);
    rgb[i * 3 + 2] = clampByte(fb + lift[i]!);
  }
  return { color: { width: W, height: H, rgb }, lift };
}

/** 2 x 2 box filter of a height field (W and H even). */
export function downsample2(lift: Float32Array, W: number, H: number): Float32Array {
  const w = W / 2, h = H / 2;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = 2 * y * W + 2 * x;
      out[y * w + x] = (lift[i]! + lift[i + 1]! + lift[i + W]! + lift[i + W + 1]!) / 4;
    }
  return out;
}

/**
 * Tangent-space normal map from a wrapping height field: central differences
 * times GRIP_NORMAL_SLOPE (or `slope` across and `slopeY` down the image, for
 * non-square texels such as the ground's), encoded as (n + 1) / 2 in RGB.
 *
 * Green is +Y up the image, glTF's convention ("+X is right and +Y is up").
 * Rows run down the image, so the upward slope is minus the row difference
 * and the normal's y, minus the upward slope, is `+dy`: no negation here.
 * three reads the map in that convention too. glTF UVs are not flipped
 * (v runs down the image), so for a mesh without a TANGENT attribute (every
 * asset here) three's derivative tangent frame has its bitangent along +v,
 * and GLTFLoader compensates by negating `normalScale.y` (three-stdlib
 * loaders/GLTFLoader.js, the `useDerivativeTangents` branch near line 1932).
 * Net effect on the ground: a green above 128 tilts the normal toward
 * world -Z, which is up the image there.
 */
export function normalMapFromHeight(
  lift: Float32Array,
  W: number,
  H: number,
  slope: number = GRIP_NORMAL_SLOPE,
  slopeY: number = slope,
): Pixels {
  const rgb = new Uint8Array(W * H * 3);
  const at = (x: number, y: number) => lift[(((y % H) + H) % H) * W + (((x % W) + W) % W)]!;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * slope;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * slopeY;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * W + x) * 3;
      rgb[i] = clampByte(((-dx / l) * 0.5 + 0.5) * 255);
      rgb[i + 1] = clampByte(((dy / l) * 0.5 + 0.5) * 255);
      rgb[i + 2] = clampByte(((1 / l) * 0.5 + 0.5) * 255);
    }
  return { width: W, height: H, rgb };
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * Linear base colour factor for the grip: red and green scaled so the grey
 * map's fill (the blue value) lands on the recipe's red and green.
 */
export function gripTint(): [number, number, number, number] {
  const [r, g, b] = GRIP_RECIPE.fill;
  const lin = (c: number) => srgbToLinear(c / 255);
  return [lin(r) / lin(b), lin(g) / lin(b), 1, 1].map((n) => Number(n.toFixed(6))) as [number, number, number, number];
}

function fillRows(p: Pixels, from: number, to: number, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  for (let y = from; y < to; y++)
    for (let x = 0; x < p.width; x++) {
      const i = (y * p.width + x) * 3;
      p.rgb[i] = r;
      p.rgb[i + 1] = g;
      p.rgb[i + 2] = b;
    }
}

/** Row where band k of n starts in an image of `height` rows. */
export const bandStart = (k: number, n: number, height: number) => Math.round((k * height) / n);

/** Ply edge stripes (7.3): seven bands top ply first, the last row of bands 1 to 6 is a glue line. */
export function plyPixels(): Pixels {
  const { width, height } = TEXTURES.ply;
  const p: Pixels = { width, height, rgb: new Uint8Array(width * height * 3) };
  const n = PLY_COLORS.length;
  PLY_COLORS.forEach((hex, k) => {
    const from = bandStart(k, n, height);
    const to = bandStart(k + 1, n, height);
    fillRows(p, from, to, hex);
    if (k < n - 1) fillRows(p, to - 1, to, GLUE_COLOR);
  });
  return p;
}

/**
 * High ply stripes (32 x 256): the same seven bands and glue lines, with a
 * seeded per-column brightness jitter so the edge reads as wood grain.
 */
export function plyPixelsHigh(): Pixels {
  const { width, height } = TEXTURES_HIGH.ply;
  const p: Pixels = { width, height, rgb: new Uint8Array(width * height * 3) };
  const n = PLY_COLORS.length;
  PLY_COLORS.forEach((hex, k) => {
    const from = bandStart(k, n, height);
    const to = bandStart(k + 1, n, height);
    fillRows(p, from, to, hex);
    if (k < n - 1) fillRows(p, to - 1, to, GLUE_COLOR);
  });
  const rand = mulberry32(PLY_GRAIN.seed);
  for (let x = 0; x < width; x++) {
    const j = Math.round((rand() * 2 - 1) * PLY_GRAIN.jitter);
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 3;
      // Glue lines keep their colour.
      if (p.rgb[i] === hexToRgb(GLUE_COLOR)[0] && p.rgb[i + 1] === hexToRgb(GLUE_COLOR)[1]) continue;
      p.rgb[i] = clampByte(p.rgb[i]! + j);
      p.rgb[i + 1] = clampByte(p.rgb[i + 1]! + j);
      p.rgb[i + 2] = clampByte(p.rgb[i + 2]! + j);
    }
  }
  return p;
}

/** Colour of wheel lathe segment k (0 to 14), 7.5. */
export function wheelBandColor(k: number): string {
  const B = WHEEL_BANDS;
  if (k === 0 || k === 14) return B.shield;
  if (k === 1 || k === 13) return B.race;
  if (k === 6 || k === 8) return B.shoulder;
  if (k === 7) return B.tread;
  return B.urethane;
}

/** Wheel bands (7.5): one band per lathe segment, because lathe v is point index / 15. */
export function wheelPixels(segments = 15): Pixels {
  const { width, height } = TEXTURES.wheel;
  const p: Pixels = { width, height, rgb: new Uint8Array(width * height * 3) };
  for (let k = 0; k < segments; k++) {
    const from = bandStart(k, segments, height);
    const to = bandStart(k + 1, segments, height);
    fillRows(p, from, to, wheelBandColor(k));
    if (k === 0 || k === 14) {
      // Steel races at both ends of the dark bearing shield.
      fillRows(p, from, from + WHEEL_BANDS.raceRows, WHEEL_BANDS.race);
      fillRows(p, to - WHEEL_BANDS.raceRows, to, WHEEL_BANDS.race);
    }
  }
  return p;
}

const bandHex = (kind: WheelBandKind) => WHEEL_BANDS[kind];

/**
 * High wheel bands (64 x 512): one band per lathe segment of the high
 * profile (27), coloured by WHEEL_HIGH_BAND_KINDS. The bearing is modelled,
 * so the races and the shield are their own segments and need no race rows.
 */
export function wheelPixelsHigh(): Pixels {
  const { width, height } = TEXTURES_HIGH.wheel;
  const p: Pixels = { width, height, rgb: new Uint8Array(width * height * 3) };
  const n = WHEEL_HIGH_BAND_KINDS.length;
  WHEEL_HIGH_BAND_KINDS.forEach((kind, k) => fillRows(p, bandStart(k, n, height), bandStart(k + 1, n, height), bandHex(kind)));
  return p;
}
