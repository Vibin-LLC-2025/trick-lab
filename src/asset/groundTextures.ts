// Deterministic concrete textures for the ground GLB (realistic ground pass,
// 2026-11-04, ADR-31; varied bays, 2026-11-05, ADR-38). Each map is a tile
// of GROUND_TEXTURES[key].bays slab bays (groundSpec.ts): the normal map one
// bay, the colour map four different bays (2 x 2), the roughness map nine
// (3 x 3). The fine relief (a shallow expansion joint along every bay edge,
// aggregate, pits) is one bay, shared by the normal map and, box filtered,
// by the colour map; everything that would show a repeat (tone, slab shade,
// cracks, stains, the worn painted mark, the wheel marks, worn roughness)
// is drawn per bay of the larger tiles. Everything wraps, so each tile
// repeats without a seam. Same conventions as textures.ts: pure, seeded with
// mulberry32, row 0 is the top of the image.
//
// Texel coordinates: column c of a W-wide tile of n bays is
// x = (c + 0.5) * n * BAY.x / W from the tile's left joint, row r likewise
// in z. The ground plane maps +u to world +X and +v (down the image) to world
// +Z, and the plane's centre to the centre of originBay(key) of each tile,
// the bay under the resting board.
import {
  BAY,
  CONCRETE,
  GROUND_TEXTURES,
  JOINT,
  MARK,
  originBay,
  ROUGHNESS,
  WHEEL_MARKS,
  type GroundTextureKey,
} from './groundSpec';
import { downsample2, hexToRgb, mulberry32, normalMapFromHeight, type GreyPixels, type Pixels } from './textures';

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Periodic value noise over a tile: a random lattice of nx x nz cells that
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

/**
 * Tileable fBm over a tile of `tx` by `tz` metres (u, v in [0, 1] across it):
 * `octaves` of value noise from cells of `cell` metres, halving each time.
 * Returns about [-1, 1].
 */
function fbm(rand: () => number, cell: number, octaves: number, tx: number = BAY.x, tz: number = BAY.z) {
  const layers = Array.from({ length: octaves }, (_, o) => {
    const c = cell / 2 ** o;
    return valueNoise(rand, Math.max(1, Math.round(tx / c)), Math.max(1, Math.round(tz / c)));
  });
  const norm = layers.reduce((n, _, o) => n + 0.5 ** o, 0);
  return (u: number, v: number) => {
    let s = 0;
    for (let o = 0; o < layers.length; o++) s += layers[o]!(u, v) * 0.5 ** o;
    return (s / norm) * 2 - 1;
  };
}

/** The one-bay fine surface on the normal map's grid, before encoding. */
export interface ConcreteSurface {
  width: number;
  height: number;
  /** Fine grey detail (grain, aggregate, pits, joint), offset from CONCRETE.fill per texel (not yet clamped or centred). */
  grey: Float32Array;
  /** Surface height in metres (0 is the slab top, the joint is negative). */
  lift: Float32Array;
}

/** Distance in metres from texel (c, r) centre of a one-bay W x H grid to the nearest bay edge (the joint's centre line). */
export function jointDistance(c: number, r: number, W: number, H: number): number {
  const x = ((c + 0.5) * BAY.x) / W;
  const z = ((r + 0.5) * BAY.z) / H;
  return bayEdgeDistance(x, z);
}

/** Distance in metres from a point (metres from a tile's top-left joint, any number of bays in) to the nearest bay edge. */
export function bayEdgeDistance(x: number, z: number): number {
  const fx = x - Math.floor(x / BAY.x) * BAY.x;
  const fz = z - Math.floor(z / BAY.z) * BAY.z;
  return Math.min(fx, BAY.x - fx, fz, BAY.z - fz);
}

/** Joint profile: 1 across the flat bottom, easing to 0 over the rounded shoulders. */
export const jointProfile = (d: number) => 1 - smoothstep(JOINT.width / 2 - JOINT.shoulder, JOINT.width / 2, d);

