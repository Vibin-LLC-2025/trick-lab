// Camera framing, pure math (no three, no React) so it can be unit tested.
// Given a view direction, a target, a vertical fov and the stage aspect, find
// the smallest distance from the target at which every point lies inside the
// view frustum with a margin. Closed form: for a point p, with forward f,
// right r and up u, its view-space depth is (p - target) . f + d, so p fits
// when d >= |(p - target) . r| / tanH - (p - target) . f (same for u, tanV).

import type { Vec3 } from './artDirection';

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export interface FitInput {
  /** Any point on the desired view ray (for example the home camera position). */
  from: Vec3;
  target: Vec3;
  /** Vertical field of view, degrees. */
  fov: number;
  /** Stage width / height. */
  aspect: number;
  points: readonly Vec3[];
  /** Fraction of the half-extent kept free at each edge (0.06 = 6 percent). */
  margin: number;
}

/** Smallest camera-to-target distance that keeps every point in frame. */
export function fitDistance({ from, target, fov, aspect, points, margin }: FitInput): number {
  const back = normalize(sub(from, target));
  const f: Vec3 = [-back[0], -back[1], -back[2]];
  const r = normalize(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const tanV = Math.tan(((fov / 2) * Math.PI) / 180) * (1 - margin);
  const tanH = tanV * Math.max(0.01, aspect);
  let d = 0;
  for (const p of points) {
    const v = sub(p, target);
    const depth = dot(v, f);
    d = Math.max(d, Math.abs(dot(v, r)) / tanH - depth, Math.abs(dot(v, u)) / tanV - depth);
  }
  return d;
}

export interface ZoomInput {
  /** The fitted distance for the stage (fitDistance, at least the orbit's minimum). */
  fit: number;
  /** The orbit target. */
  target: Vec3;
  /** The flight box's corners (framingPoints). */
  points: readonly Vec3[];
  /** The orbit's own zoom-out limit. */
  maxDistance: number;
  /** How far past the fit a narrow stage may zoom out, as a multiple of it. */
  zoomOut: number;
  /** Where the fog starts: no point of the flight may be farther from the camera. */
  fogNear: number;
}

/**
 * How far the orbit may zoom out: `maxDistance`, or `zoomOut` times the fit
 * on a narrow stage where the fit is already far (ADR-18), but never so far
 * that a point of the flight could be farther than `fogNear` from the camera
 * (the camera to the target plus the target to the point bounds it), so the
 * board, the feet and the trails are never fogged (ADR-55's update); and
 * never nearer than the fit itself.
 */
export function orbitMaxDistance({ fit, target, points, maxDistance, zoomOut, fogNear }: ZoomInput): number {
  let spread = 0;
  for (const p of points) spread = Math.max(spread, Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2]));
  return Math.max(fit, Math.min(Math.max(maxDistance, fit * zoomOut), fogNear - spread));
}

/**
 * What must stay in frame (ADR-18): a box around the board's flight, from
 * the pad surface under it (`bottom`, so the shadow stays in) to the highest
 * pop (`top`: board centre at rest height plus 0.6 m plus its half extent).
 * The shove can point the deck any way, so the box is the deck's spin circle
 * (`reach`). The pad is allowed to run off the edges; it used to be framed
 * whole (ADR-11), which left the board a few hundred pixels long.
 */
export function framingPoints(flight: { reach: number; bottom: number; top: number }): Vec3[] {
  const pts: Vec3[] = [];
  for (const y of [flight.bottom, flight.top])
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push([sx * flight.reach, y, sz * flight.reach]);
  return pts;
}

/** An axis-aligned box by its min and max corners. */
export interface Box3 {
  min: Vec3;
  max: Vec3;
}

/** The eight corners of a box. */
export function boxCorners({ min, max }: Box3): Vec3[] {
  const pts: Vec3[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) pts.push([x, y, z]);
  return pts;
}

/** Where a point lands on the pad (y 0) along a light-to-scene direction `d` (d.y < 0). */
export const projectToGround = (p: Vec3, d: Vec3): Vec3 => [p[0] - (p[1] * d[0]) / d[1], 0, p[2] - (p[1] * d[2]) / d[1]];

export interface ShadowFrustum {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
}

/**
 * The tightest orthographic shadow camera (ADR-38) for a directional light at
 * `light` aimed at `target`, in the frame three's DirectionalLightShadow uses
 * (the camera at the light, lookAt the target, up +Y): it holds every corner
 * of the caster boxes and the point where each corner's shadow reaches the
 * pad, so a caster anywhere in a box draws its whole shadow. `pad` is added on
 * every side (the PCF kernel, and depth for the bias).
 */
export function shadowFrustum(light: Vec3, target: Vec3, boxes: readonly Box3[], pad: number): ShadowFrustum {
  const f = normalize(sub(target, light));
  const r = normalize(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const corners = boxes.flatMap(boxCorners);
  const points = [...corners, ...corners.map((c) => projectToGround(c, f))];
  const out = { left: Infinity, right: -Infinity, top: -Infinity, bottom: Infinity, near: Infinity, far: -Infinity };
  for (const p of points) {
    const v = sub(p, light);
    const x = dot(v, r);
    const y = dot(v, u);
    const z = dot(v, f);
    out.left = Math.min(out.left, x);
    out.right = Math.max(out.right, x);
    out.bottom = Math.min(out.bottom, y);
    out.top = Math.max(out.top, y);
    out.near = Math.min(out.near, z);
    out.far = Math.max(out.far, z);
  }
  return {
    left: out.left - pad,
    right: out.right + pad,
    bottom: out.bottom - pad,
    top: out.top + pad,
    near: Math.max(0.01, out.near - pad),
    far: out.far + pad,
  };
}
