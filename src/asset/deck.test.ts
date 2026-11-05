import { describe, expect, it } from 'vitest';
import { Box3, type BufferGeometry, Vector3 } from 'three';
import { buildDeck, halfWidth, kickHeight, midSurface, RING_POINTS, ringPoints, surfaceNormal } from './deck';
import { CONCAVE, DECK, DECK_DETAIL, KICK, OUTLINE, RINGS } from './spec';

const deck = buildDeck();
const groups = Object.values(deck.groups);

function bounds(geos: BufferGeometry[]) {
  const box = new Box3();
  for (const g of geos) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  return box;
}

/** Every vertex has a z mirror within 1 micron (spatial hash with neighbour lookup). */
function zSymmetric(g: BufferGeometry) {
  const p = g.getAttribute('position');
  const cell = 1e-4;
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < p.count; i++) {
    const k = key(p.getX(i), p.getY(i), p.getZ(i));
    grid.set(k, [...(grid.get(k) ?? []), i]);
  }
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = -p.getZ(i);
    let found = false;
    for (let dx = -1; dx <= 1 && !found; dx++)
      for (let dy = -1; dy <= 1 && !found; dy++)
        for (let dz = -1; dz <= 1 && !found; dz++) {
          const k = `${Math.floor(x / cell) + dx},${Math.floor(y / cell) + dy},${Math.floor(z / cell) + dz}`;
          found = (grid.get(k) ?? []).some((j) => Math.hypot(p.getX(j) - x, p.getY(j) - y, p.getZ(j) - z) < 1e-6);
        }
    if (!found) return false;
  }
  return true;
}

describe('deck outline (DESIGN.md 7.2)', () => {
  it('matches the design check values for the half width', () => {
    const checks: [number, number][] = [
      [-0.39, 0.0394],
      [-0.36, 0.074],
      [-0.3, 0.0955],
      [-0.25, 0.0987],
      [0, 0.1016],
      [0.26, 0.0985],
      [0.32, 0.0923],
      [0.38, 0.0637],
      [0.4, 0.0396],
    ];
    for (const [x, w] of checks) expect(Math.abs(halfWidth(x) - w), `x = ${x}`).toBeLessThan(1.5e-4);
  });

  it('is 0.8065 m long and 0.2032 m wide within 2 mm, as built', () => {
    const box = bounds(groups);
    expect(Math.abs(box.max.x - box.min.x - OUTLINE.length)).toBeLessThan(0.002);
    expect(Math.abs(box.max.z - box.min.z - OUTLINE.width)).toBeLessThan(0.002);
  });

  it('has a nose 12.5 mm longer than the tail (measured from the deck centre)', () => {
    expect(OUTLINE.noseTip + OUTLINE.tailTip).toBeCloseTo(0.0125, 6);
  });

  it('is left/right (z) symmetric; nose and tail are meant to differ, so x is not tested', () => {
    for (const g of groups) expect(zSymmetric(g)).toBe(true);
  });
});

