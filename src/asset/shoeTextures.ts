// Deterministic shoe textures (feet pass, 2026-11-04; construction and wear
// pass, 2026-11-05, ADR-39). Two maps, laid out by SOLE_ATLAS and
// UPPER_ATLAS in shoeSpec.ts:
// - the sole (RGB): the side wall by arc position and height (outsole edge,
//   groove, foxing with its stripe), the toe bumper, and the waffle tread in
//   plan, with scuffs and dirt where a skater wears them;
// - the upper (one grey channel, tinted by the material's base colour
//   factor, like the medium grip): the shell's panels, seams, stitching,
//   eyelet holes, suede nap and wear, the tongue, the collar, the lining,
//   the insole and the eyelet metal.
// Same conventions as textures.ts: row 0 is the top of the image (uv v = 0).
import { TOE_ARC, archPoint, eyelets, footHalfWidth, openingC, upperFrame, archS } from './shoe';
import { SHOE, SHOE_COLORS, SHOE_TEXTURES, SHOE_WEAR, SOLE, SOLE_ATLAS, UPPER, UPPER_ATLAS } from './shoeSpec';
import { hexToRgb, type GreyPixels, type Pixels } from './textures';

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
const smoothstep = (u: number) => {
  const s = clamp01(u);
  return s * s * (3 - 2 * s);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const L = SHOE.length;
const X0 = -L / 2;

/** Integer hash to [0, 1): seeded, no period. */
function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise in [0, 1) at (x, y) in lattice units: smooth, seeded, not periodic. */
export function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

/** Pixel band [first, last] to a fraction (the inverse of shoe.ts band() at a pixel centre). */
const inBand = (rows: readonly [number, number], y: number) => (y - rows[0]) / (rows[1] - rows[0]);

/** The blue value of a hex colour: the grey map stores it (the tint scales red and green). */
const grey = (hex: string) => hexToRgb(hex)[2];

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Linear base colour factor for the upper: red and green scaled so the grey map lands on the upper's colour. */
export function upperTint(): [number, number, number, number] {
  const [r, g, b] = hexToRgb(SHOE_COLORS.upper);
  const lin = (c: number) => srgbToLinear(c / 255);
  return [lin(r) / lin(b), lin(g) / lin(b), 1, 1].map((n) => Number(n.toFixed(6))) as [number, number, number, number];
}

const W = SHOE_WEAR;

/** Suede nap in grey levels at a pixel: a fine octave and a broad mottle, both seeded hash noise. */
function nap(x: number, y: number, k = 1): number {
  const N = W.nap;
  const fine = (valueNoise(x / N.fineScale, y / N.fineScale, W.seed) - 0.5) * 2 * N.fine;
  const mottle = (valueNoise(x / N.mottleScale, y / N.mottleScale, W.seed + 1) - 0.5) * 2 * N.mottle;
  return k * fine + mottle;
}

/** Metres along the section per unit of s at (t, s): converts the shell's v to millimetres. */
function sectionScale(t: number, s: number): number {
  const e = 0.002;
  const phi = Math.PI * (1 - s);
  const a = archPoint(t, Math.cos(phi + e));
  const b = archPoint(t, Math.cos(phi - e));
  return (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / (2 * e)) * Math.PI;
}

/** The upper map: one grey channel, 1024 x 1024 (shoeSpec.ts UPPER_ATLAS). */
export function upperPixels(): GreyPixels {
  const { width: Wd, height: H } = SHOE_TEXTURES.upper;
  const out = new Uint8Array(Wd * H);
  const A = UPPER_ATLAS;
  const shellRows = A.shell[1] - A.shell[0];
  const tone = {
    upper: grey(SHOE_COLORS.upper),
    toeCap: grey(SHOE_COLORS.toeCap),
    tongue: grey(SHOE_COLORS.tongue),
    heel: grey(SHOE_COLORS.heelCounter),
    heelTab: grey(SHOE_COLORS.heelTab),
    eyelet: grey(SHOE_COLORS.eyelet),
    collar: grey(SHOE_COLORS.collar),
    lining: grey(SHOE_COLORS.lining),
    insole: grey(SHOE_COLORS.insole),
    backing: grey(SHOE_COLORS.backing),
    scuff: grey(SHOE_COLORS.scuff),
  };
  // Per column (t) values the shell needs.
  const cols = Array.from({ length: Wd }, (_, x) => {
    const t = (x + 0.5) / Wd;
    const f = upperFrame(t);
    return { t, co: openingC(t), a: f.a };
  });
  const holes = eyelets().map((e) => {
    const s = archS(e.c);
    const mPerS = sectionScale(e.t, s);
    return { x: e.t * Wd, y: A.shell[0] + s * shellRows, rx: (UPPER.eyelets.hole / L) * Wd, ry: (UPPER.eyelets.hole / mPerS) * shellRows };
  });
  const P = W.patch;
  const Cr = W.creases;
  const St = W.stitch;
  const stitch = (along: number, distMm: number) => Math.abs(distMm - St.offset * 1000) < 0.35 && along % St.every < St.length;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < Wd; x++) {
      let v: number;
      if (y <= A.shell[1] + 6) {
        const { t, co, a } = cols[x]!;
        const s = clamp01(inBand(A.shell, y));
        const c = Math.cos(Math.PI * (1 - s));
        const e2 = (2 * s - 1) ** 2;
        const toeSeam = lerp(UPPER.toeCap.top, UPPER.toeCap.edge, e2);
        const heelSeam = lerp(UPPER.heelCounter.top, UPPER.heelCounter.edge, e2);
        const eyestay = t > UPPER.opening.throat.from - 0.02 && t < UPPER.opening.throat.to + 0.01 && Math.abs(c) < co + 0.009 / Math.max(a, 1e-3);
        v = t >= toeSeam ? tone.toeCap : t <= heelSeam ? tone.heel : tone.upper;
        if (eyestay) v += 3;
        // The heel tab: a small patch at the top of the back seam, under the collar.
        if (t < 0.035 && Math.abs(s - 0.5) < 0.08) v = tone.heelTab;
        let napK = 1;
        // Stitching beside the seams, 4 mm into the panel.
        if (stitch(y, Math.abs(t - toeSeam) * L * 1000) && t > toeSeam) v += St.lift;
        if (stitch(y, Math.abs(t - heelSeam) * L * 1000) && t < heelSeam) v += St.lift;
        if (eyestay && t > UPPER.opening.throat.from && stitch(x, (Math.abs(c) - co) * a * 1000 - 5)) v += St.lift;
        // Flex creases across the vamp.
        if (s > Cr.s[0] && s < Cr.s[1]) {
          const fade = Math.sin((Math.PI * (s - Cr.s[0])) / (Cr.s[1] - Cr.s[0]));
          for (let i = 0; i < Cr.count; i++) {
            const tc = lerp(Cr.from, Cr.to, i / (Cr.count - 1)) + 0.006 * Math.sin(Math.PI * 2 * s + i * 1.7);
            const d = (t - tc) * Wd;
            if (Math.abs(d) < Cr.width * 2) v += (d < 0 ? -Cr.depth : Cr.depth * 0.5) * fade * Math.exp(-(d * d) / (Cr.width * Cr.width));
          }
        }
        // Scuffed toe front.
        if (t > W.toeScuff.from) {
          const k = ((t - W.toeScuff.from) / (1 - W.toeScuff.from)) * valueNoise(x / 6, y / 6, W.seed + 2);
          v = lerp(v, tone.scuff, W.toeScuff.amount * k);
          napK *= 1 - 0.5 * k;
        }
        // The worn patch at the lateral forefoot: scuffed nap, through to the dark backing at its core.
        const dt = (t - P.t) / P.rt;
        const ds = (s - P.s) / P.rs;
        const ragged = (valueNoise(x / P.noiseScale, y / P.noiseScale, W.seed + 3) - 0.5) * 0.5;
        const d = Math.hypot(dt, ds) + ragged;
        if (d < 1) {
          const k = smoothstep((1 - d) / 0.6);
          v = lerp(v, tone.scuff, P.scuff * k);
          napK *= 1 - 0.6 * k;
          if (d < P.core) v = tone.backing + 2 * valueNoise(x / 2, y / 2, W.seed + 4);
          else if (d < P.core + P.coreEdge) v = lerp(tone.scuff + 8, v, (d - P.core) / P.coreEdge);
        }
        v += nap(x, y, napK);
        for (const h of holes) {
          const q = ((x + 0.5 - h.x) / h.rx) ** 2 + ((y + 0.5 - h.y) / h.ry) ** 2;
          if (q < 1) v = tone.backing;
        }
      } else if (y <= A.tongueTop.rows[1] + 6) {
        if (x < (A.tongueTop.cols[1] + A.tongueUnder.cols[0]) / 2) {
          const along = clamp01(inBand(A.tongueTop.cols, x));
          const w = clamp01(inBand(A.tongueTop.rows, y)) * 2 - 1;
          v = tone.tongue + nap(x, y);
          const edgeMm = (1 - Math.abs(w)) * 16;
          const topMm = along * (TONGUE_LENGTH * 1000);
          if ((Math.abs(edgeMm - 3) < 0.4 && x % St.every < St.length) || (Math.abs(topMm - 3) < 0.5 && y % St.every < St.length && Math.abs(w) < 0.85)) v += St.lift;
        } else {
          v = tone.lining + (((x >> 1) + (y >> 1)) & 1) * 3;
        }
      } else if (y <= A.collar.rows[1] + 6) {
        v = tone.collar + nap(x, y, 0.5);
      } else if (x < (A.lining.cols[1] + A.insole.cols[0]) / 2) {
        v = tone.lining + (((x >> 1) + (y >> 1)) & 1) * 3;
      } else if (x < (A.insole.cols[1] + A.eyelet.cols[0]) / 2) {
        // Insole: darker where the heel sits (the low columns are the heel end).
        const u = clamp01(inBand(A.insole.cols, x));
        v = tone.insole - 8 * Math.exp(-(((u - 0.15) / 0.18) ** 2)) + nap(x, y, 0.6);
      } else {
        v = tone.eyelet;
      }
      out[y * Wd + x] = clampByte(v);
    }
  }
  return { width: Wd, height: H, grey: out };
}

