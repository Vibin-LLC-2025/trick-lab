// The board as a solid, for the feet clearance (ADR-29, 2026-11-04). Pure:
// no React, no three, no store, no src/asset. Units metres and degrees.
//
// The feet model (feet.ts) says where the rider means to put each shoe; this
// module lifts a shoe straight up (world +Y) by the least amount that puts its
// whole sole above the board, for the board's actual pose at that progress,
// plus a 2 mm margin. It only ever adds height, so the model's motion (slide,
// flick, scoop, gather, hover, bail) stays the intent.
//
// Frame: the board's own frame (the board group in src/scene): origin at the
// deck centre, nose +X, grip +Y, z across. The feet frame (feet.ts) is the
// board's rest frame, so during a flight the board centre is at (0, y, 0) in
// it and the board is turned by the pose's Euler 'YZX' (setBoardRotation in
// src/scene/boardPose.ts, ADR-32), goofy signs. Everything here works in the goofy
// frame; regular is the mirror image (ADR-25), so the same lift clears it.
//
// The solid is the union of:
// - the realistic deck plate (the GLB on High and Medium): the plan outline,
//   kicks and concave of src/asset/deck.ts, thickness measured along +Y;
// - the primitive deck (Low and the fallback): three boxes, a flat middle and
//   two straight kicks, as src/scene/resources.ts builds it;
// - per truck three boxes that hold all the hardware of both boards: hanger
//   (baseplate, pivot cup, yoke, kingpin, bushings, axle housing), wheels, and
//   the axle ends with their nuts. The bolt heads (1.3 mm proud of the grip
//   at the centreline, lower than the rails) are left out.
// src/sim may not import src/asset or src/scene, so BOARD is a pinned copy;
// boardVolume.test.ts checks it against the built deck and hardware and
// against ART.board by behaviour, not just by value.
//
// The lift is the larger of two measures, so a thin rail cannot slip between
// sole samples:
// (a) sole samples (the corners, edges and centreline of the sole rectangle)
//     cast straight up through the board: the highest point of the board on
//     each sample's vertical;
// (b) board edge points (the four rails of the deck plate, the edges of every
//     box) dropped straight down onto the sole's plane: if the point lands on
//     the sole, the sole must rise above it. A point landing just outside the
//     sole counts with a slope penalty (CLEARANCE.shoulder), which turns a
//     rail sweeping in from the side into a ramp instead of a step.
// - and the pad: no corner of a sole goes below it.
// The sole is the rectangle FOOT.length by FOOT.width: the primitive shoe's
// box, which also holds the GLB shoe's rounded outline.

import type { Pose } from './flight';

