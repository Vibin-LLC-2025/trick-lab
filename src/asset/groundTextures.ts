// Deterministic concrete textures for the ground GLB (realistic ground pass,
// 2026-11-04, ADR-31). One tile is one slab bay (groundSpec.ts BAY): a
// shallow expansion joint along its edges, a faint worn painted centre mark,
// aggregate, pits, a few hairline cracks and large-scale tonal variation.
// Everything wraps, so the tile repeats without a seam. Same conventions as
// textures.ts: pure, seeded with mulberry32, row 0 is the top of the image.
//
// Texel coordinates: column c is x = (c + 0.5) * BAY.x / W from the tile's
// left joint, row r is z = (r + 0.5) * BAY.z / H from its top joint. The
// ground plane maps +u to world +X and +v (down the image) to world +Z, and
// the tile's centre (u, v = 0.5) to a bay centre under the resting board.
import { BAY, CONCRETE, GROUND_TEXTURES, JOINT, MARK, ROUGHNESS, WHEEL_MARKS } from './groundSpec';
import { downsample2, hexToRgb, mulberry32, normalMapFromHeight, type GreyPixels, type Pixels } from './textures';

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Periodic value noise over the tile: a random lattice of nx x nz cells that
 * wraps, sampled with a quintic fade. Returns values in [0, 1].
 */
function valueNoise(rand: () => number, nx: number, nz: number) {
  const lattice = new Float32Array(nx * nz);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (u: number, v: number) => {
    const x = u * nx, z = v * nz;
    const x0 = Math.floor(x), z0 = Math.floor(z);
    const fx = fade(x - x0), fz = fade(z - z0);
    const i0 = ((x0 % nx) + nx) % nx, i1 = (i0 + 1) % nx;
    const j0 = ((z0 % nz) + nz) % nz, j1 = (j0 + 1) % nz;
    const a = lattice[j0 * nx + i0]!, b = lattice[j0 * nx + i1]!;
    const c = lattice[j1 * nx + i0]!, d = lattice[j1 * nx + i1]!;
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  };
}

/** Tileable fBm: `octaves` of value noise from cells of `cell` metres, halving each time. Returns about [-1, 1]. */
function fbm(rand: () => number, cell: number, octaves: number) {
  const layers = Array.from({ length: octaves }, (_, o) => {
    const c = cell / 2 ** o;
    return valueNoise(rand, Math.max(1, Math.round(BAY.x / c)), Math.max(1, Math.round(BAY.z / c)));
  });
  const norm = layers.reduce((n, _, o) => n + 0.5 ** o, 0);
  return (u: number, v: number) => {
    let s = 0;
    for (let o = 0; o < layers.length; o++) s += layers[o]!(u, v) * 0.5 ** o;
    return (s / norm) * 2 - 1;
  };
}

/** The concrete surface on the colour and normal grid, before encoding. */
export interface ConcreteSurface {
  width: number;
  height: number;
  /** Grey level offset from CONCRETE.fill per texel (not yet clamped). */
  grey: Float32Array;
  /** Surface height in metres (0 is the slab top, the joint is negative). */
  lift: Float32Array;
  /** Roughness 0 to 1. */
  rough: Float32Array;
}

/** Distance in metres from texel (c, r) centre to the nearest bay edge (the joint's centre line). */
export function jointDistance(c: number, r: number, W: number, H: number): number {
  const x = ((c + 0.5) * BAY.x) / W;
  const z = ((r + 0.5) * BAY.z) / H;
  return Math.min(x, BAY.x - x, z, BAY.z - z);
}

/** Joint profile: 1 across the flat bottom, easing to 0 over the rounded shoulders. */
export const jointProfile = (d: number) => 1 - smoothstep(JOINT.width / 2 - JOINT.shoulder, JOINT.width / 2, d);

let cached: ConcreteSurface | null = null;

