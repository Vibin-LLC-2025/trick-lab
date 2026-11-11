// Foot paths (2026-11-04): the route each shoe takes through the trick, drawn
// as a thin tube with arrowheads along it, so the student sees which way each
// foot moves and when. Built from the feet model (src/sim/feet.ts), so a bad
// input shows a visibly wrong path before the pop as well as after it.
//
// One geometry for both feet, one draw call: per-vertex colour says which
// foot, and a per-vertex `aU` (0 to 1 of the airtime) lets the shared
// material (resources.ts, mat.footPath); FootPaths.tsx renders it light the part of the path the foot
// has already travelled. FlightDriver sets the material's progress uniform
// each frame; nothing here runs per frame. A geometry is built only when the
// shown inputs or the stance change, and its owner disposes it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { newFeetPose, writeFeetPose, type FeetPose, type Stance } from '../sim/feet';
import type { Flight, TrickInputs } from '../sim/flight';
import { ART } from './artDirection';

const P = ART.footPaths;
export type FootName = 'front' | 'back';

/**
 * The tracked point of both feet (the sole's centre, lifted to mid-shoe so the
 * path leaves from inside the shoe) at `samples + 1` evenly spaced progress
 * values, from one run of the feet model per sample. Board rest frame, flat
 * xyz; regular mirrors x (ADR-25).
 */
export function sampleFootPaths(
  inputs: TrickInputs,
  flight: Flight | null,
  stance: Stance = 'goofy',
  samples: number = P.samples,
): Record<FootName, Float32Array> {
  const out = { front: new Float32Array((samples + 1) * 3), back: new Float32Array((samples + 1) * 3) };
  const pose: FeetPose = newFeetPose();
  for (let i = 0; i <= samples; i++) {
    writeFeetPose(pose, inputs, flight, i / samples, stance);
    for (const foot of ['front', 'back'] as const) {
      const f = pose[foot];
      const a = out[foot];
      a[i * 3] = f.x;
      a[i * 3 + 1] = f.y + P.lift;
      a[i * 3 + 2] = f.z;
    }
  }
  return out;
}

/** One foot's path, as `sampleFootPaths` gives it. */
export const sampleFootPath = (
  inputs: TrickInputs,
  flight: Flight | null,
  foot: FootName,
  stance: Stance = 'goofy',
  samples: number = P.samples,
): Float32Array => sampleFootPaths(inputs, flight, stance, samples)[foot];

const v = (a: Float32Array, i: number, target: THREE.Vector3) => target.set(a[i * 3]!, a[i * 3 + 1]!, a[i * 3 + 2]!);

/** Unit tangents by central difference, carrying the last good one over still stretches. */
function tangents(points: Float32Array): THREE.Vector3[] {
  const n = points.length / 3;
  const out: THREE.Vector3[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let last = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    v(points, Math.min(n - 1, i + 1), a);
    v(points, Math.max(0, i - 1), b);
    const t = a.sub(b);
    if (t.lengthSq() > 1e-12) last = t.normalize().clone();
    out.push(last.clone());
  }
  return out;
}

/** A tube through the points, its frames parallel-transported so it never twists. */
function tube(points: Float32Array, T: readonly THREE.Vector3[], color: THREE.Color): THREE.BufferGeometry {
  const n = points.length / 3;
  const R = P.tube.radialSegments;
  const pos = new Float32Array(n * R * 3);
  const col = new Float32Array(n * R * 3);
  const u = new Float32Array(n * R);
  const centre = new THREE.Vector3();
  let normal = new THREE.Vector3().crossVectors(T[0]!, new THREE.Vector3(1, 0, 0));
  if (normal.lengthSq() < 1e-6) normal.crossVectors(T[0]!, new THREE.Vector3(0, 0, 1));
  normal.normalize();
  const binormal = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = T[i]!;
    // Parallel transport: remove the tangent component of the last normal.
    normal = normal.sub(t.clone().multiplyScalar(normal.dot(t)));
    if (normal.lengthSq() < 1e-8) normal.set(t.y, -t.x, 0);
    normal.normalize();
    binormal.crossVectors(t, normal);
    v(points, i, centre);
    for (let j = 0; j < R; j++) {
      const a = (j / R) * Math.PI * 2;
      const k = (i * R + j) * 3;
      pos[k] = centre.x + P.tube.radius * (Math.cos(a) * normal.x + Math.sin(a) * binormal.x);
      pos[k + 1] = centre.y + P.tube.radius * (Math.cos(a) * normal.y + Math.sin(a) * binormal.y);
      pos[k + 2] = centre.z + P.tube.radius * (Math.cos(a) * normal.z + Math.sin(a) * binormal.z);
      col[k] = color.r;
      col[k + 1] = color.g;
      col[k + 2] = color.b;
      u[i * R + j] = i / (n - 1);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < R; j++) {
      const a = i * R + j;
      const b = i * R + ((j + 1) % R);
      const c = (i + 1) * R + j;
      const d = (i + 1) * R + ((j + 1) % R);
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aU', new THREE.BufferAttribute(u, 1));
  g.setIndex(index);
  return g;
}

/**
 * Arrowheads along the path, pointing the way the foot moves, at every
 * `arrows.every` of the airtime where the foot is actually moving (a foot
 * standing still gets no arrow). Each carries the `aU` of where it sits.
 */
function arrowheads(points: Float32Array, T: readonly THREE.Vector3[], color: THREE.Color): THREE.BufferGeometry[] {
  const n = points.length / 3;
  const out: THREE.BufferGeometry[] = [];
  const A = P.arrows;
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const here = new THREE.Vector3();
  const next = new THREE.Vector3();
  for (let u = A.first; u < 1; u += A.every) {
    const i = Math.round(u * (n - 1));
    v(points, i, here);
    v(points, Math.min(n - 1, i + 1), next);
    const speed = next.distanceTo(here) * (n - 1); // metres per unit of progress
    if (speed < A.minSpeed) continue;
    const g = new THREE.ConeGeometry(A.radius, A.length, A.radialSegments);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    q.setFromUnitVectors(up, T[i]!);
    g.applyQuaternion(q);
    g.translate(here.x, here.y, here.z);
    const count = g.attributes.position!.count;
    const col = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) {
      col[k * 3] = color.r;
      col[k * 3 + 1] = color.g;
      col[k * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aU', new THREE.BufferAttribute(new Float32Array(count).fill(i / (n - 1)), 1));
    out.push(g);
  }
  return out;
}

/**
 * Both feet's paths and arrowheads as one geometry (one draw call). `flight`
 * is the flight being shown, or before the first pop the flight the current
 * inputs would make, so the planned path moves with the sliders. `stance`
 * mirrors the paths for a regular rider (ADR-25).
 */
export function buildFootPaths(inputs: TrickInputs, flight: Flight, stance: Stance = 'goofy'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const paths = sampleFootPaths(inputs, flight, stance);
  for (const foot of ['front', 'back'] as const) {
    const color = new THREE.Color(P.color[foot]);
    const points = paths[foot];
    const T = tangents(points);
    parts.push(tube(points, T, color), ...arrowheads(points, T, color));
  }
  // Cones come indexed from three; the tubes are indexed too, so the merge is uniform.
  const merged = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return merged;
}
