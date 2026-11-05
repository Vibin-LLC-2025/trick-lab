import { describe, expect, it } from 'vitest';
import { Vector3, type BufferGeometry } from 'three';
import { buildBoard } from './board';
import { buildTruck, cylinderOnAxis } from './hardware';
import { HARDWARE_DETAIL, TRUCK, type DetailLevel, type V3 } from './spec';

/** Triangles with less area than this (m^2) have no reliable winding and are skipped. */
const DEGENERATE = 1e-14;

interface WindingReport {
  /** Non-degenerate triangles checked. */
  checked: number;
  /** Triangles whose index-order normal points into the solid (only counted when `inside` is given). */
  inward: number;
  /** Triangles whose index-order normal disagrees with the sum of their vertex normals. */
  againstNormals: number;
}

/**
 * Checks every triangle's winding (counter-clockwise from outside, so the
 * cross product of its edges in index order is its front normal) against its
 * vertex normals and, for a convex part, against a point inside it.
 */
function winding(g: BufferGeometry, inside?: Vector3): WindingReport {
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const index = g.getIndex();
  const count = index ? index.count : pos.count;
  const at = (i: number) => (index ? index.getX(i) : i);
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  const face = new Vector3(), e = new Vector3(), vn = new Vector3(), centroid = new Vector3();
  const report: WindingReport = { checked: 0, inward: 0, againstNormals: 0 };
  for (let t = 0; t < count; t += 3) {
    const ia = at(t), ib = at(t + 1), ic = at(t + 2);
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib);
    c.fromBufferAttribute(pos, ic);
    face.subVectors(b, a).cross(e.subVectors(c, a));
    if (face.length() / 2 < DEGENERATE) continue;
    report.checked++;
    vn.fromBufferAttribute(nrm, ia).add(e.fromBufferAttribute(nrm, ib)).add(e.fromBufferAttribute(nrm, ic));
    if (face.dot(vn) <= 0) report.againstNormals++;
    if (inside) {
      centroid.copy(a).add(b).add(c).divideScalar(3).sub(inside);
      if (face.dot(centroid) <= 0) report.inward++;
    }
  }
  return report;
}

/** The mean of the vertices: inside the convex hull, so inside any convex part. */
function vertexMean(g: BufferGeometry): Vector3 {
  const pos = g.getAttribute('position');
  const sum = new Vector3(), v = new Vector3();
  for (let i = 0; i < pos.count; i++) sum.add(v.fromBufferAttribute(pos, i));
  return sum.divideScalar(pos.count);
}

/** The radius of the vertices that lie in the plane `start + axis * s`, about the axis. */
function radiiAt(g: BufferGeometry, start: V3, axis: V3, s: number): Set<number> {
  const dir = new Vector3(...axis).normalize();
  const o = new Vector3(...start);
  const pos = g.getAttribute('position');
  const v = new Vector3();
  const out = new Set<number>();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(o);
    const along = v.dot(dir);
    if (Math.abs(along - s) > 1e-7) continue; // float32 positions
    const r = v.addScaledVector(dir, -along).length();
    // Skip the cap centres (r is rounding noise there).
    if (r > 1e-6) out.add(Math.round(r * 1e7) / 1e7);
  }
  return out;
}

const roundedPositions = (g: BufferGeometry) => Array.from(g.getAttribute('position').array, (x) => Math.round(x * 1e9));

