import { describe, expect, it } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { FOOT, newFeetPose, writeFeetPose } from '../sim/feet';
import { computeFlight, writePose } from '../sim/flight';
import { BODY, bonePoint, newBodyPose, RIDER_BONES, writeBodyPose } from '../sim/body';
import { LEG, newLegsPose, writeLegsPose } from '../sim/legs';
import { PRESETS } from '../sim/tricks';
import { ART } from './artDirection';
import { boxCorners, fitDistance, framingPoints, orbitMaxDistance, projectToGround, shadowFrustum } from './cameraFit';

const C = ART.camera;
const POINTS = framingPoints(C.fit);

/** Place a real three camera at the fitted distance and project every point to NDC. */
function ndcExtent(aspect: number) {
  const d = fitDistance({ from: C.position, target: C.target, fov: C.fov, aspect, points: POINTS, margin: C.fit.margin });
  const target = new Vector3(...C.target);
  const cam = new PerspectiveCamera(C.fov, aspect, C.near, C.far);
  cam.position.set(...C.position).sub(target).setLength(d).add(target);
  cam.lookAt(target);
  cam.updateMatrixWorld();
  let x = 0;
  let y = 0;
  for (const p of POINTS) {
    const v = new Vector3(...p).project(cam);
    x = Math.max(x, Math.abs(v.x));
    y = Math.max(y, Math.abs(v.y));
  }
  return { d, x, y };
}

describe('camera fit (ADR-18)', () => {
  // Stage sizes measured in the browser: 1440 x 900, 1024 x 768, and the stacked 16:10 layout.
  it.each([
    ['1440 x 900', 784 / 876],
    ['1024 x 768', 368 / 744],
    ['stacked 16:10', 16 / 10],
  ])('keeps the board, its shadow and the highest pop in frame at %s', (_name, aspect) => {
    const { x, y } = ndcExtent(aspect);
    expect(x).toBeLessThanOrEqual(1 - C.fit.margin + 1e-6);
    expect(y).toBeLessThanOrEqual(1 - C.fit.margin + 1e-6);
    // Tight on at least one axis: the fit is the smallest distance, not just a safe one.
    expect(Math.max(x, y)).toBeGreaterThan(1 - C.fit.margin - 1e-3);
  });

  // Changed on purpose with the rider's-view home camera (ADR-23, 2026-11-04).
  // Seen from 60 degrees up the pad's depth is foreshortened, so on the
  // 1440 stage the whole-pad fit is only 1.3 times the flight fit (it was
  // more than 1.4 from the old 3/4 view), and on 16:10 the pad fits anyway.
  // The 1024 stage, where the width binds, still shows the large saving.
  it('frames the flight, not the pad: the fit is closer than the old whole-pad fit', () => {
    // The pad is one ground bay (ADR-31), the size of the old slab.
    const [w, dp] = ART.ground.bay;
    const padCorners = [-1, 1].flatMap((sx) => [-1, 1].map((sz): [number, number, number] => [(sx * w) / 2, 0, (sz * dp) / 2]));
    const whole = (aspect: number) =>
      fitDistance({ from: C.position, target: C.target, fov: C.fov, aspect, points: [...POINTS, ...padCorners], margin: C.fit.margin });
    expect(ndcExtent(368 / 744).d).toBeLessThan(whole(368 / 744) * 0.7);
    expect(ndcExtent(784 / 876).d).toBeLessThan(whole(784 / 876) * 0.8);
  });

  // From the steep home view the flight box's height on screen (its depth
  // in Z, seen from above) binds on both the 1440 and the 16:10 stage, so
  // those two now fit at the same distance (ADR-23); only a stage narrow
  // enough for the width to bind backs off further.
  it('backs off further on narrower stages', () => {
    expect(ndcExtent(368 / 744).d).toBeGreaterThan(ndcExtent(784 / 876).d);
    expect(ndcExtent(784 / 876).d).toBeGreaterThanOrEqual(ndcExtent(16 / 10).d - 1e-9);
  });

  it('starts in the rider view: above the heel side (+Z), centred on X, 55 to 65 degrees up, nose on the right (ADR-23)', () => {
    const back = new Vector3(...C.position).sub(new Vector3(...C.target));
    expect(C.position[0]).toBe(0);
    expect(back.z).toBeGreaterThan(0);
    const polar = Math.acos(back.y / back.length());
    expect(polar).toBeGreaterThanOrEqual(C.minPolarAngle);
    expect(polar).toBeLessThanOrEqual(C.maxPolarAngle);
    const elevation = 90 - (polar * 180) / Math.PI;
    expect(elevation).toBeGreaterThanOrEqual(55);
    expect(elevation).toBeLessThanOrEqual(65);
    // Screen right is +X, so the nose (+X) is on the right of the stage.
    const cam = new PerspectiveCamera(C.fov, 1, C.near, C.far);
    cam.position.set(...C.position);
    cam.lookAt(new Vector3(...C.target));
    cam.updateMatrixWorld();
    const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    expect(right.x).toBeCloseTo(1, 6);
  });
});

