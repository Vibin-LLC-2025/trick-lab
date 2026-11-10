// Deterministic texture pixels from docs/DESIGN.md 7.3 and 7.5. Pure: returns
// RGB bytes (row 0 is the top row of the image, the glTF convention). The deck
// graphic is not here: it is rasterized from assets/source/deck-graphic.svg by
// the build script.
import { halfWidth } from './deck';
import {
  DECK_WEAR,
  GLUE_COLOR,
  OUTLINE,
  GRIP_NORMAL_SLOPE,
  GRIP_RECIPE,
  GRIP_RECIPE_HIGH,
  PLY_COLORS,
  PLY_GRAIN,
  TEXTURES,
  TEXTURES_HIGH,
  WHEEL_BANDS,
  WHEEL_HIGH_BAND_KINDS,
  WHEEL_PRINT,
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

/**
 * The wheel print (ADR-67) over rows `from` to `to` (the outer face's band):
 * the texel columns whose centre falls in one of WHEEL_PRINT's arcs of u,
 * inside the band's inset.
 */
export function printWheel(p: Pixels, from: number, to: number) {
  const inset = Math.round((to - from) * WHEEL_PRINT.inset);
  const [r, g, b] = hexToRgb(WHEEL_PRINT.color);
  for (let y = from + inset; y < to - inset; y++)
    for (let x = 0; x < p.width; x++) {
      const u = (x + 0.5) / p.width;
      if (!WHEEL_PRINT.arcs.some(([a, z]) => u >= a && u < z)) continue;
      const i = (y * p.width + x) * 3;
      p.rgb[i] = r;
      p.rgb[i + 1] = g;
      p.rgb[i + 2] = b;
    }
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
    if (k === WHEEL_PRINT.segment.medium) printWheel(p, from, to);
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
  const k = WHEEL_PRINT.segment.high;
  printWheel(p, bandStart(k, n, height), bandStart(k + 1, n, height));
  return p;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Seeded 2D value noise on a lattice of `cell` metres (not tiling: the deck is one piece). Returns [0, 1]. */
function deckNoise(rand: () => number, cell: number) {
  const N = 256;
  const table = new Float32Array(N * N);
  for (let i = 0; i < table.length; i++) table[i] = rand();
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, z: number) => {
    const gx = x / cell + 128, gz = z / cell + 128;
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const fx = fade(gx - x0), fz = fade(gz - z0);
    const at = (i: number, j: number) => table[(((j % N) + N) % N) * N + (((i % N) + N) % N)]!;
    const a = at(x0, z0), b = at(x0 + 1, z0), c = at(x0, z0 + 1), d = at(x0 + 1, z0 + 1);
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  };
}

/** Deck plan point (x along the deck, z across) of a texel centre of the deck-bottom map (deck.ts deckUv, graphic group). */
export function deckBottomPoint(c: number, r: number, W: number, H: number): [number, number] {
  return [OUTLINE.tailTip + ((c + 0.5) / W) * OUTLINE.length, OUTLINE.width / 2 - ((r + 0.5) / H) * OUTLINE.width];
}

/** The deck wear on a texel grid: the mask (0 clean print, 1 bare wood) and the maple grain. */
export interface DeckWear {
  mask: Float32Array;
  /** About -1 to 1. */
  grain: Float32Array;
  /**
   * The grain under the print: the same lines with x snapped to
   * DECK_WEAR.grain.block, so each texel row is constant over a block
   * (2 grey levels of grain cannot show the jog, and a PNG row filter then
   * predicts it almost for free: 2 KB instead of 14 KB on Medium).
   */
  printGrain: Float32Array;
}

/** Outline points near the tips (inset 0), for the distance to the edge. */
function tipOutline(): [number, number][] {
  const pts: [number, number][] = [];
  const E = DECK_WEAR.edge;
  const n = 400;
  const ease = (t: number) => 1 - Math.cos((t * Math.PI) / 2);
  for (let i = 0; i <= n; i++) {
    // Sine spacing toward each tip, where the outline turns fastest.
    const t = ease(i / n);
    for (const x of [OUTLINE.tailTip + t * (E.tail.reach + 0.02), OUTLINE.noseTip - t * (E.nose.reach + 0.02)]) {
      const w = halfWidth(x);
      pts.push([x, w], [x, -w]);
    }
  }
  return pts;
}

/**
 * The deck wear mask and grain on a W x H grid of the deck-bottom map
 * (DECK_WEAR). Every mark is placed in metres, so the same seed gives the
 * same marks at every resolution.
 */
export function deckWear(W: number, H: number): DeckWear {
  const D = DECK_WEAR;
  const rand = mulberry32(D.seed);
  const mask = new Float32Array(W * H);
  const grain = new Float32Array(W * H);
  const printGrain = new Float32Array(W * H);
  const sx = OUTLINE.length / W, sz = OUTLINE.width / H;

  const lines = deckNoise(rand, D.grain.period);
  const wave = deckNoise(rand, D.grain.wave.length);
  const ragged = deckNoise(rand, D.edge.cell);
  const haze = deckNoise(rand, D.haze.cell);
  // Grain: lines along x whose z wanders slowly; the lattice is stretched 40 times along x so the lines run with the deck.
  const grainAt = (x: number, z: number) => lines(x / 40, z + (wave(x, 0.37) * 2 - 1) * D.grain.wave.amplitude) * 2 - 1;
  const B = D.grain.block;
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const [x, z] = deckBottomPoint(c, r, W, H);
      grain[r * W + c] = grainAt(x, z);
      printGrain[r * W + c] = grainAt((Math.floor((x - OUTLINE.tailTip) / B) + 0.5) * B + OUTLINE.tailTip, z);
    }

  // Slide scratches across the middle, tapered at both ends.
  const S = D.scratches;
  const between = ([a, b]: readonly [number, number]) => a + (b - a) * rand();
  for (let k = 0; k < S.count; k++) {
    const cx = between(S.x);
    const cz = (rand() * 2 - 1) * (OUTLINE.width / 2 - 0.012);
    const len = between(S.length);
    const width = between(S.width);
    const strength = between(S.strength);
    const ang = ((rand() * 2 - 1) * S.angleDeg * Math.PI) / 180;
    const dx = Math.sin(ang), dz = Math.cos(ang);
    const steps = Math.ceil(len / (Math.min(sx, sz) * 0.5));
    const reach = Math.ceil(width / Math.min(sx, sz)) + 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps - 0.5;
      const px = cx + dx * t * len, pz = cz + dz * t * len;
      const taper = Math.sin((t + 0.5) * Math.PI) ** 0.6;
      const c0 = Math.floor((px - OUTLINE.tailTip) / sx - 0.5), r0 = Math.floor((OUTLINE.width / 2 - pz) / sz - 0.5);
      for (let r = r0 - reach; r <= r0 + reach + 1; r++)
        for (let c = c0 - reach; c <= c0 + reach + 1; c++) {
          if (r < 0 || r >= H || c < 0 || c >= W) continue;
          const [qx, qz] = deckBottomPoint(c, r, W, H);
          const m = strength * taper * (1 - smooth(width * 0.25, width, Math.hypot(qx - px, qz - pz)));
          if (m > mask[r * W + c]!) mask[r * W + c] = m;
        }
    }
  }

  // The tips: a scuff haze, and scraped to wood at the outline.
  const E = D.edge;
  const outline = tipOutline();
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const [x, z] = deckBottomPoint(c, r, W, H);
      const fromTail = x - OUTLINE.tailTip, fromNose = OUTLINE.noseTip - x;
      const tail = fromTail < fromNose;
      const along = tail ? fromTail : fromNose;
      const i = r * W + c;
      const outside = Math.abs(z) > halfWidth(x);
      if (along < D.haze.reach && !outside) {
        const h = (tail ? D.haze.tail : D.haze.nose) * (1 - smooth(0, D.haze.reach, along)) * smooth(D.haze.above[0], D.haze.above[1], haze(x, z));
        if (h > mask[i]!) mask[i] = h;
      }
      const e = tail ? E.tail : E.nose;
      if (along > e.reach) continue;
      // Outside the outline the texel is never seen (only mipmaps reach it): plain wood, no grain, cheap to store.
      if (outside) {
        mask[i] = 1;
        grain[i] = 0;
        continue;
      }
      let d2 = Infinity;
      for (const [ox, oz] of outline) d2 = Math.min(d2, (ox - x) * (ox - x) + (oz - z) * (oz - z));
      const d = Math.sqrt(d2);
      const tip = 1 - smooth(0, e.reach, along);
      const width = e.width[0] + (e.width[1] - e.width[0]) * tip * (0.55 + 0.45 * ragged(x, z));
      const m = e.strength * (0.35 + 0.65 * tip) * (1 - smooth(width * 0.6, width, d));
      if (m > mask[i]!) mask[i] = m;
    }
  return { mask, grain, printGrain };
}

