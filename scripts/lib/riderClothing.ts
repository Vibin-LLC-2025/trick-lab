import { BufferAttribute, type BufferGeometry, Vector3 } from 'three';
import { REGION } from '../../src/asset/riderSpec';

// Bisect long denim edges around the seat and upper legs before compression.
// Both faces of a shared edge use the same midpoint. UV seams retain their
// separate vertices so texture interpolation stays inside each atlas island.
export function finishRiderClothing(g: BufferGeometry, hipY: number) {
  const pos = g.getAttribute('position');
  const normal = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  const joints = g.getAttribute('skinIndex');
  const weights = g.getAttribute('skinWeight');
  const region = g.getAttribute('region');
  const positions = Array.from(pos.array), normals = Array.from(normal.array), uvs = Array.from(uv.array);
  const bones = Array.from(joints.array), skin = Array.from(weights.array), regions = Array.from(region.array);
  const cache = new Map<number, number>();
  function midpoint(a: number, b: number) {
    const key = Math.min(a, b) * pos.count + Math.max(a, b);
    const previous = cache.get(key);
    if (previous !== undefined) return previous;
    const p = new Vector3().fromBufferAttribute(pos, a);
    const q = new Vector3().fromBufferAttribute(pos, b);
    const height = (p.y + q.y) / 2 - hipY;
    if (height < -0.42 || height > 0.07 || p.distanceToSquared(q) < 0.045 ** 2) return;
    const na = new Vector3().fromBufferAttribute(normal, a);
    const nb = new Vector3().fromBufferAttribute(normal, b);
    const edge = q.clone().sub(p);
    // Midpoint of a cubic whose end tangents follow the denim surface.
    const mid = p.lerp(q, 0.5).addScaledVector(na, -edge.dot(na) / 8).addScaledVector(nb, edge.dot(nb) / 8);
    const id = regions.length;
    positions.push(...mid.toArray());
    normals.push(...na.add(nb).normalize().toArray());
    uvs.push((uv.getX(a) + uv.getX(b)) / 2, (uv.getY(a) + uv.getY(b)) / 2);
    regions.push(REGION.trouser);
    const blend = new Map<number, number>();
    for (const v of [a, b]) for (let k = 0; k < 4; k++) {
      const bone = joints.getComponent(v, k);
      blend.set(bone, (blend.get(bone) ?? 0) + weights.getComponent(v, k));
    }
    const top = [...blend].sort((l, r) => r[1] - l[1]).slice(0, 4);
    const sum = top.reduce((s, entry) => s + entry[1], 0);
    for (let k = 0; k < 4; k++) {
      bones.push(top[k]?.[0] ?? 0);
      skin.push((top[k]?.[1] ?? 0) / sum);
    }
    cache.set(key, id);
    return id;
  }

  const indices = g.getIndex()!.array, refined: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const face = [indices[i]!, indices[i + 1]!, indices[i + 2]!];
    let faces = [face];
    if (face.every(v => region.getX(v) === REGION.trouser)) {
      for (let j = 0; j < 3; j++) {
        const a = face[j]!, b = face[(j + 1) % 3]!;
        const m = midpoint(a, b);
        if (m === undefined) continue;
        faces = faces.flatMap(tri => {
          if (!tri.includes(a) || !tri.includes(b)) return [tri];
          const c = tri.find(v => v !== a && v !== b)!;
          return [[a, m, c], [m, b, c]];
        });
      }
    }
    for (const tri of faces) refined.push(...tri);
  }
  // Finish the three open cloth edges with a turned-in strip. Count by
  // position so an atlas seam cannot acquire a false cuff down its length.
  const sewn = new Map<string, [number, number]>();
  const keyOf = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)].map(n => Math.round(n * 1e5)).join(',');
  for (let i = 0; i < indices.length; i += 3) {
    const garment = region.getX(indices[i]!);
    if (garment !== REGION.hoodie && garment !== REGION.trouser) continue;
    for (let k = 0; k < 3; k++) {
      const a = indices[i + k]!, b = indices[i + (k + 1) % 3]!;
      const key = garment + ':' + [keyOf(a), keyOf(b)].sort().join(':');
      if (!sewn.delete(key)) sewn.set(key, [a, b]);
    }
  }
  const openings: [number, number][][] = [[], [], []];
  const waistband: [number, number][] = [];
  for (const edge of sewn.values()) {
    const i = edge[0];
    if (region.getX(i) === REGION.trouser) {
      if (pos.getY(i) > hipY) waistband.push(edge);
      continue;
    }
    if (pos.getY(i) < hipY + 0.2) openings[0]!.push(edge);
    else if (Math.abs(pos.getX(i)) > 0.2) openings[pos.getX(i) < 0 ? 1 : 2]!.push(edge);
  }
  for (const [part, edges] of openings.entries()) {
    const centre = new Vector3();
    for (const [a] of edges) centre.add(new Vector3().fromBufferAttribute(pos, a));
    centre.divideScalar(edges.length);
    const inner = new Map<number, number>();
    function inset(i: number) {
      const existing = inner.get(i);
      if (existing !== undefined) return existing;
      const id = regions.length;
      const p = new Vector3().fromBufferAttribute(pos, i);
      const inside = p.clone().lerp(centre, part === 0 ? 0.035 : 0.32);
      if (part === 0) inside.y = p.y + 0.004;
      positions.push(...inside.toArray());
      const outside = p.sub(centre);
      if (part === 0) outside.y = 0;
      normals.push(...outside.normalize().toArray());
      uvs.push(uv.getX(i), uv.getY(i));
      regions.push(REGION.hoodie);
      for (let k = 0; k < 4; k++) {
        bones.push(joints.getComponent(i, k));
        skin.push(weights.getComponent(i, k));
      }
      inner.set(i, id);
      return id;
    }
    for (const [a, b] of edges) refined.push(b, a, inset(a), b, inset(a), inset(b));
  }
  // Extend the top of the jeans under the tee, attaching the hidden
  // upper row to the tee's skinning so the tuck cannot pull the two apart.
  const upper = new Map<number, number>();
  const lower = new Map<number, number>();
  const hem = openings[0]!.map(([a]) => a);
  // Give the waistband its own strip of unbroken denim in the same atlas.
  // Reusing one UV at both heights would stretch a single texel vertically.
  function bandVertex(i: number, top: boolean) {
    const cache = top ? upper : lower;
    const existing = cache.get(i);
    if (existing !== undefined) return existing;
    const p = new Vector3().fromBufferAttribute(pos, i);
    let nearest = hem[0]!, distance = Infinity;
    for (const h of hem) {
      const dx = pos.getX(h) - p.x, dz = pos.getZ(h) - p.z;
      const d = dx*dx + dz*dz;
      if (d < distance) { nearest = h; distance = d; }
    }
    const id = regions.length;
    if (top) positions.push(0.97 * pos.getX(nearest), pos.getY(nearest) + 0.022, 0.97 * pos.getZ(nearest));
    else positions.push(p.x, p.y, p.z);
    const radial = new Vector3(p.x, 0, p.z + 0.035).normalize();
    normals.push(...radial.toArray());
    uvs.push(0.53 + p.x * 0.23, top ? 0.678 : 0.70);
    regions.push(REGION.trouser);
    const attached = top ? nearest : i;
    for (let k = 0; k < 4; k++) {
      bones.push(joints.getComponent(attached, k));
      skin.push(weights.getComponent(attached, k));
    }
    cache.set(i, id);
    return id;
  }
  for (const [a, b] of waistband) {
    const loA = bandVertex(a, false), loB = bandVertex(b, false);
    const hiA = bandVertex(a, true), hiB = bandVertex(b, true);
    refined.push(loB, loA, hiA, loB, hiA, hiB);
  }
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  g.setAttribute('region', new BufferAttribute(new Uint8Array(regions), 1));
  g.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(bones), 4));
  g.setAttribute('skinWeight', new BufferAttribute(new Float32Array(skin), 4));
  g.setIndex(refined);
}