describe('the orbit zoom-out limit (ADR-18, ADR-55)', () => {
  // A unit box round the origin: its farthest corner is sqrt(3) from the target.
  const points = framingPoints({ reach: 1, bottom: -1, top: 1 });
  const base = { target: [0, 0, 0] as const, points, maxDistance: 4.5, zoomOut: 1.25, fogNear: 10 };

  it('is the orbit limit while the fit is near, and the fit times zoomOut on a narrow stage', () => {
    expect(orbitMaxDistance({ ...base, fit: 2 })).toBe(4.5);
    expect(orbitMaxDistance({ ...base, fit: 5 })).toBe(6.25);
  });

  it('stops where the farthest point would reach the fog, but never nearer than the fit', () => {
    expect(orbitMaxDistance({ ...base, fit: 5, fogNear: 7 })).toBeCloseTo(7 - Math.sqrt(3), 9);
    expect(orbitMaxDistance({ ...base, fit: 6, fogNear: 7 })).toBe(6);
  });
});

describe('camera presets (ADR-38)', () => {
  const D = C.views.detail;

  it('keeps the rider preset equal to the home view', () => {
    expect(C.views.rider.position).toEqual(C.position);
    expect(C.views.rider.target).toEqual(C.target);
  });

  it('puts the detail view low and three-quarter on the heel side: 30 to 40 degrees up, inside the orbit limits', () => {
    const back = new Vector3(...D.position).sub(new Vector3(...D.target));
    expect(back.z).toBeGreaterThan(0);
    const polar = Math.acos(back.y / back.length());
    expect(polar).toBeGreaterThanOrEqual(C.minPolarAngle);
    expect(polar).toBeLessThanOrEqual(C.maxPolarAngle);
    const elevation = 90 - (polar * 180) / Math.PI;
    expect(elevation).toBeGreaterThanOrEqual(30);
    expect(elevation).toBeLessThanOrEqual(40);
    // Three-quarter: turned off the heel-side axis, not square to it and not end on.
    const azimuth = (Math.atan2(back.x, back.z) * 180) / Math.PI;
    expect(Math.abs(azimuth)).toBeGreaterThanOrEqual(15);
    expect(Math.abs(azimuth)).toBeLessThanOrEqual(45);
  });

  it.each([
    ['1440 x 900', 784 / 876],
    ['1024 x 768', 368 / 744],
    ['stacked 16:10', 16 / 10],
  ])('frames the board, its shadow and the highest pop from the detail view at %s (ADR-18)', (_name, aspect) => {
    const d = fitDistance({ from: D.position, target: D.target, fov: C.fov, aspect, points: POINTS, margin: C.fit.margin });
    const target = new Vector3(...D.target);
    const cam = new PerspectiveCamera(C.fov, aspect, C.near, C.far);
    cam.position.set(...D.position).sub(target).setLength(Math.max(C.minDistance, d)).add(target);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    for (const p of POINTS) {
      const v = new Vector3(...p).project(cam);
      expect(Math.abs(v.x)).toBeLessThanOrEqual(1 - C.fit.margin + 1e-6);
      expect(Math.abs(v.y)).toBeLessThanOrEqual(1 - C.fit.margin + 1e-6);
      expect(v.z).toBeLessThan(1);
    }
  });
});