/** Pinned board numbers (src/asset/spec.ts and ART.board in src/scene/artDirection.ts). */
export const BOARD = {
  /** OUTLINE: half width at x, inset 0. */
  outline: {
    tailTip: -0.397,
    noseTip: 0.4095,
    middle: { halfWidth: 0.1016, drop: 0.0031, dropAt: 0.26 },
    tail: { join: -0.25, length: 0.147, size: 0.0987, exponent: 2.4 },
    nose: { join: 0.26, length: 0.1495, size: 0.0985, exponent: 2.2 },
  },
  /** KICK: a cubic in s = (|x| - start) / length. */
  kick: {
    start: 0.235,
    nose: { length: 0.1745, a: 0.0595, b: 0.0185 },
    tail: { length: 0.162, a: 0.0552, b: 0.0182 },
  },
  /** CONCAVE: rails 12 mm above the centreline in the flat, 40 percent of that at the tips. */
  concave: { depth: 0.012, tipKeep: 0.4 },
  /** DECK.thickness. */
  thickness: 0.0115,
  /** REST_Y: the deck centre above the pad at rest, so the pad is at -restY in the board's rest frame. */
  restY: 0.08425,
  /**
   * Hardware boxes for the nose truck (the tail truck mirrors x): x range, y
   * range, z half width. Each holds the GLB parts (TRUCK, WHEEL) and the
   * primitive's (ART.board.trucks, wheels).
   * - hanger: baseplate x 0.1655 to 0.2655 down to the axle housing bottom,
   *   0.06875; z the housing's 0.061 and the primitive hanger's 0.062.
   * - wheels: the primitive's 0.027 radius about x 0.208, from the pad (rest
   *   height 0.08425 below the deck centre) to the top of the primitive wheel;
   *   z to the wheel's outer face, 0.078 + 0.016.
   * - axle: the axle ends, the outer speed washer and the axle nut (radius
   *   0.0065 about the axle) out to the axle's end, 0.203 / 2.
   */
  hardware: {
    hanger: { x: [0.1655, 0.2655], y: [-0.0688, -0.00575], z: 0.062 },
    wheels: { x: [0.181, 0.235], y: [-0.08425, -0.03025], z: 0.094 },
    axle: { x: [0.2015, 0.2145], y: [-0.0645, -0.051], z: 0.1015 },
  },
  /**
   * The primitive deck (ART.board.deck, lifted by primitiveLift): a flat
   * middle box and two kick boxes tilted by `angle` about Z from the ends of
   * the flat. Half thickness is the wood core plus one skin (the grip and the
   * graphic skins sit on its faces); half width is the core's.
   */
  primitive: { lift: 0.00075, flatLength: 0.55, halfThickness: 0.006 + 0.002, halfWidth: 0.1025, kick: { length: 0.13, angle: 0.33 } },
} as const;

/** The sole as a rectangle, half length (toe +X) and half width (shoe Z): FOOT in feet.ts. */
export const SOLE_HALF = { length: 0.285 / 2, width: 0.105 / 2 } as const;

export const CLEARANCE = {
  /** Gap kept between the sole and the board, metres. */
  margin: 0.002,
  /**
   * Shoulder: a board point just outside the sole still lifts the shoe, by
   * its height minus a penalty per metre outside, so a rail coming in from
   * the side ramps the shoe up instead of lifting it in one step (25 cm in
   * one step for a hard scoop, measured without it). The penalty is `near`
   * per metre for the first `reach` outside the sole and `far` per metre
   * beyond. `far` runs from `near` (one gentle slope: 1.5 per metre, a ramp
   * under 1 cm per 0.001 of progress for every input measured) to `steep`
   * as footLift's `narrow` goes from 0 to 1: feet.ts narrows it over a bail,
   * where the feet step down beside the board and a gentle slope would hold
   * them up to 8 cm off the pad (a point 1.5 cm out must then be 10 cm above
   * the sole to count).
   */
  shoulder: { near: 1.5, reach: 0.005, steep: 10 },
  /** Longest march step through the deck plate's box along a vertical, metres (the plate is 11.5 mm thick). */
  step: 0.006,
  /** Bisections after the march finds the plate: the top is known to step / 32. */
  bisect: 5,
} as const;

const O = BOARD.outline;
const HT = BOARD.thickness / 2;

/** Half width of the plan outline at x (src/asset/deck.ts halfWidth, inset 0); 0 off the deck. */
export function halfWidth(x: number): number {
  if (x < O.tailTip || x > O.noseTip) return 0;
  let w: number;
  if (x < O.tail.join) {
    const s = Math.min(1, (O.tail.join - x) / O.tail.length);
    w = O.tail.size * Math.pow(1 - Math.pow(s, O.tail.exponent), 1 / O.tail.exponent);
  } else if (x > O.nose.join) {
    const s = Math.min(1, (x - O.nose.join) / O.nose.length);
    w = O.nose.size * Math.pow(1 - Math.pow(s, O.nose.exponent), 1 / O.nose.exponent);
  } else {
    w = middleHalfWidth(x);
  }
  return w > 0 ? w : 0;
}

function middleHalfWidth(x: number): number {
  const m = O.middle;
  const r = x / m.dropAt;
  return m.halfWidth - m.drop * r * r;
}

