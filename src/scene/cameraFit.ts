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

/**
 * The farthest the camera may stand from `target`, looking along `from`'s
 * direction, before any of `points` is farther than `fogNear` from it (ADR-85):
 * for each point the distance d where |target + d u - p| = fogNear, solved
 * exactly, the least of them. Infinity if no point would ever reach it.
 */
export function fogDistance({ from, target, points, fogNear }: { from: Vec3; target: Vec3; points: readonly Vec3[]; fogNear: number }): number {
  const ux = from[0] - target[0];
  const uy = from[1] - target[1];
  const uz = from[2] - target[2];
  const len = Math.hypot(ux, uy, uz) || 1;
  let best = Infinity;
  for (const p of points) {
    const wx = target[0] - p[0];
    const wy = target[1] - p[1];
    const wz = target[2] - p[2];
    const b = (ux * wx + uy * wy + uz * wz) / len;
    const disc = b * b - (wx * wx + wy * wy + wz * wz) + fogNear * fogNear;
    if (disc < 0) return 0;
    best = Math.min(best, -b + Math.sqrt(disc));
  }
  return best;
}

/** The rider's outline for the framing (ADR-85): the head's column and the arms' band, metres in the world. */
export interface RiderFrame {
  /** The head's column: half width about x 0 and its top (the beanie at the top of the highest pop, plus headroom). */
  head: { reach: number; top: number; front: number; back: number };
  /** The arms' band: as far as a hand reaches along the board, up to `top`, from `front` (toward the toe side, -Z) to `back`. */
  arms: { reach: number; top: number; front: number; back: number };
}

/**
 * What a view that films the whole rider keeps in frame (ADR-85): the
 * board's flight box (framingPoints) and the rider's outline round it, the
 * head's column above and the arms' band either side, as boxes' corners.
 */
export function riderFramingPoints(flight: { reach: number; bottom: number; top: number }, rider: RiderFrame): Vec3[] {
  const pts = framingPoints(flight);
  for (const b of [rider.head, rider.arms])
    for (const x of [-b.reach, b.reach]) for (const z of [b.front, b.back]) for (const y of [flight.top, b.top]) pts.push([x, y, z]);
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

/** The clear part of the stage (store/stage.ts, ADR-86): fractions of the stage from its top left. */
export interface Clear {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The lens that frames inside a clear area (ADR-86). The camera keeps its
 * field of view, so a pixel covers the same angle as before; its principal
 * point moves to the clear area's centre with a view offset (three's
 * setViewOffset in units of the stage, 1 by 1, which a resize never
 * invalidates because R3F only resets the aspect): `x` and `y` are where the
 * stage's top left sits in that unit square. The fit then fills the clear
 * area alone: a vertical field of view as tall as the clear area
 * (`fitFov`) and its own shape (`fitAspect`, for a stage of `aspect`).
 */
export function clearLens(fov: number, aspect: number, clear: Clear) {
  const tan = Math.tan(((fov / 2) * Math.PI) / 180);
  const h = clear.bottom - clear.top;
  const w = clear.right - clear.left;
  return {
    x: 0.5 - (clear.left + clear.right) / 2,
    y: 0.5 - (clear.top + clear.bottom) / 2,
    fitFov: (2 * Math.atan(tan * h) * 180) / Math.PI,
    fitAspect: (aspect * w) / h,
  };
}

/** 0 at a, rising smoothly to 1 at b (smoothstep). */
const ease = (a: number, b: number, u: number) => {
  const t = Math.min(1, Math.max(0, (u - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * How far the views that film the rider rise during a flight (ADR-86): the
 * board's own height (its parabola, 4u(1 - u) times the peak), eased in over
 * the first `easeBy` of the flight and out over the last, so the camera
 * starts and stops with no jolt (zero slope at both ends) and is back where
 * it was at the landing. It follows the board closely in between, so the
 * board stays about where it was in the frame and the body's extension above
 * it is all the headroom the frame needs; it never rises faster than the
 * board, so the board is never lower in the frame than it was at rest. A
 * function of the flight and its progress alone: a paused flight, a scrubbed
 * one and a replayed one sit at the same height. Zero with no flight. A bail
 * eases out over a shorter `bailEase`, since its rider stands up out of the
 * trick while the board is still in the air.
 */
export function cameraRise(flight: { peak: number; landed: boolean } | null, u: number, easeBy = 0.2, bailEase = 0.15): number {
  if (!flight || !(u > 0) || u >= 1) return 0;
  // A bail stands the rider up out of the trick before the board lands (body.ts MOTION.bail): the camera stays up longer.
  return flight.peak * 4 * u * (1 - u) * ease(0, easeBy, u) * ease(0, flight.landed ? easeBy : bailEase, 1 - u);
}

/**
 * The height to look at for a direction and a set of points (ADR-86): the
 * one that lets the camera stand nearest while every point fits the frame's
 * height, so the frame's top and bottom bind together and none of its height
 * is left empty at one end (a camera above the subject sees its near bottom
 * lower and its far top higher than the middle height would). A golden-section
 * search between `low` and `high`; pure, done once per view.
 */
export function balancedLook({ from, target, fov, points, margin, low, high }: { from: Vec3; target: Vec3; fov: number; points: readonly Vec3[]; margin: number; low: number; high: number }): number {
  const dir: Vec3 = [from[0] - target[0], from[1] - target[1], from[2] - target[2]];
  const at = (y: number) => fitDistance({ from: [target[0] + dir[0], y + dir[1], target[2] + dir[2]], target: [target[0], y, target[2]], fov, aspect: 1e6, points, margin });
  const k = (Math.sqrt(5) - 1) / 2;
  let a = low;
  let b = high;
  for (let i = 0; i < 60; i++) {
    const c = b - k * (b - a);
    const d = a + k * (b - a);
    if (at(c) < at(d)) b = d;
    else a = c;
  }
  return (a + b) / 2;
}
