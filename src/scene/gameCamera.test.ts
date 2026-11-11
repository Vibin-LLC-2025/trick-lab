// Step 17 (ADR-72): the game's fixed angles and the instant replay's view,
// lens, bend and clock. Since ADR-85 (2026-11-11) the views that film the
// rider (Free, Filmer, Side) frame the whole body at the top of a 0.6 m pop,
// the outline tested here against the body model itself.
import { describe, expect, it } from 'vitest';
import { Euler, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { buildRider } from '../asset/rider';
import { BODY, BONE, bonePoint, newBodyPose, RIDER_BONES, writeBindPose, writeBodyPose } from '../sim/body';
import { newFeetPose, writeFeetPose } from '../sim/feet';
import { computeFlight, writePose } from '../sim/flight';
import { newLegsPose, writeLegsPose } from '../sim/legs';
import { presetById, PRESETS } from '../sim/tricks';
import { ART } from './artDirection';
import { setBoardRotation } from './boardPose';
import { framingPoints, orbitMaxDistance } from './cameraFit';
import { bendUv } from './effects';
import { replayProgress } from './replayClock';
import { leavesFreeForReplay, returnsFromReplay } from './cameraPlacement';
import { distanceFor, fovOf, framePointsFor, lookFor, viewFor } from './SceneCamera';

const C = ART.camera;
/** The board's flight box, which every view frames. */
const POINTS = framingPoints(C.fit);
const GAME = ['free', 'film', 'side', 'above', 'replay'] as const;
const [gx, gz] = ART.ground.size;

/** A real camera for a view at its fitted distance on a stage of this aspect. */
function cameraFor(view: (typeof GAME)[number] | 'showcase', aspect: number, rider = true) {
  const V = lookFor(view, rider);
  const fov = fovOf(view);
  const d = distanceFor(view, aspect, rider);
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

  it.each(GAME.flatMap((v) => [0.5, 1, 16 / 10, 2.2].flatMap((a) => [true, false].map((r) => [v, a, r] as const))))(
    '%s frames the board, its shadow and the highest pop (and on Free, Filmer and Side the whole rider) at aspect %s, rider shown %s',
    (view, aspect, rider) => {
      const cam = cameraFor(view, aspect, rider);
      const points = framePointsFor(view, rider);
      expect(points).toEqual(expect.arrayContaining(POINTS));
      // The whole rider on every stage from 1:1 (the layout makes 1.1:1 to 1.6:1); narrower, only the board is promised.
      for (const p of aspect >= 1 ? points : POINTS) {
        const ndc = new Vector3(...p).project(cam);
        expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1 + 1e-6);
        expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1 + 1e-6);
      }
      // And the flight and the rider stay before the fog starts, on every stage.
      for (const p of points) expect(new Vector3(...p).distanceTo(cam.position)).toBeLessThan(ART.fog.near + 1e-6);
    },
  );

  it("films the rider from Free, Filmer, Side and the welcome screen while it shows; Above, the replay, the lab and a hidden rider keep the board's box", () => {
    for (const v of ['free', 'film', 'side', 'showcase'] as const) {
      expect(framePointsFor(v, true).length).toBeGreaterThan(POINTS.length);
      expect(lookFor(v, true).target[1]).toBe(C.riderLook);
      // Lifted, not turned: the same direction from the target.
      const a = new Vector3(...lookFor(v, true).position).sub(new Vector3(...lookFor(v, true).target));
      const b = new Vector3(...C.views[v].position).sub(new Vector3(...C.views[v].target));
      expect(a.distanceTo(b)).toBeLessThan(1e-12);
    }
    for (const v of ['above', 'replay', 'rider', 'detail'] as const) expect(framePointsFor(v, true)).toEqual(POINTS);
    for (const v of ['free', 'film', 'side', 'showcase', 'above', 'replay', 'rider', 'detail'] as const) {
      expect(framePointsFor(v, false)).toEqual(POINTS);
      expect(lookFor(v, false)).toBe(C.views[v]);
    }
  });

  it.each(GAME)('%s keeps the plane edge in full fog wherever it is in the frame, for every stage shape, with the rider shown or not', (view) => {
    let nearestEdge = Infinity;
    for (const aspect of [0.5, 1, 1.6, 2.2, 3.6, 5.5, 10])
      for (const rider of [true, false]) nearestEdge = Math.min(nearestEdge, nearestPlaneEdge(cameraFor(view, aspect, rider)));
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

/** The nearest point of the ground plane's edge anywhere in this camera's frame, by distance from the camera. */
function nearestPlaneEdge(cam: PerspectiveCamera) {
  const ray = new Vector3();
  const hit = new Vector3();
  let nearest = Infinity;
  for (let i = 0; i <= 40; i++)
    for (let j = 0; j <= 40; j++) {
      ray.set(i / 20 - 1, j / 20 - 1, 0.5).unproject(cam).sub(cam.position).normalize();
      if (ray.y >= 0) continue;
      hit.copy(cam.position).addScaledVector(ray, -cam.position.y / ray.y);
      if (Math.max(Math.abs(hit.x) / (gx / 2), Math.abs(hit.z) / (gz / 2)) < 0.97) continue;
      nearest = Math.min(nearest, hit.distanceTo(cam.position));
    }
  return nearest;
}

describe("the game's free camera (ADR-81)", () => {
  const F = C.free;
  const V = C.views.free;
  const target = new Vector3(...V.target);
  /** A camera where the orbit can put it: polar and azimuth as OrbitControls has them (azimuth 0 on +Z, the heel side), round the target with the rider shown or not. */
  function orbitCamera(polar: number, azimuth: number, distance: number, aspect: number, rider = false) {
    const cam = new PerspectiveCamera(C.fov, aspect, C.near, C.far);
    const target = new Vector3(...lookFor('free', rider).target);
    cam.position.setFromSphericalCoords(distance, polar, azimuth).add(target);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    return cam;
  }
  const corners = [F.minPolarAngle, F.maxPolarAngle].flatMap((p) => [-F.azimuth, 0, F.azimuth].map((a) => [p, a] as const));

  it('starts inside its own limits, the default of the game, under its own key', () => {
    const back = new Vector3(...V.position).sub(target);
    const polar = Math.acos(back.y / back.length());
    expect(polar).toBeGreaterThan(F.minPolarAngle);
    expect(polar).toBeLessThan(F.maxPolarAngle);
    expect(Math.abs(Math.atan2(back.x, back.z))).toBeLessThan(F.azimuth);
  });

  it('never turns to the toe side, so the skate spot stays behind the board', () => {
    expect(F.azimuth).toBeLessThan(Math.PI / 2);
    for (const [p, a] of corners) expect(orbitCamera(p, a, 1, 1.6).position.z).toBeGreaterThan(0);
  });

  it.each(corners)('at polar %s and azimuth %s, from as close as it zooms to as far, keeps the plane edge in full fog and the flight (and the rider) before it', (polar, azimuth) => {
    for (const rider of [false, true])
      for (const aspect of [0.5, 1, 1.6, 2.2, 3.6]) {
        const points = framePointsFor('free', rider);
        const fit = distanceFor('free', aspect, rider);
        const far = orbitMaxDistance({ fit, target: lookFor('free', rider).target, points, maxDistance: C.maxDistance, zoomOut: C.zoomOut, fogNear: ART.fog.near });
        for (const d of [C.minDistance, fit, far]) {
          const cam = orbitCamera(polar, azimuth, d, aspect, rider);
          expect(nearestPlaneEdge(cam), `aspect ${aspect}, distance ${d.toFixed(2)}, rider ${rider}`).toBeGreaterThan(ART.fog.far);
          for (const p of points) expect(new Vector3(...p).distanceTo(cam.position), `aspect ${aspect}, distance ${d.toFixed(2)}, rider ${rider}`).toBeLessThan(ART.fog.near + 1e-6);
        }
      }
  });

  it('keeps the student\'s orbit across the replay, unless Reset view was asked for in between', () => {
    expect(leavesFreeForReplay('free', 'replay')).toBe(true);
    expect(leavesFreeForReplay('film', 'replay')).toBe(false);
    expect(returnsFromReplay('replay', 'free', false)).toBe(true);
    expect(returnsFromReplay('replay', 'free', true)).toBe(false);
    expect(returnsFromReplay('replay', 'film', false)).toBe(false);
    expect(returnsFromReplay('showcase', 'free', false)).toBe(false);
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

describe('the whole rider in frame (ADR-85)', () => {
  const restY = ART.board.restY;
  // The top of the beanie, from the bind pose of the built mesh, along the head bone.
  const built = buildRider().geometry;
  built.computeBoundingBox();
  const bindHead = writeBindPose(newBodyPose()).bones[BONE.head]!;
  const crown = (built.boundingBox!.max.y - bindHead.o.y) / bindHead.y.y;
  const p = { x: 0, y: 0, z: 0 };
  /** The beanie's crown and the mittens' tips at every 0.6 m pop and the timing bar's corners, both stances, in the world. */
  function riderExtremes() {
    const heads: Vector3[] = [];
    const hands: Vector3[] = [];
    const feet = newFeetPose();
    const legs = newLegsPose();
    const body = newBodyPose();
    const cases = [
      ...PRESETS.map((pr) => ({ ...pr.inputs, pop: 0.6 })),
      ...[-4.2, 4.2].flatMap((flick) => [-4.2, 0, 4.2].map((scoop) => ({ pop: 0.6, flick, scoop }))),
    ];
    for (const inputs of cases) {
      const flight = computeFlight(inputs);
      for (const stance of ['goofy', 'regular'] as const)
        for (let i = 0; i <= 100; i++) {
          const u = i / 100;
          const f = writeFeetPose(feet, inputs, flight, u, stance);
          const l = writeLegsPose(legs, f, flight, u, inputs, stance);
          const b = writeBodyPose(body, l, f, flight, u, inputs, stance);
          bonePoint(p, b.bones[BONE.head]!, 0, crown, 0);
          heads.push(new Vector3(p.x, restY + p.y, p.z));
          for (const h of [BONE.handL, BONE.handR]) {
            bonePoint(p, b.bones[h]!, 0, BODY.hand, 0);
            hands.push(new Vector3(p.x, restY + p.y, p.z));
          }
        }
    }
    return { heads, hands };
  }
  const { heads, hands } = riderExtremes();

  it("keeps the outline round the body the model makes: the crown under the head column with room to spare, the hands inside the arms' band", () => {
    const H = C.rider.head;
    const A = C.rider.arms;
    const top = Math.max(...heads.map((h) => h.y));
    expect(top).toBeLessThanOrEqual(H.top - 0.1);
    expect(top).toBeGreaterThan(H.top - 0.2);
    const mitten = 0.05;
    for (const h of hands) {
      expect(Math.abs(h.x) + mitten).toBeLessThanOrEqual(A.reach);
      expect(h.y + mitten).toBeLessThanOrEqual(A.top);
      expect(h.z - mitten).toBeGreaterThanOrEqual(A.front);
      expect(h.z + mitten).toBeLessThanOrEqual(A.back);
    }
    for (const h of heads) {
      expect(Math.abs(h.x)).toBeLessThanOrEqual(A.reach);
      expect(h.z).toBeGreaterThanOrEqual(Math.min(H.front, A.front));
      expect(h.z).toBeLessThanOrEqual(Math.max(H.back, A.back));
    }
  });

  it.each((['free', 'film', 'side', 'showcase'] as const).flatMap((v) => [1.1, 16 / 10, 2.2].map((a) => [v, a] as const)))(
    '%s at aspect %s keeps the crown in frame with headroom at the top of every 0.6 m pop, and the board readable',
    (view, aspect) => {
      const cam = cameraFor(view, aspect);
      let highest = -Infinity;
      for (const h of heads) {
        const ndc = h.clone().project(cam);
        highest = Math.max(highest, ndc.y);
        expect(Math.abs(ndc.x)).toBeLessThan(1);
      }
      // Headroom: the crown never in the top 5 percent of the frame.
      expect(highest).toBeLessThan(0.9);
      for (const h of hands) expect(Math.abs(h.clone().project(cam).x)).toBeLessThan(1);
      // The board at rest, nose to tail, spans a fair part of the frame's height.
      const nose = new Vector3(C.fit.reach, restY, 0).project(cam);
      const tail = new Vector3(-C.fit.reach, restY, 0).project(cam);
      const span = Math.hypot((nose.x - tail.x) * aspect, nose.y - tail.y) / 2;
      expect(span).toBeGreaterThan(0.2);
    },
  );
});

describe('the rider never hides the board from Filmer or Side (ADR-85)', () => {
  const restY = ART.board.restY;
  /** The body above the legs (the legs stood on the board before ADR-85), each bone a capsule as thick as the mesh round it. */
  const UPPER: [(typeof RIDER_BONES)[number], number, number][] = [
    ['pelvis', BODY.pelvis, 0.19],
    ['spine', BODY.spine, 0.19],
    ['chest', BODY.chest, 0.19],
    ['neck', BODY.neck, 0.055],
    ['head', BODY.head, 0.1],
    ['clavicleL', BODY.clavicle.length, 0.07],
    ['clavicleR', BODY.clavicle.length, 0.07],
    ['upperArmL', BODY.upperArm, 0.06],
    ['upperArmR', BODY.upperArm, 0.06],
    ['forearmL', BODY.forearm, 0.055],
    ['forearmR', BODY.forearm, 0.055],
    ['handL', BODY.hand, 0.045],
    ['handR', BODY.hand, 0.045],
  ];
  /** The least distance between the sight line from `o` (unit `d`, `len` long) and the segment a to b, sampled along the segment. */
  function nearest(o: Vector3, d: Vector3, len: number, a: Vector3, b: Vector3) {
    const q = new Vector3();
    const p = new Vector3();
    let best = Infinity;
    for (let i = 0; i <= 24; i++) {
      q.lerpVectors(a, b, i / 24);
      p.copy(o).addScaledVector(d, Math.max(0, Math.min(len, q.clone().sub(o).dot(d))));
      best = Math.min(best, p.distanceTo(q));
    }
    return best;
  }

  it.each((['film', 'side'] as const).flatMap((v) => (['goofy', 'regular'] as const).flatMap((st) => [0.35, 0.6].map((pop) => [v, st, pop] as const))))(
    '%s, %s, a 360 flip at %s m: every point along the deck is in sight all the way through the trick',
    (view, stance, pop) => {
      const inputs = { ...presetById('360-flip').inputs, pop };
      const flight = computeFlight(inputs);
      const cam = cameraFor(view, 1.6).position;
      const feet = newFeetPose();
      const legs = newLegsPose();
      const body = newBodyPose();
      const turn = new Euler();
      const deck = new Matrix4();
      const p = { x: 0, y: 0, z: 0 };
      const hidden: string[] = [];
      for (let i = 0; i <= 50; i++) {
        const u = i / 50;
        const pose = writePose({ y: 0, roll: 0, yaw: 0, pitch: 0 }, flight, u);
        deck.makeRotationFromEuler(setBoardRotation(turn, pose, stance)).setPosition(0, restY + pose.y, 0);
        const f = writeFeetPose(feet, inputs, flight, u, stance);
        const l = writeLegsPose(legs, f, flight, u, inputs, stance);
        const b = writeBodyPose(body, l, f, flight, u, inputs, stance);
        const capsules = UPPER.map(([name, length, r]) => {
          const bone = b.bones[BONE[name]]!;
          bonePoint(p, bone, 0, 0, 0);
          const from = new Vector3(p.x, restY + p.y, p.z);
          bonePoint(p, bone, 0, length, 0);
          return [from, new Vector3(p.x, restY + p.y, p.z), r] as const;
        });
        // Nine points along the deck's length on each edge, wherever the flip and the shove have turned it.
        for (let k = -4; k <= 4; k++)
          for (const z of [-0.08, 0.08]) {
            const at = new Vector3((k / 4) * 0.39, 0, z).applyMatrix4(deck);
            const dir = at.clone().sub(cam);
            const len = dir.length();
            dir.normalize();
            if (capsules.some(([a, c, r]) => nearest(cam, dir, len, a, c) < r)) hidden.push(`u ${u} point ${k},${z}`);
          }
      }
      expect(hidden).toEqual([]);
    },
  );
});
