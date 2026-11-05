// The outdoor scene that SceneEnvironment prefilters into the environment
// map (ground pass, 2026-11-04, ADR-31; replaces three's RoomEnvironment).
// Never added to the rendered scene and never shown as the background: it
// exists for one PMREMGenerator.fromScene call, then dispose() frees it.
// Built in code (not JSX, not resources.ts) because it is transient, the way
// RoomEnvironment builds and frees its own room. Every number is ART.lights.
import * as THREE from 'three';
import { ART } from './artDirection';

const E = ART.lights.environment;
const L = ART.lights.directional;

/** A colour in linear radiance: the sRGB hex converted to the working space, times `scale`. */
const radiance = (hex: string, scale: number) => new THREE.Color(hex).multiplyScalar(scale);

/**
 * Sky dome (vertex colours: horizon to zenith above, concrete below, blended
 * over `horizonBlend`) and a sun disc in the key light's direction, so the
 * reflections and the image-based fill agree with the key light.
 */
export function outdoorEnvironment(): { scene: THREE.Scene; dispose: () => void } {
  const scene = new THREE.Scene();
  const zenith = radiance(E.sky.zenith, E.sky.scale);
  const horizon = radiance(E.sky.horizon, E.sky.scale);
  const ground = radiance(E.ground.color, E.ground.scale);

  const dome = new THREE.SphereGeometry(E.radius, E.segments.width, E.segments.height);
  const pos = dome.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / E.radius;
    if (y >= 0) c.copy(horizon).lerp(zenith, y ** E.sky.exponent);
    else c.copy(horizon).lerp(ground, THREE.MathUtils.smoothstep(-y, 0, E.horizonBlend));
    c.toArray(colors, i * 3);
  }
  dome.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const domeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  scene.add(new THREE.Mesh(dome, domeMaterial));

  const toSun = new THREE.Vector3(...L.position).sub(new THREE.Vector3(...L.target)).normalize();
  const sunRadius = E.radius * 0.8 * Math.tan(E.sun.angularRadius);
  const sun = new THREE.SphereGeometry(sunRadius, 16, 8);
  const sunMaterial = new THREE.MeshBasicMaterial({ color: radiance(E.sun.color, E.sun.scale) });
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
