import { describe, expect, it } from 'vitest';
import tokens from '../styles/tokens.css?raw';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { CONCRETE, PLANE } from '../asset/groundSpec';
import { OUTLINE, REST_Y, WHEEL } from '../asset/spec';
import { ART, SCENE_BG } from './artDirection';
import { fitDistance, framingPoints, orbitMaxDistance } from './cameraFit';
import { geo } from './resources';

/** Body of the first rule whose selector matches exactly, e.g. `:root` or `:root[data-theme="dark"]`. */
function ruleBody(css: string, selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)?.[1];
}

const sceneBg = (body: string | undefined) => /--scene-bg:\s*(#[0-9a-f]{6})/i.exec(body ?? '')?.[1]?.toLowerCase();

describe('scene background per theme', () => {
  it('--path-front and --path-back equal the foot path colours', () => {
    const root = ruleBody(tokens, ':root') ?? '';
    const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(root)?.[1]?.toLowerCase();
    expect(token('path-front')).toBe(ART.footPaths.color.front);
    expect(token('path-back')).toBe(ART.footPaths.color.back);
  });

  it('light (:root) --scene-bg equals the light clear color', () => {
    expect(sceneBg(ruleBody(tokens, ':root')), 'tokens.css :root should define --scene-bg').toBe(SCENE_BG.light);
  });

  it('dark (:root[data-theme="dark"]) --scene-bg equals the dark clear color', () => {
    expect(
      sceneBg(ruleBody(tokens, ':root[data-theme="dark"]')),
      'tokens.css :root[data-theme="dark"] should define --scene-bg',
    ).toBe(SCENE_BG.dark);
  });

  it('the scene reads its clear colors from the same constant', () => {
    expect(ART.clearColor).toBe(SCENE_BG);
  });
});

describe('rest height (realistic board pass)', () => {
  it('rests both detail levels with their wheels on the pad', () => {
    const B = ART.board;
    expect(B.restY).toBe(REST_Y);
    // GLB wheels: centre -0.05775, radius 0.0265 (src/asset/spec.ts, tested against the built geometry).
    expect(B.restY + WHEEL.centerY - WHEEL.radius).toBeCloseTo(0, 9);
    // Primitive board (fallback and Low, ADR-54): built at the GLB's coordinates, so its wheels touch too.
    geo.boardHardware.computeBoundingBox();
    expect(B.restY + geo.boardHardware.boundingBox!.min.y).toBeCloseTo(0, 6);
    geo.boardDeck.computeBoundingBox();
    // The deck mesh: its caps reach within a millimetre past the outline's tips.
    expect(geo.boardDeck.boundingBox!.max.x).toBeCloseTo(OUTLINE.noseTip, 2);
    expect(geo.boardDeck.boundingBox!.min.x).toBeCloseTo(OUTLINE.tailTip, 2);
  });

  it('frames the longer nose and the board at any roll at the top of a 0.6 m pop', () => {
    expect(ART.camera.fit.reach).toBeGreaterThan(0.4095);
    const outerWheelEdge = Math.hypot(WHEEL.centerZ + WHEEL.width / 2, REST_Y);
    expect(ART.camera.fit.top - (REST_Y + 0.6)).toBeGreaterThan(outerWheelEdge);
  });
});

describe('fog and ground (ground pass, ADR-31)', () => {
  const F = ART.fog;
  const C = ART.camera;
  const [gx, gz] = ART.ground.size;
  // By distance from the camera (ADR-55), as both renderers apply it.
  const fogAt = (distance: number) => MathUtils.smoothstep(distance, F.near, F.far);
  // A desktop window's stage has no widest shape (2560 x 400 makes about
  // 5.5:1; review of Phase C, 2026-11-09), so the edge is checked to 50:1.
  const STAGES = [368 / 744, 1, 1.6, 2.2, 3.6, 5.5, 10, 50];

  it('fogs to the clear colour, per theme, and to nothing else', () => {
    expect(F.color).toBe(SCENE_BG);
    expect(F.color.dark).toBe(ART.clearColor.dark);
    expect(F.color.light).toBe(ART.clearColor.light);
  });

  /** The fitted distance for a view on a stage, as SceneCamera computes it. */
  const fitFor = (view: 'rider' | 'detail' | 'showcase', aspect: number) => {
    const V = C.views[view];
    const d = fitDistance({ from: V.position, target: V.target, fov: C.fov, aspect, points: framingPoints(C.fit), margin: C.fit.margin });
    return Math.max(C.minDistance, d);
  };
  /** The farthest the student's orbit may zoom out on a view and stage (SceneCamera). */
  const orbitMax = (view: 'rider' | 'detail', aspect: number) =>
    orbitMaxDistance({ fit: fitFor(view, aspect), target: C.views[view].target, points: framingPoints(C.fit), maxDistance: C.maxDistance, zoomOut: C.zoomOut, fogNear: F.near });

  // Both of the student's views and the welcome one (no orbit there: it sits
  // at the fit). The detail view on the 1024 x 768 stage zoomed out to 5.23 m
  // before the cap, and a deck corner reached 6.0 m (review of Phase C,
  // 2026-11-09).
  it.each(['rider', 'detail', 'showcase'] as const)(
    'never fogs the board from the %s view: its farthest point from the farthest allowed camera is nearer than fog near, on every stage',
    (view) => {
      const target = C.views[view].target;
      const spread = Math.max(...framingPoints(C.fit).map((p) => Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2])));
      for (const aspect of STAGES) {
        const farthest = view === 'showcase' ? fitFor(view, aspect) : orbitMax(view, aspect);
        expect(farthest).toBeGreaterThanOrEqual(fitFor(view, aspect));
        expect(farthest + spread).toBeLessThanOrEqual(F.near + 1e-9);
        expect(fogAt(farthest + spread)).toBe(0);
      }
    },
  );

  it('lets a narrow stage zoom out past the fit, and stops only where the fog would start', () => {
    const narrow = 368 / 744;
    expect(orbitMax('rider', narrow)).toBeCloseTo(C.maxDistance, 9);
    expect(orbitMax('detail', narrow)).toBeGreaterThan(fitFor('detail', narrow));
    // With the fog starting at 6.5 m (ADR-86) the zoom-out's own limit can bind before the fog does.
    expect(orbitMax('detail', narrow)).toBeLessThanOrEqual(fitFor('detail', narrow) * C.zoomOut);
    for (const aspect of [1, 1.6]) for (const view of ['rider', 'detail'] as const) expect(orbitMax(view, aspect)).toBeCloseTo(C.maxDistance, 9);
  });

  it('hides the plane edge: from every low orbit, on every stage shape, the ground near its edge is fully fogged', () => {
    const cam = new PerspectiveCamera(C.fov, 1, C.near, C.far);
    const target = new Vector3();
    const ray = new Vector3();
    const hit = new Vector3();
    let nearestEdge = Infinity;
    for (const view of ['rider', 'detail'] as const)
      for (const aspect of STAGES) {
        target.set(...C.views[view].target);
        for (const distance of [C.minDistance, 2.4, C.maxDistance, orbitMax(view, aspect)])
          for (let a = 0; a < 16; a++) {
            const az = (a / 16) * Math.PI * 2;
            const polar = C.maxPolarAngle;
            cam.aspect = aspect;
            cam.position.set(
              target.x + distance * Math.sin(polar) * Math.sin(az),
              target.y + distance * Math.cos(polar),
              target.z + distance * Math.sin(polar) * Math.cos(az),
            );
            cam.lookAt(target);
            cam.updateMatrixWorld();
            cam.updateProjectionMatrix();
            for (let i = 0; i <= 40; i++)
              for (let j = 0; j <= 40; j++) {
                ray.set((i / 20 - 1), (j / 20 - 1), 0.5).unproject(cam).sub(cam.position).normalize();
                if (ray.y >= 0) continue;
                const t = -cam.position.y / ray.y;
                hit.copy(cam.position).addScaledVector(ray, t);
                const edge = Math.max(Math.abs(hit.x) / (gx / 2), Math.abs(hit.z) / (gz / 2));
                if (edge < 0.97 || edge > 1) continue;
                nearestEdge = Math.min(nearestEdge, hit.distanceTo(cam.position));
              }
          }
      }
    expect(nearestEdge).toBeGreaterThan(F.far);
    expect(fogAt(nearestEdge)).toBe(1);
  });

  it('draws the untextured ground the size of the GLB plane, flat on y = 0, in two triangles', () => {
    const g = geo.ground;
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.max.x - b.min.x).toBeCloseTo(PLANE.x, 4);
    expect(b.max.z - b.min.z).toBeCloseTo(PLANE.z, 4);
    expect(b.min.y).toBeCloseTo(0, 9);
    expect(b.max.y).toBeCloseTo(0, 9);
    expect(g.index!.count / 3).toBe(2);
    expect(ART.ground.color).toBe(CONCRETE.color);
  });
});
