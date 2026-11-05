import { describe, expect, it } from 'vitest';
import { triangleCount } from './board';
import { bayUv, buildGround } from './ground';
import { BAY, CONCRETE, GROUND_PARTS, GROUND_TEXTURES, JOINT, PLANE, PLANE_BAYS } from './groundSpec';
import { concreteColor, concreteNormal, concreteRoughness, concreteSurface, concreteTint, jointDistance, jointProfile } from './groundTextures';
import { BUDGETS } from './spec';

const isPow2 = (n: number) => (n & (n - 1)) === 0;

describe('ground plane (ground.glb, ADR-31)', () => {
  const g = buildGround();
  g.computeBoundingBox();
  const b = g.boundingBox!;

  it('is at least 24 m each way, a whole odd number of bays, centred on the origin, on y = 0', () => {
    expect(PLANE.x).toBeGreaterThanOrEqual(24);
    expect(PLANE.z).toBeGreaterThanOrEqual(24);
    expect(PLANE_BAYS.x % 2).toBe(1);
    expect(PLANE_BAYS.z % 2).toBe(1);
    expect(b.max.x - b.min.x).toBeCloseTo(PLANE.x, 4);
    expect(b.max.z - b.min.z).toBeCloseTo(PLANE.z, 4);
    expect(b.min.x + b.max.x).toBeCloseTo(0, 9);
    expect(b.min.z + b.max.z).toBeCloseTo(0, 9);
    expect(b.min.y).toBe(0);
    expect(b.max.y).toBe(0);
  });

  it('is one quad facing up, inside the ground budget', () => {
    expect(GROUND_PARTS).toHaveLength(BUDGETS.ground.drawCalls);
    expect(triangleCount(g)).toBe(2);
    expect(triangleCount(g)).toBeLessThanOrEqual(BUDGETS.ground.triangles);
    const p = g.getAttribute('position');
    const idx = g.index!.array;
    for (let i = 0; i < idx.length; i += 3) {
      const [a, c, d] = [idx[i]!, idx[i + 1]!, idx[i + 2]!];
      const ux = p.getX(c) - p.getX(a), uz = p.getZ(c) - p.getZ(a);
      const vx = p.getX(d) - p.getX(a), vz = p.getZ(d) - p.getZ(a);
      // y of (u x v): positive means the face points up.
      expect(uz * vx - ux * vz).toBeGreaterThan(0);
    }
  });

  it('maps +u to +X and +v to +Z, UVs 0 to 1, so the repeated tile puts a bay centre at the origin', () => {
    const p = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(p.getX(i) / PLANE.x + 0.5, 6);
      expect(uv.getY(i)).toBeCloseTo(p.getZ(i) / PLANE.z + 0.5, 6);
    }
    // Repeating PLANE_BAYS times, the origin lands in the middle of a tile.
    expect((0.5 * PLANE_BAYS.x) % 1).toBeCloseTo(0.5, 9);
    expect((0.5 * PLANE_BAYS.z) % 1).toBeCloseTo(0.5, 9);
    expect(bayUv(0, 0, BAY)).toEqual([0.5, 0.5]);
    // The plane's edge is on a joint.
    const [u, v] = bayUv(PLANE.x / 2, PLANE.z / 2, BAY);
    expect(Math.min(u, 1 - u)).toBeCloseTo(0, 6);
    expect(Math.min(v, 1 - v)).toBeCloseTo(0, 6);
  });
});