describe('kicks and concave (DESIGN.md 7.2)', () => {
  const slopeDeg = (x: number) => (Math.atan((midSurface(x + 1e-6, 0) - midSurface(x - 1e-6, 0)) / 2e-6) * 180) / Math.PI;

  it('reaches the design tip heights and the check values', () => {
    expect(kickHeight(OUTLINE.noseTip)).toBeCloseTo(KICK.nose.tipHeight, 4);
    expect(kickHeight(OUTLINE.tailTip)).toBeCloseTo(KICK.tail.tipHeight, 4);
    const nose = (s: number) => kickHeight(KICK.start + s * KICK.nose.length);
    const tail = (s: number) => kickHeight(-(KICK.start + s * KICK.tail.length));
    expect(nose(0.25)).toBeCloseTo(0.0034, 4);
    expect(nose(0.5)).toBeCloseTo(0.0126, 4);
    expect(nose(0.75)).toBeCloseTo(0.0257, 4);
    expect(tail(0.25)).toBeCloseTo(0.0032, 4);
    expect(tail(0.5)).toBeCloseTo(0.0115, 4);
    expect(tail(0.75)).toBeCloseTo(0.0234, 4);
  });

  it('kicks up to 20 deg at the nose and 19 deg at the tail, within 0.5 deg', () => {
    expect(Math.abs(slopeDeg(OUTLINE.noseTip - 1e-5) - 20)).toBeLessThan(0.5);
    expect(Math.abs(-slopeDeg(OUTLINE.tailTip + 1e-5) - 19)).toBeLessThan(0.5);
  });

  it('starts each kick with zero slope and keeps curving up (no crease, no flat spots)', () => {
    expect(Math.abs(slopeDeg(KICK.start))).toBeLessThan(0.05);
    expect(Math.abs(slopeDeg(-KICK.start))).toBeLessThan(0.05);
    expect(kickHeight(0.1)).toBe(0);
    let prev = slopeDeg(KICK.start);
    for (let x = KICK.start + 0.01; x < OUTLINE.noseTip; x += 0.01) {
      const s = slopeDeg(x);
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
  });

  it('has 12 mm of concave across the width in the flat', () => {
    expect(midSurface(0, OUTLINE.middle.halfWidth) - midSurface(0, 0)).toBeCloseTo(CONCAVE.depth, 6);
  });

  it('is 11.5 mm thick on the centreline in the flat', () => {
    const p = deck.groups.grip.getAttribute('position');
    const q = deck.groups.graphic.getAttribute('position');
    const nearest = (attr: typeof p) => {
      let best = { d: Infinity, y: 0 };
      for (let i = 0; i < attr.count; i++) {
        const d = Math.hypot(attr.getX(i), attr.getZ(i));
        if (d < best.d) best = { d, y: attr.getY(i) };
      }
      return best.y;
    };
    expect(nearest(p) - nearest(q)).toBeCloseTo(DECK.thickness, 5);
  });

  it('has an upward surface normal everywhere on the mid surface', () => {
    for (let x = OUTLINE.tailTip; x <= OUTLINE.noseTip; x += 0.02)
      for (const z of [-0.09, 0, 0.09]) expect(surfaceNormal(x, z)[1]).toBeGreaterThan(0.9);
  });
});

describe('deck mesh', () => {
  it('has the expected rings and triangle count, with the zero-area spine-tip triangles dropped and counted', () => {
    expect(RINGS).toHaveLength(20);
    expect(RING_POINTS).toBe(144);
    const tris = groups.reduce((n, g) => n + g.index!.count / 3, 0);
    // 19 bands of 144 quads; the top spine shares its tip points with ring 1, so 4 triangles per side of the tips are zero-area.
    expect(deck.droppedTriangles).toBe(8);
    expect(tris).toBe(19 * 288 - 8);
  });

  it('has no zero-area triangles and no NaN anywhere', () => {
    for (const g of groups) {
      for (const name of ['position', 'normal', 'uv']) {
        expect(Array.from(g.getAttribute(name).array).every(Number.isFinite), name).toBe(true);
      }
      const p = g.getAttribute('position');
      const idx = g.index!.array;
      const a = new Vector3(), b = new Vector3(), c = new Vector3();
      for (let i = 0; i < idx.length; i += 3) {
        a.fromBufferAttribute(p, idx[i]!);
        b.fromBufferAttribute(p, idx[i + 1]!);
        c.fromBufferAttribute(p, idx[i + 2]!);
        expect(b.sub(a).cross(c.sub(a)).length()).toBeGreaterThan(1e-12);
      }
    }
  });

  it('grip normals point +Y (y > 0.99 in the middle of the flat), graphic normals point -Y', () => {
    const grip = deck.groups.grip;
    const gp = grip.getAttribute('position');
    const gn = grip.getAttribute('normal');
    for (let i = 0; i < gp.count; i++) {
      expect(gn.getY(i)).toBeGreaterThan(0);
      if (Math.abs(gp.getX(i)) < 0.2 && Math.abs(gp.getZ(i)) < 0.06) expect(gn.getY(i)).toBeGreaterThan(0.99);
    }
    const bn = deck.groups.graphic.getAttribute('normal');
    for (let i = 0; i < bn.count; i++) expect(bn.getY(i)).toBeLessThan(0);
  });

  it('winds every triangle outward (face normal agrees with the smooth vertex normal)', () => {
    const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3();
    for (const g of groups) {
      const p = g.getAttribute('position');
      const nor = g.getAttribute('normal');
      const idx = g.index!.array;
      for (let i = 0; i < idx.length; i += 3) {
        a.fromBufferAttribute(p, idx[i]!);
        b.fromBufferAttribute(p, idx[i + 1]!).sub(a);
        c.fromBufferAttribute(p, idx[i + 2]!).sub(a);
        n.fromBufferAttribute(nor, idx[i]!);
        expect(b.cross(c).dot(n)).toBeGreaterThan(0);
      }
    }
  });

  it('puts the graphic the right way round: nose at u = 1, toe side (+z) at v = 0', () => {
    const g = deck.groups.graphic;
    const p = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      if (p.getX(i) > 0.39) expect(u).toBeGreaterThan(0.97);
      // The bottom rings sit up to 1.3 mm outboard of their plan z (normal offset over the concave); UVs use plan z.
      if (p.getZ(i) > 0.09) expect(v).toBeLessThan(0.07);
      if (p.getZ(i) < -0.09) expect(v).toBeGreaterThan(0.93);
    }
  });

  it('maps the wood edge from the top ply (v = 0) to the bottom ply (v = 1)', () => {
    const uv = deck.groups.wood.getAttribute('uv');
    const vs = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
    expect(Math.min(...vs)).toBeCloseTo(0, 6);
    expect(Math.max(...vs)).toBeCloseTo(1, 6);
  });
});

