import { describe, expect, it } from 'vitest';
import { Bone, Group, MathUtils, Vector3, type BufferAttribute } from 'three';
import { newFeetPose, writeFeetPose, type FootPose, type Stance } from '../sim/feet';
import { computeFlight } from '../sim/flight';
import { LEG, newLegsPose, writeLegsPose, type Segment } from '../sim/legs';
import { PRESETS } from '../sim/tricks';
import { ART } from './artDirection';
import { ditherThreshold, geo, LEG_BONES, mat } from './resources';

const REST_Y = ART.board.restY;
const D2R = MathUtils.DEG2RAD;

/** The shoe group exactly as FlightDriver's applyFoot poses it. */
function shoe(f: FootPose, edge: 1 | -1) {
  const g = new Group();
  g.position.set(f.x, REST_Y + f.y, f.z);
  g.rotation.set(f.roll * edge * D2R, f.yaw * D2R, f.pitch * D2R, 'YZX');
  g.updateMatrixWorld(true);
  return g;
}

/** A bone exactly as FlightDriver's applySegment poses it. */
function bone(s: Segment) {
  const b = new Bone();
  b.position.set(s.x, REST_Y + s.y, s.z);
  b.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(s.dx, s.dy, s.dz));
  b.updateMatrixWorld(true);
  return b;
}