let cached: ConcreteSurface | null = null;

/** Builds (once) the one-bay fine surface: grey detail and height on the normal map's grid. */
export function concreteSurface(): ConcreteSurface {
  if (cached) return cached;
  const { width: W, height: H } = GROUND_TEXTURES.normal;
  const sx = BAY.x / W, sz = BAY.z / H;
  const n = W * H;
  const grey = new Float32Array(n);
  const lift = new Float32Array(n);
  const rand = mulberry32(CONCRETE.seed);
  const C = CONCRETE;

  const grain = fbm(rand, C.grain.cell, 1);
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) grey[r * W + c] = grain((c + 0.5) / W, (r + 0.5) / H) * C.grain.amplitude;

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

  // Exposed aggregate: lighter or darker specks; the larger stones a little proud.
  const A = C.aggregate;
  for (let k = 0; k < A.count; k++) {
    const x = rand() * BAY.x, z = rand() * BAY.z, rad = between(A.radius);
    const level = (rand() * 2 - 1) * A.levels;
    const proud = rad > A.proudAbove ? A.height : 0;
    stamp(x, z, rad, (i, d) => {
      const t = 1 - (d / rad) ** 2;
      grey[i]! += level * Math.min(1, t * 2);
      lift[i]! += proud * t;
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
    });
  }
  // The expansion joint along the bay edges: sunk and darker.
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const t = jointProfile(jointDistance(c, r, W, H));
      if (t <= 0) continue;
      const i = r * W + c;
      grey[i]! += JOINT.levels * t;
      lift[i]! -= JOINT.depth * t;
    }

  cached = { width: W, height: H, grey, lift };
  return cached;
}

/** A map's tile: texel size in metres, tile size in metres, and its bays. */
function tileOf(key: GroundTextureKey) {
  const T = GROUND_TEXTURES[key];
  const [bx, bz] = T.bays;
  return { W: T.width, H: T.height, bx, bz, tx: bx * BAY.x, tz: bz * BAY.z, sx: (bx * BAY.x) / T.width, sz: (bz * BAY.z) / T.height };
}

/** The painted centre mark's coverage at (x, z) metres from a bay centre, with its wear (0 none, 1 full paint). */
function markPaint(x: number, z: number, wear: number, sx: number, sz: number): number {
  const ragged = (wear - 0.5) * 2 * MARK.edge;
  const inMark =
    (1 - smoothstep(MARK.length / 2 - sx, MARK.length / 2 + sx, Math.abs(x) - ragged)) *
    (1 - smoothstep(MARK.width / 2 - sz, MARK.width / 2 + sz, Math.abs(z) - ragged));
  if (inMark <= 0) return 0;
  const MW = MARK.wear;
  return inMark * (MW.kept + (1 - MW.kept) * smoothstep(MW.below - MW.soft, MW.below + MW.soft, wear));
}

/** The four wheel marks of the resting board at (x, z) metres from the bay centre: 0 to 1. */
function wheelMark(x: number, z: number): number {
  let k = 0;
  for (const sxn of [-1, 1])
    for (const szn of [-1, 1]) {
      const d = Math.hypot((x - sxn * WHEEL_MARKS.x) / WHEEL_MARKS.radius[0], (z - szn * WHEEL_MARKS.z) / WHEEL_MARKS.radius[1]);
      if (d < 1) k += 1 - smoothstep(0, 1, d);
    }
  return k;
}

