// The rider's mesh (ADR-85): one skinned geometry round the bind pose of
// src/sim/body.ts, symmetric, every vertex smoothly weighted to at most four
// of the 17 bones, its regions and cloth coordinates in range.
import { describe, expect, it } from 'vitest';
import { BONE, MIRROR_BONE, RIDER_BONES } from '../sim/body';
import { LEG } from '../sim/legs';
import { buildRider } from './rider';
import { REGION, RIDER_REGIONS, TROUSER } from './riderSpec';

const r = buildRider();
const g = r.geometry;
const pos = g.getAttribute('position');
const nrm = g.getAttribute('normal');
const uv = g.getAttribute('uv');
const joints = g.getAttribute('skinIndex');
const weights = g.getAttribute('skinWeight');
const region = g.getAttribute('region');
const n = pos.count;

describe('the rider mesh (ADR-85)', () => {
  it('is one indexed geometry inside its budget, every attribute the skinned GLB needs', () => {
    expect(g.index).not.toBeNull();
    const triangles = g.index!.count / 3;
    expect(triangles).toBe(Object.values(r.triangles).reduce((a, b) => a + b, 0));
    expect(triangles).toBeLessThanOrEqual(20000);
    for (const a of [pos, nrm, uv, joints, weights, region]) expect(a.count).toBe(n);
  });

  it('weights every vertex to at most four bones of the rig, summing to 1', () => {
    for (let v = 0; v < n; v++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const w = weights.getComponent(v, k);
        expect(w).toBeGreaterThanOrEqual(0);
        if (w > 0) expect(joints.getComponent(v, k)).toBeLessThan(RIDER_BONES.length);
        sum += w;
      }
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it('blends the weights across each joint, so nothing bends like stacked capsules', () => {
    // Somewhere on the body, each pair of neighbouring bones shares a vertex, each with a quarter or more
    // (the neck is short, so its blend into the head is the narrowest).
    const pairs: [string, string][] = [
      ['thighR', 'shinR'],
      ['pelvis', 'thighL'],
      ['upperArmR', 'forearmR'],
      ['pelvis', 'spine'],
      ['spine', 'chest'],
      ['neck', 'head'],
      ['forearmL', 'handL'],
      ['chest', 'clavicleR'],
    ];
    for (const [a, b] of pairs) {
      const ia = BONE[a as keyof typeof BONE];
      const ib = BONE[b as keyof typeof BONE];
      let shared = false;
      for (let v = 0; v < n && !shared; v++) {
        let wa = 0;
        let wb = 0;
        for (let k = 0; k < 4; k++) {
          if (joints.getComponent(v, k) === ia) wa += weights.getComponent(v, k);
          if (joints.getComponent(v, k) === ib) wb += weights.getComponent(v, k);
        }
        shared = wa >= 0.25 && wb >= 0.25;
      }
      expect(shared, `${a} and ${b}`).toBe(true);
    }
  });

  it('is symmetric: every vertex has its mirror across x = 0, weighted to the mirrored bones', () => {
    // Rounded to 0.01 mm, with -0 and 0 the same key.
    const k5 = (x: number) => Math.round(x * 1e5) + 0;
    const key = (x: number, y: number, z: number) => `${k5(x)},${k5(y)},${k5(z)}`;
    const at = new Map<string, number>();
    for (let v = 0; v < n; v++) at.set(key(pos.getX(v), pos.getY(v), pos.getZ(v)), v);
    for (let v = 0; v < n; v += 7) {
      const m = at.get(key(-pos.getX(v), pos.getY(v), pos.getZ(v)));
      expect(m, `vertex ${v}`).toBeDefined();
      const bones = (i: number) =>
        [0, 1, 2, 3]
          .filter((k) => weights.getComponent(i, k) > 0.01)
          .map((k) => joints.getComponent(i, k))
          .sort();
      expect(bones(m!)).toEqual(bones(v).map((b) => MIRROR_BONE[b]!).sort());
    }
  });

  it('has unit normals, and its regions and cloth coordinates in range', () => {
    for (let v = 0; v < n; v++) {
      expect(Math.hypot(nrm.getX(v), nrm.getY(v), nrm.getZ(v))).toBeCloseTo(1, 4);
      expect(region.getX(v)).toBeLessThan(RIDER_REGIONS.length);
      expect(uv.getX(v)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(v)).toBeLessThanOrEqual(1);
      expect(uv.getY(v)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(v)).toBeLessThanOrEqual(1);
    }
    // Every region is used but the gloves: since ADR-91 the hands are bare skin (the region stays, so the colour lists keep their order).
    const used = new Set(Array.from({ length: n }, (_, v) => region.getX(v)));
    expect([...used].sort((a, b) => a - b)).toEqual(RIDER_REGIONS.map((_, i) => i).filter((i) => i !== REGION.glove));
  });

  it('ends each trouser leg in the cuff over the shoe collar and a dark sock inside the shoe (ADR-70)', () => {
    const shin = r.bind.bones[BONE.shinR]!;
    // A vertex's distance along the shin from the knee.
    const along = (v: number) => (pos.getX(v) - shin.o.x) * shin.y.x + (pos.getY(v) - shin.o.y) * shin.y.y + (pos.getZ(v) - shin.o.z) * shin.y.z;
    const cuffEnd = LEG.shank + TROUSER.cuff.drop;
    for (let v = 0; v < n; v++) {
      if (pos.getX(v) < 0.02 || pos.getY(v) > 0.4) continue;
      if (region.getX(v) === REGION.sock) expect(along(v)).toBeGreaterThanOrEqual(cuffEnd - 1e-6);
      if (region.getX(v) === REGION.trouser) expect(along(v)).toBeLessThan(cuffEnd);
    }
  });
});