/** Builds (once) the concrete surface: grey, height and roughness fields on a W x H grid. */
export function concreteSurface(): ConcreteSurface {
  if (cached) return cached;
  const { width: W, height: H } = GROUND_TEXTURES.color;
  const sx = BAY.x / W, sz = BAY.z / H;
  const n = W * H;
  const grey = new Float32Array(n);
  const lift = new Float32Array(n);
  const rough = new Float32Array(n);
  const rand = mulberry32(CONCRETE.seed);
  const C = CONCRETE;

  // Continuous fields: tone, mottle, grain, roughness wear, paint wear.
  const tone = fbm(rand, C.tone.cell, C.tone.octaves);
  const mottle = fbm(rand, C.mottle.cell, C.mottle.octaves);
  const grain = fbm(rand, C.grain.cell, 1);
  const worn = fbm(rand, ROUGHNESS.worn.cell, ROUGHNESS.worn.octaves);
  const paintWear = fbm(rand, MARK.wear.cell, 3);
  const R = ROUGHNESS;
  for (let r = 0; r < H; r++) {
    const v = (r + 0.5) / H;
    const z = v * BAY.z - BAY.z / 2;
    for (let c = 0; c < W; c++) {
      const u = (c + 0.5) / W;
      const x = u * BAY.x - BAY.x / 2;
      const i = r * W + c;
      grey[i] = tone(u, v) * C.tone.amplitude + mottle(u, v) * C.mottle.amplitude + grain(u, v) * C.grain.amplitude;
      // Worn smoother where the wear noise is low, and around the bay centre where boards roll.
      const w = (worn(u, v) + 1) / 2;
      let ro = w < R.worn.below ? R.base + (R.worn.to - R.base) * smoothstep(R.worn.below, 0, w) : R.base;
      const e = Math.hypot(x / R.centre.radius[0], z / R.centre.radius[1]);
      ro -= R.centre.by * (1 - smoothstep(0.4, 1, e));
      rough[i] = ro;
      // Painted centre mark, worn through in places, soft over a texel at its edges.
      const wear = (paintWear(u, v) + 1) / 2;
      const ragged = (wear - 0.5) * 2 * MARK.edge;
      const inMark =
        (1 - smoothstep(MARK.length / 2 - sx, MARK.length / 2 + sx, Math.abs(x) - ragged)) *
        (1 - smoothstep(MARK.width / 2 - sz, MARK.width / 2 + sz, Math.abs(z) - ragged));
      if (inMark > 0) {
        const MW = MARK.wear;
        const kept = MW.kept + (1 - MW.kept) * smoothstep(MW.below - MW.soft, MW.below + MW.soft, wear);
        const paint = inMark * kept;
        grey[i]! += MARK.levels * paint;
        rough[i] = rough[i]! + (MARK.roughness - rough[i]!) * paint;
      }
      // Wheel marks of the resting board: four soft ellipses.
      for (const sxn of [-1, 1])
        for (const szn of [-1, 1]) {
          const d = Math.hypot((x - sxn * WHEEL_MARKS.x) / WHEEL_MARKS.radius[0], (z - szn * WHEEL_MARKS.z) / WHEEL_MARKS.radius[1]);
          if (d < 1) {
            const k = 1 - smoothstep(0, 1, d);
            grey[i]! += WHEEL_MARKS.levels * k;
            rough[i]! += WHEEL_MARKS.roughness * k;
          }
        }
    }
  }

  /** Visits the texels within `radius` metres of (x, z) (tile metres, wrapping), with their distance. */
  const stamp = (x: number, z: number, radius: number, fn: (i: number, d: number) => void) => {
    const cx = x / sx - 0.5, cz = z / sz - 0.5;
    const rx = radius / sx, rz = radius / sz;
    for (let r = Math.floor(cz - rz); r <= Math.ceil(cz + rz); r++)
      for (let c = Math.floor(cx - rx); c <= Math.ceil(cx + rx); c++) {
        const d = Math.hypot((c - cx) * sx, (r - cz) * sz);
        if (d >= radius) continue;
        fn((((r % H) + H) % H) * W + (((c % W) + W) % W), d);
      }
  };
  const between = ([a, b]: readonly [number, number]) => a + (b - a) * rand();

  // Exposed aggregate: lighter or darker specks, a little proud and smoother.
  const A = C.aggregate;
  for (let k = 0; k < A.count; k++) {
    const x = rand() * BAY.x, z = rand() * BAY.z, rad = between(A.radius);
    const level = (rand() * 2 - 1) * A.levels;
    // Only the larger stones stand proud; the small ones are flush (and cost the normal map nothing).
    const proud = rad > A.proudAbove ? A.height : 0;
    stamp(x, z, rad, (i, d) => {
      const t = 1 - (d / rad) ** 2;
      grey[i]! += level * Math.min(1, t * 2);
      lift[i]! += proud * t;
      rough[i]! += A.roughness * t;
    });
  }
  // Pits: sunk, darker.
  const P = C.pits;
  for (let k = 0; k < P.count; k++) {
    const x = rand() * BAY.x, z = rand() * BAY.z, rad = between(P.radius);
    stamp(x, z, rad, (i, d) => {
      const t = 1 - (d / rad) ** 2;
      grey[i]! += P.levels * t;
      lift[i]! -= P.depth * t;
      rough[i]! += 0.05 * t;
    });
  }
  // Dust: rough specks.
  for (let k = 0; k < R.dust.count; k++) {
    const x = rand() * BAY.x, z = rand() * BAY.z, rad = between(R.dust.radius);
    stamp(x, z, rad, (i, d) => {
      const t = 1 - d / rad;
      rough[i] = rough[i]! + (R.dust.to - rough[i]!) * t * 0.6;
    });
  }
  // Hairline cracks: a random walk that stops at the joint.
  const K = C.cracks;
  const crack = new Float32Array(n);
  for (let k = 0; k < K.count; k++) {
    let x = BAY.x * (0.1 + 0.8 * rand()), z = BAY.z * (0.1 + 0.8 * rand());
    let a = rand() * Math.PI * 2;
    const steps = Math.round(between(K.length) / K.step);
    for (let s = 0; s < steps; s++) {
      a += (rand() - 0.5) * K.wander;
      x += Math.cos(a) * K.step;
      z += Math.sin(a) * K.step;
      if (Math.min(x, BAY.x - x, z, BAY.z - z) < JOINT.width) break;
      stamp(x, z, K.width, (i, d) => {
        crack[i] = Math.max(crack[i]!, 1 - d / K.width);
      });
    }
  }
  for (let i = 0; i < n; i++) {
    const t = crack[i]!;
    if (t <= 0) continue;
    grey[i]! += K.levels * t;
    lift[i]! -= K.depth * t;
  }
  // The expansion joint along the bay edges: sunk, darker, rough.
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const t = jointProfile(jointDistance(c, r, W, H));
      if (t <= 0) continue;
      const i = r * W + c;
      grey[i]! += JOINT.levels * t;
      lift[i]! -= JOINT.depth * t;
      rough[i] = rough[i]! + (JOINT.roughness - rough[i]!) * t;
    }

  // Recentre the grey on the fill so the tint factor lands the mean on CONCRETE.color.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += grey[i]!;
  mean /= n;
  for (let i = 0; i < n; i++) grey[i]! -= mean;

  cached = { width: W, height: H, grey, lift, rough };
  return cached;
}

