// ADR-52 (2026-11-09): the sky dome, its city and what the welcome camera
// sees of them. The numbers are ART.sky; the dome is skyDome.ts.
import { describe, expect, it } from 'vitest';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { hexToRgb } from '../asset/textures';
import { ART, SCENE_BG } from './artDirection';
import { fitDistance, framingPoints } from './cameraFit';
import { cityRgb, skylineBlocks, skyRgb } from './sky';
import { skyDomeGeometry } from './skyDome';

const S = ART.sky;
const THEMES = ['light', 'dark'] as const;

describe('the sky (ADR-52)', () => {
  it.each(THEMES)('meets the fog at the horizon on %s: the horizon is the clear and fog colour, and so is everything below', (theme) => {
    const horizon = hexToRgb(SCENE_BG[theme]);
    expect(S.colors[theme].horizon).toBe(SCENE_BG[theme]);
    expect(ART.fog.color[theme]).toBe(SCENE_BG[theme]);
    expect(skyRgb(theme, 0)).toEqual(horizon);
    expect(skyRgb(theme, -5)).toEqual(horizon);
  });

  it.each(THEMES)('climbs from the horizon through the band to the zenith on %s, without a jump', (theme) => {
    expect(skyRgb(theme, S.bandAt * 90).map(Math.round)).toEqual(hexToRgb(S.colors[theme].band));
    expect(skyRgb(theme, 90).map(Math.round)).toEqual(hexToRgb(S.colors[theme].zenith));
    for (let e = 0; e < 90; e += 0.5) {
      const a = skyRgb(theme, e);
      const b = skyRgb(theme, e + 0.5);
      for (let c = 0; c < 3; c++) expect(Math.abs(a[c]! - b[c]!)).toBeLessThan(6);
    }
  });

  it('builds the same faint city every time, edge to edge round the whole horizon', () => {
    const blocks = skylineBlocks();
    expect(skylineBlocks()).toEqual(blocks);
    expect(blocks[0]!.start).toBe(0);
    for (let i = 1; i < blocks.length; i++) expect(blocks[i]!.start).toBeCloseTo(blocks[i - 1]!.start + blocks[i - 1]!.width, 9);
    const last = blocks.at(-1)!;
    expect(last.start + last.width).toBeCloseTo(360, 9);
    for (const b of blocks.slice(0, -1)) {
      expect(b.width).toBeGreaterThanOrEqual(S.skyline.width[0]);
      expect(b.width).toBeLessThanOrEqual(S.skyline.width[1]);
    }
    for (const b of blocks) {
      expect(b.height).toBeGreaterThanOrEqual(S.skyline.height[0]);
      expect(b.height).toBeLessThanOrEqual(S.skyline.height[1]);
      expect(b.setback === 1 || (b.setback >= S.skyline.setback[0] && b.setback <= S.skyline.setback[1])).toBe(true);
    }
  });

  it.each(THEMES)('draws the city on %s between the sky and its tint, closer to the sky (faint)', (theme) => {
    const sky = skyRgb(theme, 1);
    const tint = hexToRgb(S.colors[theme].city);
    const city = cityRgb(theme, 1);
    for (let c = 0; c < 3; c++) {
      expect(city[c]!).toBeCloseTo(sky[c]! + (tint[c]! - sky[c]!) * S.skyline.strength, 9);
    }
    expect(S.skyline.strength).toBeLessThan(0.5);
  });
});

describe('the sky dome', () => {
  it.each(THEMES)('puts the sky on the dome and the city just inside it, from below the horizon to the zenith, on %s', (theme) => {
    const g = skyDomeGeometry(theme);
    const pos = g.getAttribute('position');
    const color = g.getAttribute('color');
    expect(color.count).toBe(pos.count);
    const v = new Vector3();
    let sky = 0;
    let city = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const r = v.length();
      const elevation = MathUtils.radToDeg(Math.asin(v.y / r));
      expect(elevation).toBeGreaterThanOrEqual(-S.dome.below - 1e-5);
      if (Math.abs(r - S.dome.radius) < 1e-4) sky++;
      else {
        expect(r).toBeCloseTo(S.dome.radius * 0.99, 4);
        expect(elevation).toBeLessThanOrEqual(S.skyline.height[1] + 1e-5);
        city++;
      }
    }
    expect(sky).toBe(S.dome.rings.length * (S.dome.azimuthSegments + 1));
    expect(city).toBe(skylineBlocks().length * 8);
    // Inside the camera's far plane, past the fog.
    expect(S.dome.radius).toBeLessThan(ART.camera.far);
    expect(S.dome.radius).toBeGreaterThan(ART.fog.far);
    g.dispose();
  });
});

describe('the welcome camera sees the sky but not the end of the ground', () => {
  const C = ART.camera;
  const V = C.views.showcase;
  const [gx, gz] = ART.ground.size;
  const target = new Vector3(...V.target);
  const dir = new Vector3(...V.position).sub(target).normalize();

  it('sits below the orbit limit, inside its own, and at least a fifth of the frame is sky', () => {
    const polar = Math.acos(dir.y);
    expect(polar).toBeGreaterThan(C.maxPolarAngle);
    expect(polar).toBeLessThanOrEqual(C.showcaseMaxPolarAngle);
    // The horizon's height in the frame: the view looks down by (90 - polar) degrees.
    const down = 90 - MathUtils.radToDeg(polar);
    const fromTop = (C.fov / 2 - down) / C.fov;
    expect(1 - fromTop).toBeGreaterThan(0.5);
    expect(fromTop).toBeGreaterThan(0.2);
  });

  it('keeps the plane edge in full fog wherever it is in the frame, for every stage shape', () => {
    const cam = new PerspectiveCamera(C.fov, 1, C.near, C.far);
    const ray = new Vector3();
    const hit = new Vector3();
    const view = new Vector3();
    let nearestEdge = Infinity;
    for (const aspect of [0.5, 1, 1.6, 2.2]) {
      const d = fitDistance({ from: V.position, target: V.target, fov: C.fov, aspect, points: framingPoints(C.fit), margin: C.fit.margin });
      cam.aspect = aspect;
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      for (let i = 0; i <= 60; i++)
        for (let j = 0; j <= 60; j++) {
          ray.set(i / 30 - 1, j / 30 - 1, 0.5).unproject(cam).sub(cam.position).normalize();
          if (ray.y >= 0) continue;
          hit.copy(cam.position).addScaledVector(ray, -cam.position.y / ray.y);
          if (Math.max(Math.abs(hit.x) / (gx / 2), Math.abs(hit.z) / (gz / 2)) < 0.97) continue;
          view.copy(hit).applyMatrix4(cam.matrixWorldInverse);
          nearestEdge = Math.min(nearestEdge, -view.z);
        }
    }
    expect(nearestEdge).toBeGreaterThan(ART.fog.far);
  });
});
