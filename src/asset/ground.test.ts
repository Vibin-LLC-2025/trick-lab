import { describe, expect, it } from 'vitest';
import { triangleCount } from './board';
import { bayUv, buildGround } from './ground';
import { BAY, CONCRETE, GROUND_PARTS, GROUND_TEXTURES, JOINT, MARK, PLANE, PLANE_BAYS, groundRepeat, originBay } from './groundSpec';
import {
  concreteColor,
  concreteColorField,
  concreteNormal,
  concreteRoughness,
  concreteRoughnessField,
  concreteSurface,
  concreteTint,
  jointDistance,
  jointProfile,
} from './groundTextures';
import { BUDGETS } from './spec';

const isPow2 = (n: number) => (n & (n - 1)) === 0;

describe('ground plane (ground.glb, ADR-31)', () => {
  const g = buildGround();
  g.computeBoundingBox();
  const b = g.boundingBox!;

  it('is at least 24 m each way, a whole odd number of bays, centred on the origin, on y = 0', () => {
    expect(PLANE.x).toBeGreaterThanOrEqual(24);
    expect(PLANE.z).toBeGreaterThanOrEqual(24);
    expect(PLANE_BAYS.x % 2).toBe(1);
    expect(PLANE_BAYS.z % 2).toBe(1);
    expect(b.max.x - b.min.x).toBeCloseTo(PLANE.x, 4);
    expect(b.max.z - b.min.z).toBeCloseTo(PLANE.z, 4);
    expect(b.min.x + b.max.x).toBeCloseTo(0, 9);
    expect(b.min.z + b.max.z).toBeCloseTo(0, 9);
    expect(b.min.y).toBe(0);
    expect(b.max.y).toBe(0);
  });

  it('is one quad facing up, inside the ground budget', () => {
    expect(GROUND_PARTS).toHaveLength(BUDGETS.ground.drawCalls);
    expect(triangleCount(g)).toBe(2);
    expect(triangleCount(g)).toBeLessThanOrEqual(BUDGETS.ground.triangles);
    const p = g.getAttribute('position');
    const idx = g.index!.array;
    for (let i = 0; i < idx.length; i += 3) {
      const [a, c, d] = [idx[i]!, idx[i + 1]!, idx[i + 2]!];
      const ux = p.getX(c) - p.getX(a), uz = p.getZ(c) - p.getZ(a);
      const vx = p.getX(d) - p.getX(a), vz = p.getZ(d) - p.getZ(a);
      // y of (u x v): positive means the face points up.
      expect(uz * vx - ux * vz).toBeGreaterThan(0);
    }
  });

  it('maps +u to +X and +v to +Z, UVs 0 to 1, so the repeated tile puts a bay centre at the origin', () => {
    const p = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(p.getX(i) / PLANE.x + 0.5, 6);
      expect(uv.getY(i)).toBeCloseTo(p.getZ(i) / PLANE.z + 0.5, 6);
    }
    // Repeating PLANE_BAYS times, the origin lands in the middle of a tile.
    expect((0.5 * PLANE_BAYS.x) % 1).toBeCloseTo(0.5, 9);
    expect((0.5 * PLANE_BAYS.z) % 1).toBeCloseTo(0.5, 9);
    expect(bayUv(0, 0, BAY)).toEqual([0.5, 0.5]);
    // The plane's edge is on a joint.
    const [u, v] = bayUv(PLANE.x / 2, PLANE.z / 2, BAY);
    expect(Math.min(u, 1 - u)).toBeCloseTo(0, 6);
    expect(Math.min(v, 1 - v)).toBeCloseTo(0, 6);
  });
});