/** The tongue's length (root to top), for its stitching in millimetres. */
const TONGUE_LENGTH = 0.34 * L;

const mixRgb = (a: readonly number[], b: readonly number[], k: number): [number, number, number] => [
  lerp(a[0]!, b[0]!, k),
  lerp(a[1]!, b[1]!, k),
  lerp(a[2]!, b[2]!, k),
];

/** Scuffs on the foxing and the bumper at an arc position: share of the dirt colour, with streaky noise. */
function foxingScuff(u: number, x: number, y: number): number {
  const F = W.foxing;
  let k = 0;
  for (let i = 0; i < F.at.length; i++) k += F.amount[i]! * Math.exp(-(((u - F.at[i]!) / F.spread[i]!) ** 2));
  const streak = valueNoise(x / F.noiseScale, y / (F.noiseScale / 4), W.seed + 5);
  return k * smoothstep((streak - 0.3) / 0.5);
}

/** The sole map: RGB, 1024 x 512 (shoeSpec.ts SOLE_ATLAS). */
export function solePixels(): Pixels {
  const { width: Wd, height: H } = SHOE_TEXTURES.sole;
  const p: Pixels = { width: Wd, height: H, rgb: new Uint8Array(Wd * H * 3) };
  const c = {
    sole: hexToRgb(SHOE_COLORS.sole),
    foxing: hexToRgb(SHOE_COLORS.foxing),
    outsole: hexToRgb(SHOE_COLORS.outsole),
    groove: hexToRgb(SHOE_COLORS.groove),
    tread: hexToRgb(SHOE_COLORS.tread),
    treadGroove: hexToRgb(SHOE_COLORS.treadGroove),
    dirt: hexToRgb(SHOE_COLORS.dirt),
  };
  const A = SOLE_ATLAS;
  const T = W.tread;
  const zMed = -0.055, zLat = 0.05;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < Wd; x++) {
      const u = (x + 0.5) / Wd;
      let rgb: [number, number, number];
      if (y < (A.wall[1] + A.bumper[0]) / 2) {
        const h = 1 - clamp01(inBand(A.wall, y));
        const base =
          h >= SOLE.foxing.from && h <= SOLE.foxing.to
            ? c.foxing
            : h >= SOLE.step.from && h <= SOLE.step.to
              ? c.groove
              : h < SOLE.step.from
                ? c.outsole
                : c.sole;
        rgb = [...base] as [number, number, number];
        // Fine vertical ribs on the outsole edge.
        if (h < SOLE.step.from && x % 4 === 0) rgb = mixRgb(rgb, c.groove, 0.35);
        // Grime toward the ground, scuffs where the board rubs.
        const grime = 0.1 * (1 - smoothstep(h / 0.35)) * valueNoise(x / 10, y / 3, W.seed + 6);
        rgb = mixRgb(rgb, c.dirt, grime + foxingScuff(u, x, y) * (0.4 + 0.6 * (1 - h)));
      } else if (y < (A.bumper[1] + A.tread[0]) / 2) {
        const f = clamp01(inBand(A.bumper, y));
        rgb = [...c.sole] as [number, number, number];
        if (f > 0.92) rgb = mixRgb(rgb, c.groove, 0.5);
        const tip = Math.exp(-(((u - TOE_ARC) / 0.03) ** 2));
        rgb = mixRgb(rgb, c.dirt, foxingScuff(u, x, y) * 0.9 + 0.12 * tip * valueNoise(x / 5, y / 5, W.seed + 7));
      } else {
        // Tread, in plan.
        const t = clamp01(inBand([4, Wd - 5], x));
        const xm = X0 + t * L;
        const zm = zMed + clamp01(inBand(A.tread, y)) * (zLat - zMed);
        const inside = Math.min(footHalfWidth(xm, 'lateral') - zm, footHalfWidth(xm, 'medial') + zm);
        const worn = T.worn * Math.max(...T.wornAt.map((w, i) => Math.exp(-(((t - w) / T.wornSpread[i]!) ** 2))));
        const a = (xm + zm) / T.cell;
        const b = (xm - zm) / T.cell;
        const g = T.groove / T.cell;
        const groove = (a - Math.floor(a) < g || b - Math.floor(b) < g) && inside > 0.004;
        rgb = groove ? mixRgb(c.treadGroove, c.tread, worn) : [...c.tread];
        // The rim round the tread: a smooth band, with a groove line on its inner edge.
        if (inside > 0.0035 && inside < 0.0045) rgb = mixRgb(c.treadGroove, c.tread, 0.4);
        const dirt = T.dirt * valueNoise(x / 18, y / 18, W.seed + 8) + (groove ? 0.12 : 0) - 0.08 * worn;
        rgb = mixRgb(rgb, c.dirt, Math.max(0, dirt));
      }
      const i = (y * Wd + x) * 3;
      p.rgb[i] = clampByte(rgb[0]);
      p.rgb[i + 1] = clampByte(rgb[1]);
      p.rgb[i + 2] = clampByte(rgb[2]);
    }
  }
  return p;
}

