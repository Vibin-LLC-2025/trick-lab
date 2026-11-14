// The tee's hem in High's rider source (ADR-101, 2026-11-13). make_rider.py
// squeezes the tee's lower band up to HEM_ABOVE_HIP over the hip joints; until
// 2026-11-13 the band's top stood 6.7 mm under that target, so the squeeze
// factor was negative and the band folded inside out (the black ring at the
// waist). These checks read what the script wrote beside its output and the
// real exported source: every column's factor in (0, 1], and in the source's
// hem no shirt triangle folded back on its neighbours or collapsed, and the
// lowest shirt edge one closed loop. The posed checks are riderDeform.test.ts's.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { RIDER_SOURCE_GLB, readRiderSource, type RiderSourceFile } from './riderSource';

const HEM_REPORT = resolve(RIDER_SOURCE_GLB, '..', 'rider-hem.json');
const SHIRT = 1;

interface HemReport {
  hip: number;
  target: number;
  top: number;
  moved: number;
  columns: { low: number; factor: number; filled: boolean }[];
}

/** One index per position, so the UV seams' duplicate vertices are one point (to 0.01 mm). */
function weld(pos: Float32Array): Uint32Array {
  const ids = new Map<string, number>();
  const out = new Uint32Array(pos.length / 3);
  for (let i = 0; i < out.length; i++) {
    const key = `${Math.round(pos[i * 3]! * 1e5)},${Math.round(pos[i * 3 + 1]! * 1e5)},${Math.round(pos[i * 3 + 2]! * 1e5)}`;
    let id = ids.get(key);
    if (id === undefined) ids.set(key, (id = ids.size));
    out[i] = id;
  }
  return out;
}

/** The shirt's triangles whose every corner lies between `lo` and `hi` (source Y, metres): corners, welded corners, unit normals and areas. */
function shirtBand(src: RiderSourceFile['source'], lo: number, hi: number) {
  const { positions: p, regions, index } = src;
  const welded = weld(p);
  const tris: { v: [number, number, number]; w: [number, number, number]; n: [number, number, number]; area: number }[] = [];
  for (let t = 0; t < index.length; t += 3) {
    const v = [index[t]!, index[t + 1]!, index[t + 2]!] as [number, number, number];
    if (v.some((i) => regions[i] !== SHIRT)) continue;
    if (v.some((i) => p[i * 3 + 1]! < lo || p[i * 3 + 1]! > hi)) continue;
    const [a, b, c] = v.map((i) => [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!]) as [number[], number[], number[]];
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
    const w = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    const n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
    const len = Math.hypot(n[0]!, n[1]!, n[2]!);
    tris.push({ v, w: v.map((i) => welded[i]!) as [number, number, number], n: [n[0]! / len, n[1]! / len, n[2]! / len], area: len / 2 });
  }
  return tris;
}

const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

