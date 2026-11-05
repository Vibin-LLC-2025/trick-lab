import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { ART } from './artDirection';
import { fitDistance, framingPoints } from './cameraFit';

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
