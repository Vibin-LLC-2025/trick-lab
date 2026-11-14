// The skate spot's geometry (step 14, ADR-69): two indexed meshes, the
// concrete and the steel, one material each, so the spot is two draw calls
// (ADR-102, 2026-11-13; one until then). Flat faces, each with its
// own normal; UVs projected on the face's own plane in metres over
// SPOT_TEXTURES.uvSpan (0 to 1, so they quantize), and a linear vertex colour
// that paints the piece over the near-white concrete map. No bottoms: they
// sit on the ground. Pure: three's BufferGeometry only.
import { BufferAttribute, BufferGeometry } from 'three';
import { SPOT, SPOT_TEXTURES } from './spotSpec';
import { hexToRgb } from './textures';

type V3 = readonly [number, number, number];

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** The map's mean, linear: a vertex colour of paint / mean puts the paint's own colour on screen. */
const MAP_MEAN = srgbToLinear(SPOT_TEXTURES.fill / 255);

/** A paint colour as the vertex colour that, times the concrete map, shows it. */
export function paint(hex: string): V3 {
  const [r, g, b] = hexToRgb(hex);
  return [srgbToLinear(r / 255) / MAP_MEAN, srgbToLinear(g / 255) / MAP_MEAN, srgbToLinear(b / 255) / MAP_MEAN];
}

/** UV of a point on a face with normal n: the face's own plane, in metres over uvSpan, shifted into 0 to 1. */
function faceUv(p: V3, n: V3): [number, number] {
  const S = SPOT_TEXTURES.uvSpan;
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]);
  const [u, v] = ax > 0.5 ? [p[2], p[1]] : ay > 0.5 ? [p[0], p[2]] : [p[0], p[1]];
  return [u / S + 0.5, v / S + 0.5];
}