function kickS(x: number): number {
  const k = x >= 0 ? BOARD.kick.nose : BOARD.kick.tail;
  const s = (Math.abs(x) - BOARD.kick.start) / k.length;
  return s < 0 ? 0 : s > 1 ? 1 : s;
}

/** Kick height of the deck's mid surface at x. */
export function kickHeight(x: number): number {
  const k = x >= 0 ? BOARD.kick.nose : BOARD.kick.tail;
  const s = kickS(x);
  return k.a * s * s - k.b * s * s * s;
}

/** Mid surface of the realistic deck at (x, z): kick plus concave (src/asset/deck.ts midSurface). */
export function midSurface(x: number, z: number): number {
  const s = kickS(x);
  const smooth = s * s * (3 - 2 * s);
  const strength = 1 - (1 - BOARD.concave.tipKeep) * smooth;
  const r = z / middleHalfWidth(x);
  return kickHeight(x) + BOARD.concave.depth * strength * r * r;
}

/** Grip top of the realistic deck at (x, z), clamped onto the outline (as cueHeight does). */
export function glbDeckTop(x: number, z: number): number {
  const xc = x < O.tailTip ? O.tailTip : x > O.noseTip ? O.noseTip : x;
  const w = halfWidth(xc);
  const zc = z < -w ? -w : z > w ? w : z;
  return midSurface(xc, zc) + HT;
}

const P = BOARD.primitive;
const PK = P.kick;
const P_HALF = P.flatLength / 2;
const P_COS = Math.cos(PK.angle);
const P_TAN = Math.tan(PK.angle);

/** Grip top of the primitive deck at x: flat middle, straight kicks to their ends. */
export function primitiveDeckTop(x: number): number {
  const ax = Math.min(Math.abs(x), P_HALF + PK.length * P_COS);
  const y = ax <= P_HALF ? P.halfThickness : (ax - P_HALF) * P_TAN + P.halfThickness / P_COS;
  return y + P.lift;
}

/** Deck top under (x, z) of whichever board is higher there (the cue drape rule, ADR-26). */
export const deckTop = (x: number, z: number) => Math.max(glbDeckTop(x, z), primitiveDeckTop(x));

// ---------------------------------------------------------------------------
// Solids. Boxes are [x0, x1, y0, y1, z0, z1] in a flat array; the primitive
// deck's three boxes are oriented in the x-y plane: centre, cos and sin of the
// tilt, half length, half thickness.

const H = BOARD.hardware;
const AABB_COUNT = 6;
const aabb = new Float64Array(AABB_COUNT * 6);
{
  let i = 0;
  for (const side of [1, -1]) {
    for (const b of [H.hanger, H.wheels, H.axle]) {
      const x0 = side > 0 ? b.x[0] : -b.x[1];
      const x1 = side > 0 ? b.x[1] : -b.x[0];
      aabb.set([x0, x1, b.y[0], b.y[1], -b.z, b.z], i * 6);
      i++;
    }
  }
}

const OBB_COUNT = 3;
/** cx, cy, cos, sin, half length, half thickness per primitive deck box. */
const obb = new Float64Array(OBB_COUNT * 6);
{
  const kx = P_HALF + (Math.cos(PK.angle) * PK.length) / 2;
  const ky = (Math.sin(PK.angle) * PK.length) / 2 + P.lift;
  obb.set([0, P.lift, 1, 0, P_HALF, P.halfThickness], 0);
  obb.set([kx, ky, Math.cos(PK.angle), Math.sin(PK.angle), PK.length / 2, P.halfThickness], 6);
  obb.set([-kx, ky, Math.cos(-PK.angle), Math.sin(-PK.angle), PK.length / 2, P.halfThickness], 12);
}

/**
 * Inside the realistic deck plate: within the outline and within half a
 * thickness of the mid surface (along Y). `slack` grows the plate by that
 * much (the tests use it to admit points on its surface).
 */
