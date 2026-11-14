import { describe, expect, it } from 'vitest';
import { BONE, newBodyPose, writeBindPose } from '../sim/body';
import { fitRider, movedNormal, RIDER_FIT, RIDER_FIT_BONES, RIDER_HIGH_LEAF, SHIRT_THIGH, type Move, type RiderSource } from './riderFit';
import { HEM_FOOT, REGION } from './riderSpec';

/**
 * A small source in MakeHuman's layout (ADR-94): the game-engine rig's joints
 * standing in the source's own axes (y up, facing +Z), a 1.2 scale of ours
 * with its arms out, and one vertex sitting on each joint, weighted to it.
 */
function toySource(): RiderSource {
  const bind = writeBindPose(newBodyPose());
  const names: string[] = [];
  const at: [number, number, number][] = [];
  const add = (name: string, p: [number, number, number]) => {
    names.push(name);
    at.push(p);
  };
  // Each of our joints, scaled 1.2 and turned to face +Z (x and z negated), under the source bone that stands for it.
  for (const b of RIDER_FIT_BONES) {
    const o = bind.bones[BONE[b]]!.o;
    add(RIDER_FIT[b].from, [-o.x * 1.2, o.y * 1.2, -o.z * 1.2]);
  }
  // The tips a source bone points to that are not a bone of ours: the feet and the middle fingers, and the folded joints.
  for (const s of ['l', 'r'] as const) {
    const ankle = at[names.indexOf(`calf_${s}`)]!;
    add(`foot_${s}`, [ankle[0], ankle[1] - 0.42 * 1.2, ankle[2]]);
    add(`ball_${s}`, [ankle[0], ankle[1] - 0.5 * 1.2, ankle[2] + 0.1]);
    const hand = at[names.indexOf(`hand_${s}`)]!;
    for (const f of ['index', 'middle', 'pinky', 'ring', 'thumb']) for (const k of [1, 2, 3]) add(`${f}_0${k}_${s}`, [hand[0] * 1.1, hand[1] - 0.05 * k, hand[2]]);
  }
  add('Root', [0, 0, 0]);
  add('spine_03', at[names.indexOf('spine_02')]!.map((x, i) => (i === 1 ? x + 0.1 : x)) as [number, number, number]);
  const n = RIDER_FIT_BONES.length;
  const positions = new Float32Array(n * 3);
  const joints = new Uint16Array(n * 4);
  const weights = new Float32Array(n * 4);
  RIDER_FIT_BONES.forEach((b, i) => {
    positions.set(at[names.indexOf(RIDER_FIT[b].from)]!, i * 3);
    joints[i * 4] = names.indexOf(RIDER_FIT[b].from);
    weights[i * 4] = 1;
  });
  return {
    positions,
    normals: new Float32Array(n * 3).map((_, i) => (i % 3 === 2 ? 1 : 0)),
    uvs: new Float32Array(n * 2),
    joints,
    weights,
    regions: new Uint8Array(n).map((_, i) => i % 7),
    index: new Uint32Array([0, 1, 2]),
    jointNames: names,
    jointPositions: at,
  };
}

