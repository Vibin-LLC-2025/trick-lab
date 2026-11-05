// Trucks, bolts and wheels from docs/DESIGN.md 7.4 and 7.5, as three
// BufferGeometries (no React). Every part is a rotationally symmetric
// primitive or a box, so the tail truck is built from mirrored parameters
// rather than by scaling x by -1 (which would flip the triangle winding).
import { BufferGeometry, CylinderGeometry, LatheGeometry, Quaternion, Vector2, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HARDWARE_DETAIL, TRUCK, WHEEL, type HardwareDetail, type V3 } from './spec';

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

/** three's RoundedBoxGeometry is not indexed; weld it so it merges with the indexed cylinders. */
function roundedBox(size: V3, radius: number, segments: number, center: V3, rotZ = 0): BufferGeometry {
  const box = new RoundedBoxGeometry(size[0], size[1], size[2], segments, radius);
  box.deleteAttribute('uv');
  const g = mergeVertices(box);
  box.dispose();
  if (rotZ) g.rotateZ(rotZ);
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
  const S = det.roundSegments;

  const aluminium = [
    roundedBox(T.baseplate.size, T.baseplate.radius, S.baseplate, mx(T.baseplate.center, side)),
    cylinderOnAxis(mx(T.pivotCup.center, side), pivotAxis, -T.pivotCup.length / 2, T.pivotCup.length / 2, T.pivotCup.radius, T.pivotCup.radius, det.pivotCup),
    roundedBox(T.yoke.size, T.yoke.radius, S.yoke, mx(T.yoke.center, side), ((side * T.yoke.rotZDeg) * Math.PI) / 180),
    roundedBox(T.axleHousing.size, T.axleHousing.radius, S.axleHousing, axleCenter),
    cylinderOnAxis(mx(T.pivot.start, side), pivotAxis, 0, T.pivot.length, T.pivot.radius, T.pivot.radius, det.pivot),
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
  ];
  return { aluminium, steel, bushing };
}

/**
 * One bolt head: a plain cylinder, or (high) a lathe with a round socket in
 * the top so it reads as an allen bolt. The lathe runs from the socket floor
 * centre out and down the outside to the base centre, closed at both ends.
 */
export function buildBoltHead(x: number, z: number, det: HardwareDetail): BufferGeometry {
  const B = TRUCK.bolts;
  if (!det.boltSocket) return cylinderOnAxis([x, B.base, z], [0, 1, 0], 0, B.height, B.radius, B.radius, det.bolt);
  const { radius: sr, depth } = det.boltSocket;
  const pts = [
    new Vector2(0, B.height - depth),
    new Vector2(sr, B.height - depth),
    new Vector2(sr, B.height),
    new Vector2(B.radius, B.height),
    new Vector2(B.radius, 0),
    new Vector2(0, 0),
  ];
  const g = new LatheGeometry(pts, det.bolt);
  g.deleteAttribute('uv');
  const welded = mergeVertices(g);
  g.dispose();
  welded.translate(x, B.base, z);
  return welded;
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
