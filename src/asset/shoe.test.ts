import { describe, expect, it } from 'vitest';
import { Box3, type BufferGeometry, Vector3 } from 'three';
import { FOOT } from '../sim/feet';
import { SOLE_RING_POINTS, buildLaces, buildShoe, buildSole, eyeletTs, footHalfWidth, shoeTriangles, upperPoint, valleyRims } from './shoe';
import { FOOTPRINT, LACES, SHOE, SHOE_PARTS, SOLE, UPPER } from './shoeSpec';
import { BUDGETS } from './spec';

const shoe = buildShoe();
const box = (g: BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!.clone();
};

describe('shoe spec', () => {
  it('matches FOOT in src/sim/feet.ts, which places the feet from these numbers', () => {
    expect(SHOE.length).toBe(FOOT.length);
    expect(SHOE.width).toBe(FOOT.width);
    expect(SHOE.soleHeight).toBe(FOOT.soleHeight);
  });

  it('is widest at the ball, where the two sides add up to the shoe width', () => {
    expect(FOOTPRINT.toe.lateral + FOOTPRINT.toe.medial).toBeCloseTo(SHOE.width, 9);
    const xBall = -SHOE.length / 2 + FOOTPRINT.toe.join * SHOE.length;
    expect(footHalfWidth(xBall, 'lateral') + footHalfWidth(xBall, 'medial')).toBeCloseTo(SHOE.width, 6);
  });

  it('has an arch: the medial side dips more than the lateral side in the middle', () => {
    const x = -SHOE.length / 2 + FOOTPRINT.arch.at * SHOE.length;
    const straightMedial = footHalfWidth(x - 0.05, 'medial');
    expect(footHalfWidth(x, 'medial')).toBeLessThan(straightMedial);
    expect(FOOTPRINT.arch.medial).toBeGreaterThan(FOOTPRINT.arch.lateral);
  });
});

