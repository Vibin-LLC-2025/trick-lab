// Medium and Low ground shadows (ADR-38, 2026-11-05): footprints projected
// along the key light's ray, the direction High's shadow map uses. Pure math
// (no three, no React) so it can be unit tested; FlightDriver turns each
// footprint into an instance matrix and an opacity inside its one useFrame.
// Allocation-free: everything writes into one preallocated object.

import type { FeetPose, FootPose } from '../sim/feet';
import type { Pose } from '../sim/flight';
import { FOOT } from '../sim/feet';
import { ART } from './artDirection';

const S = ART.shadow;
const F = S.foot;
const REST_Y = ART.board.restY;
const D2R = Math.PI / 180;

const L = ART.lights.directional;
/** Light-to-scene direction over its y: a point at height y lands y * (LX, LZ) back along it. */
const LX = (L.target[0] - L.position[0]) / (L.target[1] - L.position[1]);
const LZ = (L.target[2] - L.position[2]) / (L.target[1] - L.position[1]);

/** One soft ellipse on the pad: centre, yaw (radians, three's Y rotation), half extents, opacity. */
export interface Footprint {
  x: number;
  z: number;
  yaw: number;
  halfLength: number;
  halfWidth: number;
  opacity: number;
}

/** The four instances, in draw order: board soft, board contact, front foot, back foot. */
export interface GroundShadows {
  board: Footprint;
  contact: Footprint;
  front: Footprint;
  back: Footprint;
}

const footprint = (): Footprint => ({ x: 0, z: 0, yaw: 0, halfLength: 0, halfWidth: 0, opacity: 0 });
export const newGroundShadows = (): GroundShadows => ({ board: footprint(), contact: footprint(), front: footprint(), back: footprint() });

/** Where a point at height y above the pad lands on it along the key light, x then z (no allocation: two numbers). */
export const groundX = (x: number, y: number) => x - y * LX;
export const groundZ = (z: number, y: number) => z - y * LZ;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smoothstep = (x: number, a: number, b: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** How deep a ground point lies in an ellipse footprint: 0 at its centre, 1 on its rim. */
export function ellipseRadius(e: Footprint, x: number, z: number): number {
  const dx = x - e.x;
  const dz = z - e.z;
  // Into the ellipse's frame: three's Y rotation maps local +X to (cos, 0, -sin).
  const c = Math.cos(e.yaw);
  const s = Math.sin(e.yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.hypot(lx / e.halfLength, lz / e.halfWidth);
}

function writeFoot(out: Footprint, f: FootPose) {
  // The sole's centre is the shoe group's origin (Feet.tsx), its bottom at REST_Y + f.y.
  const h = Math.max(0, REST_Y + f.y);
  const k = clamp01(h / S.topHeight);
  out.x = groundX(f.x, h);
  out.z = groundZ(f.z, h);
  out.yaw = f.yaw * D2R;
  out.halfLength = (FOOT.length / 2) * F.scale + F.spread * k;
  out.halfWidth = (FOOT.width / 2) * F.scale + F.spread * k;
  out.opacity = lerp(F.opacity.ground, F.opacity.top, k) + F.contact * (1 - smoothstep(h, 0, S.contact.height));
}

/** The soft disc's alpha at a normalised radius (resources.ts: 1 inside `core`, falling linearly to 0 at the rim). */
export const discAlpha = (r: number) => (r <= S.core ? 1 : r >= 1 ? 0 : (1 - r) / (1 - S.core));

/** One footprint's alpha at a ground point. */
export const alphaAt = (f: Footprint, x: number, z: number) => f.opacity * discAlpha(ellipseRadius(f, x, z));

/** The board's soft and contact shadows together at a ground point, as the fragment shader computes them. */
export const boardAlphaAt = (gs: GroundShadows, x: number, z: number) => 1 - (1 - alphaAt(gs.board, x, z)) * (1 - alphaAt(gs.contact, x, z));

/**
 * What a foot footprint draws at a ground point (the fragment shader in
 * resources.ts, mirrored here for the tests): only what it adds over the
 * board, so that blended over the board it gives max(board, foot).
 */
export function footDrawnAlpha(gs: GroundShadows, foot: Footprint, x: number, z: number) {
  const b = boardAlphaAt(gs, x, z);
  return Math.max(0, alphaAt(foot, x, z) - b) / Math.max(1e-4, 1 - b);
}

/**
 * Writes the four footprints for a board pose (`yaw` the board group's
 * rotation.y, which carries the stance's base yaw) and, if the feet are
 * shown, their pose. Returns `out`.
 */
export function writeGroundShadows(out: GroundShadows, p: Pose, yaw: number, feet: FeetPose | null): GroundShadows {
  const k = clamp01(p.y / S.topHeight);
  const centreY = REST_Y + p.y;
  const b = out.board;
  b.x = groundX(0, centreY);
  b.z = groundZ(0, centreY);
  b.yaw = yaw;
  // Shorter as the nose comes up, narrower on edge, broader with height (the penumbra).
  b.halfLength = S.halfLength * Math.abs(Math.cos(p.pitch * D2R)) + S.spread * k;
  b.halfWidth = S.halfWidth * lerp(S.edgeWidth, 1, Math.abs(Math.cos(p.roll * D2R))) + S.spread * k;
  b.opacity = lerp(S.opacity.ground, S.opacity.top, k);

  const c = out.contact;
  c.x = b.x;
  c.z = b.z;
  c.yaw = yaw;
  c.halfLength = b.halfLength * S.contact.scale;
  c.halfWidth = b.halfWidth * S.contact.scale;
  c.opacity = S.contact.opacity * (1 - smoothstep(p.y, 0, S.contact.height));

  if (feet) {
    writeFoot(out.front, feet.front);
    writeFoot(out.back, feet.back);
  } else {
    out.front.opacity = 0;
    out.back.opacity = 0;
  }
  return out;
}
