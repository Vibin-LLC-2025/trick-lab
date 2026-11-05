// Trucks, bolts and wheels from docs/DESIGN.md 7.4 and 7.5, as three
// BufferGeometries (no React). The hanger body is a loft of convex sections
// (truck pass, 2026-11-05, ADR-40); every other part is a rotationally
// symmetric primitive or a box. The tail truck is built from mirrored
// parameters rather than by scaling x by -1 (which would flip the triangle
// winding); the loft, built from points, orients each triangle outward itself.
import { BufferAttribute, BufferGeometry, CylinderGeometry, LatheGeometry, Quaternion, Vector2, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { midSurface, surfaceNormal } from './deck';
import { DECK, HARDWARE_DETAIL, TRUCK, WHEEL, type HardwareDetail, type V3 } from './spec';

const MEDIUM: HardwareDetail = HARDWARE_DETAIL.medium;

const UP = new Vector3(0, 1, 0);

/**
 * A cylinder (or cone) on an axis: from `start + axis * from` to
 * `start + axis * to`, radius `r0` at `from` and `r1` at `to`. Either order
 * of `from` and `to` gives the same solid: a reversed pair (the -Z axle
 * washers and nuts are mirrored as `-a, -b` with `a < b`) is swapped with its
 * radii first, because three's cylinder with a negative height puts its caps
 * and side on the wrong side of their normals and reverses the winding.
 */
export function cylinderOnAxis(
  start: V3,
  axis: V3,
  from: number,
  to: number,
  r0: number,
  r1: number,
  segments: number,
): BufferGeometry {
  if (to < from) return cylinderOnAxis(start, axis, to, from, r1, r0, segments);
  const dir = new Vector3(...axis).normalize();
  // three's cylinder: radiusTop at +Y, radiusBottom at -Y, centred on the origin.
  const g = new CylinderGeometry(r1, r0, to - from, segments);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(UP, dir));
  const mid = new Vector3(...start).addScaledVector(dir, (from + to) / 2);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/**
 * A lathe on an axis: `profile` is (radius, distance along the axis from
 * `start`), listed from the far bottom up, which is three's outward winding.
 * UVs dropped and the seam welded, so it merges with the indexed cylinders.
 */
export function latheOnAxis(start: V3, axis: V3, profile: readonly (readonly [number, number])[], segments: number): BufferGeometry {
  const lathe = new LatheGeometry(profile.map(([r, s]) => new Vector2(r, s)), segments);
  lathe.deleteAttribute('uv');
  const g = mergeVertices(lathe);
  lathe.dispose();
  g.applyQuaternion(new Quaternion().setFromUnitVectors(UP, new Vector3(...axis).normalize()));
  g.translate(start[0], start[1], start[2]);
  return g;
}

/** A closed, chamfered barrel profile from `from` to `to` at `radius` (for latheOnAxis). */
function barrel(from: number, to: number, radius: number, chamfer: number): [number, number][] {
  return [
    [0, from],
    [radius - chamfer, from],
    [radius, from + chamfer],
    [radius, to - chamfer],
    [radius - chamfer, to],
    [0, to],
  ];
}

/** three's RoundedBoxGeometry is not indexed; weld it so it merges with the indexed cylinders. */
function roundedBox(size: V3, radius: number, segments: number, center: V3): BufferGeometry {
  const box = new RoundedBoxGeometry(size[0], size[1], size[2], segments, radius);
  box.deleteAttribute('uv');
  const g = mergeVertices(box);
  box.dispose();
  g.translate(center[0], center[1], center[2]);
  return g;
}

const mx = (v: V3, s: number): V3 => [v[0] * s, v[1], v[2]];

/** Merges parts and drops the UVs (hardware is untextured). Disposes the inputs. */
export function mergeUntextured(parts: BufferGeometry[]): BufferGeometry {
  for (const p of parts) if (p.hasAttribute('uv')) p.deleteAttribute('uv');
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error('mergeGeometries failed: parts have different attributes');
  return merged;
}

/** Sets a constant linear vertex colour (glTF COLOR_0) on a geometry, in place. */
export function tint(g: BufferGeometry, rgb: V3): BufferGeometry {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(rgb, i * 3);
  g.setAttribute('color', new BufferAttribute(c, 3));
  return g;
}

type Circle = readonly [number, number, number];

/** 2D convex hull (Andrew's monotone chain), counter-clockwise, of circles sampled at 96 points each. */
function hullOfCircles(circles: readonly Circle[]): [number, number][] {
  const pts: [number, number][] = [];
  for (const [cx, cy, r] of circles)
    for (let k = 0; k < 96; k++) {
      const a = (k / 96) * Math.PI * 2;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Distance from (cx, cy) to a convex polygon's boundary along angle a ((cx, cy) inside it). */
function rayToHull(hull: readonly [number, number][], cx: number, cy: number, a: number): number {
  const dx = Math.cos(a), dy = Math.sin(a);
  let best = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const [x0, y0] = hull[i]!;
    const [x1, y1] = hull[(i + 1) % hull.length]!;
    const ex = x1 - x0, ey = y1 - y0;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-15) continue;
    const t = ((x0 - cx) * ey - (y0 - cy) * ex) / den;
    const u = ((x0 - cx) * dy - (y0 - cy) * dx) / den;
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
  }
  return best;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The hanger body's section radii at |z| (nose truck, local x outboard),
 * sampled at `ring` angles about the axle centre: the yoke hull blended into
 * the tapering bar hull (TRUCK.hanger).
 */
export function hangerSection(az: number, ring: number): number[] {
  const T = TRUCK;
  const H = T.hanger;
  const [ax, ay] = T.axleHousing.center;
  const king = new Vector3(...T.kingpin.start).addScaledVector(new Vector3(...T.kingpinAxis), H.seatLobe.along);
  // Outboard perpendicular to the kingpin in the x-y plane.
  const perp = new Vector2(-T.kingpinAxis[1], T.kingpinAxis[0]);
  if (perp.x < 0) perp.negate();
  const seat: Circle = [king.x + perp.x * H.seatLobe.out, king.y + perp.y * H.seatLobe.out, H.seatLobe.radius];
  const pivotRoot = new Vector3(...T.pivot.start).addScaledVector(new Vector3(...T.pivotAxis), H.pivotLobe.along);
  const yoke = hullOfCircles([[ax, ay, H.axleRadius[0]], seat, [pivotRoot.x, pivotRoot.y, H.pivotLobe.radius]]);
  // The bar tapers linearly from blendZ to endZ.
  const q = Math.min(1, Math.max(0, (az - H.blendZ) / (H.endZ - H.blendZ)));
  const B = H.barLobe;
  const bar = hullOfCircles([
    [ax, ay, lerp(H.axleRadius[0], H.axleRadius[1], q)],
    [ax + B.dx, ay + lerp(B.height[0], B.height[1], q), lerp(B.radius[0], B.radius[1], q)],
  ]);
  const w = 1 - smoothstep(H.yokeZ, H.blendZ, az);
  return Array.from({ length: ring }, (_, k) => {
    const a = (k / ring) * Math.PI * 2;
    return w * rayToHull(yoke, ax, ay, a) + (1 - w) * rayToHull(bar, ax, ay, a);
  });
}

/**
 * The hanger body of one truck: the sections at ±stations along the axle,
 * stitched, with flat caps at the ends (inside the axle bulges). Each
 * triangle is wound so its face points away from the axle line (the sides)
 * or along the axle (the caps), so mirroring x for the tail truck keeps it
 * outward; normals are smooth over the sides, flat on the caps.
 */
export function buildHangerBody(side: 1 | -1, det: HardwareDetail = MEDIUM): BufferGeometry {
  const [ax, ay] = TRUCK.axleHousing.center;
  const N = det.hanger.ring;
  const half = det.hanger.stations;
  const zs = [...[...half].reverse().map((z) => -z), ...half.slice(half[0] === 0 ? 1 : 0)];
  const pos: number[] = [];
  const point = (r: number, k: number, z: number) => {
    const a = (k / N) * Math.PI * 2;
    return [side * (ax + r * Math.cos(a)), ay + r * Math.sin(a), z] as const;
  };
  const rings = zs.map((z) => {
    const radii = hangerSection(Math.abs(z), N);
    return radii.map((r, k) => {
      pos.push(...point(r, k, z));
      return pos.length / 3 - 1;
    });
  });
  const index: number[] = [];
  const v = (i: number) => new Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  /** Pushes a triangle wound so its face normal agrees with `want`. */
  const tri = (a: number, b: number, c: number, want: Vector3) => {
    const A = v(a), B = v(b), C = v(c);
    const n = B.clone().sub(A).cross(C.clone().sub(A));
    if (n.dot(want) >= 0) index.push(a, b, c);
    else index.push(a, c, b);
  };
  const axisX = side * ax;
  for (let s = 0; s < rings.length - 1; s++)
    for (let k = 0; k < N; k++) {
      const a = rings[s]![k]!, b = rings[s]![(k + 1) % N]!, c = rings[s + 1]![(k + 1) % N]!, d = rings[s + 1]![k]!;
      const m = v(a).add(v(b)).add(v(c)).add(v(d)).multiplyScalar(0.25);
      const out = new Vector3(m.x - axisX, m.y - ay, 0);
      tri(a, b, c, out);
      tri(a, c, d, out);
    }
  const sides = new BufferGeometry();
  sides.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  sides.setIndex(index);
  sides.computeVertexNormals();

  // Caps: their own vertices (flat normals along the axle), a fan from the axle centre.
  const caps: BufferGeometry[] = [];
  for (const [ring, z] of [[rings[0]!, zs[0]!], [rings[rings.length - 1]!, zs[zs.length - 1]!]] as const) {
    const cp: number[] = [axisX, ay, z];
    for (const i of ring) cp.push(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!);
    const want = new Vector3(0, 0, Math.sign(z));
    const ci: number[] = [];
    const cv = (i: number) => new Vector3(cp[i * 3], cp[i * 3 + 1], cp[i * 3 + 2]);
    for (let k = 0; k < N; k++) {
      const b = 1 + k, c = 1 + ((k + 1) % N);
      const n = cv(b).sub(cv(0)).cross(cv(c).sub(cv(0)));
      if (n.dot(want) >= 0) ci.push(0, b, c);
      else ci.push(0, c, b);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(cp), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(cp.map((_, i) => (i % 3 === 2 ? Math.sign(z) : 0))), 3));
    g.setIndex(ci);
    caps.push(g);
  }
  const merged = mergeGeometries([sides, ...caps]);
  [sides, ...caps].forEach((g) => g.dispose());
  if (!merged) throw new Error('mergeGeometries failed for the hanger body');
  return merged;
}

export interface TruckParts {
  aluminium: BufferGeometry[];
  steel: BufferGeometry[];
  bushing: BufferGeometry[];
}

/** One truck. `side` is +1 for the nose truck, -1 for the tail truck; `det` picks the segment counts. */
export function buildTruck(side: 1 | -1, det: HardwareDetail = MEDIUM): TruckParts {
  const T = TRUCK;
  const pivotAxis = mx(T.pivotAxis, side);
  const kingAxis = mx(T.kingpinAxis, side);
  const king = mx(T.kingpin.start, side);
  const onKing = (from: number, to: number, r0: number, r1: number, seg: number) =>
    cylinderOnAxis(king, kingAxis, from, to, r0, r1, seg);
  const axleCenter = mx(T.axleHousing.center, side);
  const onAxle = (z0: number, z1: number, r: number, seg: number) =>
    cylinderOnAxis(axleCenter, [0, 0, 1], z0, z1, r, r, seg);
  const cup = mx(T.pivotCup.center, side);
  const C = T.pivotCup;
  const AB = T.axleBulge;
  const S = T.seat;

  const aluminium = [
    roundedBox(T.baseplate.size, T.baseplate.radius, det.roundSegments.baseplate, mx(T.baseplate.center, side)),
    cylinderOnAxis(cup, pivotAxis, C.socket.from, C.socket.to, C.socket.radius, C.socket.radius, det.pivotCup),
    buildHangerBody(side, det),
    latheOnAxis(king, kingAxis, barrel(S.from, S.to, S.radius, S.chamfer), det.seat),
    // The bulges, +z then -z: a lathe up the axle from the inboard end, and one down it.
    latheOnAxis(axleCenter, [0, 0, 1], barrel(AB.from, AB.to, AB.radius, AB.chamfer), det.bulge),
    latheOnAxis(axleCenter, [0, 0, -1], barrel(AB.from, AB.to, AB.radius, AB.chamfer), det.bulge),
    cylinderOnAxis(mx(T.pivot.start, side), pivotAxis, 0, T.pivot.length, T.pivot.radiusRoot, T.pivot.radiusTip, det.pivot),
  ];

  const steel = [
    onKing(0, T.kingpin.length, T.kingpin.radius, T.kingpin.radius, det.kingpin),
    onKing(T.cupWasherTop.from, T.cupWasherTop.to, T.cupWasherTop.radius, T.cupWasherTop.radius, det.cupWasher),
    onKing(T.cupWasherBottom.from, T.cupWasherBottom.to, T.cupWasherBottom.radius, T.cupWasherBottom.radius, det.cupWasher),
    onKing(T.kingpinNut.from, T.kingpinNut.to, T.kingpinNut.radius, T.kingpinNut.radius, det.nut),
    onAxle(-T.axle.length / 2, T.axle.length / 2, T.axle.radius, det.axle),
  ];
  for (const zs of [1, -1]) {
    for (const [a, b] of T.speedWashers.ranges) steel.push(onAxle(zs * a, zs * b, T.speedWashers.radius, det.speedWasher));
    steel.push(onAxle(zs * T.axleNuts.range[0], zs * T.axleNuts.range[1], T.axleNuts.radius, det.nut));
  }

  const bushing = [
    onKing(T.bushingTop.from, T.bushingTop.to, T.bushingTop.radiusFrom, T.bushingTop.radiusTo, det.bushing),
    onKing(T.bushingBottom.from, T.bushingBottom.to, T.bushingBottom.radiusFrom, T.bushingBottom.radiusTo, det.bushing),
    // The pivot cup's urethane insert, its lip showing below the aluminium socket.
    cylinderOnAxis(cup, pivotAxis, C.insert.from, C.insert.to, C.insert.radius, C.insert.radius, det.pivotCup),
  ];
  return { aluminium, steel, bushing };
}

/** Where a bolt head sits: the grip's top over plan point (x, z), and the local deck normal there. */
export function boltSeat(x: number, z: number): { origin: V3; normal: V3 } {
  const n = surfaceNormal(x, z);
  // The top face is the mid surface offset by half the thickness along the normal: straight up that is h / n.y.
  return { origin: [x, midSurface(x, z) + DECK.thickness / 2 / n[1], z], normal: n };
}

/**
 * The hex socket of a high-detail head, in the head's own frame (axis +Y,
 * the grip at y 0): a flat ring from the head's inner circle (radius
 * `ri`, at the top) in to the hexagon, the six walls down to the floor, and
 * the floor. `segments` points round, 4 per hexagon side, at the lathe's
 * angles (x = r sin a, z = r cos a), so the ring meets the head's lathe.
 */
function hexSocket(ri: number, top: number, apothem: number, floor: number, segments: number): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const index: number[] = [];
  const hexR = (a: number) => {
    const sector = Math.PI / 3;
    const off = ((a % sector) + sector) % sector - sector / 2;
    return apothem / Math.cos(off);
  };
  const at = (r: number, a: number, y: number) => [r * Math.sin(a), y, r * Math.cos(a)] as const;
  const add = (p: readonly number[], n: readonly number[]) => {
    pos.push(...p);
    nor.push(...n);
    return pos.length / 3 - 1;
  };
  const face = (a: number, b: number, c: number, want: readonly number[]) => {
    const A = new Vector3(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]);
    const B = new Vector3(pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]);
    const C = new Vector3(pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]);
    const n = B.sub(A).cross(C.sub(A));
    if (n.dot(new Vector3(...want)) >= 0) index.push(a, b, c);
    else index.push(a, c, b);
  };
  const angle = (k: number) => (k / segments) * Math.PI * 2;
  // Ring at the top.
  const outer: number[] = [], inner: number[] = [];
  for (let k = 0; k < segments; k++) {
    outer.push(add(at(ri, angle(k), top), [0, 1, 0]));
    inner.push(add(at(hexR(angle(k)), angle(k), top), [0, 1, 0]));
  }
  for (let k = 0; k < segments; k++) {
    const k1 = (k + 1) % segments;
    face(outer[k]!, outer[k1]!, inner[k1]!, [0, 1, 0]);
    face(outer[k]!, inner[k1]!, inner[k]!, [0, 1, 0]);
  }
  // Walls: one flat quad per sub-segment, facing in toward the axis (out of the metal).
  for (let k = 0; k < segments; k++) {
    const k1 = (k + 1) % segments;
    const mid = (angle(k) + (k1 === 0 ? Math.PI * 2 : angle(k1))) / 2;
    // Corners are at multiples of 60 deg, so the side holding this sub-segment
    // faces 30 deg past the corner before it; the wall's normal points in.
    const sideAngle = Math.floor(mid / (Math.PI / 3)) * (Math.PI / 3) + Math.PI / 6;
    const n = [-Math.sin(sideAngle), 0, -Math.cos(sideAngle)];
    const t0 = add(at(hexR(angle(k)), angle(k), top), n);
    const t1 = add(at(hexR(angle(k1)), angle(k1), top), n);
    const b1 = add(at(hexR(angle(k1)), angle(k1), floor), n);
    const b0 = add(at(hexR(angle(k)), angle(k), floor), n);
    face(t0, t1, b1, n);
    face(t0, b1, b0, n);
  }
  // Floor: a fan.
  const c = add([0, floor, 0], [0, 1, 0]);
  const rim: number[] = [];
  for (let k = 0; k < segments; k++) rim.push(add(at(hexR(angle(k)), angle(k), floor), [0, 1, 0]));
  for (let k = 0; k < segments; k++) face(c, rim[k]!, rim[(k + 1) % segments]!, [0, 1, 0]);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setIndex(index);
  return g;
}