class Builder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  /** A flat convex polygon, counter-clockwise seen from outside, with normal n. */
  face(points: readonly V3[], n: V3, color: V3) {
    const base = this.pos.length / 3;
    for (const p of points) {
      this.pos.push(...p);
      this.nor.push(...n);
      this.uv.push(...faceUv(p, n));
      this.col.push(...color);
    }
    for (let i = 1; i + 1 < points.length; i++) this.idx.push(base, base + i, base + i + 1);
  }

  /** A face cut along x at `cuts` (inside x0 to x1), each piece coloured by `colorAt` of its middle. */
  faceAlongX(x0: number, x1: number, cuts: readonly number[], make: (xa: number, xb: number) => V3[], n: V3, colorAt: (x: number) => V3) {
    const xs = [x0, ...[...cuts].sort((p, q) => p - q).filter((x) => x > x0 && x < x1), x1];
    for (let i = 0; i + 1 < xs.length; i++) this.face(make(xs[i]!, xs[i + 1]!), n, colorAt((xs[i]! + xs[i + 1]!) / 2));
  }

  /**
   * An axis-aligned box without its bottom, its four top edges bevelled by c
   * (ADR-102): the sides stop c under the top, four 45 degree strips meet at
   * the corners, and the top is inset by c. `top` splits the top along z into
   * bands from the back (z0) to the front (z1): [z where the band ends, colour].
   * `frontCuts` and `frontColor` paint the front face along x.
   */
  bevelBox(
    x0: number,
    x1: number,
    h: number,
    z0: number,
    z1: number,
    c: number,
    color: V3,
    opts: { top?: readonly (readonly [number, V3])[]; frontCuts?: readonly number[]; frontColor?: (x: number) => V3 } = {},
  ) {
    const s = Math.SQRT1_2;
    const k = h - c;
    const fc = opts.frontColor ?? (() => color);
    this.faceAlongX(x0, x1, opts.frontCuts ?? [], (a, b) => [[a, 0, z1], [b, 0, z1], [b, k, z1], [a, k, z1]], [0, 0, 1], fc);
    this.face([[x1, 0, z0], [x0, 0, z0], [x0, k, z0], [x1, k, z0]], [0, 0, -1], color);
    this.face([[x1, 0, z1], [x1, 0, z0], [x1, k, z0], [x1, k, z1]], [1, 0, 0], color);
    this.face([[x0, 0, z0], [x0, 0, z1], [x0, k, z1], [x0, k, z0]], [-1, 0, 0], color);
    this.face([[x0, k, z1], [x1, k, z1], [x1 - c, h, z1 - c], [x0 + c, h, z1 - c]], [0, s, s], color);
    this.face([[x1, k, z0], [x0, k, z0], [x0 + c, h, z0 + c], [x1 - c, h, z0 + c]], [0, s, -s], color);
    this.face([[x1, k, z1], [x1, k, z0], [x1 - c, h, z0 + c], [x1 - c, h, z1 - c]], [s, s, 0], color);
    this.face([[x0, k, z0], [x0, k, z1], [x0 + c, h, z1 - c], [x0 + c, h, z0 + c]], [-s, s, 0], color);
    const bands = opts.top ?? [[z1 - c, color] as const];
    let za = z0 + c;
    for (const [zEnd, col] of bands) {
      const zb = Math.min(zEnd, z1 - c);
      if (zb > za) this.face([[x0 + c, h, zb], [x1 - c, h, zb], [x1 - c, h, za], [x0 + c, h, za]], [0, 1, 0], col);
      za = Math.max(za, zb);
    }
  }

  /** An axis-aligned box without its bottom. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: V3) {
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], color);
    this.face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], color);
    this.face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], color);
    this.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], color);
    this.face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], color);
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setIndex(this.idx);
    return g;
  }
}

/** The kerb: a box with its top front edge (+Z, toward the board) chamfered; the grind edge waxed and chipped (ADR-102). */
function kerb(b: Builder) {
  const K = SPOT.kerb;
  const [x0, x1] = K.x;
  const [z0, z1] = K.z;
  const h = K.height;
  const c = K.chamfer;
  const col = paint(K.color);
  const wax = paint(K.wax.color);
  const chip = paint(K.chip.color);
  const s = Math.SQRT1_2;
  const cuts = K.chips.flat();
  const edge = (x: number) => (K.chips.some(([a, z]) => x > a && x < z) ? chip : wax);
  // The end profile: back bottom, front bottom, front top less the chamfer, top back from the chamfer, back top.
  const profile: [number, number][] = [
    [z0, 0],
    [z1, 0],
    [z1, h - c],
    [z1 - c, h],
    [z0, h],
  ];
  // Seen from +X the board side (+Z) is on the left, so the profile runs clockwise there: reversed for the +X end.
  b.face([...profile].reverse().map(([z, y]) => [x1, y, z] as V3), [1, 0, 0], col);
  b.face(profile.map(([z, y]) => [x0, y, z] as V3), [-1, 0, 0], col);
  b.face([[x0, 0, z1], [x1, 0, z1], [x1, h - c, z1], [x0, h - c, z1]], [0, 0, 1], col);
  b.faceAlongX(x0, x1, cuts, (xa, xb) => [[xa, h - c, z1], [xb, h - c, z1], [xb, h, z1 - c], [xa, h, z1 - c]], [0, s, s], edge);
  // The top: a waxed strip behind the chamfer, then the paint.
  const zw = z1 - c - K.wax.depth;
  b.face([[x0, h, z1 - c], [x1, h, z1 - c], [x1, h, zw], [x0, h, zw]], [0, 1, 0], wax);
  b.face([[x0, h, zw], [x1, h, zw], [x1, h, z0], [x0, h, z0]], [0, 1, 0], col);
  b.face([[x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0]], [0, 0, -1], col);
}