/** Colour map: one grey channel around CONCRETE.fill, tinted by the base colour factor (concreteTint). */
export function concreteColor(): GreyPixels {
  const s = concreteSurface();
  const out = new Uint8Array(s.width * s.height);
  for (let i = 0; i < out.length; i++) out[i] = clampByte(CONCRETE.fill + s.grey[i]!);
  return { width: s.width, height: s.height, grey: out };
}

/** Tangent-space normal map (glTF convention, as the high grip) from the height field, slopes in metres per metre. */
export function concreteNormal(): Pixels {
  const s = concreteSurface();
  const { width: W, height: H } = GROUND_TEXTURES.normal;
  if (W !== s.width || H !== s.height) throw new Error('concreteNormal: the normal map must match the surface grid');
  return normalMapFromHeight(s.lift, W, H, W / BAY.x, H / BAY.z);
}

/** Roughness map: one grey channel (glTF reads green as roughness and blue as metalness, times a metallic factor of 0). */
export function concreteRoughness(): GreyPixels {
  const s = concreteSurface();
  const { width: W, height: H } = GROUND_TEXTURES.roughness;
  let field = s.rough;
  let w = s.width, h = s.height;
  while (w > W) {
    field = downsample2(field, w, h);
    w /= 2;
    h /= 2;
  }
  const out = new Uint8Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = clampByte(field[i]! * 255);
  return { width: W, height: H, grey: out };
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Linear base colour factor: the grey map's fill times this lands on CONCRETE.color. */
export function concreteTint(): [number, number, number, number] {
  const fill = srgbToLinear(CONCRETE.fill / 255);
  const [r, g, b] = hexToRgb(CONCRETE.color).map((c) => srgbToLinear(c / 255) / fill);
  return [r!, g!, b!, 1].map((x) => Number(x.toFixed(6))) as [number, number, number, number];
}