describe('the tee hem in the rider source (ADR-101)', () => {
  let report: HemReport;
  let file: RiderSourceFile;
  beforeAll(async () => {
    report = JSON.parse(readFileSync(HEM_REPORT, 'utf8')) as HemReport;
    file = await readRiderSource();
  });

  it('has its report beside the source', () => {
    expect(existsSync(HEM_REPORT)).toBe(true);
  });

  it('squeezes every column by a factor in (0, 1] into a band at least 5 cm tall, the lowest point onto the target', () => {
    expect(report.top - report.target).toBeGreaterThanOrEqual(0.05);
    expect(report.columns).toHaveLength(48);
    expect(report.moved).toBeGreaterThan(0);
    for (const c of report.columns) {
      expect(c.factor).toBeGreaterThan(0);
      expect(c.factor).toBeLessThanOrEqual(1);
      expect(c.low).toBeLessThan(report.top);
      // Order kept: the column's lowest point ends on the target, the band's top stays where it was.
      expect(report.top - (report.top - c.low) * c.factor).toBeCloseTo(report.target, 6);
    }
  });

  it('places the hem in the source where the report says, above the hips', () => {
    const hip = file.source.jointPositions[file.source.jointNames.indexOf('thigh_l')]!;
    expect(hip[1]).toBeCloseTo(report.hip, 3);
    const { positions: p, regions } = file.source;
    let lowest = Infinity;
    for (let i = 0; i < regions.length; i++) if (regions[i] === SHIRT) lowest = Math.min(lowest, p[i * 3 + 1]!);
    expect(lowest).toBeGreaterThan(report.target - 1e-4);
  });

  it('has no shirt triangle in the hem folded back on a neighbour or collapsed', () => {
    const tris = shirtBand(file.source, report.target - 0.01, report.top + 0.02);
    expect(tris.length).toBeGreaterThan(100);
    const byEdge = new Map<string, number[]>();
    tris.forEach((t, k) => {
      for (const [a, b] of [
        [t.w[0], t.w[1]],
        [t.w[1], t.w[2]],
        [t.w[2], t.w[0]],
      ] as const)
        byEdge.set(edgeKey(a, b), [...(byEdge.get(edgeKey(a, b)) ?? []), k]);
    });
    let worst = 1;
    for (const ks of byEdge.values()) {
      if (ks.length !== 2) continue;
      const a = tris[ks[0]!]!.n;
      const b = tris[ks[1]!]!.n;
      worst = Math.min(worst, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!);
    }
    // The suit's hem has a turned-back edge of its own: unsqueezed, its neighbours meet at up to 105 degrees (a dot of
    // -0.26, 2026-11-13), squeezed into the band at up to 121 (-0.51). The band folded inside out met at 165 to 180
    // (-0.96 to -1.00), which this tells apart.
    expect(worst).toBeGreaterThan(-0.6);
    for (const t of tris) expect(t.area).toBeGreaterThan(1e-8);
  });

  it('faces out round the torso above the hem edge', () => {
    const tris = shirtBand(file.source, report.target + 0.01, report.top);
    const p = file.source.positions;
    let cx = 0;
    let cz = 0;
    for (const t of tris)
      for (const i of t.v) {
        cx += p[i * 3]!;
        cz += p[i * 3 + 2]!;
      }
    cx /= tris.length * 3;
    cz /= tris.length * 3;
    let inward = 0;
    for (const t of tris) {
      const mx = t.v.reduce((s, i) => s + p[i * 3]!, 0) / 3 - cx;
      const mz = t.v.reduce((s, i) => s + p[i * 3 + 2]!, 0) / 3 - cz;
      if (t.n[0] * mx + t.n[2] * mz < 0) inward++;
    }
    expect(tris.length).toBeGreaterThan(100);
    expect(inward).toBe(0);
  });

  it("ends in one closed loop: the shirt's lowest edge", () => {
    const tris = shirtBand(file.source, -Infinity, report.target + 0.03);
    const count = new Map<string, number>();
    for (const t of tris)
      for (const [a, b] of [
        [t.w[0], t.w[1]],
        [t.w[1], t.w[2]],
        [t.w[2], t.w[0]],
      ] as const)
        count.set(edgeKey(a, b), (count.get(edgeKey(a, b)) ?? 0) + 1);
    // The open edges of the band, low down only (the band's own top edge is cut by the window, so stay under it).
    const { positions: p } = file.source;
    const welded = weld(p);
    const height = new Map<number, number>();
    for (let i = 0; i < welded.length; i++) height.set(welded[i]!, p[i * 3 + 1]!);
    const open = [...count].filter(([k, n]) => n === 1 && k.split(':').every((v) => height.get(Number(v))! < report.target + 0.015)).map(([k]) => k.split(':').map(Number) as [number, number]);
    expect(open.length).toBeGreaterThan(20);
    const next = new Map<number, number[]>();
    for (const [a, b] of open) {
      next.set(a, [...(next.get(a) ?? []), b]);
      next.set(b, [...(next.get(b) ?? []), a]);
    }
    for (const ns of next.values()) expect(ns).toHaveLength(2);
    // One loop: walking from any point visits every point.
    const start = open[0]![0];
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length)
      for (const n of next.get(stack.pop()!)!)
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
    expect(seen.size).toBe(next.size);
  });
});
