// Deck geometry from docs/DESIGN.md 7.2: plan outline, kicks, concave, and the
// 19 nested outline rings that wrap from the top spine over the edge to the
// bottom spine. Pure math plus a three BufferGeometry at the end (no React).
import { BufferAttribute, BufferGeometry } from 'three';
import { CONCAVE, DECK, DECK_DETAIL, KICK, OUTLINE, RINGS, type DeckGroup, type DetailLevel } from './spec';

const O = OUTLINE;

/**
 * Half width of the plan outline at x for a ring inset by d (7.2). Outside
 * the ring's x range, or where the inset eats the width, it is 0.
 */
export function halfWidth(x: number, d = 0): number {
  if (x < O.tailTip + d || x > O.noseTip - d) return 0;
  let w: number;
  if (x < O.tail.join) {
    const s = Math.min(1, (O.tail.join - x) / (O.tail.length - d));
    w = (O.tail.size - d) * Math.pow(1 - Math.pow(s, O.tail.exponent), 1 / O.tail.exponent);
  } else if (x > O.nose.join) {
    const s = Math.min(1, (x - O.nose.join) / (O.nose.length - d));
    w = (O.nose.size - d) * Math.pow(1 - Math.pow(s, O.nose.exponent), 1 / O.nose.exponent);
  } else {
    w = middleHalfWidth(x) - d;
  }
  return Math.max(0, w);
}

/** The middle formula of the outline, valid everywhere (used to normalise the concave). */
export function middleHalfWidth(x: number): number {
  const m = O.middle;
  return m.halfWidth - m.drop * (x / m.dropAt) ** 2;
}

/** s in [0, 1] along a kick, 0 in the flat. */
function kickParam(x: number): { s: number; k: (typeof KICK)['nose'] | (typeof KICK)['tail'] } {
  const k = x >= 0 ? KICK.nose : KICK.tail;
  return { s: Math.min(1, Math.max(0, (Math.abs(x) - KICK.start) / k.length)), k };
}

/** Kick height of the mid surface (7.2): a cubic with zero slope at the outer bolt holes. */
export function kickHeight(x: number): number {
  const { s, k } = kickParam(x);
  return k.a * s * s - k.b * s * s * s;
}

/** Concave strength along the deck: 1 in the flat, easing to 40 percent at the tips. */
export function concaveStrength(x: number): number {
  const { s } = kickParam(x);
  const smooth = s * s * (3 - 2 * s);
  return 1 - (1 - CONCAVE.tipKeep) * smooth;
}

/**
 * Mid surface S(x, z) = kick + concave (7.2). The concave is normalised by the
 * middle outline formula rather than the rounded-end outline: in the flat they
 * are the same, but at the tips the true outline goes to zero width, which
 * makes (z / w)^2 a 0/0 at the tip point and pins the rail at full height all
 * the way round the nose. The middle formula keeps it smooth (DESIGN.md
 * deviation, noted in docs/ASSET-PIPELINE.md).
 */
export function midSurface(x: number, z: number): number {
  const r = z / middleHalfWidth(x);
  return kickHeight(x) + CONCAVE.depth * concaveStrength(x) * r * r;
}

const EPS = 1e-6;

/** Unit normal of the mid surface (pointing +Y-ish), by central differences. */
export function surfaceNormal(x: number, z: number): [number, number, number] {
  const dx = (midSurface(x + EPS, z) - midSurface(x - EPS, z)) / (2 * EPS);
  const dz = (midSurface(x, z + EPS) - midSurface(x, z - EPS)) / (2 * EPS);
  const l = Math.hypot(dx, 1, dz);
  return [-dx / l, 1 / l, -dz / l];
}

/**
 * The x positions of one side of a ring (3n + 1 points, tail tip to nose tip):
 * n sine-spaced tail intervals, n uniform middle intervals, n sine-spaced
 * nose intervals, so the rounded ends get the density. n is 24 on medium
 * (73 points) and 48 on high (145).
 */
export function ringXs(d: number, n: number = O.intervals): number[] {
  const xs: number[] = [];
  for (let i = n; i >= 0; i--) xs.push(O.tail.join - (O.tail.length - d) * Math.sin((i * Math.PI) / (2 * n)));
  const step = (O.nose.join - O.tail.join) / n;
  for (let j = 1; j < n; j++) xs.push(O.tail.join + j * step);
  for (let i = 0; i <= n; i++) xs.push(O.nose.join + (O.nose.length - d) * Math.sin((i * Math.PI) / (2 * n)));
  return xs;
}

/** Points per side (tips included) and per closed ring, for n intervals per region. */
export const sidePoints = (n: number) => 3 * n + 1;
export const ringPoints = (n: number) => 2 * sidePoints(n) - 2;
/** The medium ring's count (144). */
export const RING_POINTS = ringPoints(OUTLINE.intervals);

