// The outdoor scene that SceneEnvironment prefilters into the environment
// map (ground pass, 2026-11-04, ADR-31; replaces three's RoomEnvironment).
// Never added to the rendered scene and never shown as the background: it
// exists for one PMREMGenerator.fromScene call, then dispose() frees it.
// Built in code (not JSX, not resources.ts) because it is transient, the way
// RoomEnvironment builds and frees its own room. Every number is ART.lights.
import * as THREE from 'three';
import type { Theme } from '../store';
import { ART } from './artDirection';
import { skyRgb } from './sky';

const E = ART.lights.environment;
const L = ART.lights.directional;

/** A colour in linear radiance: the sRGB hex converted to the working space, times `scale`. */
const radiance = (hex: string, scale: number) => new THREE.Color(hex).multiplyScalar(scale);

/**
 * Sky dome (vertex colours: the theme's sky, ART.sky, above; concrete below,
 * blended from the horizon over `horizonBlend`) and a sun disc in the key
 * light's direction, so the reflections and the image-based fill agree with
 * the sky the student sees (ADR-52) and with the key light.
 */
export function outdoorEnvironment(theme: Theme): { scene: THREE.Scene; dispose: () => void } {
  const scene = new THREE.Scene();
  const horizon = new THREE.Color().setRGB(...skyRgb(theme, 0).map((c) => c / 255) as [number, number, number], THREE.SRGBColorSpace).multiplyScalar(E.skyScale);
  const ground = radiance(E.ground.color, E.ground.scale);

  const dome = new THREE.SphereGeometry(E.radius, E.segments.width, E.segments.height);
  const pos = dome.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const grey = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / E.radius;
    if (y >= 0) {
      const [r, g, b] = skyRgb(theme, (Math.asin(Math.min(1, y)) * 180) / Math.PI);
      c.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
      // Part grey, so the fill does not tint the concrete (ART.lights.environment.skySaturation).
      const luma = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
      c.lerp(grey.setScalar(luma), 1 - E.skySaturation).multiplyScalar(E.skyScale);
    } else c.copy(horizon).lerp(ground, THREE.MathUtils.smoothstep(-y, 0, E.horizonBlend));
    c.toArray(colors, i * 3);
  }
  dome.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const domeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  scene.add(new THREE.Mesh(dome, domeMaterial));

  const toSun = new THREE.Vector3(...L.position).sub(new THREE.Vector3(...L.target)).normalize();
  const sunRadius = E.radius * 0.8 * Math.tan(E.sun.angularRadius);
  const sun = new THREE.SphereGeometry(sunRadius, 16, 8);
  const sunMaterial = new THREE.MeshBasicMaterial({ color: radiance(E.sun.color[theme], E.sun.scale) });
  const sunMesh = new THREE.Mesh(sun, sunMaterial);
  sunMesh.position.copy(toSun).multiplyScalar(E.radius * 0.8);
  scene.add(sunMesh);

  return {
    scene,
    dispose: () => {
      dome.dispose();
      domeMaterial.dispose();
      sun.dispose();
      sunMaterial.dispose();
    },
  };
}