describe('concrete textures (one bay of relief, varied bays of colour and roughness, ADR-38)', () => {
  const s = concreteSurface();
  const { width: W, height: H } = s;
  const at = (f: Float32Array, c: number, r: number) => f[r * W + c]!;

  it('are power of two, at most 1024 px, and the normal map matches the surface grid', () => {
    for (const t of Object.values(GROUND_TEXTURES)) {
      expect(isPow2(t.width) && isPow2(t.height)).toBe(true);
      expect(Math.max(t.width, t.height)).toBeLessThanOrEqual(BUDGETS.ground.textureMaxSide);
    }
    expect(Object.keys(GROUND_TEXTURES)).toHaveLength(BUDGETS.ground.textures);
    const c = concreteColor(), n = concreteNormal(), r = concreteRoughness();
    expect(c.grey).toHaveLength(GROUND_TEXTURES.color.width * GROUND_TEXTURES.color.height);
    expect(n.rgb).toHaveLength(GROUND_TEXTURES.normal.width * GROUND_TEXTURES.normal.height * 3);
    expect(r.grey).toHaveLength(GROUND_TEXTURES.roughness.width * GROUND_TEXTURES.roughness.height);
  });

  it('bakes the joint into all three maps along every bay edge of each tile, so it repeats without a seam', () => {
    const mid = Math.floor(H / 3);
    // The normal map's height: one bay, sunk along all four edges.
    for (const c of [0, W - 1]) expect(at(s.lift, c, mid)).toBeCloseTo(-JOINT.depth, 6);
    for (const r of [0, H - 1]) expect(at(s.lift, Math.floor(W / 3), r)).toBeCloseTo(-JOINT.depth, 6);
    // Symmetric across the wrap: the first and last columns are the same distance from the joint line.
    expect(jointDistance(0, mid, W, H)).toBeCloseTo(jointDistance(W - 1, mid, W, H), 9);
    expect(jointProfile(jointDistance(W / 2, H / 2, W, H))).toBe(0);

    // The colour tile (2 x 2 bays): darker along every bay edge, the inner ones and the wrapping ones.
    const color = concreteColorField();
    const CW = GROUND_TEXTURES.color.width, bw = CW / GROUND_TEXTURES.color.bays[0];
    const colAvg = (c: number, r0: number) => {
      let sum = 0;
      for (let r = r0; r < r0 + 100; r++) sum += color[r * CW + c]!;
      return sum / 100;
    };
    for (const c of [0, bw - 1, bw, CW - 1]) expect(colAvg(c, 100)).toBeLessThan(colAvg(c < bw ? 40 : bw + 40, 100) - 20);

    // The roughness tile (3 x 3 bays, 9.4 x 7.0 mm texels): the 12 mm joint
    // straddles the two texels either side of each bay edge (supersampled),
    // which are rougher than the slab a few texels in, along every edge.
    const rough = concreteRoughnessField();
    const RW = GROUND_TEXTURES.roughness.width;
    const [nx, nz] = GROUND_TEXTURES.roughness.bays;
    const sx = (nx * BAY.x) / RW, sz = (nz * BAY.z) / RW;
    const wrap = (i: number) => ((i % RW) + RW) % RW;
    const mean = (pick: (k: number) => number) => {
      let sum = 0;
      for (let k = 0; k < RW; k++) sum += pick(k);
      return sum / RW;
    };
    for (let b = 0; b < nx; b++) {
      // Texels either side of the joint line x = b * BAY.x, averaged down the whole tile.
      const c = Math.round((b * BAY.x) / sx);
      const joint = mean((r) => (rough[r * RW + wrap(c - 1)]! + rough[r * RW + wrap(c)]!) / 2);
      const slab = mean((r) => (rough[r * RW + wrap(c - 6)]! + rough[r * RW + wrap(c + 5)]!) / 2);
      expect(joint, `joint column ${b}`).toBeGreaterThan(slab + 0.02);
    }
    for (let b = 0; b < nz; b++) {
      const r = Math.round((b * BAY.z) / sz);
      const joint = mean((c) => (rough[wrap(r - 1) * RW + c]! + rough[wrap(r) * RW + c]!) / 2);
      const slab = mean((c) => (rough[wrap(r - 6) * RW + c]! + rough[wrap(r + 5) * RW + c]!) / 2);
      expect(joint, `joint row ${b}`).toBeGreaterThan(slab + 0.02);
    }
  });

  it('varies the bays: each bay of the colour tile has its own shade and cracks, and the mark only in the bay under the board', () => {
    const color = concreteColorField();
    const CW = GROUND_TEXTURES.color.width;
    const [bx, bz] = GROUND_TEXTURES.color.bays;
    const bw = CW / bx, bh = GROUND_TEXTURES.color.height / bz;
    expect([bx, bz]).toEqual([2, 2]);
    // Each bay of the tile, as one array (texels in the same order).
    const bays = Array.from({ length: bx * bz }, (_, k) => {
      const ox = (k % bx) * bw, oz = Math.floor(k / bx) * bh;
      const out = new Float32Array(bw * bh);
      for (let r = 0; r < bh; r++) for (let c = 0; c < bw; c++) out[r * bw + c] = color[(oz + r) * CW + ox + c]!;
      return out;
    });
    // No two bays are the same picture: their difference is far above zero everywhere but the shared fine detail.
    for (let a = 0; a < bays.length; a++)
      for (let b = a + 1; b < bays.length; b++) {
        let d = 0;
        for (let i = 0; i < bw * bh; i++) d += Math.abs(bays[a]![i]! - bays[b]![i]!);
        expect(d / (bw * bh), `bays ${a} and ${b}`).toBeGreaterThan(2);
      }
    // The painted mark: a thin light strip along x through the centre of the origin bay, absent from the others.
    const [ox, oz] = originBay('color');
    expect([ox, oz]).toEqual([0, 0]);
    const strip = (bay: Float32Array, rowOffset: number) => {
      let sum = 0;
      for (let c = bw / 2 - 80; c < bw / 2 + 80; c++) sum += bay[(bh / 2 + rowOffset) * bw + c]!;
      return sum / 160;
    };
    const lift = (bay: Float32Array) => strip(bay, 0) - (strip(bay, -12) + strip(bay, 12)) / 2;
    expect(lift(bays[oz * bx + ox]!)).toBeGreaterThan(MARK.levels * 0.3);
    for (let k = 0; k < bays.length; k++) if (k !== oz * bx + ox) expect(Math.abs(lift(bays[k]!))).toBeLessThan(MARK.levels * 0.3);
  });

  it('repeats each map by its own tile size and puts the origin bay of each tile under the board', () => {
    expect(groundRepeat('normal')).toEqual([PLANE_BAYS.x, PLANE_BAYS.z]);
    expect(groundRepeat('color')).toEqual([PLANE_BAYS.x / 2, PLANE_BAYS.z / 2]);
    expect(groundRepeat('roughness')).toEqual([PLANE_BAYS.x / 3, PLANE_BAYS.z / 3]);
    // Colour and roughness tiles are 2 and 3 bays: they line up again only every 6 bays.
    const [cx, cz] = GROUND_TEXTURES.color.bays, [rx, rz] = GROUND_TEXTURES.roughness.bays;
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    expect(gcd(cx, rx)).toBe(1);
    expect(gcd(cz, rz)).toBe(1);
    for (const key of ['color', 'normal', 'roughness'] as const) {
      const [rptX, rptZ] = groundRepeat(key);
      const [bx, bz] = GROUND_TEXTURES[key].bays;
      const [ix, iz] = originBay(key);
      // The plane's centre (UV 0.5) lands on the centre of that bay of the tile.
      const f = (t: number) => t - Math.floor(t);
      expect(f(0.5 * rptX) * bx).toBeCloseTo(ix + 0.5, 9);
      expect(f(0.5 * rptZ) * bz).toBeCloseTo(iz + 0.5, 9);
      // And the plane's edge (UV 0 and 1) is on a bay edge of the tile.
      expect(f(rptX) * bx % 1).toBeCloseTo(0, 9);
      expect(f(rptZ) * bz % 1).toBeCloseTo(0, 9);
    }
  });

  it('encodes normals in the glTF convention: red is -dh/du, green is +dh/drow (image up is +Y)', () => {
    const n = concreteNormal();
    const px = (c: number, r: number) => [n.rgb[(r * W + c) * 3]!, n.rgb[(r * W + c) * 3 + 1]!, n.rgb[(r * W + c) * 3 + 2]!];
    // On the shoulder of the left joint the surface rises toward +u: the normal leans to -u (red below 128).
    const shoulderPx = Math.round(((JOINT.width / 2 - JOINT.shoulder / 2) * W) / BAY.x);
    expect(px(shoulderPx, Math.floor(H / 3))[0]).toBeLessThan(110);
    // On the right joint it falls toward +u: red above 128.
    expect(px(W - 1 - shoulderPx, Math.floor(H / 3))[0]).toBeGreaterThan(146);
    // On the top joint's shoulder the surface rises down the image: green above 128.
    const shoulderRow = Math.round(((JOINT.width / 2 - JOINT.shoulder / 2) * H) / BAY.z);
    expect(px(Math.floor(W / 3), shoulderRow)[1]).toBeGreaterThan(146);
    // Flat slab: straight up.
    expect(px(Math.floor(W / 3), Math.floor(H / 3) + 7)[2]).toBeGreaterThan(250);
  });

  it('centres the grey on the fill, so the tint lands the mean on the concrete colour', () => {
    const c = concreteColor();
    const mean = c.grey.reduce((a, v) => a + v, 0) / c.grey.length;
    expect(Math.abs(mean - CONCRETE.fill)).toBeLessThan(1);
    const tint = concreteTint();
    expect(tint[3]).toBe(1);
    // #616466 is a touch cool: blue above green above red.
    expect(tint[2]).toBeGreaterThan(tint[1]);
    expect(tint[1]).toBeGreaterThan(tint[0]);
  });

  it('keeps roughness matte (0.6 to 1) everywhere', () => {
    const r = concreteRoughness();
    let min = 255, max = 0;
    for (const v of r.grey) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min / 255).toBeGreaterThan(0.6);
    expect(max).toBeLessThanOrEqual(255);
  });
});
