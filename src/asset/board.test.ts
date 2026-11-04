import { describe, expect, it } from 'vitest';
import { Box3, type BufferGeometry } from 'three';
import { boardTriangles, buildBoard } from './board';
import { buildBolts, buildWheel } from './hardware';
import { BUDGET, OUTLINE, PARTS, REST_Y, TRUCK, WHEEL } from './spec';

const board = buildBoard();
const box = (g: BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!.clone();
};

describe('board assembly (DESIGN.md 7.1 to 7.5)', () => {
  it('rests at 0.08425 m: the wheel bottoms touch y = 0 with the group at restY', () => {
    expect(REST_Y).toBeCloseTo(0.08425, 8);
    expect(box(board.parts.Wheels).min.y + REST_Y).toBeCloseTo(0, 6);
    // Nothing else hangs lower than the wheels.
    for (const p of PARTS) expect(box(board.parts[p.node]).min.y, p.node).toBeGreaterThanOrEqual(-REST_Y - 1e-6);
  });

  it('is one geometry per material, within the draw call and triangle budgets', () => {
    expect(PARTS.length).toBe(7);
    expect(PARTS.length).toBeLessThanOrEqual(BUDGET.drawCalls);
    const tris = boardTriangles(board);
    const total = Object.values(tris).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(BUDGET.triangles);
    // The design's target band is 11,000 to 13,000; the rounded boxes and the 20th deck ring put it a little over.
    expect(total).toBeGreaterThan(11000);
    expect(total).toBeLessThan(15000);
    expect(tris.Wheels).toBe(4 * WHEEL.radialSegments * (WHEEL.profile.length - 1) * 2);
  });

  it('has no NaN in any attribute', () => {
    for (const p of PARTS) {
      const g = board.parts[p.node];
      for (const name of Object.keys(g.attributes))
        expect(Array.from(g.getAttribute(name).array).every(Number.isFinite), `${p.node}.${name}`).toBe(true);
    }
  });

  it('is z symmetric overall and the trucks mirror each other in x', () => {
    const all = new Box3();
    for (const p of PARTS) all.union(box(board.parts[p.node]));
    expect(all.max.z + all.min.z).toBeCloseTo(0, 6);
    const al = box(board.parts.Truck_Aluminium);
    expect(al.max.x + al.min.x).toBeCloseTo(0, 6);
    const wheels = box(board.parts.Wheels);
    expect(wheels.max.x + wheels.min.x).toBeCloseTo(0, 6);
  });

  it('has the new-school bolt pattern and a 14.25 in (0.362 m) wheelbase between the inner holes', () => {
    const centres = buildBolts().map((g) => {
      const b = box(g);
      return [(b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2] as const;
    });
    expect(centres).toHaveLength(8);
    const xs = [...new Set(centres.map(([x]) => Math.round(x * 1e4) / 1e4))].sort((a, b) => a - b);
    expect(xs).toEqual([-0.235, -0.181, 0.181, 0.235]);
    expect(xs[2]! - xs[1]!).toBeCloseTo(0.362, 6);
    expect(xs[3]! - xs[2]!).toBeCloseTo(0.054, 6);
    const zs = [...new Set(centres.map(([, z]) => Math.round(z * 1e4) / 1e4))].sort((a, b) => a - b);
    expect(zs[1]! - zs[0]!).toBeCloseTo(0.041, 6);
  });

  it('keeps the axle (0.203 m end to end) inside the deck width and the wheels clear of the deck', () => {
    const steel = box(board.parts.Truck_Steel);
    expect(steel.max.z - steel.min.z).toBeCloseTo(TRUCK.axle.length, 4);
    expect(steel.max.z).toBeLessThan(OUTLINE.width / 2);
    // Wheel top at -0.03125 leaves 25 mm under the deck bottom: no wheel bite at any pose.
    expect(box(board.parts.Wheels).max.y).toBeCloseTo(-0.03125, 5);
    expect(TRUCK.deckBottom - box(board.parts.Wheels).max.y).toBeGreaterThan(0.02);
  });
});

describe('wheel lathe (DESIGN.md 7.5)', () => {
  const wheel = buildWheel(WHEEL.centerX, 1);
  const pos = wheel.getAttribute('position');
  const uv = wheel.getAttribute('uv');

  it('is 53 mm across and 32 mm wide, centred on its axle', () => {
    const b = box(wheel);
    expect(b.max.y - b.min.y).toBeCloseTo(2 * WHEEL.radius, 5);
    expect(b.max.z - b.min.z).toBeCloseTo(WHEEL.width, 5);
    expect((b.max.z + b.min.z) / 2).toBeCloseTo(WHEEL.centerZ, 6);
  });

  it('assigns v by point index, not arc length (the band texture depends on it)', () => {
    const vs = new Set<number>();
    for (let i = 0; i < uv.count; i++) vs.add(Math.round(uv.getY(i) * 15 * 1e6) / 1e6);
    expect([...vs].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, k) => k));
  });

  it('has an 18 mm flat contact patch at full radius', () => {
    const zs: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i) - WHEEL.centerX, pos.getY(i) - WHEEL.centerY);
      if (Math.abs(r - WHEEL.radius) < 1e-6) zs.push(pos.getZ(i) - WHEEL.centerZ);
    }
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.018, 6);
  });

  it('faces its outer bearing outboard on both sides of the board', () => {
    for (const side of [1, -1] as const) {
      const w = buildWheel(WHEEL.centerX, side);
      const p = w.getAttribute('position');
      const v = w.getAttribute('uv');
      // The last profile point (v = 1) is the outer bearing face, which sits outboard of the wheel centre.
      for (let i = 0; i < p.count; i++) if (v.getY(i) === 1) expect(Math.sign(p.getZ(i) - side * WHEEL.centerZ)).toBe(side);
    }
  });
});
