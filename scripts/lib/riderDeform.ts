// The High rider's deformation probe (ADR-101, 2026-11-13; FINAL review A5). Fits the real source onto the
// game's bind pose (src/asset/riderFit.ts), skins it on the CPU with the real pose code (feet.ts, legs.ts,
// body.ts) in the riding stance, the crouch, the pop, the tuck, the catch, touchdown and the recovery, both
// stances, and measures named edges and panels: the worst stretch and compression of their edges, the worst
// collapse of their triangles' areas, and how many hem points end up inside the trousers. Each length is taken
// against the current fit's rest and against a fixed baseline (the source as reviewed on 2026-11-13, kept as
// riderDeformBaseline.json), so a regenerated mesh cannot hide strain behind a new rest length.
//
// A diagnostic, not a gate on the look: today's numbers are a bad baseline (docs/research/2026-11-13-rider-deform.md).
//   npx tsx scripts/lib/riderDeform.ts            prints the table
//   npx tsx scripts/lib/riderDeform.ts --baseline <rider-source.glb>   rewrites the fixture from a source
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitRider, RIDER_HIGH_LEAF } from '../../src/asset/riderFit';
import { REGION } from '../../src/asset/riderSpec';
import { BONE, newBodyPose, RIDER_BONES, writeBindPose, writeBodyPose, type BodyPose, type BoneFrame } from '../../src/sim/body';
import { newFeetPose, writeFeetPose } from '../../src/sim/feet';
import { computeFlight } from '../../src/sim/flight';
import { newLegsPose, writeLegsPose } from '../../src/sim/legs';
import { presetById } from '../../src/sim/tricks';
import { readRiderSource } from './riderSource';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFORM_BASELINE = resolve(HERE, 'riderDeformBaseline.json');

/** The three edges the 2026-11-13 review measured (source vertex indices). */
export const NAMED_EDGES: readonly [number, number][] = [
  [13114, 13460],
  [13459, 13113],
  [13801, 13396],
];

export type Panel = 'seat' | 'innerThighs' | 'fly' | 'hem';
export const PANELS: readonly Panel[] = ['seat', 'innerThighs', 'fly', 'hem'];

/** Which vertices make each panel, from the bind pose (metres from the hip joints' height; our front is -Z). */
function panelOf(x: number, yHip: number, z: number, region: number, hemTop: number): Panel | null {
  if (region === REGION.trouser) {
    if (z > 0 && Math.abs(x) < 0.16 && yHip > -0.16 && yHip < 0.06) return 'seat';
    if (z < 0 && Math.abs(x) < 0.05 && yHip > -0.2 && yHip < 0.06) return 'fly';
    if (Math.abs(x) < 0.09 && yHip > -0.38 && yHip < -0.1) return 'innerThighs';
  }
  if (region === REGION.hoodie && yHip < hemTop) return 'hem';
  return null;
}

export interface Pose {
  name: string;
  stance: 'goofy' | 'regular';
  body: BodyPose;
}

/** The poses the probe sweeps: a clean kickflip at 0.35 m, both stances. */
export function probePoses(): Pose[] {
  const inputs = presetById('kickflip').inputs;
  const flight = computeFlight(inputs);
  const out: Pose[] = [];
  for (const stance of ['goofy', 'regular'] as const) {
    const at = (name: string, fl: typeof flight | null, u: number, ready = 1, after = 0) => {
      const feet = writeFeetPose(newFeetPose(), inputs, fl, u, stance);
      const legs = writeLegsPose(newLegsPose(), feet, fl, u, inputs, stance, ready, 0, after);
      out.push({ name, stance, body: writeBodyPose(newBodyPose(), legs, feet, fl, u, inputs, stance, ready, 0, after) });
    };
    at('riding', null, 0, 0);
    at('crouch', null, 0, 1);
    at('pop', flight, 0.1);
    at('tuck', flight, 0.45);
    at('catch', flight, 0.73);
    at('touchdown', flight, 1);
    at('recovery', flight, 1, 1, 0.5);
  }
  return out;
}

/** A bone's frame as a 4 x 4 (column-major) and its inverse, for skinning. */
function matrixOf(f: BoneFrame): number[] {
  return [f.x.x, f.x.y, f.x.z, 0, f.y.x, f.y.y, f.y.z, 0, f.z.x, f.z.y, f.z.z, 0, f.o.x, f.o.y, f.o.z, 1];
}
function rigidInverse(m: number[]): number[] {
  // [R | t] -> [R^T | -R^T t]
  const r = (row: number, col: number) => m[col * 4 + row]!;
  const t = [m[12]!, m[13]!, m[14]!];
  const out = new Array<number>(16).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out[j * 4 + i] = r(j, i);
  for (let i = 0; i < 3; i++) out[12 + i] = -(r(0, i) * t[0]! + r(1, i) * t[1]! + r(2, i) * t[2]!);
  out[15] = 1;
  return out;
}
function mul(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
  return out;
}