/** The colour map's tile as grey offsets from CONCRETE.fill (centred, not clamped). */
export function concreteColorField(): Float32Array {
  const s = concreteSurface();
  const { W, H, bx, bz, tx, tz, sx, sz } = tileOf('color');
  // The fine detail, box filtered from the normal map's grid to this map's texels per bay.
  let fine = s.grey;
  let fw = s.width, fh = s.height;
  const bw = W / bx, bh = H / bz;
  while (fw > bw) {
    fine = downsample2(fine, fw, fh);
    fw /= 2;
    fh /= 2;
  }
  if (fw !== bw || fh !== bh) throw new Error('concreteColor: a bay of the colour tile must be a power-of-two fraction of the normal map');

  const C = CONCRETE;
  const rand = mulberry32(C.seed + 1);
  const tone = fbm(rand, C.tone.cell, C.tone.octaves, tx, tz);
  const mottle = fbm(rand, C.mottle.cell, C.mottle.octaves, tx, tz);
  const paintWear = fbm(rand, MARK.wear.cell, 3, tx, tz);
  const between = ([a, b]: readonly [number, number]) => a + (b - a) * rand();
  const slab = Array.from({ length: bx * bz }, () => (rand() * 2 - 1) * C.slab.levels);
  const [ox, oz] = originBay('color');
  const grey = new Float32Array(W * H);
  for (let r = 0; r < H; r++) {
    const z = (r + 0.5) * sz;
    const bzI = Math.floor(z / BAY.z);
    for (let c = 0; c < W; c++) {
      const x = (c + 0.5) * sx;
      const bxI = Math.floor(x / BAY.x);
      const i = r * W + c;
      const u = x / tx, v = z / tz;
      let g = fine[(r % bh) * bw + (c % bw)]! + tone(u, v) * C.tone.amplitude + mottle(u, v) * C.mottle.amplitude + slab[bzI * bx + bxI]!;
      if (bxI === ox && bzI === oz) {
        // The bay under the board: the worn painted mark and the wheel marks.
        const lx = x - (bxI + 0.5) * BAY.x, lz = z - (bzI + 0.5) * BAY.z;
        g += MARK.levels * markPaint(lx, lz, (paintWear(u, v) + 1) / 2, sx, sz);
        g += WHEEL_MARKS.levels * wheelMark(lx, lz);
      }
      grey[i] = g;
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

  // Per bay: stains, then hairline cracks that stop at the bay's joint.
  const K = C.cracks;
  const crackWidth = Math.max(K.width, Math.max(sx, sz));
  const crackLevels = (K.levels * K.width) / crackWidth;
  const crack = new Float32Array(W * H);
  for (let bzI = 0; bzI < bz; bzI++)
    for (let bxI = 0; bxI < bx; bxI++) {
      const x0 = bxI * BAY.x, z0 = bzI * BAY.z;
      const stains = Math.floor(rand() * (C.stains.max + 1));
      for (let k = 0; k < stains; k++) {
        const x = x0 + BAY.x * (0.15 + 0.7 * rand()), z = z0 + BAY.z * (0.15 + 0.7 * rand());
        const rad = between(C.stains.radius), level = between(C.stains.levels);
        stamp(x, z, rad, (i, d) => {
          grey[i]! += level * (1 - smoothstep(0.2, 1, d / rad));
        });
      }
      const count = K.perBay[0] + Math.floor(rand() * (K.perBay[1] - K.perBay[0] + 1));
      for (let k = 0; k < count; k++) {
        let x = x0 + BAY.x * (0.1 + 0.8 * rand()), z = z0 + BAY.z * (0.1 + 0.8 * rand());
        let a = rand() * Math.PI * 2;
        const steps = Math.round(between(K.length) / K.step);
        for (let st = 0; st < steps; st++) {
          a += (rand() - 0.5) * K.wander;
          x += Math.cos(a) * K.step;
          z += Math.sin(a) * K.step;
          if (Math.min(x - x0, x0 + BAY.x - x, z - z0, z0 + BAY.z - z) < JOINT.width) break;
          stamp(x, z, crackWidth, (i, d) => {
            crack[i] = Math.max(crack[i]!, 1 - d / crackWidth);
          });
        }
      }
    }
  for (let i = 0; i < crack.length; i++) grey[i]! += crackLevels * crack[i]!;

  // Recentre the grey on the fill so the tint factor lands the mean on CONCRETE.color.
  let mean = 0;
  for (let i = 0; i < grey.length; i++) mean += grey[i]!;
  mean /= grey.length;
  for (let i = 0; i < grey.length; i++) grey[i]! -= mean;
  return grey;
}

/** Colour map: one grey channel around CONCRETE.fill (four bays), tinted by the base colour factor (concreteTint). */
export function concreteColor(): GreyPixels {
  const { width: W, height: H } = GROUND_TEXTURES.color;
  const field = concreteColorField();
  const out = new Uint8Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = clampByte(CONCRETE.fill + field[i]!);
  return { width: W, height: H, grey: out };
}

/** Tangent-space normal map (glTF convention, as the high grip) of the one-bay height field, slopes in metres per metre. */
export function concreteNormal(): Pixels {
  const s = concreteSurface();
  const { width: W, height: H } = GROUND_TEXTURES.normal;
  if (W !== s.width || H !== s.height) throw new Error('concreteNormal: the normal map must match the surface grid');
  return normalMapFromHeight(s.lift, W, H, W / BAY.x, H / BAY.z);
}

/** Roughness 0 to 1 over the roughness map's tile (nine bays). */
export function concreteRoughnessField(): Float32Array {
  const { W, H, bx, bz, tx, tz, sx, sz } = tileOf('roughness');
  const R = ROUGHNESS;
  const rand = mulberry32(CONCRETE.seed + 2);
  const worn = fbm(rand, R.worn.cell, R.worn.octaves, tx, tz);
  const paintWear = fbm(rand, MARK.wear.cell * 4, 2, tx, tz);
  const slab = Array.from({ length: bx * bz }, () => (rand() * 2 - 1) * R.slab);
  const [ox, oz] = originBay('roughness');
  const out = new Float32Array(W * H);
  // 4 x 4 samples per texel for the joint, which is about one texel wide here.
  const SS = 4;
  for (let r = 0; r < H; r++) {
    const z = (r + 0.5) * sz;
    const bzI = Math.floor(z / BAY.z);
    for (let c = 0; c < W; c++) {
      const x = (c + 0.5) * sx;
      const bxI = Math.floor(x / BAY.x);
      const u = x / tx, v = z / tz;
      const w = (worn(u, v) + 1) / 2;
      let ro = w < R.worn.below ? R.base + (R.worn.to - R.base) * smoothstep(R.worn.below, 0, w) : R.base;
      ro += slab[bzI * bx + bxI]!;
      if (bxI === ox && bzI === oz) {
        const lx = x - (bxI + 0.5) * BAY.x, lz = z - (bzI + 0.5) * BAY.z;
        ro -= R.centre.by * (1 - smoothstep(0.4, 1, Math.hypot(lx / R.centre.radius[0], lz / R.centre.radius[1])));
        const paint = markPaint(lx, lz, (paintWear(u, v) + 1) / 2, sx, sz);
        ro += (MARK.roughness - ro) * paint;
        ro += WHEEL_MARKS.roughness * wheelMark(lx, lz);
      }
      let joint = 0;
      for (let a = 0; a < SS; a++)
        for (let b = 0; b < SS; b++) joint += jointProfile(bayEdgeDistance(x + ((a + 0.5) / SS - 0.5) * sx, z + ((b + 0.5) / SS - 0.5) * sz));
      joint /= SS * SS;
      out[r * W + c] = ro + (JOINT.roughness - ro) * joint;
    }
  }
  return out;
}

/** Roughness map: one grey channel (glTF reads green as roughness and blue as metalness, times a metallic factor of 0). */
export function concreteRoughness(): GreyPixels {
  const { width: W, height: H } = GROUND_TEXTURES.roughness;
  const field = concreteRoughnessField();
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
