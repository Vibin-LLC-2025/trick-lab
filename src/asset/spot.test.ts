import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { triangleCount } from './board';
import { BUDGETS } from './spec';
import { buildSpot } from './spot';
import { SPOT, SPOT_FOOTPRINTS, SPOT_PARTS, SPOT_TEXTURES } from './spotSpec';
import { spotColor, spotNormal } from './spotTextures';

const isPow2 = (n: number) => (n & (n - 1)) === 0;

describe('the skate spot (spot.glb, step 14, ADR-69)', () => {
  const g = buildSpot();
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const pos = g.getAttribute('position');
  const idx = g.getIndex()!;

  it('is one mesh inside its budget, painted by vertex colour', () => {
    expect(SPOT_PARTS).toHaveLength(BUDGETS.spot.drawCalls);
    expect(triangleCount(g)).toBeLessThanOrEqual(BUDGETS.spot.triangles);
    expect(g.getAttribute('color')).toBeDefined();
    expect(g.getAttribute('normal')).toBeDefined();
    expect(g.getAttribute('uv')).toBeDefined();
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
    // Each triangle's winding normal agrees with its vertices' normals.
    const nrm = g.getAttribute('normal');
    const a = new Vector3(), c = new Vector3(), d = new Vector3(), n = new Vector3(), v = new Vector3();
    for (let t = 0; t < idx.count; t += 3) {
      const [i, j, k] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      a.fromBufferAttribute(pos, i);
      c.fromBufferAttribute(pos, j).sub(a);
      d.fromBufferAttribute(pos, k).sub(a);
      n.crossVectors(c, d);
      v.fromBufferAttribute(nrm, i);
      expect(n.dot(v), `triangle ${t / 3}`).toBeGreaterThan(0);
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
