// Step 17 (ADR-72): the game's fixed angles and the instant replay's view,
// lens, bend and clock.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { computeFlight } from '../sim/flight';
import { ART } from './artDirection';
import { fitDistance, framingPoints } from './cameraFit';
import { bendUv } from './effects';
import { replayProgress } from './replayClock';
import { fovOf, viewFor } from './SceneCamera';

const C = ART.camera;
const POINTS = framingPoints(C.fit);
const GAME = ['film', 'side', 'above', 'replay'] as const;
const [gx, gz] = ART.ground.size;

/** A real camera for a view at its fitted distance on a stage of this aspect. */
function cameraFor(view: (typeof GAME)[number], aspect: number) {
  const V = C.views[view];
  const fov = fovOf(view);
  const d = Math.max(C.minDistance, fitDistance({ from: V.position, target: V.target, fov, aspect, points: POINTS, margin: C.fit.margin }));
  const target = new Vector3(...V.target);
  const cam = new PerspectiveCamera(fov, aspect, C.near, C.far);
  cam.position.set(...V.position).sub(target).setLength(d).add(target);
  cam.lookAt(target);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

describe("the game's camera (step 17, ADR-72)", () => {
  it.each(GAME)('%s looks from the heel side, below the lab\'s rider view, so the spot stays behind the board', (view) => {
    const V = C.views[view];
    const back = new Vector3(...V.position).sub(new Vector3(...V.target));
    expect(back.z).toBeGreaterThan(0);
    const elevation = 90 - (Math.acos(back.y / back.length()) * 180) / Math.PI;
    expect(elevation).toBeGreaterThan(0);
    expect(elevation).toBeLessThan(60);
  });

  it.each(GAME.flatMap((v) => [0.5, 1, 16 / 10, 2.2].map((a) => [v, a] as const)))('%s frames the board, its shadow and the highest pop at aspect %s', (view, aspect) => {
    const cam = cameraFor(view, aspect);
    for (const p of POINTS) {
      const ndc = new Vector3(...p).project(cam);
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1 + 1e-6);
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1 + 1e-6);
    }
    // And the flight stays before the fog starts.
    for (const p of POINTS) expect(new Vector3(...p).distanceTo(cam.position)).toBeLessThan(ART.fog.near);
  });

  it.each(GAME)('%s keeps the plane edge in full fog wherever it is in the frame, for every stage shape', (view) => {
    const ray = new Vector3();
    const hit = new Vector3();
    let nearestEdge = Infinity;
    for (const aspect of [0.5, 1, 1.6, 2.2, 3.6, 5.5, 10]) {
      const cam = cameraFor(view, aspect);
      for (let i = 0; i <= 40; i++)
        for (let j = 0; j <= 40; j++) {
          ray.set(i / 20 - 1, j / 20 - 1, 0.5).unproject(cam).sub(cam.position).normalize();
          if (ray.y >= 0) continue;
          hit.copy(cam.position).addScaledVector(ray, -cam.position.y / ray.y);
          if (Math.max(Math.abs(hit.x) / (gx / 2), Math.abs(hit.z) / (gz / 2)) < 0.97) continue;
          nearestEdge = Math.min(nearestEdge, hit.distanceTo(cam.position));
        }
    }
    expect(nearestEdge).toBeGreaterThan(ART.fog.far);
  });

  it('is the chosen angle on the game screen, the replay\'s while it plays, and the lab\'s and the welcome screen\'s own elsewhere', () => {
    const base = { screen: 'skate' as const, cameraView: 'detail' as const, gameView: 'side' as const, replay: 'none' as const };
    expect(viewFor(base)).toBe('side');
    expect(viewFor({ ...base, replay: 'plays' })).toBe('replay');
    expect(viewFor({ ...base, replay: 'due' })).toBe('side');
    expect(viewFor({ ...base, screen: 'lab' })).toBe('detail');
    expect(viewFor({ ...base, screen: 'lab', replay: 'plays' })).toBe('detail');
    expect(viewFor({ ...base, screen: 'home' })).toBe('showcase');
    expect(fovOf('replay')).toBeGreaterThan(C.fov);
    expect(fovOf('film')).toBe(C.fov);
  });
});

describe('the instant replay (ADR-72)', () => {
  it('bends the picture about its centre and keeps the corners on the corners (bendUv)', () => {
    const k = ART.replay.bend;
    for (const aspect of [0.5, 1, 16 / 9, 3]) {
      expect(bendUv(0.5, 0.5, k, aspect)).toEqual([0.5, 0.5]);
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const [bu, bv] = bendUv(u, v, k, aspect);
        expect(bu).toBeCloseTo(u, 9);
        expect(bv).toBeCloseTo(v, 9);
      }
      // A barrel: halfway out, a point samples nearer the centre than it is, and nothing samples outside.
      const [mu] = bendUv(0.75, 0.5, k, aspect);
      expect(mu).toBeGreaterThan(0.5);
      expect(mu).toBeLessThan(0.75);
      for (let i = 0; i <= 10; i++)
        for (let j = 0; j <= 10; j++) {
          const [bu, bv] = bendUv(i / 10, j / 10, k, aspect);
          expect(bu).toBeGreaterThanOrEqual(-1e-9);
          expect(bu).toBeLessThanOrEqual(1 + 1e-9);
          expect(bv).toBeGreaterThanOrEqual(-1e-9);
          expect(bv).toBeLessThanOrEqual(1 + 1e-9);
        }
    }
    // No bend is no change.
    expect(bendUv(0.2, 0.9, 0, 1.6)).toEqual([0.2, 0.9]);
  });

  it('plays the whole flight at its slow rate, from the pop to the landing', () => {
    const flight = computeFlight({ pop: 0.35, flick: 1.9, scoop: 0 });
    expect(replayProgress(0, flight)).toBe(0);
    expect(replayProgress(flight.airtime / ART.replay.rate / 2, flight)).toBeCloseTo(0.5, 9);
    expect(replayProgress(flight.airtime / ART.replay.rate, flight)).toBe(1);
    expect(replayProgress(100, flight)).toBe(1);
    // Slow motion: several times the flight's own length.
    expect(1 / ART.replay.rate).toBeGreaterThanOrEqual(2.5);
  });
});