export function insidePlate(x: number, y: number, z: number, slack = 0): boolean {
  if (x < O.tailTip - slack || x > O.noseTip + slack) return false;
  const xc = x < O.tailTip ? O.tailTip : x > O.noseTip ? O.noseTip : x;
  const w = halfWidth(xc) + slack;
  if (z > w || z < -w) return false;
  const m = midSurface(xc, z);
  return y >= m - HT - slack && y <= m + HT + slack;
}

/** Inside the board volume (any solid), board frame; `slack` grows every solid by that much. */
export function insideBoard(x: number, y: number, z: number, slack = 0): boolean {
  const e = slack;
  for (let i = 0; i < AABB_COUNT; i++) {
    const o = i * 6;
    if (x >= aabb[o]! - e && x <= aabb[o + 1]! + e && y >= aabb[o + 2]! - e && y <= aabb[o + 3]! + e && z >= aabb[o + 4]! - e && z <= aabb[o + 5]! + e) {
      return true;
    }
  }
  if (z >= -P.halfWidth - e && z <= P.halfWidth + e) {
    for (let i = 0; i < OBB_COUNT; i++) {
      const o = i * 6;
      const dx = x - obb[o]!;
      const dy = y - obb[o + 1]!;
      const c = obb[o + 2]!;
      const s = obb[o + 3]!;
      if (Math.abs(dx * c + dy * s) <= obb[o + 4]! + e && Math.abs(-dx * s + dy * c) <= obb[o + 5]! + e) return true;
    }
  }
  return insidePlate(x, y, z, e);
}

// Plate bounding box, from the outline at module load.
let plateTop = -Infinity;
for (let i = 0; i <= 2000; i++) {
  const x = O.tailTip + ((O.noseTip - O.tailTip) * i) / 2000;
  const w = halfWidth(x);
  for (let j = 0; j <= 20; j++) plateTop = Math.max(plateTop, midSurface(x, (w * j) / 20) + HT);
}
const PLATE_BOX = { x0: O.tailTip, x1: O.noseTip, y0: -HT, y1: plateTop + 1e-4, z: O.middle.halfWidth } as const;

/** Slab interval of a line within [lo, hi] along one axis, folded into the running [t0, t1] (scratch). */
const span = { t0: 0, t1: 0 };
function slab(p: number, d: number, lo: number, hi: number): boolean {
  if (Math.abs(d) < 1e-12) return p >= lo && p <= hi;
  let a = (lo - p) / d;
  let b = (hi - p) / d;
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  if (a > span.t0) span.t0 = a;
  if (b < span.t1) span.t1 = b;
  return span.t0 <= span.t1;
}

/**
 * Highest t at which the line q + t d (board frame) is inside the board, or
 * -Infinity. Only answers above `floor` matter (the caller's best so far).
 */
