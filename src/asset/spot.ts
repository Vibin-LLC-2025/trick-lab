// The skate spot's geometry (step 14, ADR-69): every piece in one indexed
// mesh, one material, so the spot is one draw call. Flat faces, each with its
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

/** The kerb: a box with its top front edge (+Z, toward the board) chamfered. */
function kerb(b: Builder) {
  const K = SPOT.kerb;
  const [x0, x1] = K.x;
  const [z0, z1] = K.z;
  const h = K.height;
  const c = K.chamfer;
  const col = paint(K.color);
  const s = Math.SQRT1_2;
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
  b.face([[x0, h - c, z1], [x1, h - c, z1], [x1, h, z1 - c], [x0, h, z1 - c]], [0, s, s], col);
  b.face([[x0, h, z1 - c], [x1, h, z1 - c], [x1, h, z0], [x0, h, z0]], [0, 1, 0], col);
  b.face([[x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0]], [0, 0, -1], col);
}

/** The flat rail: a round bar on two square posts, each on a base plate. */
function rail(b: Builder) {
  const R = SPOT.rail;
  const col = paint(R.color);
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
    b.face([[x0, ya, za], [x0, yb, zb], [x1, yb, zb], [x1, ya, za]], [0, ny / l, nz / l], col);
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

/** The ledge: a concrete block with a steel angle along its top front edge. */
function ledge(b: Builder) {
  const L = SPOT.ledge;
  const [x0, x1] = L.x;
  const [z0, z1] = L.z;
  b.box(x0, x1, 0, L.height, z0, z1, paint(L.color));
  // The angle sits just proud of the concrete, so the two never share a face.
  const a = L.angle;
  const e = 0.0015;
  b.box(x0 + e, x1 - e, L.height - a, L.height + e, z1 - a, z1 + e, paint(L.angleColor));
}

/** The wall: a long concrete box at the back. */
function wall(b: Builder) {
  const W = SPOT.wall;
  b.box(W.x[0], W.x[1], 0, W.height, W.z[0], W.z[1], paint(W.color));
}

/** The whole spot as one geometry (one draw call). */
export function buildSpot(): BufferGeometry {
  const b = new Builder();
  kerb(b);
  rail(b);
  ledge(b);
  wall(b);
  return b.geometry();
}
