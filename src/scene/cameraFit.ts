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

/**
 * What must stay in frame: the eight corners of the pad slab and a box around
 * the board at the highest pop (board centre at rest height plus 0.6 m, the
 * shove can point the deck any way, so the box is the deck's spin circle).
 */
export function framingPoints(pad: { size: Vec3; center: Vec3 }, flight: { reach: number; top: number }): Vec3[] {
  const pts: Vec3[] = [];
  const [w, h, dp] = pad.size;
  const [cx, cy, cz] = pad.center;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) pts.push([cx + (sx * w) / 2, cy + (sy * h) / 2, cz + (sz * dp) / 2]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push([sx * flight.reach, flight.top, sz * flight.reach]);
  return pts;
}