export interface Fitted {
  positions: Float32Array;
  joints: ArrayLike<number>;
  weights: ArrayLike<number>;
  regions: ArrayLike<number>;
  index: ArrayLike<number>;
}

export async function fitSource(path?: string): Promise<Fitted> {
  const file = await readRiderSource(path);
  const { geometry } = fitRider(file.source, writeBindPose(newBodyPose()), RIDER_HIGH_LEAF);
  return {
    positions: geometry.getAttribute('position').array as Float32Array,
    joints: geometry.getAttribute('skinIndex').array,
    weights: geometry.getAttribute('skinWeight').array,
    regions: geometry.getAttribute('region').array,
    index: geometry.getIndex()!.array,
  };
}

/** Every vertex skinned into a pose (linear blend, as three does). */
export function skin(f: Fitted, pose: BodyPose): Float32Array {
  const bind = writeBindPose(newBodyPose());
  const M = RIDER_BONES.map((_, i) => mul(matrixOf(pose.bones[i]!), rigidInverse(matrixOf(bind.bones[i]!))));
  const n = f.positions.length / 3;
  const out = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const x = f.positions[v * 3]!;
    const y = f.positions[v * 3 + 1]!;
    const z = f.positions[v * 3 + 2]!;
    let ox = 0;
    let oy = 0;
    let oz = 0;
    for (let k = 0; k < 4; k++) {
      const w = f.weights[v * 4 + k]!;
      if (!(w > 0)) continue;
      const m = M[f.joints[v * 4 + k]!]!;
      ox += w * (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!);
      oy += w * (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!);
      oz += w * (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!);
    }
    out[v * 3] = ox;
    out[v * 3 + 1] = oy;
    out[v * 3 + 2] = oz;
  }
  return out;
}

const dist = (p: ArrayLike<number>, a: number, b: number) => Math.hypot(p[a * 3]! - p[b * 3]!, p[a * 3 + 1]! - p[b * 3 + 1]!, p[a * 3 + 2]! - p[b * 3 + 2]!);
function area(p: ArrayLike<number>, a: number, b: number, c: number) {
  const ux = p[b * 3]! - p[a * 3]!;
  const uy = p[b * 3 + 1]! - p[a * 3 + 1]!;
  const uz = p[b * 3 + 2]! - p[a * 3 + 2]!;
  const vx = p[c * 3]! - p[a * 3]!;
  const vy = p[c * 3 + 1]! - p[a * 3 + 1]!;
  const vz = p[c * 3 + 2]! - p[a * 3 + 2]!;
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
}

/** The panels' vertices, edges and triangles, from the current fit's bind pose. */
export function panelsOf(f: Fitted) {
  const hipY = writeBindPose(newBodyPose()).bones[BONE.thighL]!.o.y;
  const p = f.positions;
  let hemLow = Infinity;
  for (let v = 0; v < f.regions.length; v++) if (f.regions[v] === REGION.hoodie) hemLow = Math.min(hemLow, p[v * 3 + 1]! - hipY);
  const of = new Array<Panel | null>(f.regions.length);
  for (let v = 0; v < of.length; v++) of[v] = panelOf(p[v * 3]!, p[v * 3 + 1]! - hipY, p[v * 3 + 2]!, f.regions[v]!, hemLow + 0.03);
  const edges = Object.fromEntries(PANELS.map((k) => [k, new Map<string, [number, number]>()])) as Record<Panel, Map<string, [number, number]>>;
  const tris = Object.fromEntries(PANELS.map((k) => [k, [] as [number, number, number][]])) as Record<Panel, [number, number, number][]>;
  for (let t = 0; t < f.index.length; t += 3) {
    const a = f.index[t]!;
    const b = f.index[t + 1]!;
    const c = f.index[t + 2]!;
    const k = of[a];
    if (!k || of[b] !== k || of[c] !== k) continue;
    tris[k].push([a, b, c]);
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const)
      edges[k].set(u < v ? `${u}:${v}` : `${v}:${u}`, [Math.min(u, v), Math.max(u, v)]);
  }
  return { of, edges, tris, hipY };
}

export interface PanelResult {
  edges: number;
  /** Posed length over rest length: the most, the least (current rest and the baseline's). */
  stretch: number;
  compress: number;
  stretchBaseline: number;
  compressBaseline: number;
  /** The smallest posed over rest triangle area. */
  collapse: number;
  /** Hem points more than 2 mm inside the trousers' surface (the hem panel only). */
  inside: number;
}

/** The baseline fixture: the reviewed source's fitted rest positions of the panels' vertices. */
export interface Baseline {
  source: string;
  positions: Record<string, [number, number, number]>;
}