describe('concrete textures (one bay per tile)', () => {
  const s = concreteSurface();
  const { width: W, height: H } = s;
  const at = (f: Float32Array, c: number, r: number) => f[r * W + c]!;

  it('are power of two, at most 1024 px, and the normal map matches the surface grid', () => {
    for (const t of Object.values(GROUND_TEXTURES)) {
      expect(isPow2(t.width) && isPow2(t.height)).toBe(true);
      expect(Math.max(t.width, t.height)).toBeLessThanOrEqual(BUDGETS.ground.textureMaxSide);
    }
    expect(Object.keys(GROUND_TEXTURES)).toHaveLength(BUDGETS.ground.textures);
    const c = concreteColor(), n = concreteNormal(), r = concreteRoughness();
    expect(c.grey).toHaveLength(GROUND_TEXTURES.color.width * GROUND_TEXTURES.color.height);
    expect(n.rgb).toHaveLength(GROUND_TEXTURES.normal.width * GROUND_TEXTURES.normal.height * 3);
    expect(r.grey).toHaveLength(GROUND_TEXTURES.roughness.width * GROUND_TEXTURES.roughness.height);
  });

  it('bakes the joint into all three maps along every edge of the tile, so it repeats without a seam', () => {
    const mid = Math.floor(H / 3);
    for (const c of [0, W - 1]) {
      expect(at(s.lift, c, mid)).toBeCloseTo(-JOINT.depth, 6);
      expect(at(s.rough, c, mid)).toBeCloseTo(JOINT.roughness, 6);
    }
    for (const r of [0, H - 1]) expect(at(s.lift, Math.floor(W / 3), r)).toBeCloseTo(-JOINT.depth, 6);
    // Symmetric across the wrap: the first and last columns are the same distance from the joint line.
    expect(jointDistance(0, mid, W, H)).toBeCloseTo(jointDistance(W - 1, mid, W, H), 9);
    // Darker than the slab around it.
    let joint = 0, field = 0;
    for (let r = 100; r < 200; r++) {
      joint += at(s.grey, 0, r);
      field += at(s.grey, 40, r);
    }
    expect(joint / 100).toBeLessThan(field / 100 - 20);
    // The bay centre is not in the joint.
    expect(jointProfile(jointDistance(W / 2, H / 2, W, H))).toBe(0);
  });

  it('encodes normals in the glTF convention: red is -dh/du, green is +dh/drow (image up is +Y)', () => {
    const n = concreteNormal();
    const px = (c: number, r: number) => [n.rgb[(r * W + c) * 3]!, n.rgb[(r * W + c) * 3 + 1]!, n.rgb[(r * W + c) * 3 + 2]!];
    // On the shoulder of the left joint the surface rises toward +u: the normal leans to -u (red below 128).
    const shoulderPx = Math.round(((JOINT.width / 2 - JOINT.shoulder / 2) * W) / BAY.x);
    expect(px(shoulderPx, Math.floor(H / 3))[0]).toBeLessThan(110);
    // On the right joint it falls toward +u: red above 128.
    expect(px(W - 1 - shoulderPx, Math.floor(H / 3))[0]).toBeGreaterThan(146);
    // On the top joint's shoulder the surface rises down the image: green above 128.
    const shoulderRow = Math.round(((JOINT.width / 2 - JOINT.shoulder / 2) * H) / BAY.z);
    expect(px(Math.floor(W / 3), shoulderRow)[1]).toBeGreaterThan(146);
    // Flat slab: straight up.
    expect(px(Math.floor(W / 3), Math.floor(H / 3) + 7)[2]).toBeGreaterThan(250);
  });

  it('centres the grey on the fill, so the tint lands the mean on the concrete colour', () => {
    const c = concreteColor();
    const mean = c.grey.reduce((a, v) => a + v, 0) / c.grey.length;
    expect(Math.abs(mean - CONCRETE.fill)).toBeLessThan(1);
    const tint = concreteTint();
    expect(tint[3]).toBe(1);
    // #616466 is a touch cool: blue above green above red.
    expect(tint[2]).toBeGreaterThan(tint[1]);
    expect(tint[1]).toBeGreaterThan(tint[0]);
  });

  it('keeps roughness matte (0.6 to 1) everywhere', () => {
    const r = concreteRoughness();
    let min = 255, max = 0;
    for (const v of r.grey) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min / 255).toBeGreaterThan(0.6);
    expect(max).toBeLessThanOrEqual(255);
  });
});
