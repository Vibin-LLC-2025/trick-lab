// The skate shoe geometry (feet pass, 2026-11-04; construction pass,
// 2026-11-05, ADR-39). The sole is lofted from nested footprint rings (the
// deck's construction) with a groove between the foxing and the outsole edge
// and a toe bumper over the front of the upper. The upper is a shell lofted
// from cross sections along the length, cut open over the ankle and the lace
// gap; a collar roll and an edge bead finish the cut, a lining and an insole
// close the inside, and the tongue is its own padded shape under the
// eyestays. Eyelet rims sit on the eyestays; the laces are flat ribbons with
// a knot and two ends. Pure three geometry, no React. Every number is in
// shoeSpec.ts.
import { BufferAttribute, BufferGeometry, SphereGeometry, Vector3 } from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BUMPER,
  FOOTPRINT,
  LACES,
  SHOE,
  SHOE_PARTS,
  SHOE_TEXTURES,
  SOLE,
  SOLE_ATLAS,
  TOE_SPRING,
  TONGUE,
  UPPER,
  UPPER_ATLAS,
  type ShoePartName,
} from './shoeSpec';

export type Side = 'lateral' | 'medial';
type V3 = [number, number, number];

const L = SHOE.length;
const X0 = -L / 2;
/** Heel join and toe join in x. */
const HEEL_JOIN = X0 + FOOTPRINT.heel.join * L;
const TOE_JOIN = X0 + FOOTPRINT.toe.join * L;
const HEEL_LEN = FOOTPRINT.heel.join * L;
const TOE_LEN = (1 - FOOTPRINT.toe.join) * L;