export function measure(f: Fitted, base: Baseline, poses: Pose[]) {
  const P = panelsOf(f);
  const restBase = (i: number) => base.positions[String(i)];
  const lenBase = (a: number, b: number) => {
    const pa = restBase(a);
    const pb = restBase(b);
    return pa && pb ? Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) : NaN;
  };
  // The trousers, for the hem's inside test: each jeans vertex with its rest normal estimated from its triangles.
  const jeans: number[] = [];
  for (let v = 0; v < f.regions.length; v++) if (f.regions[v] === REGION.trouser) jeans.push(v);
  const rows: { pose: string; stance: string; panel: Panel | 'named'; r: PanelResult }[] = [];
  for (const pose of poses) {
    const q = skin(f, pose.body);
    for (const k of PANELS) {
      let stretch = 0;
      let compress = Infinity;
      let sb = 0;
      let cb = Infinity;
      for (const [a, b] of P.edges[k].values()) {
        const now = dist(q, a, b);
        const rest = dist(f.positions, a, b);
        if (rest > 1e-6) {
          stretch = Math.max(stretch, now / rest);
          compress = Math.min(compress, now / rest);
        }
        const rb = lenBase(a, b);
        if (rb > 1e-6) {
          sb = Math.max(sb, now / rb);
          cb = Math.min(cb, now / rb);
        }
      }
      let collapse = Infinity;
      for (const [a, b, c] of P.tris[k]) {
        const r = area(f.positions, a, b, c);
        if (r > 1e-9) collapse = Math.min(collapse, area(q, a, b, c) / r);
      }
      let inside = 0;
      if (k === 'hem') {
        const hem = [...new Set([...P.edges.hem.values()].flat())];
        // Nearest posed jeans vertex and the direction out from the pelvis there: a hem point behind it is inside.
        const pelvis = pose.body.bones[BONE.pelvis]!.o;
        for (const h of hem) {
          let best = Infinity;
          let j = -1;
          for (const v of jeans) {
            const d = (q[v * 3]! - q[h * 3]!) ** 2 + (q[v * 3 + 1]! - q[h * 3 + 1]!) ** 2 + (q[v * 3 + 2]! - q[h * 3 + 2]!) ** 2;
            if (d < best) {
              best = d;
              j = v;
            }
          }
          if (j < 0) continue;
          const ox = q[j * 3]! - pelvis.x;
          const oz = q[j * 3 + 2]! - pelvis.z;
          const ol = Math.hypot(ox, oz) || 1;
          const depth = ((q[h * 3]! - q[j * 3]!) * ox + (q[h * 3 + 2]! - q[j * 3 + 2]!) * oz) / ol;
          if (depth < -0.002) inside++;
        }
      }
      rows.push({ pose: pose.name, stance: pose.stance, panel: k, r: { edges: P.edges[k].size, stretch, compress, stretchBaseline: sb, compressBaseline: cb, collapse, inside } });
    }
    let stretch = 0;
    let compress = Infinity;
    let sb = 0;
    let cb = Infinity;
    for (const [a, b] of NAMED_EDGES) {
      const now = dist(q, a, b);
      const rest = dist(f.positions, a, b);
      stretch = Math.max(stretch, now / rest);
      compress = Math.min(compress, now / rest);
      const rb = lenBase(a, b);
      sb = Math.max(sb, now / rb);
      cb = Math.min(cb, now / rb);
    }
    rows.push({ pose: pose.name, stance: pose.stance, panel: 'named', r: { edges: NAMED_EDGES.length, stretch, compress, stretchBaseline: sb, compressBaseline: cb, collapse: NaN, inside: 0 } });
  }
  return rows;
}

export const readBaseline = (): Baseline => JSON.parse(readFileSync(DEFORM_BASELINE, 'utf8')) as Baseline;

/** The fixture from a source: the panels' and the named edges' vertices, at their fitted rest, to 0.01 mm. */
export async function writeBaseline(path: string, label: string) {
  const f = await fitSource(path);
  const P = panelsOf(f);
  const keep = new Set<number>(NAMED_EDGES.flat());
  for (const k of PANELS)
    for (const [a, b] of P.edges[k].values()) {
      keep.add(a);
      keep.add(b);
    }
  const positions: Baseline['positions'] = {};
  for (const v of [...keep].sort((a, b) => a - b)) positions[String(v)] = [0, 1, 2].map((i) => Math.round(f.positions[v * 3 + i]! * 1e5) / 1e5) as [number, number, number];
  writeFileSync(DEFORM_BASELINE, JSON.stringify({ source: label, positions }) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--baseline');
  if (i > 0) {
    await writeBaseline(process.argv[i + 1]!, process.argv[i + 2] ?? 'rider-source.glb');
  } else {
    const rows = measure(await fitSource(), readBaseline(), probePoses());
    const f = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '-');
    console.log('| Pose | Stance | Panel | Edges | Stretch | Compress | Stretch (baseline rest) | Compress (baseline rest) | Area collapse | Hem inside |');
    console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const { pose, stance, panel, r } of rows)
      console.log(`| ${pose} | ${stance} | ${panel} | ${r.edges} | ${f(r.stretch)} | ${f(r.compress)} | ${f(r.stretchBaseline)} | ${f(r.compressBaseline)} | ${f(r.collapse)} | ${panel === 'hem' ? r.inside : ''} |`);
  }
}