function topAlong(qx: number, qy: number, qz: number, dx: number, dy: number, dz: number, floor: number): number {
  let best = floor;
  for (let i = 0; i < AABB_COUNT; i++) {
    const o = i * 6;
    span.t0 = -Infinity;
    span.t1 = Infinity;
    if (slab(qx, dx, aabb[o]!, aabb[o + 1]!) && slab(qy, dy, aabb[o + 2]!, aabb[o + 3]!) && slab(qz, dz, aabb[o + 4]!, aabb[o + 5]!)) {
      if (span.t1 > best) best = span.t1;
    }
  }
  for (let i = 0; i < OBB_COUNT; i++) {
    const o = i * 6;
    const c = obb[o + 2]!;
    const s = obb[o + 3]!;
    const px = qx - obb[o]!;
    const py = qy - obb[o + 1]!;
    span.t0 = -Infinity;
    span.t1 = Infinity;
    const hl = obb[o + 4]!;
    const ht = obb[o + 5]!;
    if (
      slab(px * c + py * s, dx * c + dy * s, -hl, hl) &&
      slab(-px * s + py * c, -dx * s + dy * c, -ht, ht) &&
      slab(qz, dz, -P.halfWidth, P.halfWidth)
    ) {
      if (span.t1 > best) best = span.t1;
    }
  }
  // The curved plate: march down from where the line leaves its box, then bisect.
  span.t0 = -Infinity;
  span.t1 = Infinity;
  const B = PLATE_BOX;
  if (slab(qx, dx, B.x0, B.x1) && slab(qy, dy, B.y0, B.y1) && slab(qz, dz, -B.z, B.z) && span.t1 > best) {
    const top = span.t1;
    const lo = span.t0 > best ? span.t0 : best;
    const n = Math.ceil((top - lo) / CLEARANCE.step);
    const h = n > 0 ? (top - lo) / n : 0;
    for (let k = 0; k <= n; k++) {
      const t = top - k * h;
      if (!insidePlate(qx + t * dx, qy + t * dy, qz + t * dz)) continue;
      if (k === 0) return Math.max(best, t);
      let tin = t;
      let tout = t + h;
      for (let j = 0; j < CLEARANCE.bisect; j++) {
        const m = (tin + tout) / 2;
        if (insidePlate(qx + m * dx, qy + m * dy, qz + m * dz)) tin = m;
        else tout = m;
      }
      return Math.max(best, tout);
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Sample sets, built once.

/** Sole samples in the shoe frame (u along the toe, w across): corners, long and short edges, centreline. */
const SOLE_SAMPLES: Float64Array = (() => {
  const A = SOLE_HALF.length;
  const W = SOLE_HALF.width;
  const pts: number[] = [];
  for (const u of [-A, -A / 1.5, -A / 3, 0, A / 3, A / 1.5, A]) pts.push(u, W, u, -W);
  pts.push(-A, 0, A, 0, -A / 2, 0, 0, 0, A / 2, 0);
  return new Float64Array(pts);
})();

/**
 * Board edges in the board frame, as vertices and segments: the deck plate's
 * four rails (top and bottom on each side, an outline polyline sine-spaced
 * over the rounded ends and about 1 cm apart through the middle, closed round
 * both tips) and the 12 edges of every box. A segment is tested exactly
 * against the sole (see segmentLift), so no rail can slip between samples.
 */
const { EDGE_VERTS, EDGE_SEGS } = (() => {
  const v: number[] = [];
  const segs: number[] = [];
  const vertex = (x: number, y: number, z: number) => {
    v.push(x, y, z);
    return v.length / 3 - 1;
  };
  const xs: number[] = [];
  const n = 16;
  for (let i = n; i > 0; i--) xs.push(O.tail.join - O.tail.length * Math.sin((i * Math.PI) / (2 * n)));
  const mid = Math.ceil((O.nose.join - O.tail.join) / 0.01);
  for (let j = 0; j < mid; j++) xs.push(O.tail.join + ((O.nose.join - O.tail.join) * j) / mid);
  for (let i = 0; i <= n; i++) xs.push(O.nose.join + O.nose.length * Math.sin((i * Math.PI) / (2 * n)));
  for (const sy of [1, -1]) {
    // One closed loop per face: the +z rail tail to nose, then the -z rail back.
    const loop: number[] = [];
    for (const x of xs) loop.push(vertex(x, midSurface(x, halfWidth(x)) + sy * HT, halfWidth(x)));
    for (let i = xs.length - 2; i > 0; i--) {
      const x = xs[i]!;
      loop.push(vertex(x, midSurface(x, -halfWidth(x)) + sy * HT, -halfWidth(x)));
    }
    for (let i = 0; i < loop.length; i++) segs.push(loop[i]!, loop[(i + 1) % loop.length]!);
  }
  const box = (corner: (i: number) => [number, number, number]) => {
    // Corners by bit index (x, y, z); edges join corners one bit apart.
    const ids: number[] = [];
    for (let i = 0; i < 8; i++) ids.push(vertex(...corner(i)));
    for (let i = 0; i < 8; i++) {
      for (const bit of [1, 2, 4]) if (!(i & bit)) segs.push(ids[i]!, ids[i | bit]!);
    }
  };
  for (let k = 0; k < AABB_COUNT; k++) {
    const o = k * 6;
    box((i) => [aabb[o + (i & 1)]!, aabb[o + 2 + ((i >> 1) & 1)]!, aabb[o + 4 + ((i >> 2) & 1)]!]);
  }
  for (let k = 0; k < OBB_COUNT; k++) {
    const o = k * 6;
    const cx = obb[o]!;
    const cy = obb[o + 1]!;
    const c = obb[o + 2]!;
    const sn = obb[o + 3]!;
    const hl = obb[o + 4]!;
    const ht = obb[o + 5]!;
    box((i) => {
      const u = i & 1 ? hl : -hl;
      const w = i & 2 ? ht : -ht;
      return [cx + u * c - w * sn, cy + u * sn + w * c, i & 4 ? P.halfWidth : -P.halfWidth];
    });
  }
  return { EDGE_VERTS: new Float64Array(v), EDGE_SEGS: new Uint16Array(segs) };
})();

/** Per call, each edge vertex as (height above the sole's plane along +Y, u, w on the sole's plane). Scratch. */
const edgeOnSole = new Float64Array(EDGE_VERTS.length);

/** Counts, for the tests and the cost note in ADR-29. */
export const SAMPLE_COUNTS = { sole: SOLE_SAMPLES.length / 2, edgeVertices: EDGE_VERTS.length / 3, edgeSegments: EDGE_SEGS.length / 2 } as const;

// ---------------------------------------------------------------------------
// Rotations, row-major 3 x 3 in Float64Array(9) scratch.

const D2R = Math.PI / 180;
const Rb = new Float64Array(9);
const Rs = new Float64Array(9);
const Ma = new Float64Array(9);
const Mb = new Float64Array(9);
const M = new Float64Array(9);

/** out = rotation about one axis (0 x, 1 y, 2 z) by a radians. */
function axisRotation(out: Float64Array, axis: 0 | 1 | 2, a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  out.fill(0);
  if (axis === 0) {
    out[0] = 1;
    out[4] = c;
    out[5] = -s;
    out[7] = s;
    out[8] = c;
  } else if (axis === 1) {
    out[0] = c;
    out[2] = s;
    out[4] = 1;
    out[6] = -s;
    out[8] = c;
  } else {
    out[0] = c;
    out[1] = -s;
    out[3] = s;
    out[4] = c;
    out[8] = 1;
  }
}

/** out = a b (out must not alias a or b). */
function mul(out: Float64Array, a: Float64Array, b: Float64Array) {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
  }
}

/** Three elementary rotations, out = R(a0) R(a1) R(a2): the matrix of three's intrinsic Euler in that order. */
function euler(out: Float64Array, ax0: 0 | 1 | 2, a0: number, ax1: 0 | 1 | 2, a1: number, ax2: 0 | 1 | 2, a2: number) {
  axisRotation(Ma, ax0, a0);
  axisRotation(Mb, ax1, a1);
  mul(M, Ma, Mb);
  axisRotation(Ma, ax2, a2);
  mul(out, M, Ma);
}

/**
 * The board's rotation for a sim pose, goofy (ADR-10): 'YZX' (ADR-32), yaw,
 * then the nose-up pitch about the yawed transverse axis, then the roll about
 * the pitched long axis, as setBoardRotation writes it with the goofy signs
 * (roll and yaw +1, base yaw 0).
 */
export function boardMatrix(out: Float64Array, pose: Pose): Float64Array {
  euler(out, 1, pose.yaw * D2R, 2, pose.pitch * D2R, 0, pose.roll * D2R);
  return out;
}

/** A foot's shape for the solver: FootPose in feet.ts. */
export interface FootLike {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
}

/**
 * A shoe's rotation: 'YZX', yaw, pitch about the shoe's Z, roll about its own
 * long axis times the shoe's outside-edge sign (applyFoot in FlightDriver).
 */
export function shoeMatrix(out: Float64Array, f: FootLike, edge: 1 | -1): Float64Array {
  euler(out, 1, f.yaw * D2R, 2, f.pitch * D2R, 0, f.roll * edge * D2R);
  return out;
}

/** How far a sole point (projected along the vertical onto the sole's plane) is outside the sole rectangle. */
function outside(u: number, w: number): number {
  const du = Math.abs(u) - SOLE_HALF.length;
  const dw = Math.abs(w) - SOLE_HALF.width;
  const d = du > dw ? du : dw;
  return d > 0 ? d : 0;
}

const SH = CLEARANCE.shoulder;
/** The shoulder's slope past `reach` for this call (scratch, set by footLift). */
let far: number = SH.near;
/** The shoulder penalty for being d outside the sole: convex, piecewise linear. */
const penalty = (d: number) => (d <= SH.reach ? SH.near * d : SH.near * SH.reach + far * (d - SH.reach));

/** Lift asked by one point on the sole's plane: its height minus the shoulder penalty for being outside the sole. */
const pointLift = (t: number, u: number, w: number) => t - penalty(outside(u, w));

/**
 * Piece boundaries of pointLift on the sole's plane, as lines a u + b w = c:
 * u = +-A and w = +-W where `outside` leaves 0, the same at `reach` out where
 * the penalty steepens, and the diagonals |u| - A = |w| - W where `outside`
 * changes side (u + w and u - w = +-(A - W)). 12 lines, (a, b, c) each.
 */
const BREAKS: Float64Array = (() => {
  const A = SOLE_HALF.length;
  const W = SOLE_HALF.width;
  const r = SH.reach;
  return new Float64Array([
    1, 0, A, 1, 0, -A, 0, 1, W, 0, 1, -W,
    1, 0, A + r, 1, 0, -A - r, 0, 1, W + r, 0, 1, -W - r,
    1, 1, A - W, 1, 1, W - A, 1, -1, A - W, 1, -1, W - A,
  ]);
})();

/**
 * The most a straight board edge asks of the shoe, or `best` if more. Along
 * the segment the height is linear and the penalty is a convex, piecewise
 * linear function of a convex, piecewise linear `outside`, so pointLift is
 * concave and piecewise linear: its maximum is at an end or on a piece
 * boundary (BREAKS). Exact, no sampling.
 */
function segmentLift(t0: number, u0: number, w0: number, t1: number, u1: number, w1: number, best: number): number {
  let m = best;
  let c = pointLift(t0, u0, w0);
  if (c > m) m = c;
  c = pointLift(t1, u1, w1);
  if (c > m) m = c;
  const du = u1 - u0;
  const dw = w1 - w0;
  for (let j = 0; j < BREAKS.length; j += 3) {
    const a = BREAKS[j]!;
    const b = BREAKS[j + 1]!;
    const d = a * du + b * dw;
    if (Math.abs(d) < 1e-12) continue;
    const s = (BREAKS[j + 2]! - a * u0 - b * w0) / d;
    if (s > 0 && s < 1) {
      c = pointLift(t0 + s * (t1 - t0), u0 + s * du, w0 + s * dw);
      if (c > m) m = c;
    }
  }
  return m;
}

/**
 * Lift for one shoe, metres, at least 0: how far the shoe must rise along
 * world +Y so the whole sole is at least CLEARANCE.margin above the board.
 * `f` is the shoe in the goofy feet frame, `edge` its outside-edge sign
 * (front +1, back -1, as FlightDriver passes for goofy), `board` the board's
 * pose at the same progress, `narrow` (0 to 1) how far the shoulder has
 * narrowed (CLEARANCE.shoulder). Allocation-free.
 */
export function footLift(f: FootLike, edge: 1 | -1, board: Pose, narrow = 0): number {
  far = SH.near + (SH.steep - SH.near) * (narrow < 0 ? 0 : narrow > 1 ? 1 : narrow);
  boardMatrix(Rb, board);
  shoeMatrix(Rs, f, edge);
  // M = Rs^T Rb takes a board point into the shoe frame; o = Rs^T (B - F).
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) M[r * 3 + c] = Rs[r]! * Rb[c]! + Rs[3 + r]! * Rb[3 + c]! + Rs[6 + r]! * Rb[6 + c]!;
  }
  const bx = -f.x;
  const by = board.y - f.y;
  const bz = -f.z;
  const ox = Rs[0]! * bx + Rs[3]! * by + Rs[6]! * bz;
  const oy = Rs[1]! * bx + Rs[4]! * by + Rs[7]! * bz;
  const oz = Rs[2]! * bx + Rs[5]! * by + Rs[8]! * bz;
  // World up in the shoe frame (Rs^T y) and in the board frame (Rb^T y).
  const sux = Rs[3]!;
  const suy = Rs[4]!;
  const suz = Rs[5]!;
  let best = -CLEARANCE.margin;

  // (b) Board edges dropped onto the sole's plane: every vertex once, then
  // each segment whose higher end could beat the best so far.
  if (suy > 1e-3) {
    for (let i = 0; i < EDGE_VERTS.length; i += 3) {
      const ex = EDGE_VERTS[i]!;
      const ey = EDGE_VERTS[i + 1]!;
      const ez = EDGE_VERTS[i + 2]!;
      const t = (M[3]! * ex + M[4]! * ey + M[5]! * ez + oy) / suy;
      edgeOnSole[i] = t;
      edgeOnSole[i + 1] = M[0]! * ex + M[1]! * ey + M[2]! * ez + ox - t * sux;
      edgeOnSole[i + 2] = M[6]! * ex + M[7]! * ey + M[8]! * ez + oz - t * suz;
    }
    for (let i = 0; i < EDGE_SEGS.length; i += 2) {
      const a = EDGE_SEGS[i]! * 3;
      const b = EDGE_SEGS[i + 1]! * 3;
      const ta = edgeOnSole[a]!;
      const tb = edgeOnSole[b]!;
      if (ta <= best && tb <= best) continue;
      best = segmentLift(ta, edgeOnSole[a + 1]!, edgeOnSole[a + 2]!, tb, edgeOnSole[b + 1]!, edgeOnSole[b + 2]!, best);
    }
  }

  // (a) Sole samples cast up through the board.
  const dx = Rb[3]!;
  const dy = Rb[4]!;
  const dz = Rb[5]!;
  for (let i = 0; i < SOLE_SAMPLES.length; i += 2) {
    const u = SOLE_SAMPLES[i]!;
    const w = SOLE_SAMPLES[i + 1]!;
    // Sole point in the feet frame, relative to the board centre.
    const px = f.x + Rs[0]! * u + Rs[2]! * w;
    const py = f.y + Rs[3]! * u + Rs[5]! * w - board.y;
    const pz = f.z + Rs[6]! * u + Rs[8]! * w;
    // Into the board frame: Rb^T p.
    const qx = Rb[0]! * px + Rb[3]! * py + Rb[6]! * pz;
    const qy = Rb[1]! * px + Rb[4]! * py + Rb[7]! * pz;
    const qz = Rb[2]! * px + Rb[5]! * py + Rb[8]! * pz;
    best = topAlong(qx, qy, qz, dx, dy, dz, best);
  }
  // The pad: no sole corner below it (no margin, so a bail stands on it). The
  // sole is flat, so its lowest point is a corner.
  const A = SOLE_HALF.length;
  const W = SOLE_HALF.width;
  const lowest = f.y - Math.abs(Rs[3]! * A) - Math.abs(Rs[5]! * W);
  const pad = -BOARD.restY - lowest - CLEARANCE.margin;
  if (pad > best) best = pad;
  return best + CLEARANCE.margin;
}

/**
 * The deck's tilt along X under a sole `width` wide centred at x, degrees,
 * positive nose up: the chord of the deck top across the sole (a flat sole
 * on the convex kick touches at its two edges). Used for the back shoe's
 * stance on the tail.
 */
export function deckTiltDeg(x: number, z: number, width: number): number {
  const a = deckTop(x - width / 2, z);
  const b = deckTop(x + width / 2, z);
  return (Math.atan2(b - a, width) * 180) / Math.PI;
}