const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
const smoothstep = (u: number) => {
  const s = clamp01(u);
  return s * s * (3 - 2 * s);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const mix3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

/** Texture v (or u) at a fraction of a pixel band [first, last] of a map `size` pixels long. */
export const band = (rows: readonly [number, number], f: number, size: number) => (rows[0] + clamp01(f) * (rows[1] - rows[0]) + 0.5) / size;
const SOLE_W = SHOE_TEXTURES.sole.width;
const SOLE_H = SHOE_TEXTURES.sole.height;
const UP_W = SHOE_TEXTURES.upper.width;
const UP_H = SHOE_TEXTURES.upper.height;

/** Piecewise-linear profile lookup over (t, value) pairs. */
export function lerpProfile(profile: readonly (readonly [number, number])[], t: number): number {
  const first = profile[0]!;
  const last = profile[profile.length - 1]!;
  if (t <= first[0]) return first[1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < profile.length; i++) {
    const [t1, v1] = profile[i]!;
    const [t0, v0] = profile[i - 1]!;
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return last[1];
}

/** Half width of the footprint's middle region on one side, at x (no inset). */
function middleHalfWidth(x: number, side: Side): number {
  const t = (x - X0) / L;
  const F = FOOTPRINT;
  const w = F.heel[side] + (F.toe[side] - F.heel[side]) * smoothstep((t - F.heel.join) / (F.toe.join - F.heel.join));
  const u = Math.abs(t - F.arch.at) / F.arch.halfWidth;
  const dip = u < 1 ? Math.cos((Math.PI / 2) * u) ** 2 : 0;
  return w - F.arch[side] * dip;
}

/**
 * Half width of the footprint at x on one side, for an outline inset by d
 * (0 outside the inset x range). Superellipse ends from the joins, eased
 * middle with the arch dip.
 */
export function footHalfWidth(x: number, side: Side, d = 0): number {
  if (x < X0 + d || x > -X0 - d) return 0;
  const F = FOOTPRINT;
  let w: number;
  if (x < HEEL_JOIN) {
    const s = Math.min(1, (HEEL_JOIN - x) / (HEEL_LEN - d));
    w = (F.heel[side] - d) * Math.pow(1 - Math.pow(s, F.heel.exponent), 1 / F.heel.exponent);
  } else if (x > TOE_JOIN) {
    const s = Math.min(1, (x - TOE_JOIN) / (TOE_LEN - d));
    w = (F.toe[side] - d) * Math.pow(1 - Math.pow(s, F.toe.exponent), 1 / F.toe.exponent);
  } else {
    w = middleHalfWidth(x, side) - d;
  }
  return Math.max(0, w);
}

/** x positions of one side of a footprint ring: n sine-spaced heel intervals, n uniform, n sine-spaced toe intervals. */
export function footRingXs(d: number, n: number): number[] {
  const xs: number[] = [];
  for (let i = n; i >= 0; i--) xs.push(HEEL_JOIN - (HEEL_LEN - d) * Math.sin((i * Math.PI) / (2 * n)));
  const step = (TOE_JOIN - HEEL_JOIN) / n;
  for (let j = 1; j < n; j++) xs.push(HEEL_JOIN + j * step);
  for (let i = 0; i <= n; i++) xs.push(TOE_JOIN + (TOE_LEN - d) * Math.sin((i * Math.PI) / (2 * n)));
  return xs;
}

/** Toe spring at t: how far the upper and the foxing rise there (the underside never does). */
export function toeSpring(t: number): number {
  const s = clamp01((t - TOE_SPRING.from) / (1 - TOE_SPRING.from));
  return TOE_SPRING.rise * s * s;
}

export interface LoftVertex {
  position: V3;
  uv?: [number, number];
}

export interface LoftOptions {
  /** Rows wrap round (each row is a closed ring). */
  closed?: boolean;
  /** Reverse the winding. */
  flip?: boolean;
  /** Leave out the quads between column `skipColumn` and the next (an opening between two halves of a row). */
  skipColumn?: number;
}

/**
 * Stitches rows of vertices into one smooth-shaded geometry. Coincident
 * vertices (same position and uv) are welded so the shading is continuous
 * over spines and tips. Zero-area triangles are dropped and counted.
 */
export function loft(rows: LoftVertex[][], options: LoftOptions = {}): { geometry: BufferGeometry; dropped: number } {
  const { closed = false, flip = false, skipColumn } = options;
  const pos: number[] = [];
  const uv: number[] = [];
  const hasUv = rows[0]![0]!.uv !== undefined;
  const ids: number[][] = [];
  for (const row of rows) {
    const r: number[] = [];
    for (const v of row) {
      r.push(pos.length / 3);
      pos.push(...v.position);
      if (hasUv) uv.push(...v.uv!);
    }
    ids.push(r);
  }
  const P = (i: number) => new Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const area2 = (a: number, b: number, c: number) => P(b).sub(P(a)).cross(P(c).sub(P(a))).length();
  const index: number[] = [];
  let dropped = 0;
  for (let r = 0; r < rows.length - 1; r++) {
    const n = rows[r]!.length;
    const quads = closed ? n : n - 1;
    for (let p = 0; p < quads; p++) {
      if (p === skipColumn) continue;
      const q = (p + 1) % n;
      const a = ids[r]![p]!, b = ids[r]![q]!, c = ids[r + 1]![q]!, d = ids[r + 1]![p]!;
      const tris = flip ? ([[a, b, c], [a, c, d]] as const) : ([[a, c, b], [a, d, c]] as const);
      for (const [i, j, k] of tris) {
        if (i === j || j === k || i === k || area2(i, j, k) < 1e-13) dropped++;
        else index.push(i, j, k);
      }
    }
  }
  const raw = new BufferGeometry();
  raw.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  if (hasUv) raw.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  raw.setIndex(index);
  const geometry = mergeVertices(raw, 1e-7);
  raw.dispose();
  geometry.computeVertexNormals();
  return { geometry, dropped };
}

/**
 * The winding that faces `out` at the quad (row r, column p) with the
 * default loft winding: true when the loft must be flipped.
 */
function needsFlip(rows: LoftVertex[][], r: number, p: number, out: V3): boolean {
  const a = rows[r]![p]!.position;
  const b = rows[r]![(p + 1) % rows[r]!.length]!.position;
  const c = rows[r + 1]![(p + 1) % rows[r + 1]!.length]!.position;
  // Default winding is (a, c, b).
  return dot(cross(sub(c, a), sub(b, a)), out) < 0;
}

/** A loft wound so the probed quad faces `out`. */
export function loftFacing(rows: LoftVertex[][], probe: { r: number; p: number; out: V3 }, options: Omit<LoftOptions, 'flip'> = {}) {
  return loft(rows, { ...options, flip: needsFlip(rows, probe.r, probe.p, probe.out) });
}

/** Averages the normals of vertices at the same position, so a uv seam does not show in the shading. */
export function smoothSeams(g: BufferGeometry): void {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const groups = new Map<string, number[]>();
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * 1e6)},${Math.round(p.getY(i) * 1e6)},${Math.round(p.getZ(i) * 1e6)}`;
    const list = groups.get(key);
    if (list) list.push(i);
    else groups.set(key, [i]);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    let x = 0, y = 0, z = 0;
    for (const i of list) {
      x += n.getX(i);
      y += n.getY(i);
      z += n.getZ(i);
    }
    const l = Math.hypot(x, y, z) || 1;
    for (const i of list) n.setXYZ(i, x / l, y / l, z / l);
  }
  n.needsUpdate = true;
}

function merged(parts: BufferGeometry[], what: string): BufferGeometry {
  const m = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  if (!m) throw new Error(`mergeGeometries failed for ${what}`);
  return m;
}

// ---------------------------------------------------------------- sole

/** Points per side of a footprint ring and per closed ring. */
const SOLE_N = FOOTPRINT.sidePoints / 3;
export const SOLE_SIDE_POINTS = 3 * SOLE_N + 1;
export const SOLE_RING_POINTS = 2 * SOLE_SIDE_POINTS - 2;

/** One footprint ring at inset d: lateral side heel to toe, then medial side toe to heel (closed). */
function footRing(d: number, spine: boolean): [number, number][] {
  const xs = footRingXs(d, SOLE_N);
  const pts: [number, number][] = [];
  for (let p = 0; p < SOLE_RING_POINTS; p++) {
    const mirrored = p >= SOLE_SIDE_POINTS;
    const i = mirrored ? SOLE_RING_POINTS - p : p;
    const x = xs[i]!;
    if (spine) {
      // The spine runs down the middle of the footprint (between the two sides), not at z = 0.
      pts.push([x, (footHalfWidth(x, 'lateral', d) - footHalfWidth(x, 'medial', d)) / 2]);
    } else {
      pts.push([x, mirrored ? -footHalfWidth(x, 'medial', d) : footHalfWidth(x, 'lateral', d)]);
    }
  }
  return pts;
}

/**
 * Arc position round the footprint (0 at the heel tip, up the lateral side
 * to the toe and back down the medial side to 1), per ring index, from the
 * outline at d = 0. The side wall's texture u, so wear can sit on one side.
 */
export const SOLE_ARC: readonly number[] = (() => {
  const ring = footRing(0, false);
  const cum = [0];
  for (let p = 1; p <= SOLE_RING_POINTS; p++) {
    const a = ring[p - 1]!;
    const b = ring[p % SOLE_RING_POINTS]!;
    cum.push(cum[p - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[SOLE_RING_POINTS]!;
  return cum.map((c) => c / total);
})();
const RING_XS = footRingXs(0, SOLE_N);
/** Arc position of the toe tip. */
export const TOE_ARC = SOLE_ARC[SOLE_SIDE_POINTS - 1]!;

/** Arc position of the footprint edge at x on one side. */
export function footToArc(x: number, side: Side): number {
  const n = SOLE_SIDE_POINTS - 1;
  let i = 0;
  while (i < n - 1 && RING_XS[i + 1]! < x) i++;
  const k = clamp01((x - RING_XS[i]!) / (RING_XS[i + 1]! - RING_XS[i]! || 1));
  if (side === 'lateral') return lerp(SOLE_ARC[i]!, SOLE_ARC[i + 1]!, k);
  // Medial: ring index SOLE_RING_POINTS - i holds x = RING_XS[i].
  return lerp(SOLE_ARC[SOLE_RING_POINTS - i]!, SOLE_ARC[SOLE_RING_POINTS - i - 1]!, k);
}

/** The footprint edge (x, side) at an arc position. */
export function arcToFoot(u: number): { x: number; side: Side } {
  let p = 0;
  while (p < SOLE_RING_POINTS - 1 && SOLE_ARC[p + 1]! < u) p++;
  const k = clamp01((u - SOLE_ARC[p]!) / (SOLE_ARC[p + 1]! - SOLE_ARC[p]! || 1));
  const i0 = p < SOLE_SIDE_POINTS ? p : SOLE_RING_POINTS - p;
  const i1 = p + 1 < SOLE_SIDE_POINTS ? p + 1 : SOLE_RING_POINTS - p - 1;
  return { x: lerp(RING_XS[i0]!, RING_XS[i1]!, k), side: p < SOLE_SIDE_POINTS - 1 ? 'lateral' : 'medial' };
}

const Z_MEDIAL = -FOOTPRINT.toe.medial;
const Z_LATERAL = FOOTPRINT.toe.lateral;

/** Underside texture coordinates: the tread map in plan, u along the length and v across. */
export const treadUv = (x: number, z: number): [number, number] => [
  band([4, SOLE_W - 5], (x - X0) / L, SOLE_W),
  band(SOLE_ATLAS.tread, (z - Z_MEDIAL) / (Z_LATERAL - Z_MEDIAL), SOLE_H),
];

/** Index of the first underside ring (the first with h = 0). */
const SOLE_BOTTOM = SOLE.rings.findIndex((r) => r.h === 0);

/**
 * The sole: nested footprint rings from the top spine over the side wall to
 * the bottom spine. The wall (and the hidden top) carries the wall strip of
 * the sole map by arc position and height, with a seam at the heel tip; the
 * underside carries the tread map in plan. The toe spring lifts every ring
 * above the underside.
 */
export function buildSole(): { geometry: BufferGeometry; dropped: number } {
  const ringRows = SOLE.rings.map((ring) => footRing(ring.d, !!ring.spine));
  const at = (x: number, k: number): number => {
    const h = SOLE.rings[k]!.h;
    return h * (SHOE.soleHeight + toeSpring((x - X0) / L));
  };
  const wall: LoftVertex[][] = [];
  for (let k = 0; k <= SOLE_BOTTOM; k++) {
    const pts = ringRows[k]!;
    const row: LoftVertex[] = [];
    for (let p = 0; p <= SOLE_RING_POINTS; p++) {
      const [x, z] = pts[p % SOLE_RING_POINTS]!;
      row.push({ position: [x, at(x, k), z], uv: [SOLE_ARC[p]!, band(SOLE_ATLAS.wall, 1 - SOLE.rings[k]!.h, SOLE_H)] });
    }
    wall.push(row);
  }
  const bottom: LoftVertex[][] = [];
  for (let k = SOLE_BOTTOM; k < SOLE.rings.length; k++) {
    bottom.push(ringRows[k]!.map(([x, z]) => ({ position: [x, 0, z], uv: treadUv(x, z) })));
  }
  // Rows run top to bottom and rings run lateral heel-to-toe first, which winds outward as is (top normals +Y).
  const w = loft(wall);
  const b = loft(bottom, { closed: true });
  const bump = buildBumper();
  const geometry = merged([w.geometry, b.geometry, bump.geometry], 'the sole');
  smoothSeams(geometry);
  return { geometry, dropped: w.dropped + b.dropped + bump.dropped };
}

// ---------------------------------------------------------------- upper shell

/** The section frame at t: centre line, half width, arch height and exponent, base height. */
export function upperFrame(t: number) {
  const x = X0 + t * L;
  const d = UPPER.inset;
  const wl = footHalfWidth(x, 'lateral', d);
  const wm = footHalfWidth(x, 'medial', d);
  return {
    x,
    a: (wl + wm) / 2,
    zc: (wl - wm) / 2,
    height: lerpProfile(UPPER.heightProfile, t),
    exponent: lerpProfile(UPPER.exponentProfile, t),
    base: SHOE.soleHeight - UPPER.tuck + toeSpring(t),
  };
}

const superG = (c: number, p: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(c)), p)), 1 / p);

/** A point on the arch at t, c (-1 medial edge, 0 the top, +1 lateral edge). */
export function archPoint(t: number, c: number): V3 {
  const f = upperFrame(t);
  return [f.x, f.base + (f.height + UPPER.tuck) * superG(c, f.exponent), f.zc + f.a * c];
}

/** Outward normal of the arch at t, c (finite differences). */
export function archNormal(t: number, c: number): V3 {
  const e = 1e-4;
  const dt = sub(archPoint(Math.min(1, t + e), c), archPoint(Math.max(0, t - e), c));
  const dc = sub(archPoint(t, Math.min(1, c + e)), archPoint(t, Math.max(-1, c - e)));
  let n = norm(cross(dt, dc));
  const f = upperFrame(t);
  const p = archPoint(t, c);
  if (dot(n, [0, p[1] - f.base, p[2] - f.zc]) < 0) n = [-n[0], -n[1], -n[2]];
  return n;
}

/** Half gap of the opening at t (metres from the section's centre line; 0 where the shell is closed). */
export function openingHalfGap(t: number): number {
  const C = UPPER.opening.collar;
  const T = UPPER.opening.throat;
  let g = 0;
  if (t > C.from && t < C.to) {
    const u = Math.abs((t - (C.from + C.to) / 2) / ((C.to - C.from) / 2));
    g = C.halfGap * Math.pow(1 - Math.pow(u, C.exponent), 1 / C.exponent);
  }
  if (t > T.from && t < T.to) {
    const k = (t - T.from) / (T.to - T.from);
    g = Math.max(g, lerp(T.halfGap[0], T.halfGap[1], k) * Math.sqrt(clamp01((T.to - t) / T.roundEnd)));
  }
  return g;
}

/** The opening as an arch parameter: the shell exists where |c| >= openingC(t). */
export function openingC(t: number): number {
  const a = upperFrame(t).a;
  return a > 0 ? Math.min(0.97, openingHalfGap(t) / a) : 0;
}

export const OPENING_FROM = UPPER.opening.collar.from;
export const OPENING_TO = UPPER.opening.throat.to;

/** Section parameter s (0 medial edge, 1 lateral edge) of an arch parameter c: the shell's texture v. */
export const archS = (c: number) => 1 - Math.acos(Math.max(-1, Math.min(1, c))) / Math.PI;

/** Stations along the upper: cosine spaced, plus extra stations at both ends of the opening. */
export function upperStations(): number[] {
  const N = UPPER.stations;
  const R = UPPER.opening.refine;
  const base = Array.from({ length: N + 1 }, (_, i) => (1 - Math.cos((Math.PI * i) / N)) / 2);
  const must = new Set<number>([OPENING_FROM, OPENING_TO]);
  const extra: number[] = [];
  for (let k = 0; k < R.count; k++) {
    const f = R.span * (k / (R.count - 1)) ** 2;
    extra.push(OPENING_FROM + f, OPENING_TO - f);
  }
  const all = [...base, ...extra].sort((a, b) => a - b);
  const out: number[] = [];
  for (const t of all) {
    const last = out[out.length - 1];
    if (last === undefined || t - last > 0.0015) out.push(t);
    else if (must.has(t) && !must.has(last)) out[out.length - 1] = t;
  }
  return out;
}

/** The shell: stations heel to toe, each a medial half (edge to rim) and a lateral half (rim to edge). */
export function buildShell(stations = upperStations()): { geometry: BufferGeometry; dropped: number } {
  const K = UPPER.halfPoints;
  const rows: LoftVertex[][] = stations.map((t) => {
    const phiRim = Math.acos(openingC(t));
    const row: LoftVertex[] = [];
    const vert = (phi: number): LoftVertex => ({
      position: archPoint(t, Math.cos(phi)),
      uv: [t, band(UPPER_ATLAS.shell, 1 - phi / Math.PI, UP_H)],
    });
    for (let j = 0; j < K; j++) row.push(vert(Math.PI - (phiRim * j) / (K - 1)));
    for (let j = 0; j < K; j++) row.push(vert(phiRim * (1 - j / (K - 1))));
    return row;
  });
  const mid = Math.floor(rows.length / 2);
  const p = rows[mid]![K + Math.floor(K / 2)]!.position;
  const f = upperFrame(stations[mid]!);
  return loftFacing(rows, { r: mid, p: K + Math.floor(K / 2), out: [0, p[1] - f.base, p[2] - f.zc] }, { skipColumn: K - 1 });
}

// ---------------------------------------------------------------- collar roll, lining, insole

/** Radius of the rim tube at t: the padded collar round the ankle, a thin bead along the lace gap. */
export const rimRadius = (t: number) =>
  lerp(UPPER.rim.collar, UPPER.rim.bead, smoothstep((t - UPPER.rim.easeFrom) / (UPPER.rim.easeTo - UPPER.rim.easeFrom)));

interface RimPoint {
  t: number;
  c: number;
  at: V3;
  normal: V3;
}

/** The rim of the opening as one closed loop: up the medial side from the heel, back down the lateral side. */
export function rimLoop(stations = upperStations()): RimPoint[] {
  const inside = stations.filter((t) => t >= OPENING_FROM && t <= OPENING_TO);
  const point = (t: number, sign: number): RimPoint => {
    const c = sign * openingC(t);
    return { t, c, at: archPoint(t, c), normal: archNormal(t, c) };
  };
  return [...inside.map((t) => point(t, -1)), ...inside.slice(1, -1).reverse().map((t) => point(t, 1))];
}

/** Tube frames along a closed loop: centre, normal (away from the shell) and binormal. */
function rimFrames(loop: RimPoint[]) {
  return loop.map((p, i) => {
    const prev = loop[(i - 1 + loop.length) % loop.length]!.at;
    const next = loop[(i + 1) % loop.length]!.at;
    const T = norm(sub(next, prev));
    const N = norm(add(p.normal, T, -dot(p.normal, T)));
    const B = cross(T, N);
    const r = rimRadius(p.t);
    return { T, N, B, r, centre: add(p.at, N, -UPPER.rim.sink * r) };
  });
}

/** Arc fractions round a closed loop (0 at the first point, 1 back at it). */
function loopArc(points: V3[]): number[] {
  const cum = [0];
  for (let i = 1; i <= points.length; i++) cum.push(cum[i - 1]! + Math.hypot(...sub(points[i % points.length]!, points[i - 1]!)));
  const total = cum[points.length]!;
  return cum.map((c) => c / total);
}

/** The collar roll and edge bead: a tube round the whole rim, seam at the back of the heel. */
export function buildCollar(stations = upperStations()): { geometry: BufferGeometry; dropped: number } {
  const loop = rimLoop(stations);
  const frames = rimFrames(loop);
  const arc = loopArc(loop.map((p) => p.at));
  const S = UPPER.rim.segments;
  const rows: LoftVertex[][] = [];
  for (let i = 0; i <= loop.length; i++) {
    const f = frames[i % loop.length]!;
    const row: LoftVertex[] = [];
    for (let m = 0; m < S; m++) {
      const th = (2 * Math.PI * m) / S;
      row.push({
        position: add(add(f.centre, f.N, f.r * Math.cos(th)), f.B, f.r * Math.sin(th)),
        uv: [band([4, UP_W - 5], arc[i]!, UP_W), band(UPPER_ATLAS.collar.rows, m / S, UP_H)],
      });
    }
    rows.push(row);
  }
  const r0 = Math.floor(loop.length / 2);
  const out = sub(rows[r0]![0]!.position, frames[r0]!.centre);
  const g = loftFacing(rows, { r: r0, p: 0, out }, { closed: true });
  smoothSeams(g.geometry);
  return g;
}

/**
 * The lining and the insole: from just inside the collar roll down to an
 * insole above the sole top, round the collar and across under the tongue
 * at t `frontAt`, so no view into the opening sees the inside of the shell.
 */
export function buildLining(stations = upperStations()): { geometry: BufferGeometry; dropped: number } {
  const Ln = UPPER.lining;
  const loop = rimLoop(stations);
  const frames = rimFrames(loop);
  const inner = (i: number) => add(frames[i]!.centre, frames[i]!.N, -0.9 * frames[i]!.r);
  const top: V3[] = [];
  const front = Ln.frontAt;
  // Medial side heel to the front, the cross under the tongue, the lateral side back.
  const medial = loop.map((p, i) => ({ p, i })).filter(({ p }) => p.c <= 0 && p.t <= front);
  const lateral = loop.map((p, i) => ({ p, i })).filter(({ p }) => p.c > 0 && p.t <= front);
  for (const { i } of medial) top.push(inner(i));
  const cFront = openingC(front);
  for (let k = 0; k <= Ln.crossPoints + 1; k++) {
    const c = lerp(-cFront, cFront, k / (Ln.crossPoints + 1));
    const p = archPoint(front, c);
    top.push([p[0], p[1] - Ln.frontDrop, p[2]]);
  }
  for (const { i } of lateral) top.push(inner(i));
  const cx = top.reduce((s, p) => s + p[0], 0) / top.length;
  const cz = top.reduce((s, p) => s + p[2], 0) / top.length;
  const yIns = SHOE.soleHeight + Ln.insole;
  const bottom = top.map((p): V3 => [cx + (p[0] - cx) * Ln.shrink, yIns, cz + (p[2] - cz) * Ln.shrink]);
  const arc = loopArc(top);
  const rows: LoftVertex[][] = [];
  for (let k = 0; k <= Ln.rows; k++) {
    const f = k / Ln.rows;
    const row: LoftVertex[] = [];
    for (let i = 0; i <= top.length; i++) {
      const a = top[i % top.length]!;
      const b = bottom[i % top.length]!;
      row.push({
        position: [lerp(a[0], b[0], f * f), lerp(a[1], b[1], f), lerp(a[2], b[2], f * f)],
        uv: [band(UPPER_ATLAS.lining.cols, arc[i]!, UP_W), band(UPPER_ATLAS.lining.rows, f, UP_H)],
      });
    }
    rows.push(row);
  }
  // The lining faces into the opening.
  const r0 = 1;
  const q = rows[r0]![0]!.position;
  const wallG = loftFacing(rows, { r: r0, p: 0, out: [cx - q[0], 0, cz - q[2]] });
  smoothSeams(wallG.geometry);
  // Insole: a fan from the loop's centre, facing up, mapped in plan.
  const xs = bottom.map((p) => p[0]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const zs = bottom.map((p) => p[2]);
  const z0 = Math.min(...zs), z1 = Math.max(...zs);
  const insoleUv = (p: V3): [number, number] => [
    band(UPPER_ATLAS.insole.cols, (p[0] - x0) / (x1 - x0), UP_W),
    band(UPPER_ATLAS.insole.rows, (p[2] - z0) / (z1 - z0), UP_H),
  ];
  const centre: V3 = [cx, yIns, cz];
  const fanRows: LoftVertex[][] = [
    bottom.map((p) => ({ position: p, uv: insoleUv(p) })),
    bottom.map(() => ({ position: centre, uv: insoleUv(centre) })),
  ];
  const fan = loftFacing(fanRows, { r: 0, p: 0, out: [0, 1, 0] }, { closed: true });
  return { geometry: merged([wallG.geometry, fan.geometry], 'the lining'), dropped: wallG.dropped + fan.dropped };
}

// ---------------------------------------------------------------- tongue

/** How far the tongue has risen out of the lace gap at t (0 in the gap, 1 at its top). */
const tongueRise = (t: number) => smoothstep((TONGUE.riseFrom - t) / (TONGUE.riseFrom - TONGUE.top));

/** The tongue's half width at t: the gap plus the overlap under the eyestays, widening to its top. */
export const tongueHalfWidth = (t: number) => lerp(openingHalfGap(t) + TONGUE.overlap, TONGUE.topHalfWidth, tongueRise(t));

/** A point on the tongue's top surface at t and across fraction w (-1 medial edge, +1 lateral edge). */
export function tonguePoint(t: number, w: number): V3 {
  const f = upperFrame(t);
  const c = (w * tongueHalfWidth(t)) / f.a;
  const p = archPoint(t, c);
  return [p[0], p[1] - TONGUE.depth + TONGUE.rise * tongueRise(t), p[2]];
}

/**
 * The tongue: a closed slab, top surface (the tongue's suede) and underside
 * (its lining) joined by rounded edges, from the root under the vamp to a
 * rounded top in front of the ankle.
 */
export function buildTongue(): { geometry: BufferGeometry; dropped: number } {
  const T = TONGUE;
  const n = T.widthPoints;
  const ts: number[] = [];
  for (let i = 0; i <= T.rows; i++) ts.push(lerp(T.root, T.top + T.endLength, i / T.rows));
  for (let i = 1; i <= T.endRows; i++) ts.push(T.top + T.endLength * (1 - i / T.endRows));
  const rows: LoftVertex[][] = ts.map((t) => {
    const e = clamp01((T.top + T.endLength - t) / T.endLength);
    // The rounded top: width and thickness close on a superellipse over the last endLength.
    const k = Math.pow(Math.max(0, 1 - Math.pow(e, 3)), 1 / 3);
    const lift = T.endLength * 0.25 * (1 - k);
    const along = (t - T.top) / (T.root - T.top);
    const row: LoftVertex[] = [];
    const topUv = (w: number): [number, number] => [band(UPPER_ATLAS.tongueTop.cols, along, UP_W), band(UPPER_ATLAS.tongueTop.rows, (w + 1) / 2, UP_H)];
    const underUv = (w: number): [number, number] => [band(UPPER_ATLAS.tongueUnder.cols, along, UP_W), band(UPPER_ATLAS.tongueUnder.rows, (w + 1) / 2, UP_H)];
    const surface = (w: number, down: number): V3 => {
      const p = tonguePoint(t, w * Math.max(k, 0.02));
      return [p[0], p[1] - down * k + lift, p[2]];
    };
    const th = T.thickness;
    for (let j = 0; j < n; j++) {
      const w = -1 + (2 * j) / (n - 1);
      row.push({ position: surface(w, 0), uv: topUv(w) });
    }
    // Lateral edge, rounded: out a little at mid thickness.
    row.push({ position: add(surface(1, th / 2), [0, 0, th * 0.35 * k]), uv: topUv(1) });
    for (let j = n - 1; j >= 0; j--) {
      const w = -1 + (2 * j) / (n - 1);
      row.push({ position: surface(w, th), uv: underUv(w) });
    }
    row.push({ position: add(surface(-1, th / 2), [0, 0, -th * 0.35 * k]), uv: topUv(-1) });
    return row;
  });
  const r0 = Math.floor(T.rows / 2);
  return loftFacing(rows, { r: r0, p: Math.floor(n / 2), out: [0, 1, 0] }, { closed: true });
}

// ---------------------------------------------------------------- eyelets

/** Eyelet stations along the lace gap. */
export function eyeletTs(): number[] {
  const E = UPPER.eyelets;
  return Array.from({ length: E.count }, (_, k) => E.from + ((E.to - E.from) * k) / (E.count - 1));
}

export interface Eyelet {
  t: number;
  side: Side;
  /** Arch parameter of the eyelet's centre. */
  c: number;
  at: V3;
  normal: V3;
  /** Unit tangents in the shell: along the length, and across. */
  u: V3;
  v: V3;
}

/** The twelve eyelets, `edge` outside the gap on each eyestay. */
export function eyelets(): Eyelet[] {
  const out: Eyelet[] = [];
  for (const t of eyeletTs()) {
    const a = upperFrame(t).a;
    for (const side of ['medial', 'lateral'] as const) {
      const c = (side === 'lateral' ? 1 : -1) * (openingC(t) + UPPER.eyelets.edge / a);
      const at = archPoint(t, c);
      const normal = archNormal(t, c);
      const along = norm(sub(archPoint(t + 1e-3, c), archPoint(t - 1e-3, c)));
      const u = norm(add(along, normal, -dot(along, normal)));
      out.push({ t, side, c, at, normal, u, v: cross(normal, u) });
    }
  }
  return out;
}

/** Eyelet rims: a low ring round each hole, proud of the eyestay. */
export function buildEyelets(): { geometry: BufferGeometry; dropped: number } {
  const E = UPPER.eyelets;
  const uv: [number, number] = [band(UPPER_ATLAS.eyelet.cols, 0.5, UP_W), band(UPPER_ATLAS.eyelet.rows, 0.5, UP_H)];
  const parts: BufferGeometry[] = [];
  let dropped = 0;
  for (const e of eyelets()) {
    const ring = (r: number, h: number): LoftVertex[] =>
      Array.from({ length: E.segments }, (_, m) => {
        const a = (2 * Math.PI * m) / E.segments;
        return { position: add(add(add(e.at, e.u, r * Math.cos(a)), e.v, r * Math.sin(a)), e.normal, h), uv };
      });
    const rows = [ring(E.hole, -0.0004), ring(E.hole, E.height), ring(E.rim, E.height), ring(E.rim, -0.0004)];
    const g = loftFacing(rows, { r: 1, p: 0, out: e.normal }, { closed: true });
    parts.push(g.geometry);
    dropped += g.dropped;
  }
  return { geometry: merged(parts, 'the eyelets'), dropped };
}

// ---------------------------------------------------------------- the upper

export function buildUpper(): { geometry: BufferGeometry; dropped: number } {
  const stations = upperStations();
  const pieces = [buildShell(stations), buildCollar(stations), buildLining(stations), buildTongue(), buildEyelets()];
  return {
    geometry: merged(
      pieces.map((p) => p.geometry),
      'the upper',
    ),
    dropped: pieces.reduce((n, p) => n + p.dropped, 0),
  };
}

// ---------------------------------------------------------------- toe bumper

/** Toe bumper height above the sole top at t. */
export const bumperHeight = (t: number) => BUMPER.height * smoothstep((t - BUMPER.from) / (BUMPER.full - BUMPER.from));

/** The arch parameter where the bumper's top edge crosses the section at t (0: it covers the whole section). */
export function bumperC(t: number): number {
  const f = upperFrame(t);
  const g = (bumperHeight(t) + UPPER.tuck) / (f.height + UPPER.tuck);
  return g >= 1 ? 0 : Math.pow(1 - Math.pow(g, f.exponent), 1 / f.exponent);
}

/** The toe bumper: a rubber band over the front of the upper, in the sole material. */
export function buildBumper(): { geometry: BufferGeometry; dropped: number } {
  const B = BUMPER;
  const K = B.halfPoints;
  const XT = -X0;
  const rows: LoftVertex[][] = [];
  for (let i = 0; i <= B.stations; i++) {
    const t = lerp(B.from, 1, Math.sin((Math.PI / 2) * (i / B.stations)));
    const f = upperFrame(t);
    const cb = bumperC(t);
    const lip = B.thickness * (1 - smoothstep(cb / 0.15));
    const inside: V3 = [Math.min(f.x, XT - 0.03), f.base + 0.004, f.zc];
    const vert = (c: number, offset: number): LoftVertex => {
      const p = archPoint(t, c);
      const dir = norm(sub(p, inside));
      const side: Side = c >= 0 ? 'lateral' : 'medial';
      const u = TOE_ARC + Math.abs(c) * (footToArc(f.x, side) - TOE_ARC);
      const v = band(SOLE_ATLAS.bumper, (p[1] - f.base) / (B.height + UPPER.tuck), SOLE_H);
      // Proud of the upper, but never past the toe tip: the shoe stays 285 mm long.
      const q = add(p, dir, offset);
      return { position: [Math.min(q[0], XT), q[1], q[2]], uv: [u, v] };
    };
    const row: LoftVertex[] = [];
    for (let j = 0; j < K; j++) row.push(vert(-(1 - ((1 - cb) * j) / (K - 1)), j === 0 ? B.baseThickness : B.thickness));
    row.push(vert(-cb, lip), vert(cb, lip));
    for (let j = K - 1; j >= 0; j--) row.push(vert(1 - ((1 - cb) * j) / (K - 1), j === 0 ? B.baseThickness : B.thickness));
    rows.push(row);
  }
  const r0 = Math.floor(B.stations / 2);
  const q = rows[r0]![2]!.position;
  const f = upperFrame(lerp(B.from, 1, Math.sin((Math.PI / 2) * (r0 / B.stations))));
  return loftFacing(rows, { r: r0, p: 2, out: [0, q[1] - f.base, q[2] - f.zc] }, { skipColumn: K });
}

// ---------------------------------------------------------------- laces

/** Height of whatever a lace passes over at (x, z): the tongue in the gap, the eyestay (and its bead) outside it. */
export function laceGround(x: number, z: number): number {
  const t = clamp01((x - X0) / L);
  const f = upperFrame(t);
  const c = Math.max(-1, Math.min(1, (z - f.zc) / f.a));
  const co = openingC(t);
  if (Math.abs(c) < co) return tonguePoint(t, c / (tongueHalfWidth(t) / f.a))[1];
  const r = rimRadius(t);
  const nearEdge = 1 - clamp01((Math.abs(c) - co) / ((2 * r) / f.a));
  return archPoint(t, c)[1] + 1.1 * r * nearEdge;
}

/** A flat lace along a path: a six-sided rounded-rectangle section, the wide side against the surface normal. */
export function ribbon(path: V3[], normals: V3[], halfWidths: number[], halfThicks: number[]): { geometry: BufferGeometry; dropped: number } {
  const rows: LoftVertex[][] = path.map((p, i) => {
    const T = norm(sub(path[Math.min(path.length - 1, i + 1)]!, path[Math.max(0, i - 1)]!));
    const N = norm(add(normals[i]!, T, -dot(normals[i]!, T)));
    const B = cross(T, N);
    const w = halfWidths[i]!;
    const h = halfThicks[i]!;
    const section: [number, number][] = [
      [w, 0],
      [0.85 * w, h],
      [-0.85 * w, h],
      [-w, 0],
      [-0.85 * w, -h],
      [0.85 * w, -h],
    ];
    return section.map(([sx, sy]) => ({ position: add(add(p, B, sx), N, sy) }));
  });
  const r0 = Math.floor(path.length / 2);
  return loftFacing(rows, { r: r0, p: 1, out: norm(add(normals[r0]!, normals[r0 + 1] ?? normals[r0]!)) }, { closed: true });
}

/** Normal of the surface under a lace at (x, z): the arch's, so a lace lies flat and does not twist over the bead. */
function laceNormal(x: number, z: number): V3 {
  const t = clamp01((x - X0) / L);
  const f = upperFrame(t);
  return archNormal(t, Math.max(-1, Math.min(1, (z - f.zc) / f.a)));
}

/**
 * Laces: a bar across the bottom pair, criss-cross spans up to the top pair
 * (one lace riding over the other at each crossing), from the top pair to a
 * small knot, and two short ends with aglets falling to the sides.
 */
export function buildLaces(): BufferGeometry {
  const C = LACES;
  const hw = C.width / 2;
  const ht = C.thickness / 2;
  const all = eyelets();
  const eye = (k: number, side: Side) => all.find((e) => e.t === eyeletTs()[k] && e.side === side)!;
  const parts: BufferGeometry[] = [];
  const rest = (p: V3, extra = 0): V3 => [p[0], Math.max(p[1], laceGround(p[0], p[2]) + ht + C.clearance + extra), p[2]];

  /** A span from an eyelet to an eyelet (or a point), diving into the holes at its eyelet ends. */
  const span = (a: Eyelet, b: Eyelet | V3, over: boolean) => {
    const top = UPPER.eyelets.height + ht + C.clearance;
    const A = add(a.at, a.normal, top);
    const Bp = Array.isArray(b) ? b : add(b.at, b.normal, top);
    // Where the lace goes down into a hole its path runs along the eyelet normal, so its section is turned
    // to face along the span (back along it going in, forward coming out, so the section does not mirror).
    const chord = norm(sub(Bp, A));
    const path: V3[] = [add(a.at, a.normal, -0.0015)];
    const normals: V3[] = [[-chord[0], -chord[1], -chord[2]]];
    const widths: number[] = [C.eyeletWidth / 2];
    for (let i = 0; i <= C.samples; i++) {
      const s = i / C.samples;
      const lift = over ? C.cross * Math.min(1, 1.6 * Math.sin(Math.PI * s)) : 0;
      const p = rest(mix3(A, Bp, s), lift);
      path.push(p);
      normals.push(i === 0 ? a.normal : laceNormal(p[0], p[2]));
      const toEnd = Array.isArray(b) ? s : Math.min(s, 1 - s);
      widths.push(lerp(C.eyeletWidth / 2, hw, smoothstep(toEnd / C.taper)));
    }
    if (!Array.isArray(b)) {
      path.push(add(b.at, b.normal, -0.0015));
      normals.push(chord);
      widths.push(C.eyeletWidth / 2);
      normals[normals.length - 2] = b.normal;
    }
    parts.push(ribbon(path, normals, widths, widths.map(() => ht)).geometry);
  };

  const n = C.count;
  span(eye(n - 1, 'medial'), eye(n - 1, 'lateral'), false);
  for (let k = n - 2; k >= 0; k--) {
    span(eye(k + 1, 'lateral'), eye(k, 'medial'), k % 2 === 0);
    span(eye(k + 1, 'medial'), eye(k, 'lateral'), k % 2 === 1);
  }
  // The knot over the top pair.
  const t0 = eyeletTs()[0]!;
  const f0 = upperFrame(t0);
  const kx = f0.x - 0.004;
  const knot: V3 = [kx, laceGround(kx, f0.zc) + C.knot.lift, f0.zc];
  span(eye(0, 'medial'), knot, true);
  span(eye(0, 'lateral'), knot, true);
  const k = new SphereGeometry(1, C.knot.widthSegments, C.knot.heightSegments);
  k.deleteAttribute('uv');
  k.scale(...C.knot.size);
  k.translate(...knot);
  k.computeVertexNormals();
  parts.push(k);
  // Two ends from the knot, lying on the shoe, each ending in an aglet.
  const E = C.ends;
  ([1, -1] as const).forEach((sign, i) => {
    const length = E.length[i]!;
    const path: V3[] = [knot];
    const normals: V3[] = [[0, 1, 0]];
    const widths: number[] = [hw * 0.7];
    const thicks: number[] = [ht];
    let travelled = 0;
    let prev = knot;
    for (let j = 1; j <= E.samples; j++) {
      const s = j / E.samples;
      const t = t0 - 0.004 + (sign > 0 ? 0.012 : 0.022) * s;
      const f = upperFrame(t);
      const c = sign * (0.12 + 0.72 * s);
      const p = rest([f.x, archPoint(t, c)[1], f.zc + f.a * c], UPPER.eyelets.height);
      travelled += Math.hypot(...sub(p, prev));
      prev = p;
      const aglet = smoothstep((travelled - (length - E.aglet)) / 0.002);
      path.push(p);
      normals.push(laceNormal(p[0], p[2]));
      widths.push(lerp(hw, E.agletWidth / 2, aglet));
      thicks.push(lerp(ht, E.agletThickness / 2, aglet));
      if (travelled >= length) break;
    }
    // Close the end.
    const last = path[path.length - 1]!;
    const dir = norm(sub(last, path[path.length - 2]!));
    path.push(add(last, dir, 0.0008));
    normals.push(normals[normals.length - 1]!);
    widths.push(0.0003);
    thicks.push(0.0003);
    parts.push(ribbon(path, normals, widths, thicks).geometry);
  });
  return merged(parts, 'the laces');
}

// ---------------------------------------------------------------- the shoe

export interface ShoeBuild {
  parts: Record<ShoePartName, BufferGeometry>;
  droppedTriangles: number;
}

export function buildShoe(): ShoeBuild {
  const sole = buildSole();
  const upper = buildUpper();
  const parts: Record<ShoePartName, BufferGeometry> = {
    Shoe_Sole: sole.geometry,
    Shoe_Upper: upper.geometry,
    Shoe_Laces: buildLaces(),
  };
  return { parts, droppedTriangles: sole.dropped + upper.dropped };
}

export const triangleCount = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

export function shoeTriangles(build: ShoeBuild): Record<ShoePartName, number> {
  return Object.fromEntries(SHOE_PARTS.map((p) => [p.node, triangleCount(build.parts[p.node])])) as Record<ShoePartName, number>;
}