export interface DeckVertex {
  /** Plan position before the height offset (drives the UVs). */
  px: number;
  pz: number;
  h: number;
  position: [number, number, number];
}

/** Plan point p (0 to ringPoints - 1) of a ring: +z side tail to nose, then -z side nose to tail. */
function planPoint(xs: number[], ring: (typeof RINGS)[number], p: number, n: number): [number, number] {
  const mirrored = p >= sidePoints(n);
  const i = mirrored ? ringPoints(n) - p : p;
  const x = xs[i]!;
  const w = ring.spine ? 0 : halfWidth(x, ring.d);
  return [x, mirrored ? -w : w];
}

export interface DeckBuild {
  /** One geometry per material group: position, normal, uv, index. */
  groups: Record<DeckGroup, BufferGeometry>;
  /** Zero-area triangles dropped while stitching (the spine tips). */
  droppedTriangles: number;
}

/** UVs per group (7.2), glTF convention: v = 0 is the top row of the image. */
export function deckUv(group: DeckGroup, v: DeckVertex): [number, number] {
  const u = (v.px - O.tailTip) / O.length;
  if (group === 'grip') return [u, (v.pz + O.width / 2) / O.width];
  if (group === 'wood') return [u, (DECK.thickness / 2 - v.h) / DECK.thickness];
  return [u, (O.width / 2 - v.pz) / O.width];
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Builds the deck. Vertices are shared between neighbouring bands, so the
 * normals are smooth over the bevels; the spine rings are welded (the +z and
 * -z sides of a spine are the same points), and the few triangles that are
 * still zero-area at the spine tips are dropped and counted.
 */
export function buildDeck(level: DetailLevel = 'medium'): DeckBuild {
  const { intervals: n, rings } = DECK_DETAIL[level];
  const RP = ringPoints(n);
  const SP = sidePoints(n);
  const verts: DeckVertex[] = [];
  /** ids[ring][p] = index into verts. */
  const ids: number[][] = [];
  for (const ring of rings) {
    const xs = ringXs(ring.d, n);
    const row: number[] = [];
    for (let p = 0; p < RP; p++) {
      if (ring.spine && p >= SP) {
        row.push(row[RP - p]!);
        continue;
      }
      const [px, pz] = planPoint(xs, ring, p, n);
      const nrm = surfaceNormal(px, pz);
      const y = midSurface(px, pz);
      row.push(verts.length);
      verts.push({ px, pz, h: ring.h, position: [px + ring.h * nrm[0], y + ring.h * nrm[1], pz + ring.h * nrm[2]] });
    }
    ids.push(row);
  }

  const area2 = (a: number, b: number, c: number) => {
    const A = verts[a]!.position;
    const B = verts[b]!.position;
    const C = verts[c]!.position;
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  };

  // Stitch bands; band i (ring i to ring i + 1) belongs to rings[i].group.
  const bandTris: number[][] = [];
  let dropped = 0;
  for (let r = 0; r < rings.length - 1; r++) {
    const tris: number[] = [];
    for (let p = 0; p < RP; p++) {
      const q = (p + 1) % RP;
      const a = ids[r]![p]!, b = ids[r]![q]!, c = ids[r + 1]![q]!, d = ids[r + 1]![p]!;
      // Wound so the top faces +Y and, the sheet being continuous, the bottom faces -Y.
      for (const [i, j, k] of [[a, c, b], [a, d, c]] as const) {
        if (i === j || j === k || i === k || area2(i, j, k) < 1e-12) dropped++;
        else tris.push(i, j, k);
      }
    }
    bandTris.push(tris);
  }

  // Smooth normals over the whole welded sheet, then split by material.
  const all = new BufferGeometry();
  all.setAttribute('position', new BufferAttribute(new Float32Array(verts.flatMap((v) => v.position)), 3));
  all.setIndex(bandTris.flat());
  all.computeVertexNormals();
  const normals = all.getAttribute('normal');

  const groups = {} as Record<DeckGroup, BufferGeometry>;
  for (const group of ['grip', 'wood', 'graphic'] as const) {
    const remap = new Map<number, number>();
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    bandTris.forEach((tris, band) => {
      if (rings[band]!.group !== group) return;
      for (const id of tris) {
        let local = remap.get(id);
        if (local === undefined) {
          local = remap.size;
          remap.set(id, local);
          const v = verts[id]!;
          pos.push(...v.position);
          nor.push(normals.getX(id), normals.getY(id), normals.getZ(id));
          const [u, w] = deckUv(group, v);
          uv.push(clamp01(u), clamp01(w));
        }
        index.push(local);
      }
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(index);
    groups[group] = g;
  }
  all.dispose();
  return { groups, droppedTriangles: dropped };
}