describe('shoe geometry (right foot, toe +X, lateral +Z)', () => {
  it('is 285 x 105 mm, rests on y = 0 and the collar reaches about 85 mm', () => {
    const all = new Box3();
    for (const p of SHOE_PARTS) all.union(box(shoe.parts[p.node]));
    expect(all.max.x - all.min.x).toBeCloseTo(SHOE.length, 4);
    expect(all.max.z - all.min.z).toBeCloseTo(SHOE.width, 4);
    expect(all.min.y).toBeCloseTo(0, 6);
    expect(all.max.y).toBeGreaterThan(0.08);
    expect(all.max.y).toBeLessThan(0.095);
    // Bounding box centred on the origin in x.
    expect(all.max.x + all.min.x).toBeCloseTo(0, 6);
  });

  it('puts the medial (wider) side at -Z: the toe joint is wider than the little-toe side', () => {
    const b = box(shoe.parts.Shoe_Sole);
    expect(-b.min.z).toBeGreaterThan(b.max.z);
  });

  it('is one geometry per material, within the shoe budget', () => {
    expect(SHOE_PARTS.length).toBe(BUDGETS.shoes.drawCalls);
    const tris = shoeTriangles(shoe);
    const total = Object.values(tris).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(BUDGETS.shoes.triangles);
    expect(total).toBeGreaterThan(5000);
    const sole = buildSole();
    expect(SOLE_RING_POINTS).toBe(96);
    expect(tris.Shoe_Sole).toBe((SOLE.rings.length - 1) * 2 * SOLE_RING_POINTS - sole.dropped);
    expect(tris.Shoe_Laces).toBe((2 * (LACES.count - 1) + 1) * LACES.segments * 4);
  });

  it('has no NaN in any attribute', () => {
    for (const p of SHOE_PARTS) {
      const g = shoe.parts[p.node];
      for (const name of Object.keys(g.attributes))
        expect(Array.from(g.getAttribute(name).array).every(Number.isFinite), `${p.node}.${name}`).toBe(true);
    }
  });

  it('faces outward: sole top normals +Y, sole bottom -Y, upper top +Y, lateral wall +Z', () => {
    const sole = shoe.parts.Shoe_Sole;
    const sp = sole.getAttribute('position'), sn = sole.getAttribute('normal');
    for (let i = 0; i < sp.count; i++) {
      if (sp.getY(i) > SHOE.soleHeight - 1e-6 && Math.abs(sp.getZ(i)) < 0.02) expect(sn.getY(i)).toBeGreaterThan(0.9);
      if (sp.getY(i) < 1e-6 && Math.abs(sp.getZ(i)) < 0.02) expect(sn.getY(i)).toBeLessThan(-0.9);
    }
    const up = shoe.parts.Shoe_Upper;
    const p = up.getAttribute('position'), n = up.getAttribute('normal');
    const b = box(up);
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > b.max.y - 0.002) expect(n.getY(i)).toBeGreaterThan(0);
      if (p.getZ(i) > b.max.z - 0.001) expect(n.getZ(i)).toBeGreaterThan(0);
      if (p.getZ(i) < b.min.z + 0.001) expect(n.getZ(i)).toBeLessThan(0);
    }
  });

  it('winds every triangle outward (face normal agrees with the smooth vertex normal)', () => {
    const a = new Vector3(), bb = new Vector3(), c = new Vector3(), nn = new Vector3();
    let agree = 0, total = 0;
    for (const part of ['Shoe_Sole', 'Shoe_Upper'] as const) {
      const g = shoe.parts[part];
      const p = g.getAttribute('position');
      const nor = g.getAttribute('normal');
      const idx = g.index!.array;
      for (let i = 0; i < idx.length; i += 3) {
        a.fromBufferAttribute(p, idx[i]!);
        bb.fromBufferAttribute(p, idx[i + 1]!).sub(a);
        c.fromBufferAttribute(p, idx[i + 2]!).sub(a);
        nn.fromBufferAttribute(nor, idx[i]!);
        total++;
        if (bb.cross(c).dot(nn) > 0) agree++;
      }
    }
    // The tip slivers can disagree with an averaged normal; everything else must agree.
    expect(agree / total).toBeGreaterThan(0.99);
  });

  it('sinks a valley for the tongue and the ankle opening, closed at the heel and over the toe', () => {
    const archTop = (t: number) => upperPoint(t, 0.5, true)[1];
    const centre = (t: number) => upperPoint(t, 0.5)[1];
    expect(archTop(0.3) - centre(0.3)).toBeCloseTo(0.03, 6);
    // The rims sit on the arch's slope, below its top but well above the valley floor.
    expect(upperPoint(0.3, valleyRims(0.3).medial, true)[1] - centre(0.3)).toBeGreaterThan(0.01);
    expect(upperPoint(0.03, 0.5, true)[1] - centre(0.03)).toBeCloseTo(0, 6);
    expect(upperPoint(0.8, 0.5, true)[1] - centre(0.8)).toBeCloseTo(0, 6);
  });

  it('tucks the upper into the sole and keeps its top under the collar height', () => {
    const b = box(shoe.parts.Shoe_Upper);
    expect(b.min.y).toBeCloseTo(SHOE.soleHeight - UPPER.tuck, 6);
    expect(b.max.y).toBeCloseTo(SHOE.soleHeight + Math.max(...UPPER.heightProfile.map(([, h]) => h)), 3);
  });

  it('crosses the laces between the eyelets, just above the rims', () => {
    const ts = eyeletTs();
    expect(ts).toHaveLength(UPPER.eyelets.count);
    expect(ts[0]).toBe(UPPER.eyelets.from);
    expect(ts[ts.length - 1]).toBeCloseTo(UPPER.eyelets.to, 9);
    const laces = box(buildLaces());
    const rimY = upperPoint(ts[0]!, valleyRims(ts[0]!).medial, true)[1];
    expect(laces.min.y).toBeGreaterThan(rimY - LACES.radius);
    expect(laces.min.x).toBeLessThan(-SHOE.length / 2 + ts[0]! * SHOE.length + 0.001);
    expect(laces.max.x).toBeGreaterThan(-SHOE.length / 2 + ts[ts.length - 1]! * SHOE.length - 0.001);
  });

  it('maps the upper with u along the length and v across the section', () => {
    const up = shoe.parts.Shoe_Upper;
    const p = up.getAttribute('position');
    const uv = up.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      const t = (p.getX(i) + SHOE.length / 2) / SHOE.length;
      expect(Math.abs(uv.getX(i) - t)).toBeLessThan(1e-5);
      if (p.getZ(i) > 0.045) expect(uv.getY(i)).toBeGreaterThan(0.85);
      if (p.getZ(i) < -0.05) expect(uv.getY(i)).toBeLessThan(0.15);
    }
  });
});
