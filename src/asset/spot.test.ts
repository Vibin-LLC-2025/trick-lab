import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { triangleCount } from './board';
import { BUDGETS } from './spec';
import { buildSpot } from './spot';
import { SPOT, SPOT_FOOTPRINTS, SPOT_PARTS, SPOT_TEXTURES } from './spotSpec';
import { spotColor, spotNormal } from './spotTextures';

const isPow2 = (n: number) => (n & (n - 1)) === 0;

describe('the skate spot (spot.glb, step 14, ADR-69)', () => {
  const { concrete, steel } = buildSpot();
  const parts = [concrete, steel];
  const b = new Box3();
  for (const g of parts) {
    g.computeBoundingBox();
    b.union(g.boundingBox!);
  }

  it('is two meshes, the concrete and the steel, inside its budget, painted by vertex colour (ADR-102)', () => {
    expect(SPOT_PARTS.map((p) => p.material)).toEqual(['concrete', 'steel']);
    expect(SPOT_PARTS).toHaveLength(BUDGETS.spot.drawCalls);
    expect(triangleCount(concrete) + triangleCount(steel)).toBeLessThanOrEqual(BUDGETS.spot.triangles);
    for (const g of parts) {
      expect(g.getAttribute('color')).toBeDefined();
      expect(g.getAttribute('normal')).toBeDefined();
      expect(g.getAttribute('uv')).toBeDefined();
    }
  });

  it('puts the rail and the ledge\'s angle in the steel, and nothing of it in the concrete', () => {
    steel.computeBoundingBox();
    const s = steel.boundingBox!;
    // The rail's x and the ledge's: the steel spans both, and its top is the angle's, just proud of the ledge.
    expect(s.min.x).toBeCloseTo(SPOT.ledge.x[0], 2);
    expect(s.max.x).toBeCloseTo(SPOT.rail.x[1], 2);
    expect(s.max.y).toBeCloseTo(SPOT.ledge.height + 0.0015, 3);
    // No concrete vertex in the rail's posts: the concrete stays out of the rail's x beyond the kerb's end.
    const cp = concrete.getAttribute('position');
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i), z = cp.getZ(i);
      const inRail = x > SPOT.rail.x[0] && x < SPOT.rail.x[1] && Math.abs(z - SPOT.rail.z) < SPOT.rail.plate.size;
      expect(inRail, `concrete vertex ${i}`).toBe(false);
    }
  });

  it('bevels the ledge\'s and the wall\'s top edges, and cuts the wall into panels (ADR-102)', () => {
    const cp = concrete.getAttribute('position');
    const tops = (h: number, z0: number, z1: number) => {
      const xs: number[] = [];
      for (let i = 0; i < cp.count; i++) if (Math.abs(cp.getY(i) - h) < 1e-6 && cp.getZ(i) >= z0 - 1e-6 && cp.getZ(i) <= z1 + 1e-6) xs.push(cp.getZ(i));
      return xs;
    };
    // The top's corners are inset by the bevel: no vertex at the top's own height on its front or back edge.
    const L = SPOT.ledge;
    const lz = tops(L.height, L.z[0], L.z[1]);
    expect(lz.length).toBeGreaterThan(0);
    expect(Math.min(...lz)).toBeCloseTo(L.z[0] + L.bevel, 6);
    expect(Math.max(...lz)).toBeCloseTo(L.z[1] - L.bevel, 6);
    const W = SPOT.wall;
    const wz = tops(W.height, W.z[0], W.z[1]);
    expect(Math.min(...wz)).toBeCloseTo(W.z[0] + W.bevel, 6);
    expect(Math.max(...wz)).toBeCloseTo(W.z[1] - W.bevel, 6);
    // The front of the wall: one face per panel and per joint, so more than ten faces at its z.
    let front = 0;
    for (let i = 0; i < cp.count; i++) if (Math.abs(cp.getZ(i) - W.z[1]) < 1e-6 && cp.getY(i) === 0) front++;
    expect(front / 2).toBeGreaterThan(10);
  });

  it('lies within its span, on the ground, and all of it behind the board', () => {
    expect(Math.max(-b.min.x, b.max.x)).toBeLessThanOrEqual(SPOT.span + 1e-6);
    expect(b.min.y).toBeCloseTo(0, 6);
    // The board and its landing's slide stay within a metre of the origin; every camera looks from +Z.
    expect(b.max.z).toBeLessThan(-0.8);
  });

  it('wraps out of sight: at the wrap its nearest piece is past the fog', () => {
    // A camera up to 4 m from the board along x (SPOT.loop's note); the range fog's far end is 15 m.
    expect(SPOT.loop / 2 - SPOT.span - 4).toBeGreaterThanOrEqual(15);
  });

  it('has every face wound outward, so none is culled from the front', () => {
    // Each triangle's winding normal agrees with its vertices' normals, and none is degenerate.
    for (const g of parts) {
      const pos = g.getAttribute('position');
      const idx = g.getIndex()!;
      const nrm = g.getAttribute('normal');
      const a = new Vector3(), c = new Vector3(), d = new Vector3(), n = new Vector3(), v = new Vector3();
      for (let t = 0; t < idx.count; t += 3) {
        const [i, j, k] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
        a.fromBufferAttribute(pos, i);
        c.fromBufferAttribute(pos, j).sub(a);
        d.fromBufferAttribute(pos, k).sub(a);
        n.crossVectors(c, d);
        v.fromBufferAttribute(nrm, i);
        expect(n.dot(v), `triangle ${t / 3}`).toBeGreaterThan(1e-9);
      }
    }
  });

  it('has a shadow footprint for every piece, each inside the span', () => {
    expect(SPOT_FOOTPRINTS.map((f) => f.name).sort()).toEqual(['kerb', 'ledge', 'rail', 'wall'].sort());
    for (const f of SPOT_FOOTPRINTS) {
      expect(f.x[0]).toBeGreaterThanOrEqual(-SPOT.span);
      expect(f.x[1]).toBeLessThanOrEqual(SPOT.span);
      expect(f.height).toBeGreaterThan(0);
    }
  });

  it('has power-of-two textures inside the budget, a near-white colour map that tiles', () => {
    const color = spotColor();
    const normal = spotNormal();
    for (const t of [color, normal]) {
      expect(isPow2(t.width) && isPow2(t.height)).toBe(true);
      expect(Math.max(t.width, t.height)).toBeLessThanOrEqual(BUDGETS.spot.textureMaxSide);
    }
    const mean = color.grey.reduce((s, x) => s + x, 0) / color.grey.length;
    expect(Math.abs(mean - SPOT_TEXTURES.fill)).toBeLessThan(3);
    // Seamless: the first and last columns differ no more than any two neighbours do.
    const W = color.width;
    let edge = 0, inner = 0;
    for (let y = 0; y < color.height; y++) {
      edge = Math.max(edge, Math.abs(color.grey[y * W]! - color.grey[y * W + W - 1]!));
      inner = Math.max(inner, Math.abs(color.grey[y * W + 1]! - color.grey[y * W]!));
    }
    expect(edge).toBeLessThanOrEqual(inner + 1);
  });
});