/** The flat rail, steel: a round bar on two square posts, each on a base plate; the bar's top ground bright. */
function rail(b: Builder) {
  const R = SPOT.rail;
  const col = paint(R.color);
  const polish = paint(R.polish);
  const [x0, x1] = R.x;
  const n = R.sides;
  const ring = (i: number): [number, number, number, number] => {
    const a = (i / n) * Math.PI * 2;
    return [R.height + R.radius * Math.cos(a), R.z + R.radius * Math.sin(a), Math.cos(a), Math.sin(a)];
  };
  for (let i = 0; i < n; i++) {
    const [ya, za, nya, nza] = ring(i);
    const [yb, zb, nyb, nzb] = ring(i + 1);
    // Each side flat, with the normal of its middle (a 10-sided bar reads round at this size).
    const ny = (nya + nyb) / 2, nz = (nza + nzb) / 2, l = Math.hypot(ny, nz);
    b.face([[x0, ya, za], [x0, yb, zb], [x1, yb, zb], [x1, ya, za]], [0, ny / l, nz / l], ny / l > 0.6 ? polish : col);
  }
  b.face(Array.from({ length: n }, (_, i) => { const [y, z] = ring(i); return [x1, y, z] as V3; }), [1, 0, 0], col);
  b.face(Array.from({ length: n }, (_, i) => { const [y, z] = ring(n - i); return [x0, y, z] as V3; }), [-1, 0, 0], col);
  const p = R.post / 2;
  const q = R.plate.size / 2;
  for (const x of R.posts) {
    b.box(x - p, x + p, 0, R.height - R.radius * 0.5, R.z - p, R.z + p, col);
    b.box(x - q, x + q, 0, R.plate.height, R.z - q, R.z + q, col);
  }
}

/** The ledge: a concrete block, its top edges bevelled and waxed behind the front (concrete), and the steel angle along that front edge (steel). */
function ledge(concrete: Builder, steel: Builder) {
  const L = SPOT.ledge;
  const [x0, x1] = L.x;
  const [z0, z1] = L.z;
  const c = L.bevel;
  const col = paint(L.color);
  const zw = z1 - c - L.wax.depth;
  concrete.bevelBox(x0, x1, L.height, z0, z1, c, col, { top: [[zw, col], [z1 - c, paint(L.wax.color)]] });
  // The angle sits just proud of the concrete, so the two never share a face; it covers the front bevel.
  const a = L.angle;
  const e = 0.0015;
  const side = paint(L.angleColor);
  const top = paint(L.anglePolish);
  const [ax0, ax1, y0, y1, az0, az1] = [x0 + e, x1 - e, L.height - a, L.height + e, z1 - a, z1 + e];
  steel.face([[ax0, y0, az1], [ax1, y0, az1], [ax1, y1, az1], [ax0, y1, az1]], [0, 0, 1], side);
  steel.face([[ax1, y0, az0], [ax0, y0, az0], [ax0, y1, az0], [ax1, y1, az0]], [0, 0, -1], side);
  steel.face([[ax1, y0, az1], [ax1, y0, az0], [ax1, y1, az0], [ax1, y1, az1]], [1, 0, 0], side);
  steel.face([[ax0, y0, az0], [ax0, y0, az1], [ax0, y1, az1], [ax0, y1, az0]], [-1, 0, 0], side);
  steel.face([[ax0, y1, az1], [ax1, y1, az1], [ax1, y1, az0], [ax0, y1, az0]], [0, 1, 0], top);
}

/** The wall: a long concrete box at the back, its top edges bevelled and its front in formwork panels. */
function wall(b: Builder) {
  const W = SPOT.wall;
  const [x0, x1] = W.x;
  const col = paint(W.color);
  const joint = paint(W.jointColor);
  // A joint, `joint` wide, at every multiple of `panel` inside the wall.
  const half = W.joint / 2;
  const cuts: number[] = [];
  for (let i = Math.ceil(x0 / W.panel); i * W.panel < x1; i++) {
    const x = i * W.panel;
    if (x - half > x0 && x + half < x1) cuts.push(x - half, x + half);
  }
  const inJoint = (x: number) => Math.abs(x - Math.round(x / W.panel) * W.panel) < half;
  b.bevelBox(x0, x1, W.height, W.z[0], W.z[1], W.bevel, col, { frontCuts: cuts, frontColor: (x) => (inJoint(x) ? joint : col) });
}

/** The spot's two meshes (ADR-102): the concrete and the steel, one draw call each, in SPOT_PARTS order. */
export function buildSpot(): { concrete: BufferGeometry; steel: BufferGeometry } {
  const concrete = new Builder();
  const steel = new Builder();
  kerb(concrete);
  rail(steel);
  ledge(concrete, steel);
  wall(concrete);
  return { concrete: concrete.geometry(), steel: steel.geometry() };
}