describe('the detailed rider fitted onto our bones (ADR-94)', () => {
  const bind = writeBindPose(newBodyPose());
  const src = toySource();
  const { geometry, report } = fitRider(src, bind, RIDER_HIGH_LEAF);
  const pos = geometry.getAttribute('position');

  it('puts a vertex on each source joint onto our joint in the bind pose', () => {
    RIDER_FIT_BONES.forEach((b, i) => {
      const o = bind.bones[BONE[b]]!.o;
      expect(pos.getX(i), b).toBeCloseTo(o.x, 6);
      expect(pos.getY(i), b).toBeCloseTo(o.y, 6);
      expect(pos.getZ(i), b).toBeCloseTo(o.z, 6);
    });
  });

  it('scales the source to our trunk and stretches each limb to our length', () => {
    expect(report.scale).toBeCloseTo(1 / 1.2, 3);
    // The toy is ours scaled, so after the scale every stretch is one.
    for (const b of RIDER_FIT_BONES) expect(report.stretch[b], b).toBeCloseTo(1, 2);
  });

  it('skins each vertex to our bone, the weights summing to one', () => {
    const idx = geometry.getAttribute('skinIndex');
    const w = geometry.getAttribute('skinWeight');
    RIDER_FIT_BONES.forEach((b, i) => {
      // A shirt vertex on a thigh is the next test's.
      if (src.regions[i] !== 1 || !b.startsWith('thigh')) expect(idx.getX(i), b).toBe(i);
      expect(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i)).toBeCloseTo(1, 6);
    });
  });

  it("hangs the shirt from the hips: a shirt vertex keeps SHIRT_THIGH of its thigh's weight, the rest on the pelvis", () => {
    const idx = geometry.getAttribute('skinIndex');
    const w = geometry.getAttribute('skinWeight');
    // The toy's thighR vertex is a shirt one (region code 1), all of it on that thigh.
    const v = BONE.thighR;
    expect(src.regions[v]).toBe(1);
    const weightOn = (bone: number) => [0, 1, 2, 3].reduce((s, k) => s + (idx.getComponent(v, k) === bone ? w.getComponent(v, k) : 0), 0);
    expect(weightOn(BONE.thighR)).toBeCloseTo(SHIRT_THIGH, 6);
    expect(weightOn(BONE.pelvis)).toBeCloseTo(1 - SHIRT_THIGH, 6);
    // Its place in the bind pose is the thigh's joint still: only the skinning changed.
    const o = bind.bones[v]!.o;
    expect(pos.getX(v)).toBeCloseTo(o.x, 6);
    expect(pos.getY(v)).toBeCloseTo(o.y, 6);
  });

  it("turns the source's regions into ours: the shirt the hoodie's, the jeans the trousers', the eyes and brows untinted", () => {
    const r = geometry.getAttribute('region');
    const expected = [REGION.skin, REGION.hoodie, REGION.trouser, REGION.hair, REGION.beanie, REGION.skin, REGION.skin];
    for (let i = 0; i < RIDER_FIT_BONES.length; i++) expect(r.getX(i)).toBe(expected[i % 7]);
  });

  it('faces the source the way ours faces: its +Z normal now points -Z', () => {
    const n = geometry.getAttribute('normal');
    // The pelvis does not turn, so its normal shows the half turn alone.
    expect(n.getZ(BONE.pelvis)).toBeCloseTo(-1, 6);
  });

  it("leans the bottom of each leg on its foot (2026-11-13): the jeans' cuff HEM_FOOT.jeans, the sock all of it, the knee none", () => {
    // Three more vertices on the right shin, all of them on calf_r: jeans and sock at the ankle, jeans at the knee.
    const calf = src.jointNames.indexOf('calf_r');
    const foot = src.jointPositions[src.jointNames.indexOf('foot_r')]!;
    const knee = src.jointPositions[calf]!;
    const add = (p: readonly number[], region: number) => ({ p, region });
    const extra = [add(foot, 2), add(foot, 7), add(knee, 2)];
    const n = src.regions.length;
    const more: RiderSource = {
      ...src,
      positions: Float32Array.from([...src.positions, ...extra.flatMap((e) => e.p)]),
      normals: Float32Array.from([...src.normals, ...extra.flatMap(() => [0, 0, 1])]),
      uvs: Float32Array.from([...src.uvs, ...extra.flatMap(() => [0, 0])]),
      joints: Uint16Array.from([...Array.from(src.joints), ...extra.flatMap(() => [calf, 0, 0, 0])]),
      weights: Float32Array.from([...src.weights, ...extra.flatMap(() => [1, 0, 0, 0])]),
      regions: Uint8Array.from([...src.regions, ...extra.map((e) => e.region)]),
    };
    const g = fitRider(more, bind, RIDER_HIGH_LEAF).geometry;
    const idx = g.getAttribute('skinIndex');
    const w = g.getAttribute('skinWeight');
    const on = (v: number, bone: number) => [0, 1, 2, 3].reduce((s, k) => s + (idx.getComponent(v, k) === bone ? w.getComponent(v, k) : 0), 0);
    expect(on(n, BONE.footR)).toBeCloseTo(HEM_FOOT.jeans, 6);
    expect(on(n, BONE.shinR)).toBeCloseTo(1 - HEM_FOOT.jeans, 6);
    expect(on(n + 1, BONE.footR)).toBeCloseTo(1, 6);
    expect(on(n + 2, BONE.footR)).toBe(0);
    expect(on(n + 2, BONE.shinR)).toBeCloseTo(1, 6);
  });

  it('refuses a source joint with no bone of ours', () => {
    expect(() => fitRider({ ...src, jointNames: [...src.jointNames, 'tail'], jointPositions: [...src.jointPositions, [0, 0, 0]] }, bind, RIDER_HIGH_LEAF)).toThrow(/tail/);
  });
});

describe('the normals of a stretched limb (2026-11-13)', () => {
  it('stay perpendicular to the surface the stretch makes, where the turn alone leaves them off it', () => {
    const k = 1.4;
    const s = Math.SQRT1_2;
    // A bone along +Y, stretched by k, then turned a quarter round Z: (x, y, z) to (y, -x, z).
    const m: Move = { from: [0, 0, 0], dir: [0, 1, 0], stretch: k, rot: [[0, 1, 0], [-1, 0, 0], [0, 0, 1]], to: [0, 0, 0] };
    // A surface leaning 45 degrees across the bone: tangent (1, 1, 0)/sqrt2, normal (1, -1, 0)/sqrt2.
    const normal: [number, number, number] = [s, -s, 0];
    // The stretched, turned tangent.
    const t = [s, s * k, 0];
    const tt = [t[1]!, -t[0]!, 0];
    const n = movedNormal(m, normal);
    const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    expect(Math.abs(dot(n, tt))).toBeLessThan(1e-12);
    // The turn alone: off the surface by several degrees.
    const turned = [normal[1], -normal[0], 0];
    const off = Math.asin(Math.abs(dot(turned, tt)) / Math.hypot(...tt));
    expect(off * (180 / Math.PI)).toBeGreaterThan(5);
  });
});
