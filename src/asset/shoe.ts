// The skate shoe geometry (feet pass, 2026-11-04): a bevelled sole lofted
// from nested footprint rings (the deck's construction), an upper lofted
// from cross sections along the length with a valley for the ankle opening
// and the tongue, and laces crossing the valley. Pure three geometry, no
// React. See shoeSpec.ts for every number.
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cylinderOnAxis } from './hardware';
import { FOOTPRINT, LACES, SHOE, SHOE_PARTS, SOLE, UPPER, type ShoePartName } from './shoeSpec';

export type Side = 'lateral' | 'medial';

const L = SHOE.length;
const X0 = -L / 2;
/** Heel join and toe join in x. */
const HEEL_JOIN = X0 + FOOTPRINT.heel.join * L;
const TOE_JOIN = X0 + FOOTPRINT.toe.join * L;
const HEEL_LEN = FOOTPRINT.heel.join * L;
const TOE_LEN = (1 - FOOTPRINT.toe.join) * L;

const smoothstep = (u: number) => {
  const s = Math.min(1, Math.max(0, u));
  return s * s * (3 - 2 * s);
};

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

interface LoftVertex {
  position: [number, number, number];
  uv: [number, number];
}

/**
 * Stitches rows of vertices into one smooth-shaded geometry. Rows wrap
 * (closed rings) when `closed`; `weld` welds coincident positions first so
 * the shading is continuous over spines and tips. Zero-area triangles are
 * dropped and counted.
 */
export function loft(rows: LoftVertex[][], closed: boolean, flip = false): { geometry: BufferGeometry; dropped: number } {
  const pos: number[] = [];
  const uv: number[] = [];
  const ids: number[][] = [];
  for (const row of rows) {
    const r: number[] = [];
    for (const v of row) {
      r.push(pos.length / 3);
      pos.push(...v.position);
      uv.push(...v.uv);
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
  raw.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  raw.setIndex(index);
  const geometry = mergeVertices(raw, 1e-7);
  raw.dispose();
  geometry.computeVertexNormals();
  return { geometry, dropped };
}

/** Points per side of a footprint ring and per closed ring. */
const SOLE_N = FOOTPRINT.sidePoints / 3;
export const SOLE_SIDE_POINTS = 3 * SOLE_N + 1;
export const SOLE_RING_POINTS = 2 * SOLE_SIDE_POINTS - 2;

/** One footprint ring at inset d: lateral side heel to toe, then medial side toe to heel (closed, wound +Y up). */
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

/** The sole: nested footprint rings from the top spine over the bevelled edge to the bottom spine. */
export function buildSole(): { geometry: BufferGeometry; dropped: number } {
  const rows: LoftVertex[][] = SOLE.rings.map((ring) =>
    footRing(ring.d, !!ring.spine).map(([x, z]) => ({
      position: [x, ring.h * SHOE.soleHeight, z],
      uv: [(x - X0) / L, 1 - ring.h],
    })),
  );
  // Rows run top to bottom and rings run lateral heel-to-toe first, which winds outward as is (checked: top normals +Y).
  return loft(rows, true);
}

/** Arch height, valley depth and valley half angle at t. */
export function upperProfileAt(t: number) {
  return {
    height: lerpProfile(UPPER.heightProfile, t),
    exponent: lerpProfile(UPPER.exponentProfile, t),
    valley: lerpProfile(UPPER.valleyProfile, t),
    valleyWidth: lerpProfile(UPPER.valleyWidthProfile, t),
  };
}

/** Section parameter s (0 medial edge, 1 lateral edge) of the valley rims at t. */
export function valleyRims(t: number): { medial: number; lateral: number } {
  const w = upperProfileAt(t).valleyWidth;
  return { medial: 0.5 - w / Math.PI, lateral: 0.5 + w / Math.PI };
}

/**
 * A point on the upper at station t and section parameter s, with the
 * valley applied unless `arch` is set (the rim height, for the laces).
 */
export function upperPoint(t: number, s: number, arch = false): [number, number, number] {
  const x = X0 + t * L;
  const d = UPPER.inset;
  const wl = footHalfWidth(x, 'lateral', d);
  const wm = footHalfWidth(x, 'medial', d);
  const a = (wl + wm) / 2;
  const zc = (wl - wm) / 2;
  const phi = Math.PI * (1 - s);
  const c = Math.cos(phi);
  const { height, exponent, valley, valleyWidth } = upperProfileAt(t);
  const base = SHOE.soleHeight - UPPER.tuck;
  const rise = (height + UPPER.tuck) * Math.pow(1 - Math.pow(Math.abs(c), exponent), 1 / exponent);
  let y = base + rise;
  if (!arch) {
    const u = Math.abs(phi - Math.PI / 2) / valleyWidth;
    if (u < 1) y -= valley * (1 - u * u) ** 2;
  }
  return [x, y, zc + a * c];
}

/** The upper: stations along the length (dense at the tips), sections from the medial edge over the top to the lateral edge. */
export function buildUpper(): { geometry: BufferGeometry; dropped: number } {
  const N = UPPER.stations;
  const M = UPPER.sectionPoints;
  const rows: LoftVertex[][] = [];
  for (let i = 0; i <= N; i++) {
    const t = (1 - Math.cos((Math.PI * i) / N)) / 2;
    const row: LoftVertex[] = [];
    for (let j = 0; j < M; j++) {
      const s = j / (M - 1);
      row.push({ position: upperPoint(t, s), uv: [t, s] });
    }
    rows.push(row);
  }
  // Stations run heel to toe and sections medial to lateral, which winds inward; flip so the top faces +Y.
  return loft(rows, false, true);
}

/** Eyelet stations along the valley. */
export function eyeletTs(): number[] {
  const E = UPPER.eyelets;
  return Array.from({ length: E.count }, (_, k) => E.from + ((E.to - E.from) * k) / (E.count - 1));
}

/** Laces: crossing cylinders between the medial and lateral eyelets of neighbouring stations, plus a straight top lace. */
export function buildLaces(): BufferGeometry {
  const ts = eyeletTs();
  const lift = LACES.lift;
  const at = (t: number, side: Side): [number, number, number] => {
    const rims = valleyRims(t);
    const p = upperPoint(t, rims[side], true);
    return [p[0], p[1] + lift, p[2]];
  };
  const parts: BufferGeometry[] = [];
  const segment = (a: [number, number, number], b: [number, number, number]) => {
    const dir: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...dir);
    parts.push(cylinderOnAxis(a, dir, 0, len, LACES.radius, LACES.radius, LACES.segments));
  };
  for (let k = 0; k < ts.length - 1; k++) {
    segment(at(ts[k]!, 'medial'), at(ts[k + 1]!, 'lateral'));
    segment(at(ts[k]!, 'lateral'), at(ts[k + 1]!, 'medial'));
  }
  segment(at(ts[0]!, 'medial'), at(ts[0]!, 'lateral'));
  for (const p of parts) p.deleteAttribute('uv');
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error('mergeGeometries failed for the laces');
  return merged;
}

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
