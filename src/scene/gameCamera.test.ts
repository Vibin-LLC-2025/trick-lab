// Step 17 (ADR-72): the game's fixed angles and the instant replay's view,
// lens, bend and clock. Since ADR-85 (2026-11-11) the views that film the
// rider (Free, Filmer, Side) frame the whole body; since ADR-86 (2026-11-11)
// in a game they frame the rider at rest inside the clear part of the stage
// and rise with the flight, and frame the whole flight only under reduced
// motion. The outlines are tested here against the body model itself.
import { describe, expect, it } from 'vitest';
import { Euler, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { buildRider } from '../asset/rider';
import { BODY, BONE, bonePoint, newBodyPose, RIDER_BONES, writeBindPose, writeBodyPose } from '../sim/body';
import { newFeetPose, writeFeetPose } from '../sim/feet';
import { computeFlight, heightAt, writePose } from '../sim/flight';
import { newLegsPose, writeLegsPose } from '../sim/legs';
import { presetById, PRESETS } from '../sim/tricks';
import { ART } from './artDirection';
import { setBoardRotation } from './boardPose';
import { boxCorners, cameraRise, framingPoints, orbitMaxDistance } from './cameraFit';
import { bendUv } from './effects';
import { replayProgress } from './replayClock';
import { leavesFreeForReplay, returnsFromReplay, setLens } from './cameraPlacement';
import { clearFor, distanceFor, fovOf, framePointsFor, framingFor, lookFor, viewFor, type Framing } from './SceneCamera';
import { FULL_STAGE, type ClearArea } from '../store';

const C = ART.camera;
/** The board's flight box, which every view frames. */
const POINTS = framingPoints(C.fit);
/** How much fog a point this far from the camera gets: the smoothstep from the fog's start to its end (rangeFog.ts). */
function fogAmount(d: number) {
  const t = Math.min(1, Math.max(0, (d - ART.fog.near) / (ART.fog.far - ART.fog.near)));
  return t * t * (3 - 2 * t);
}
const GAME = ['free', 'film', 'side', 'above', 'replay'] as const;
const [gx, gz] = ART.ground.size;

/**
 * The game screen's layouts as the page measured them in Chromium on
 * 2026-11-11 (ADR-86): the stage's aspect and its clear part, at 1440 x 900,
 * 1920 x 1080 and 1280 x 720 (the cards down either side, the timing strip
 * along the bottom between them), 1024 x 768, and a phone at 390 x 844 (the
 * turn chip over the top left; the panels and Pop are under the stage).
 */
const LAYOUTS: readonly {
  name: string;
  aspect: number;
  clear: ClearArea;
  px: number;
}[] = [
  {
    name: '1440 x 900',
    aspect: 1.7115,
    clear: { left: 0.2528, top: 0, right: 0.7753, bottom: 0.9303 },
    px: 832,
  },
  {
    name: '1920 x 1080',
    aspect: 1.8814,
    clear: { left: 0.1891, top: 0, right: 0.8319, bottom: 0.9427 },
    px: 1012,
  },
  {
    name: '1280 x 720',
    aspect: 1.9387,
    clear: { left: 0.2848, top: 0, right: 0.7468, bottom: 0.911 },
    px: 652,
  },
  {
    name: '1024 x 768',
    aspect: 1.44,
    clear: { left: 0.3571, top: 0, right: 0.6825, bottom: 0.9171 },
    px: 700,
  },
  {
    name: '390 x 844',
    aspect: 1.9179,
    clear: { left: 0.382, top: 0, right: 1, bottom: 1 },
    px: 195,
  },
];

/** The framing a view had with the rider shown or hidden before ADR-86, and keeps under reduced motion. */
const calmFraming = (view: (typeof GAME)[number] | 'showcase', rider: boolean): Framing => framingFor(view, rider, true);

/** A real camera for a view at its fitted distance on a stage of this aspect, in this framing, inside this clear area, raised by `rise`. */
function cameraFor(view: (typeof GAME)[number] | 'showcase', aspect: number, framing: Framing, clear: ClearArea = FULL_STAGE, rise = 0) {
  const V = lookFor(view, framing);
  const d = distanceFor(view, aspect, framing, clear);
  const target = new Vector3(...V.target);
  const cam = new PerspectiveCamera(C.fov, aspect, C.near, C.far);
  setLens(cam, fovOf(view), clear);
  cam.position
    .set(...V.position)
    .sub(target)
    .setLength(d)
    .add(target);
  cam.position.y += rise;
  target.y += rise;
  cam.lookAt(target);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

/** Where a world point lands on the stage, as fractions from its top left (the clear area's units). */
function onStage(cam: PerspectiveCamera, p: Vector3) {
  const n = p.clone().project(cam);
  return { x: (n.x + 1) / 2, y: (1 - n.y) / 2 };
}

/** Whether a point is inside a clear area (the clear area's own edges, a hair of slack for rounding). */
const inside = (at: { x: number; y: number }, c: ClearArea, eps = 1e-3) =>
  at.x >= c.left - eps && at.x <= c.right + eps && at.y >= c.top - eps && at.y <= c.bottom + eps;

describe("the game's camera (step 17, ADR-72)", () => {
  it.each(GAME)("%s looks from the heel side, below the lab's rider view, so the spot stays behind the board", (view) => {
    const V = C.views[view];
    const back = new Vector3(...V.position).sub(new Vector3(...V.target));
    expect(back.z).toBeGreaterThan(0);
    const elevation = 90 - (Math.acos(back.y / back.length()) * 180) / Math.PI;
    expect(elevation).toBeGreaterThan(0);
    expect(elevation).toBeLessThan(60);
  });

  it.each(GAME.flatMap((v) => [0.5, 1, 16 / 10, 2.2].flatMap((a) => [true, false].map((r) => [v, a, r] as const))))(
    '%s frames the board, its shadow and the highest pop (and on Free, Filmer and Side under reduced motion the whole rider) at aspect %s, rider shown %s',
    (view, aspect, rider) => {
      const cam = cameraFor(view, aspect, calmFraming(view, rider));
      const points = framePointsFor(calmFraming(view, rider));
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
    // In a game Free, Filmer and Side frame the rider at rest (ADR-86); under reduced motion and on the welcome screen, the whole flight (ADR-85).
    for (const v of ['free', 'film', 'side'] as const) {
      expect(framingFor(v, true, false)).toBe('rest');
      expect(framingFor(v, true, true)).toBe('flight');
    }
    expect(framingFor('showcase', true, false)).toBe('flight');
    for (const v of ['above', 'replay', 'rider', 'detail'] as const) for (const calm of [false, true]) expect(framingFor(v, true, calm)).toBe('board');
    for (const v of ['free', 'film', 'side', 'showcase', 'above', 'replay', 'rider', 'detail'] as const)
      for (const calm of [false, true]) expect(framingFor(v, false, calm)).toBe('board');
    expect(framePointsFor('board')).toEqual(POINTS);
    expect(framePointsFor('flight').length).toBeGreaterThan(POINTS.length);
    for (const framing of ['flight', 'rest'] as const)
      for (const v of framing === 'rest' ? (['free', 'film', 'side'] as const) : (['free', 'film', 'side', 'showcase'] as const)) {
        if (framing === 'flight') expect(lookFor(v, framing).target[1]).toBe(C.riderLook);
        // The rest framing looks at the rider's middle, balanced per view (between the knees and the chest).
        else expect(lookFor(v, framing).target[1]).toBeGreaterThan(0.5);
        // Lifted, not turned: the same direction from the target.
        const a = new Vector3(...lookFor(v, framing).position).sub(new Vector3(...lookFor(v, framing).target));
        const b = new Vector3(...C.views[v].position).sub(new Vector3(...C.views[v].target));
        expect(a.distanceTo(b)).toBeLessThan(1e-12);
      }
    for (const v of ['free', 'film', 'side', 'showcase', 'above', 'replay', 'rider', 'detail'] as const) expect(lookFor(v, 'board')).toBe(C.views[v]);
  });

  it.each(GAME)('%s keeps the plane edge in full fog wherever it is in the frame, for every stage shape and every layout, in every framing', (view) => {
    let nearestEdge = Infinity;
    // Every stage shape with nothing over it, and every layout the game makes.
    const stages = [
      ...[0.5, 1, 1.6, 2.2, 3.6, 5.5, 10].map((aspect) => ({
        aspect,
        clear: FULL_STAGE,
      })),
      ...LAYOUTS,
    ];
    for (const { aspect, clear } of stages)
      for (const framing of ['board', 'flight', 'rest'] as const) {
        if (framing !== 'board' && !C.filmsRider.includes(view)) continue;
        // The rise lifts the camera by up to the highest pop.
        for (const rise of framing === 'rest' ? [0, 0.6] : [0])
          nearestEdge = Math.min(nearestEdge, nearestPlaneEdge(cameraFor(view, aspect, framing, clear, rise)));
      }
    expect(nearestEdge).toBeGreaterThan(ART.fog.far);
  });

  it('frames inside the clear part of the stage on the game screen only (ADR-86)', () => {
    const clear = LAYOUTS[0]!.clear;
    expect(clearFor({ screen: 'skate', stageClear: clear })).toBe(clear);
    expect(clearFor({ screen: 'skate', stageClear: null })).toBe(FULL_STAGE);
    expect(clearFor({ screen: 'lab', stageClear: clear })).toBe(FULL_STAGE);
    expect(clearFor({ screen: 'home', stageClear: clear })).toBe(FULL_STAGE);
  });

  it("is the chosen angle on the game screen, the replay's while it plays, and the lab's and the welcome screen's own elsewhere", () => {
    const base = {
      screen: 'skate' as const,
      cameraView: 'detail' as const,
      gameView: 'side' as const,
      replay: 'none' as const,
    };
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
      ray
        .set(i / 20 - 1, j / 20 - 1, 0.5)
        .unproject(cam)
        .sub(cam.position)
        .normalize();
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
  /** A camera where the orbit can put it: polar and azimuth as OrbitControls has them (azimuth 0 on +Z, the heel side), round the target in this framing. */
  function orbitCamera(polar: number, azimuth: number, distance: number, aspect: number, framing: Framing = 'board') {
    const cam = new PerspectiveCamera(C.fov, aspect, C.near, C.far);
    const target = new Vector3(...lookFor('free', framing).target);
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

  it.each(corners)(
    'at polar %s and azimuth %s, from as close as it zooms to as far, keeps the plane edge in full fog and the flight (and the rider) before it',
    (polar, azimuth) => {
      const stages = [
        ...[0.5, 1, 1.6, 2.2, 3.6].map((aspect) => ({
          aspect,
          clear: FULL_STAGE,
        })),
        ...LAYOUTS,
      ];
      for (const framing of ['board', 'flight', 'rest'] as const)
        for (const { aspect, clear } of stages) {
          // The rest framing is the game's, whose stage is always wider than tall (1.4:1 to 2:1 measured).
          if (framing === 'rest' && aspect < 1) continue;
          const points = framePointsFor(framing);
          const fit = distanceFor('free', aspect, framing, clear);
          const far = orbitMaxDistance({
            fit,
            target: lookFor('free', framing).target,
            points,
            maxDistance: C.maxDistance,
            zoomOut: C.zoomOut,
            fogNear: ART.fog.near,
          });
          for (const d of [C.minDistance, fit, far]) {
            const cam = orbitCamera(polar, azimuth, d, aspect, framing);
            setLens(cam, C.fov, clear);
            const at = `aspect ${aspect}, distance ${d.toFixed(2)}, ${framing}`;
            expect(nearestPlaneEdge(cam), at).toBeGreaterThan(ART.fog.far);
            // The rest framing (ADR-86): on the narrow column of a 1024 x 768 game the far corners pass the fog's start a little,
            // where its smoothstep is still under 2 percent; everywhere else nothing reaches it.
            for (const p of points) {
              const dist = new Vector3(...p).distanceTo(cam.position);
              if (framing === 'rest') expect(fogAmount(dist), at).toBeLessThan(0.02);
              else expect(dist, at).toBeLessThan(ART.fog.near + 1e-6);
            }
          }
        }
    },
  );

  it("keeps the student's orbit across the replay, unless Reset view was asked for in between", () => {
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
      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
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
    '%s at aspect %s, framing the whole flight (reduced motion, the welcome screen), keeps the crown in frame with headroom at the top of every 0.6 m pop, and the board readable',
    (view, aspect) => {
      const cam = cameraFor(view, aspect, 'flight');
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
    '%s, %s, a 360 flip at %s m: every point along the deck is in sight all the way through the trick, in a game and framing the whole flight',
    (view, stance, pop) => {
      const inputs = { ...presetById('360-flip').inputs, pop };
      const flight = computeFlight(inputs);
      // Framing the whole flight (ADR-85), and in a game at the layouts it makes, rising with the flight (ADR-86).
      const cams = [
        { cam: cameraFor(view, 1.6, 'flight').position, rising: false },
        ...[LAYOUTS[0]!, LAYOUTS[2]!].map((L) => ({
          cam: cameraFor(view, L.aspect, 'rest', L.clear).position,
          rising: true,
        })),
      ];
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
        for (const { cam: home, rising } of cams) {
          const cam = home.clone();
          if (rising) cam.y += cameraRise(flight, u, C.rest.riseEase, C.rest.bailEase);
          for (let k = -4; k <= 4; k++)
            for (const z of [-0.08, 0.08]) {
              const at = new Vector3((k / 4) * 0.39, 0, z).applyMatrix4(deck);
              const dir = at.clone().sub(cam);
              const len = dir.length();
              dir.normalize();
              if (capsules.some(([a, c, r]) => nearest(cam, dir, len, a, c) < r)) hidden.push(`u ${u} point ${k},${z}${rising ? ' rising' : ''}`);
            }
        }
      }
      expect(hidden).toEqual([]);
    },
  );
});

describe('the rise (ADR-86)', () => {
  const flights = [0.15, 0.35, 0.6].map((pop) => computeFlight({ pop, flick: 1.9, scoop: 0 }));

  it('is zero with no flight, at the pop and from the landing on, and the pop itself at the top', () => {
    expect(cameraRise(null, 0.5)).toBe(0);
    for (const f of flights) {
      for (const u of [-1, 0, 1, 1.5, Infinity]) expect(cameraRise(f, u)).toBe(0);
      expect(cameraRise(f, 0.5)).toBeCloseTo(f.peak, 12);
    }
  });

  it('is continuous and smooth at both ends: no jolt as the camera starts and stops', () => {
    for (const f of flights) {
      let prev = 0;
      for (let i = 1; i <= 1000; i++) {
        const r = cameraRise(f, i / 1000);
        // Never more than a few millimetres a thousandth of the flight.
        expect(Math.abs(r - prev)).toBeLessThan(0.005);
        prev = r;
      }
      // Its slope goes to nothing at both ends.
      expect(cameraRise(f, 1e-4) / 1e-4).toBeLessThan(0.01);
      expect(cameraRise(f, 1 - 1e-4) / 1e-4).toBeLessThan(0.01);
    }
  });

  it('never rises faster than the board: the board is never lower in the frame than at rest', () => {
    for (const f of flights)
      for (let i = 0; i <= 200; i++) {
        const u = i / 200;
        expect(cameraRise(f, u)).toBeLessThanOrEqual(heightAt(f.peak, u) + 1e-12);
      }
  });
});

describe('the rider at rest, in the clear part of the stage (ADR-86)', () => {
  const restY = ART.board.restY;
  const built = buildRider().geometry;
  built.computeBoundingBox();
  const bindHead = writeBindPose(newBodyPose()).bones[BONE.head]!;
  const crown = (built.boundingBox!.max.y - bindHead.o.y) / bindHead.y.y;
  /** The board's outline about the deck's centre: the deck nose to tail and edge to edge, and the wheels' bottoms under the trucks. */
  const BOARD_OUTLINE: [number, number, number][] = [
    ...[-0.41, 0.41].flatMap((x) => [-0.01, 0.03].flatMap((y) => [-0.105, 0.105].map((z): [number, number, number] => [x, y, z]))),
    ...[-0.235, 0.235].flatMap((x) => [-0.105, 0.105].map((z): [number, number, number] => [x, -restY, z])),
  ];

  /**
   * What must be in frame at progress u of a flight (null: at rest, before the
   * pop), the camera's rise taken off: the board's outline (turned by the
   * flip, the shove and the pop's pitch), both shoes' soles and the
   * beanie's crown, the essentials; and the hands.
   */
  function sample(inputs: { pop: number; flick: number; scoop: number }, u: number | null, stance: 'goofy' | 'regular', bufs: ReturnType<typeof buffers>) {
    const flight = u === null ? null : computeFlight(inputs);
    const at = u ?? 0;
    const rise = cameraRise(flight, at, C.rest.riseEase, C.rest.bailEase);
    const pose = writePose(bufs.pose, flight, at);
    bufs.deck.makeRotationFromEuler(setBoardRotation(bufs.turn, pose, stance)).setPosition(0, restY + pose.y - rise, 0);
    const essential: Vector3[] = [];
    for (const [x, y, z] of BOARD_OUTLINE) essential.push(new Vector3(x, y, z).applyMatrix4(bufs.deck));
    const f = writeFeetPose(bufs.feet, inputs, flight, at, stance);
    for (const s of [f.front, f.back]) {
      const yaw = (s.yaw * Math.PI) / 180;
      for (const [a, b] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ] as const) {
        const x = s.x + (Math.cos(yaw) * a * 0.285) / 2 + (Math.sin(yaw) * b * 0.105) / 2;
        const z = s.z - (Math.sin(yaw) * a * 0.285) / 2 + (Math.cos(yaw) * b * 0.105) / 2;
        essential.push(new Vector3(x, restY + s.y - rise, z), new Vector3(x, restY + s.y + 0.12 - rise, z));
      }
    }
    const l = writeLegsPose(bufs.legs, f, flight, at, inputs, stance);
    const b = writeBodyPose(bufs.body, l, f, flight, at, inputs, stance);
    bonePoint(bufs.p, b.bones[BONE.head]!, 0, crown, 0);
    essential.push(new Vector3(bufs.p.x, restY + bufs.p.y - rise, bufs.p.z));
    const hands: Vector3[] = [];
    for (const h of [BONE.handL, BONE.handR]) {
      bonePoint(bufs.p, b.bones[h]!, 0, BODY.hand, 0);
      hands.push(new Vector3(bufs.p.x, restY + bufs.p.y - rise, bufs.p.z));
    }
    return { essential, hands };
  }
  const buffers = () => ({
    pose: { y: 0, roll: 0, yaw: 0, pitch: 0 },
    deck: new Matrix4(),
    turn: new Euler(),
    feet: newFeetPose(),
    legs: newLegsPose(),
    body: newBodyPose(),
    p: { x: 0, y: 0, z: 0 },
  });
  const CASES = [
    ...PRESETS.flatMap((pr) => [0.15, 0.35, 0.6].map((pop) => ({ ...pr.inputs, pop }))),
    ...[0.15, 0.35, 0.6].flatMap((pop) => [-4.2, 4.2].flatMap((flick) => [-4.2, 0, 4.2].map((scoop) => ({ pop, flick, scoop })))),
  ];
  /** Every sample of every case, both stances, at rest and over the flight. */
  const SAMPLES = (() => {
    const bufs = buffers();
    const out: { essential: Vector3[]; hands: Vector3[] }[] = [];
    for (const stance of ['goofy', 'regular'] as const) {
      out.push(sample({ pop: 0.35, flick: 0, scoop: 0 }, null, stance, bufs));
      for (const inputs of CASES) for (let i = 0; i <= 60; i++) out.push(sample(inputs, i / 60, stance, bufs));
    }
    return out;
  })();
  const boxes = C.rest.boxes;
  const inBox = (p: Vector3, b: (typeof boxes)[number], eps = 1e-6) =>
    p.x >= b.min[0] - eps && p.x <= b.max[0] + eps && p.y >= b.min[1] - eps && p.y <= b.max[1] + eps && p.z >= b.min[2] - eps && p.z <= b.max[2] + eps;

  it('keeps the outline round what the model makes, the rise taken off: the board and shoes, the hands, the crown with its headroom', () => {
    let crownTop = -Infinity;
    for (const { essential, hands } of SAMPLES) {
      for (const p of essential)
        expect(
          boxes.some((b) => inBox(p, b)),
          `${p.toArray().map((n) => n.toFixed(3))}`,
        ).toBe(true);
      for (const p of hands)
        expect(
          boxes.some((b) => inBox(p, b, 0.05)),
          `hand ${p.toArray().map((n) => n.toFixed(3))}`,
        ).toBe(true);
      crownTop = Math.max(crownTop, essential[essential.length - 1]!.y);
    }
    // Headroom, not more: the crown comes within 4 to 8 cm of the head box's top.
    expect(crownTop).toBeLessThan(boxes[3]!.max[1] - 0.04 + 1e-9);
    expect(crownTop).toBeGreaterThan(boxes[3]!.max[1] - 0.08);
    expect(boxCorners({ min: boxes[0]!.min, max: boxes[0]!.max })).toHaveLength(8);
  });

  it.each(LAYOUTS.flatMap((L) => (['free', 'film', 'side'] as const).map((v) => [v, L.name, L] as const)))(
    '%s at %s: the board, both shoes and the head inside the clear area at rest and through every flight, the camera rising',
    (view, _name, L) => {
      for (const { essential } of SAMPLES) {
        // The camera at the rise this sample took off: the same picture as the sample put back up under a raised camera.
        const cam = cameraFor(view, L.aspect, 'rest', L.clear);
        for (const p of essential) expect(inside(onStage(cam, p), L.clear), `${view} ${p.toArray().map((n) => n.toFixed(3))}`).toBe(true);
      }
    },
  );

  /**
   * The board's length at rest at 1440 x 900 on High (ADR-86): measured
   * 2026-11-11 at 217, 223 and 288 px from Free, Filmer and Side, where the
   * whole flight's framing over the whole stage gives 198, 199 and 229
   * (ADR-85). Free and Filmer look at the board three quarters on, 30 degrees
   * round, so it reads shorter than side on; the floors here keep a little
   * room under what is measured.
   */
  const BOARD_PX = { free: 212, film: 218, side: 282 } as const;

  it.each(['free', 'film', 'side'] as const)('%s at 1440 x 900: the board at rest is long on screen, longer than the whole flight framed on the whole stage', (view) => {
    const L = LAYOUTS[0]!;
    const length = (cam: PerspectiveCamera) => {
      const a = onStage(cam, new Vector3(C.fit.reach - 0.01, restY, 0));
      const b = onStage(cam, new Vector3(-(C.fit.reach - 0.01), restY, 0));
      return Math.hypot((a.x - b.x) * L.aspect * L.px, (a.y - b.y) * L.px);
    };
    const rest = length(cameraFor(view, L.aspect, 'rest', L.clear));
    expect(rest).toBeGreaterThanOrEqual(BOARD_PX[view]);
    expect(rest).toBeGreaterThan(1.08 * length(cameraFor(view, L.aspect, 'flight', FULL_STAGE)));
  });

  it('puts the orbit target at the centre of the clear area, and the whole stage back with no offset (setLens)', () => {
    for (const L of LAYOUTS) {
      const cam = cameraFor('film', L.aspect, 'rest', L.clear);
      const t = onStage(cam, new Vector3(...lookFor('film', 'rest').target));
      expect(t.x).toBeCloseTo((L.clear.left + L.clear.right) / 2, 6);
      expect(t.y).toBeCloseTo((L.clear.top + L.clear.bottom) / 2, 6);
      expect(cam.fov).toBe(C.fov);
      // A resize keeps it: only the aspect changes, the offset is in units of the stage.
      cam.aspect = L.aspect * 1.3;
      cam.updateProjectionMatrix();
      const r = onStage(cam, new Vector3(...lookFor('film', 'rest').target));
      expect(r.x).toBeCloseTo((L.clear.left + L.clear.right) / 2, 6);
      setLens(cam, C.fov, FULL_STAGE);
      expect(cam.view?.enabled ?? false).toBe(false);
      const c = onStage(cam, new Vector3(...lookFor('film', 'rest').target));
      expect(c.x).toBeCloseTo(0.5, 6);
      expect(c.y).toBeCloseTo(0.5, 6);
    }
  });
});