/**
 * One countersunk bolt head on the grip at plan point (x, z): a lathe of
 * TRUCK.bolts.profile (hidden below the grip, a 0.15 mm rim, a flat top
 * 0.7 mm up) on the local deck normal, plus (high) a hex socket.
 */
export function buildBoltHead(x: number, z: number, det: HardwareDetail): BufferGeometry {
  const B = TRUCK.bolts;
  const { origin, normal } = boltSeat(x, z);
  const hex = det.boltHex;
  let parts: BufferGeometry[];
  if (!hex) {
    parts = [latheOnAxis([0, 0, 0], [0, 1, 0], B.profile, det.bolt)];
  } else {
    // Open the lathe at the socket ring: the profile up to the top face's inner circle.
    const ri = B.profile[B.profile.length - 2]![0];
    const lathe = latheOnAxis([0, 0, 0], [0, 1, 0], B.profile.slice(0, -1), det.bolt);
    parts = [lathe, hexSocket(ri, B.top, hex.apothem, hex.floor, det.bolt)];
  }
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!g) throw new Error('mergeGeometries failed for a bolt head');
  g.applyQuaternion(new Quaternion().setFromUnitVectors(UP, new Vector3(...normal)));
  g.translate(origin[0], origin[1], origin[2]);
  return g;
}

