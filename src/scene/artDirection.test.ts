import { describe, expect, it } from 'vitest';
import tokens from '../styles/tokens.css?raw';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { CONCRETE, PLANE } from '../asset/groundSpec';
import { REST_Y, WHEEL } from '../asset/spec';
import { ART, SCENE_BG } from './artDirection';
import { fitDistance, framingPoints } from './cameraFit';
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
    // Primitive board (fallback and Low): its own DESIGN.md section 2 numbers, lifted by primitiveLift.
    expect(B.restY + B.primitiveLift + B.wheels.y - B.wheels.radius).toBeCloseTo(0, 9);
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
  const fogAt = (depth: number) => MathUtils.smoothstep(depth, F.near, F.far);

  it('fogs to the clear colour, per theme, and to nothing else', () => {
    expect(F.color).toBe(SCENE_BG);
    expect(F.color.dark).toBe(ART.clearColor.dark);
    expect(F.color.light).toBe(ART.clearColor.light);
  });

  it('never fogs the board: its farthest point from the farthest allowed camera is nearer than fog near', () => {
    const points = framingPoints(C.fit);
    // The narrowest stage the layout produces (cameraFit.test.ts), where the fit backs off most.
    const fit = fitDistance({ from: C.position, target: C.target, fov: C.fov, aspect: 368 / 744, points, margin: C.fit.margin });
    const farthest = Math.max(C.maxDistance, fit * 1.25);
    // Board reach plus the highest pop, from the orbit target.
    const spread = Math.hypot(C.fit.reach, C.fit.reach, C.fit.top - C.target[1]);
    expect(farthest + spread).toBeLessThanOrEqual(F.near);
    expect(fogAt(farthest + spread)).toBe(0);
  });

  it('hides the plane edge: from every low orbit, the ground near its edge is fully fogged', () => {
    const cam = new PerspectiveCamera(C.fov, 1, C.near, C.far);
    const target = new Vector3(...C.target);
    const ray = new Vector3();
    const hit = new Vector3();
    const view = new Vector3();
    let nearestEdge = Infinity;
    for (const aspect of [0.5, 1, 1.6, 2.2])
      for (const distance of [C.minDistance, 2.4, C.maxDistance])
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
              view.copy(hit).applyMatrix4(cam.matrixWorldInverse);
              nearestEdge = Math.min(nearestEdge, -view.z);
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