describe('high-detail deck (quality tiers, 2026-11-04)', () => {
  const high = buildDeck('high');
  const highGroups = Object.values(high.groups);
  const { intervals, rings } = DECK_DETAIL.high;

  it('doubles the outline intervals and adds flat rings and bevel steps, with the same groups in the same order', () => {
    expect(intervals).toBe(48);
    expect(ringPoints(intervals)).toBe(288);
    expect(rings.length).toBeGreaterThan(RINGS.length);
    const groupsInOrder = rings.map((r) => r.group).filter((g, i, a) => i === 0 || g !== a[i - 1]);
    expect(groupsInOrder).toEqual(['grip', 'wood', 'graphic']);
    expect(rings[0]!.spine && rings[rings.length - 1]!.spine).toBe(true);
    // Six bevel steps per side: 0, 18, 36, 54, 72, 90 deg, from the bevel top (inset 4 mm) to the wall (inset 0).
    const bevel = rings.filter((r) => r.group === 'wood');
    expect(bevel[0]).toMatchObject({ d: 0.004, h: 0.00575 });
    expect(bevel[5]).toMatchObject({ d: 0, h: 0.00175 });
    expect(bevel[6]).toMatchObject({ d: 0, h: -0.00175 });
  });

  it('has the same size, symmetry and thickness as the medium deck, with more triangles', () => {
    const box = bounds(highGroups);
    expect(Math.abs(box.max.x - box.min.x - OUTLINE.length)).toBeLessThan(0.002);
    expect(Math.abs(box.max.z - box.min.z - OUTLINE.width)).toBeLessThan(0.002);
    for (const g of highGroups) expect(zSymmetric(g)).toBe(true);
    const tris = highGroups.reduce((n, g) => n + g.index!.count / 3, 0);
    expect(tris).toBe((rings.length - 1) * 2 * 288 - high.droppedTriangles);
    expect(tris).toBeGreaterThan(3 * (19 * 288 - 8));
    for (const g of highGroups)
      for (const name of ['position', 'normal', 'uv']) expect(Array.from(g.getAttribute(name).array).every(Number.isFinite), name).toBe(true);
  });

  it('keeps the grip facing +Y and the graphic facing -Y', () => {
    const gn = high.groups.grip.getAttribute('normal');
    for (let i = 0; i < gn.count; i++) expect(gn.getY(i)).toBeGreaterThan(0);
    const bn = high.groups.graphic.getAttribute('normal');
    for (let i = 0; i < bn.count; i++) expect(bn.getY(i)).toBeLessThan(0);
  });
});