/**
 * Bakes the wear over the rasterized graphic (RGB): the print takes the
 * grain faintly, goes pale where scuffed and gives way to bare maple (with
 * its grain) where the mask is high. Returns the colour and, from the same
 * mask, the roughness per texel (DECK_WEAR.roughness: print, scuffed, wood).
 */
export function wearDeckBottom(graphic: Pixels): { color: Pixels; roughness: Float32Array; wear: DeckWear } {
  const D = DECK_WEAR;
  const { width: W, height: H } = graphic;
  const wear = deckWear(W, H);
  const wood = hexToRgb(D.wood);
  const pale = hexToRgb(D.scuff.color);
  const rgb = new Uint8Array(W * H * 3);
  const roughness = new Float32Array(W * H);
  const R = D.roughness;
  for (let i = 0; i < W * H; i++) {
    const m = wear.mask[i]!;
    const g = wear.grain[i]!;
    const pg = wear.printGrain[i]!;
    const bare = smooth(D.expose[0], D.expose[1], m);
    const scuff = Math.min(1, m / D.expose[0]);
    for (let ch = 0; ch < 3; ch++) {
      const print = graphic.rgb[i * 3 + ch]! + pg * D.grain.print;
      const scraped = print + (pale[ch]! - print) * D.scuff.mix * scuff;
      const maple = wood[ch]! + g * D.grain.wood;
      rgb[i * 3 + ch] = clampByte(scraped + (maple - scraped) * bare);
    }
    roughness[i] = R.print + (R.scuffed - R.print) * scuff + (R.wood - R.scuffed) * bare;
  }
  return { color: { width: W, height: H, rgb }, roughness, wear };
}

/** One grey channel of a 0 to 1 field, box filtered down to W x H (a power-of-two fraction of the field). */
export function greyFromField(field: Float32Array, fw: number, fh: number, W: number, H: number): GreyPixels {
  let f = field, w = fw, h = fh;
  while (w > W) {
    f = downsample2(f, w, h);
    w /= 2;
    h /= 2;
  }
  if (w !== W || h !== H) throw new Error(`greyFromField: ${fw} x ${fh} does not halve to ${W} x ${H}`);
  const grey = new Uint8Array(W * H);
  for (let i = 0; i < grey.length; i++) grey[i] = clampByte(f[i]! * 255);
  return { width: W, height: H, grey };
}
