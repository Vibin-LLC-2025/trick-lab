// The ground plane for public/models/ground.glb (realistic ground pass,
// 2026-11-04, ADR-31): one quad on y = 0, PLANE.x by PLANE.z metres, centred
// on the origin, facing +Y. Its UVs run 0 to 1 across the whole plane (so
// they quantize exactly at the corners); the build's KHR_texture_transform
// repeats the bay tile PLANE_BAYS times, which puts a bay centre under the
// origin because both counts are odd. +u is world +X, +v world +Z.
import { BufferAttribute, BufferGeometry } from 'three';
import { PLANE } from './groundSpec';

export function buildGround(): BufferGeometry {
  const hx = PLANE.x / 2, hz = PLANE.z / 2;
  const g = new BufferGeometry();
  // 0 (-x, -z), 1 (+x, -z), 2 (-x, +z), 3 (+x, +z)
  g.setAttribute('position', new BufferAttribute(new Float32Array([-hx, 0, -hz, hx, 0, -hz, -hx, 0, hz, hx, 0, hz]), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
  // Counter-clockwise seen from above, so the face points up.
  g.setIndex([0, 2, 1, 1, 2, 3]);
  return g;
}

/** Tile coordinates (0 to 1 within a bay, 0.5 the bay centre) of a world point on the plane. */
export function bayUv(x: number, z: number, bay: { x: number; z: number }): [number, number] {
  const f = (t: number) => t - Math.floor(t);
  return [f(x / bay.x + 0.5), f(z / bay.z + 0.5)];
}