describe('the High shadow camera (ADR-38)', () => {
  const S = ART.shadowMap;
  const L = ART.lights.directional;
  const F = shadowFrustum(L.position, L.target, S.casters, S.pad);
  const lightDir = new Vector3(...L.target).sub(new Vector3(...L.position)).normalize();
  const AROUND = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  /** The same camera three's DirectionalLightShadow builds: at the light, looking at the target, with these bounds. */
  function shadowCamera() {
    const cam = new OrthographicCamera(F.left, F.right, F.top, F.bottom, F.near, F.far);
    cam.position.set(...L.position);
    cam.lookAt(new Vector3(...L.target));
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    return cam;
  }

  /** Every caster the sim can put in the air: the board's reach, the soles, the shank joints, at every preset and pop in both stances. */
  function casterPoints() {
    const pts: Vector3[] = [];
    const feet = newFeetPose();
    const legs = newLegsPose();
    const restY = ART.board.restY;
    const r = ART.legs.shank.calf;
    const sole = Math.hypot(FOOT.length / 2, FOOT.width / 2);
    const cases = PRESETS.flatMap((p) => [0.15, 0.35, 0.6].map((pop) => ({ ...p.inputs, pop })));
    for (const inputs of cases) {
      const flight = computeFlight(inputs);
      for (const stance of ['goofy', 'regular'] as const) {
        for (let i = 0; i <= 100; i++) {
          const u = i / 100;
          const pose = writePose({ y: 0, roll: 0, yaw: 0, pitch: 0 }, flight, u);
          // The board's spin circle at its height, plus its farthest reach off the long axis (ART.camera.fit).
          for (const [sx, sz] of AROUND) pts.push(new Vector3(sx * C.fit.reach, restY + pose.y + 0.13, sz * C.fit.reach));
          const f = writeFeetPose(feet, inputs, flight, u, stance);
          const l = writeLegsPose(legs, f, flight, u, inputs, stance);
          // Each sole's corners whatever its yaw, up to the top of the shoe.
          for (const foot of [f.front, f.back])
            for (const [sx, sz] of AROUND) pts.push(new Vector3(foot.x + sx * sole, restY + foot.y + 0.11, foot.z + sz * sole));
          // The shanks (the casting part of the legs, ADR-37): knee and ankle plus the calf radius.
          for (const leg of [l.front, l.back])
            for (const q of [leg.knee, leg.ankle])
              for (const [sx, sz] of AROUND) pts.push(new Vector3(q.x + sx * r, restY + q.y + r, q.z + sz * r));
        }
      }
    }
    return pts;
  }

  it('the caster boxes hold every board, sole and shank point the sim produces', () => {
    const inside = (p: Vector3, b: (typeof S.casters)[number]) =>
      p.x >= b.min[0] && p.x <= b.max[0] && p.y >= b.min[1] - 1e-9 && p.y <= b.max[1] && p.z >= b.min[2] && p.z <= b.max[2];
    let top = 0;
    for (const p of casterPoints()) {
      expect(S.casters.some((b) => inside(p, b)), `${p.x.toFixed(3)} ${p.y.toFixed(3)} ${p.z.toFixed(3)}`).toBe(true);
      top = Math.max(top, p.y);
    }
    // And they are not loose: the top is the knees at the highest pop, within 2 cm.
    expect(top).toBeGreaterThan(Math.max(...S.casters.map((b) => b.max[1])) - 0.02);
  });

  it('holds every caster and the place its shadow lands on the pad, through a real three camera', () => {
    const cam = shadowCamera();
    const ground = (p: Vector3) => p.clone().addScaledVector(lightDir, -p.y / lightDir.y);
    for (const c of S.casters.flatMap(boxCorners)) {
      const p = new Vector3(...c);
      for (const q of [p, ground(p)]) {
        const v = q.project(cam);
        expect(Math.abs(v.x)).toBeLessThan(1);
        expect(Math.abs(v.y)).toBeLessThan(1);
        expect(Math.abs(v.z)).toBeLessThan(1);
      }
    }
    // The pure projection agrees with the ray.
    const top = new Vector3(0.3, 1.2, -0.2);
    const [gx, gy, gz] = projectToGround([top.x, top.y, top.z], [lightDir.x, lightDir.y, lightDir.z]);
    expect(new Vector3(gx, gy, gz).distanceTo(ground(top))).toBeLessThan(1e-9);
  });

  it('is tighter than the old fixed box: smaller across and far shallower', () => {
    // Was +-1.0 m across, near 1 and far 12 (2026-11-04).
    expect(F.right - F.left).toBeLessThan(2);
    expect(F.top - F.bottom).toBeLessThan(2);
    expect(F.far - F.near).toBeLessThan(3);
    // A texel of the 2048 map is under a millimetre, so 1 to 3 mm of normal bias is a few texels, not 15 mm.
    expect(Math.max(F.right - F.left, F.top - F.bottom) / S.size).toBeLessThan(0.001);
    expect(S.normalBias).toBeGreaterThanOrEqual(0.001);
    expect(S.normalBias).toBeLessThanOrEqual(0.003);
  });

  describe('round the whole rider (ADR-85), while it shows', () => {
    const RF = shadowFrustum(L.position, L.target, S.riderCasters, S.pad);
    /** Each bone as a capsule as thick as the mesh round it (src/asset/riderSpec.ts): length, radius. */
    const CAPSULE: Record<(typeof RIDER_BONES)[number], [number, number]> = {
      pelvis: [BODY.pelvis, 0.2],
      spine: [BODY.spine, 0.2],
      chest: [BODY.chest, 0.2],
      neck: [BODY.neck, 0.06],
      head: [BODY.head, 0.11],
      clavicleL: [BODY.clavicle.length, 0.08],
      clavicleR: [BODY.clavicle.length, 0.08],
      upperArmL: [BODY.upperArm, 0.065],
      upperArmR: [BODY.upperArm, 0.065],
      forearmL: [BODY.forearm, 0.06],
      forearmR: [BODY.forearm, 0.06],
      handL: [BODY.hand, 0.05],
      handR: [BODY.hand, 0.05],
      thighL: [LEG.thigh, 0.09],
      thighR: [LEG.thigh, 0.09],
      shinL: [LEG.shank, 0.065],
      shinR: [LEG.shank, 0.065],
      // The feet (2026-11-13): only the jeans' cuff and the sock hang from them, round the ankle joint.
      footL: [0.03, 0.065],
      footR: [0.03, 0.065],
    };
    /** The body's points over every preset at three pops and the timing bar's corners (4.2 rev/s, bar.ts), both stances. */
    function bodyPoints() {
      const pts: Vector3[] = [];
      const feet = newFeetPose();
      const legs = newLegsPose();
      const body = newBodyPose();
      const p = { x: 0, y: 0, z: 0 };
      const restY = ART.board.restY;
      const cases = [
        ...PRESETS.flatMap((pr) => [0.15, 0.35, 0.6].map((pop) => ({ ...pr.inputs, pop }))),
        ...[0.15, 0.6].flatMap((pop) => [-4.2, 4.2].flatMap((flick) => [-4.2, 0, 4.2].map((scoop) => ({ pop, flick, scoop })))),
      ];
      for (const inputs of cases) {
        const flight = computeFlight(inputs);
        for (const stance of ['goofy', 'regular'] as const) {
          for (let i = 0; i <= 50; i++) {
            const u = i / 50;
            const f = writeFeetPose(feet, inputs, flight, u, stance);
            const l = writeLegsPose(legs, f, flight, u, inputs, stance);
            const b = writeBodyPose(body, l, f, flight, u, inputs, stance);
            RIDER_BONES.forEach((name, k) => {
              const [length, r] = CAPSULE[name];
              for (let t = 0; t <= 4; t++) {
                bonePoint(p, b.bones[k]!, 0, (length * t) / 4, 0);
                for (const [sx, sz] of AROUND) pts.push(new Vector3(p.x + sx * r, restY + p.y, p.z + sz * r));
                pts.push(new Vector3(p.x, restY + p.y + r, p.z));
              }
            });
          }
        }
      }
      return pts;
    }

    it('holds every board, sole, shank and body point, and is not loose: the top is the beanie at the highest pop', () => {
      const inside = (p: Vector3, b: (typeof S.riderCasters)[number]) =>
        p.x >= b.min[0] && p.x <= b.max[0] && p.y >= b.min[1] - 1e-9 && p.y <= b.max[1] && p.z >= b.min[2] && p.z <= b.max[2];
      let top = 0;
      const out: string[] = [];
      for (const p of [...casterPoints(), ...bodyPoints()]) {
        if (!S.riderCasters.some((b) => inside(p, b))) out.push(`${p.x.toFixed(3)} ${p.y.toFixed(3)} ${p.z.toFixed(3)}`);
        top = Math.max(top, p.y);
      }
      expect(out.slice(0, 5)).toEqual([]);
      expect(top).toBeGreaterThan(Math.max(...S.riderCasters.map((b) => b.max[1])) - 0.02);
    });

    it('contains the legs fit, and keeps a texel of the map under 1.6 mm (the legs fit: 0.87)', () => {
      expect(RF.left).toBeLessThanOrEqual(F.left);
      expect(RF.right).toBeGreaterThanOrEqual(F.right);
      expect(RF.bottom).toBeLessThanOrEqual(F.bottom);
      expect(RF.top).toBeGreaterThanOrEqual(F.top);
      expect(Math.max(RF.right - RF.left, RF.top - RF.bottom) / S.size).toBeLessThan(0.0016);
      // Measured 2026-11-13: 1.85 x 2.71 m, 3.73 m deep, a texel of 1.33 mm (2026-11-11: 1.74 x 3.05 m, 4.28 m, 1.49 mm).
      expect(RF.far - RF.near).toBeLessThan(4.5);
    });
  });
});