describe('cylinderOnAxis', () => {
  const cases: [string, V3, V3, number, number, number, number][] = [
    ['a -Z axle washer', [0.208, -0.05775, 0], [0, 0, 1], -0.061, -0.062, 0.0065, 0.0065],
    ['a cone on Y', [0, 0, 0], [0, 1, 0], 0.0012, 0.0157, 0.0125, 0.0115],
    ['a cone on a tilted axis', [0.1, -0.02, 0.01], [-0.5, -0.8, 0.1], 0.0277, 0.0397, 0.0115, 0.0105],
    ['a cone crossing the start point', [0, 0, 0], [1, 0, 0], -0.01, 0.02, 0.004, 0.009],
  ];

  it.each(cases)('builds %s the same in either endpoint order', (_name, start, axis, from, to, r0, r1) => {
    const forward = cylinderOnAxis(start, axis, from, to, r0, r1, 12);
    const reversed = cylinderOnAxis(start, axis, to, from, r1, r0, 12);
    expect(roundedPositions(reversed)).toEqual(roundedPositions(forward));
    expect(Array.from(reversed.getIndex()!.array)).toEqual(Array.from(forward.getIndex()!.array));
    // Radius r0 at `from` and r1 at `to`, whichever is further along the axis.
    for (const g of [forward, reversed]) {
      expect([...radiiAt(g, start, axis, from)]).toEqual([Math.round(r0 * 1e7) / 1e7]);
      expect([...radiiAt(g, start, axis, to)]).toEqual([Math.round(r1 * 1e7) / 1e7]);
    }
  });

  it.each(cases)('winds %s outward, with its normals, in either endpoint order', (_name, start, axis, from, to, r0, r1) => {
    for (const g of [cylinderOnAxis(start, axis, from, to, r0, r1, 12), cylinderOnAxis(start, axis, to, from, r1, r0, 12)]) {
      const w = winding(g, vertexMean(g));
      expect(w.checked).toBe(12 * 4);
      expect(w).toEqual({ checked: w.checked, inward: 0, againstNormals: 0 });
    }
  });
});

describe('truck winding (both trucks, both detail levels)', () => {
  const levels = Object.keys(HARDWARE_DETAIL) as DetailLevel[];
  const trucks = levels.flatMap((level) => ([1, -1] as const).map((side) => [level, side] as const));

  it.each(trucks)('%s truck on side %i: every convex part faces outward and agrees with its normals', (level, side) => {
    const t = buildTruck(side, HARDWARE_DETAIL[level]);
    const parts = { aluminium: t.aluminium, steel: t.steel, bushing: t.bushing };
    let checked = 0;
    for (const [material, list] of Object.entries(parts))
      list.forEach((g, i) => {
        const w = winding(g, vertexMean(g));
        checked += w.checked;
        expect(w.checked, `${material}[${i}]`).toBeGreaterThan(0);
        expect({ inward: w.inward, againstNormals: w.againstNormals }, `${material}[${i}]`).toEqual({ inward: 0, againstNormals: 0 });
      });
    expect(checked).toBeGreaterThan(1000);
  });

  it.each(trucks)('%s truck on side %i: the -Z speed washers and axle nut mirror the +Z ones', (level, side) => {
    const steel = buildTruck(side, HARDWARE_DETAIL[level]).steel;
    // steel: kingpin, two cup washers, kingpin nut, axle, then per z side two speed washers and a nut.
    const axleEnds = steel.slice(5);
    expect(axleEnds).toHaveLength(6);
    const cz = TRUCK.axleHousing.center[2];
    const span = (g: BufferGeometry): [number, number] => {
      g.computeBoundingBox();
      return [g.boundingBox!.min.z - cz, g.boundingBox!.max.z - cz];
    };
    for (let i = 0; i < 3; i++) {
      const [p0, p1] = span(axleEnds[i]!);
      const [n0, n1] = span(axleEnds[i + 3]!);
      expect(p0).toBeGreaterThan(0);
      expect(n1).toBeLessThan(0);
      expect(n0).toBeCloseTo(-p1, 7);
      expect(n1).toBeCloseTo(-p0, 7);
    }
  });

  it.each(levels)('the merged %s truck parts agree with their normals', (level) => {
    const board = buildBoard(level);
    for (const node of ['Truck_Aluminium', 'Truck_Steel', 'Truck_Bushings'] as const) {
      const w = winding(board.parts[node]);
      expect(w.checked, node).toBeGreaterThan(0);
      expect(w.againstNormals, node).toBe(0);
    }
  });
});