describe('legs in the scene (ADR-37)', () => {
  it('puts each ankle target where the shoe group carries its ankle joint, in both stances', () => {
    const feet = newFeetPose();
    const legs = newLegsPose();
    for (const p of PRESETS) {
      const flight = computeFlight(p.inputs);
      for (const stance of ['goofy', 'regular'] as Stance[]) {
        const regular = stance === 'regular';
        for (const u of [0, 0.03, 0.1, 0.18, 0.5, 0.7, 1]) {
          writeFeetPose(feet, p.inputs, flight, u, stance);
          writeLegsPose(legs, feet, flight, u, p.inputs, stance);
          const pairs = [
            [feet.front, regular ? -1 : 1, legs.front.target],
            [feet.back, regular ? 1 : -1, legs.back.target],
          ] as const;
          for (const [f, edge, target] of pairs) {
            const joint = shoe(f, edge).localToWorld(new Vector3(-LEG.ankleBack, LEG.ankleHeight, 0));
            expect(joint.x).toBeCloseTo(target.x, 9);
            expect(joint.y).toBeCloseTo(REST_Y + target.y, 9);
            expect(joint.z).toBeCloseTo(target.z, 9);
          }
        }
      }
    }
  });

  it('turns each bone so its +Y runs from the proximal joint to the distal one', () => {
    const feet = newFeetPose();
    const legs = newLegsPose();
    const p = PRESETS[0]!.inputs;
    const flight = computeFlight(p);
    for (const u of [0, 0.2, 0.5, 0.76, 1]) {
      writeFeetPose(feet, p, flight, u);
      writeLegsPose(legs, feet, flight, u, p);
      for (const leg of [legs.front, legs.back]) {
        const knee = bone(leg.thigh).localToWorld(new Vector3(0, LEG.thigh, 0));
        expect(knee.distanceTo(new Vector3(leg.knee.x, REST_Y + leg.knee.y, leg.knee.z))).toBeLessThan(1e-9);
        const ankle = bone(leg.shank).localToWorld(new Vector3(0, LEG.shank, 0));
        expect(ankle.distanceTo(new Vector3(leg.ankle.x, REST_Y + leg.ankle.y, leg.ankle.z))).toBeLessThan(1e-9);
      }
    }
  });

  /** The vertices of `g` skinned to one of `bones`, as a geometry of their own (positions, colours, cast flags). */
  const part = (bones: number[]) => {
    const g = geo.legs;
    const idx = g.attributes.skinIndex as BufferAttribute;
    const keep = Array.from({ length: idx.count }, (_, i) => i).filter((i) => bones.includes(idx.getX(i)));
    return { keep, pos: g.attributes.position as BufferAttribute, col: g.attributes.color as BufferAttribute, cast: g.attributes.aCast as BufferAttribute };
  };
  const shanks = [LEG_BONES.frontShank, LEG_BONES.backShank];
  const thighs = [LEG_BONES.frontThigh, LEG_BONES.backThigh];

  it('builds both legs into one opaque, rigidly skinned geometry, the thighs fading by a dither (ADR-60)', () => {
    const g = geo.legs;
    const idx = g.attributes.skinIndex as BufferAttribute;
    const w = g.attributes.skinWeight as BufferAttribute;
    const set = new Set<number>();
    for (let i = 0; i < idx.count; i++) {
      set.add(idx.getX(i));
      expect(w.getX(i)).toBe(1);
      expect(w.getY(i) + w.getZ(i) + w.getW(i)).toBe(0);
    }
    expect([...set].sort()).toEqual([...shanks, ...thighs].sort());
    // One material, opaque: depth written, no sorting, the fade is the alpha test (resources.ts legsMaterial).
    expect(mat.legs.transparent).toBe(false);
    expect(mat.legs.depthWrite).toBe(true);
    expect(mat.legs.vertexColors).toBe(true);
    expect(mat.legs.customProgramCacheKey()).toBe('trick-lab-legs-dither');
    // Only the shanks cast a shadow, as before the merge.
    const s = part(shanks);
    const t = part(thighs);
    expect(s.keep.every((i) => s.cast.getX(i) === 1)).toBe(true);
    expect(t.keep.every((i) => t.cast.getX(i) === 0)).toBe(true);
  });

  it('dithers with every one of 16 thresholds once per 4 x 4 block, the same on every block', () => {
    const block = (ox: number, oy: number) => {
      const out: number[] = [];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) out.push(ditherThreshold(ox + x + 0.5, oy + y + 0.5));
      return out;
    };
    const first = block(0, 0);
    expect([...first].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => (i + 0.5) / 16));
    expect(block(8, 12)).toEqual(first);
    // Ordered, not clumped: each 2 x 2 quarter of the block spreads over the range.
    expect(ditherThreshold(0, 0)).toBe(0.5 / 16);
    expect(ditherThreshold(1, 1)).toBe(4.5 / 16);
    // Opaque (alpha 1) is never discarded, clear (alpha 0) always is.
    expect(Math.max(...first)).toBeLessThan(1);
    expect(Math.min(...first)).toBeGreaterThan(0);
  });

  it('spans each segment from joint to joint, capped, with the faces outward', () => {
    const range = (g: typeof geo.legs) => {
      g.computeBoundingBox();
      return g.boundingBox!;
    };
    const S = ART.legs.shank;
    const T = ART.legs.thigh;
    const yRange = (bones: number[]) => {
      const p = part(bones);
      const ys = p.keep.map((i) => p.pos.getY(i));
      return { min: Math.min(...ys), max: Math.max(...ys) };
    };
    expect(yRange(shanks).min).toBeCloseTo(-S.knee, 6);
    expect(yRange(shanks).max).toBeCloseTo(LEG.shank + S.ankle, 6);
    expect(yRange(thighs).min).toBeCloseTo(-T.hip, 6);
    expect(yRange(thighs).max).toBeCloseTo(LEG.thigh + T.knee, 6);
    expect(range(geo.legs).min.y).toBeCloseTo(-T.hip, 6);
    // Each triangle's winding normal points away from the segment's axis.
    for (const g of [geo.legs]) {
      const pos = g.attributes.position as BufferAttribute;
      const index = g.index!;
      let outward = 0;
      let inward = 0;
      const a = new Vector3();
      const b = new Vector3();
      const c = new Vector3();
      for (let t = 0; t < index.count; t += 3) {
        a.fromBufferAttribute(pos, index.getX(t));
        b.fromBufferAttribute(pos, index.getX(t + 1));
        c.fromBufferAttribute(pos, index.getX(t + 2));
        const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
        if (n.lengthSq() < 1e-14) continue;
        const centre = new Vector3().add(a).add(b).add(c).divideScalar(3);
        const radial = new Vector3(centre.x, 0, centre.z);
        if (radial.lengthSq() < 1e-8) continue;
        // The hem's flat step faces straight down (no radial part): not counted.
        const cos = n.dot(radial) / Math.sqrt(n.lengthSq() * radial.lengthSq());
        if (Math.abs(cos) < 0.05) continue;
        if (cos > 0) outward++;
        else inward++;
      }
      expect(inward).toBe(0);
      expect(outward).toBeGreaterThan(100);
    }
  });

  it('colours the sock below the hem and fades the thighs from clear at the hip to opaque at the knee', () => {
    const hem = LEG.shank - ART.legs.hemAbove;
    const s = part(shanks);
    expect(s.col.itemSize).toBe(4);
    for (const i of s.keep) {
      const y = s.pos.getY(i);
      const light = s.col.getX(i) > 0.5;
      // Trouser is dark grey, sock light; exactly at the hem there is one ring of each.
      if (y < hem - 1e-6) expect(light).toBe(false);
      if (y > hem + 1e-6) expect(light).toBe(true);
      // The shanks never fade.
      expect(s.col.getW(i)).toBe(1);
    }
    const t = part(thighs);
    for (const i of t.keep) {
      const y = t.pos.getY(i);
      const alpha = t.col.getW(i);
      if (y <= ART.legs.fade.from * LEG.thigh + 1e-9) expect(alpha).toBe(0);
      if (y >= LEG.thigh - 1e-9) expect(alpha).toBe(1);
    }
  });
});
