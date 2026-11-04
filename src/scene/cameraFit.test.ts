import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { ART } from './artDirection';
import { fitDistance, framingPoints } from './cameraFit';

const C = ART.camera;
const POINTS = framingPoints(ART.pad, C.fit);

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

describe('camera fit (ADR-11)', () => {
  // Stage sizes measured in the browser: 1440 x 900, 1024 x 768, and the stacked 16:10 layout.
  it.each([
    ['1440 x 900', 784 / 876],
    ['1024 x 768', 368 / 744],
    ['stacked 16:10', 16 / 10],
  ])('keeps the whole pad and the highest pop in frame at %s', (_name, aspect) => {
    const { x, y } = ndcExtent(aspect);
    expect(x).toBeLessThanOrEqual(1 - C.fit.margin + 1e-6);
    expect(y).toBeLessThanOrEqual(1 - C.fit.margin + 1e-6);
    // Tight on at least one axis: the fit is the smallest distance, not just a safe one.
    expect(Math.max(x, y)).toBeGreaterThan(1 - C.fit.margin - 1e-3);
  });

  it('backs off further on narrower stages', () => {
    expect(ndcExtent(368 / 744).d).toBeGreaterThan(ndcExtent(784 / 876).d);
    expect(ndcExtent(784 / 876).d).toBeGreaterThan(ndcExtent(16 / 10).d);
  });
});