/** The 8 bolt heads on the grip, 4 per truck, new-school pattern. */
export function buildBolts(det: HardwareDetail = MEDIUM): BufferGeometry[] {
  const B = TRUCK.bolts;
  const out: BufferGeometry[] = [];
  for (const side of [1, -1]) for (const x of B.x) for (const z of [B.z, -B.z]) out.push(buildBoltHead(side * x, z, det));
  return out;
}

/**
 * One wheel: a lathe of the 7.5 profile with three's LatheGeometry, so the UVs
 * follow its convention (u = angle / 2 pi, v = point index / 15, by index not
 * arc length), which the band texture depends on. The lathe axis is Y; it is
 * turned onto Z with +Z outboard on the toe side and -Z outboard on the heel side.
 */
export function buildWheel(x: number, zSide: 1 | -1, det: HardwareDetail = MEDIUM): BufferGeometry {
  const pts = det.wheelProfile.map(([r, z]) => new Vector2(r, z));
  const g = new LatheGeometry(pts, det.wheelRadial);
  // rotateX(+90 deg) maps +Y to +Z; rotateX(-90 deg) maps +Y to -Z. Both are rotations, so winding holds.
  g.rotateX((zSide * Math.PI) / 2);
  g.translate(x, WHEEL.centerY, zSide * WHEEL.centerZ);
  return g;
}

export function buildWheels(det: HardwareDetail = MEDIUM): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const side of [1, -1]) for (const z of [1, -1] as const) parts.push(buildWheel(side * WHEEL.centerX, z, det));
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error('mergeGeometries failed for the wheels');
  return merged;
}
