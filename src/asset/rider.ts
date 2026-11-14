// The rider's body (ADR-85, 2026-11-11), built in code round the bind pose of
// src/sim/body.ts: one skinned mesh, every part a loft of rings (a tube along
// a bone chain, or rings stacked up the body) so each knee, elbow, hip and
// the spine bends without a seam, its skin weights blended smoothly across
// each joint. The right arm and leg are built and mirrored for the left, so
// the body is exactly symmetric, as body.ts's mirror for regular needs.
// scripts/lib/build.ts writes it to public/models/rider.glb. No React, no
// store, nothing from src/scene; three only for the geometry container.
import { BufferAttribute, BufferGeometry, Uint16BufferAttribute } from 'three';
import { BODY, BONE, MIRROR_BONE, newBodyPose, writeBindPose, type BodyPose, type BoneFrame } from '../sim/body';
import { LEG } from '../sim/legs';
import { BEANIE, HAIR, HEAD, HEM_FOOT, HOODIE, MITTEN, NECK, REGION, RIDER_MESH, RIDER_UV, SEAT, TORSO, TROUSER } from './riderSpec';

type V3 = [number, number, number];
/** Bone influences before they are sorted, merged and cut to four. */
type Infl = [number, number][];
interface Vtx {
  p: V3;
  u: number;
  v: number;
  region: number;
  w: Infl;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const smooth = (a: number, b: number, x: number) => {
  const s = clamp01((x - a) / (b - a));
  return s * s * (3 - 2 * s);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crossV = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};
const v3 = (p: { x: number; y: number; z: number }): V3 => [p.x, p.y, p.z];
/** A bone's local point in the bind pose. */
const local = (f: BoneFrame, x: number, y: number, z: number): V3 => [
  f.o.x + f.x.x * x + f.y.x * y + f.z.x * z,
  f.o.y + f.x.y * x + f.y.y * y + f.z.y * z,
  f.o.z + f.x.z * x + f.y.z * y + f.z.z * z,
];
/** A superellipse's cos or sin, |t|^(2/n) with its sign: n 2 is a circle, more is squarer. */
const sq = (t: number, n: number) => Math.sign(t) * Math.abs(t) ** (2 / n);
/** The cloth's coordinates (riderSpec RIDER_UV), in tiles, into the [0, 1] the file stores. */
const UVS = RIDER_UV.span;
const FLAT = { u: RIDER_UV.flat.u, v: RIDER_UV.flat.v };

/** Piecewise linear in a list of keys sorted by `at`. */
function interp<T extends Record<string, number>>(keys: readonly T[], at: keyof T, x: number): T {
  const out = {} as Record<string, number>;
  let i = 0;
  while (i < keys.length - 2 && x > keys[i + 1]![at]!) i++;
  const a = keys[i]!;
  const b = keys[i + 1]!;
  const t = b[at] === a[at] ? 0 : clamp01((x - a[at]!) / (b[at]! - a[at]!));
  for (const k of Object.keys(a)) out[k] = lerp(a[k]!, b[k]!, t);
  return out as T;
}

/** Samples between a list of key positions, at most `step` apart, keys included (a repeated key stays repeated: a step in the profile). */
function samples(keys: readonly number[], step: number): number[] {
  const out: number[] = [keys[0]!];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    const n = Math.max(1, Math.ceil(Math.abs(b - a) / step));
    for (let k = 1; k <= n; k++) out.push(lerp(a, b, k / n));
  }
  return out;
}

/** The mesh being built: flat arrays, one entry per vertex. */
class Mesh {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  joints: number[] = [];
  weights: number[] = [];
  region: number[] = [];
  index: number[] = [];

  /**
   * A loft: `rings` of N + 1 vertices each (the last repeats the first's
   * place with the cloth's coordinate carried on, so the texture does not
   * run backwards across the seam). Normals are smooth, summed round the
   * closed ring; a ring that is a single point (an end) shares one normal;
   * faces are turned to point away from each ring's centre.
   */
  loft(rings: Vtx[][]) {
    const K = rings.length;
    const N = rings[0]!.length - 1;
    const P = (k: number, j: number) => rings[k]![j % N]!.p;
    const pole = rings.map((r) => r.every((v) => Math.hypot(v.p[0] - r[0]!.p[0], v.p[1] - r[0]!.p[1], v.p[2] - r[0]!.p[2]) < 1e-9));
    const acc = new Float64Array(K * N * 3);
    const tris: [number, number, number, number, number, number][] = [];
    const face = (ka: number, ja: number, kb: number, jb: number, kc: number, jc: number) => {
      const a = P(ka, ja);
      const n = crossV(sub(P(kb, jb), a), sub(P(kc, jc), a));
      for (const [k, j] of [
        [ka, ja],
        [kb, jb],
        [kc, jc],
      ] as const) {
        const i = (k * N + (j % N)) * 3;
        acc[i]! += n[0];
        acc[i + 1]! += n[1];
        acc[i + 2]! += n[2];
      }
      tris.push([ka, ja, kb, jb, kc, jc]);
    };
    for (let k = 0; k < K - 1; k++)
      for (let j = 0; j < N; j++) {
        if (!pole[k + 1]) face(k, j, k + 1, j, k + 1, j + 1);
        if (!pole[k]) face(k, j, k + 1, j + 1, k, j + 1);
      }
    for (let k = 0; k < K; k++) {
      if (!pole[k]) continue;
      let x = 0, y = 0, z = 0;
      for (let j = 0; j < N; j++) {
        x += acc[(k * N + j) * 3]!;
        y += acc[(k * N + j) * 3 + 1]!;
        z += acc[(k * N + j) * 3 + 2]!;
      }
      for (let j = 0; j < N; j++) acc.set([x, y, z], (k * N + j) * 3);
    }
    // Outward: the summed normals against each vertex's offset from its ring's centre.
    let out = 0;
    for (let k = 0; k < K; k++) {
      const c = [0, 0, 0] as V3;
      for (let j = 0; j < N; j++) for (let a = 0; a < 3; a++) c[a]! += P(k, j)[a]! / N;
      for (let j = 0; j < N; j++) {
        const d = sub(P(k, j), c);
        out += d[0] * acc[(k * N + j) * 3]! + d[1] * acc[(k * N + j) * 3 + 1]! + d[2] * acc[(k * N + j) * 3 + 2]!;
      }
    }
    const flip = out < 0 ? -1 : 1;
    const base = this.pos.length / 3;
    for (let k = 0; k < K; k++)
      for (let j = 0; j <= N; j++) {
        const v = rings[k]![j]!;
        const i = (k * N + (j % N)) * 3;
        const n = norm([acc[i]! * flip, acc[i + 1]! * flip, acc[i + 2]! * flip]);
        this.vertex(v, n);
      }
    const at = (k: number, j: number) => base + k * (N + 1) + j;
    for (const [ka, ja, kb, jb, kc, jc] of tris) {
      if (flip > 0) this.index.push(at(ka, ja), at(kb, jb), at(kc, jc));
      else this.index.push(at(ka, ja), at(kc, jc), at(kb, jb));
    }
  }

  private vertex(v: Vtx, n: V3) {
    if (!(v.u >= 0 && v.u <= UVS && v.v >= 0 && v.v <= UVS)) throw new Error(`rider: cloth coordinate (${v.u}, ${v.v}) outside 0 to ${UVS}`);
    this.pos.push(...v.p);
    this.nrm.push(...n);
    this.uv.push(v.u / UVS, v.v / UVS);
    this.region.push(v.region);
    const merged = new Map<number, number>();
    for (const [b, w] of v.w) if (w > 1e-4) merged.set(b, (merged.get(b) ?? 0) + w);
    const top = [...merged].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
    const sum = top.reduce((s, [, w]) => s + w, 0);
    for (let i = 0; i < 4; i++) {
      this.joints.push(top[i]?.[0] ?? 0);
      this.weights.push(top[i] ? top[i]![1] / sum : 0);
    }
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('skinIndex', new Uint16BufferAttribute(this.joints, 4));
    g.setAttribute('skinWeight', new BufferAttribute(new Float32Array(this.weights), 4));
    g.setAttribute('region', new BufferAttribute(new Uint8Array(this.region), 1));
    g.setIndex(this.index);
    return g;
  }
}

/** The left side's copy of a part built on the right: x negated, each bone its mirror. The loft turns its faces back out. */
const mirrored = (rings: Vtx[][]): Vtx[][] =>
  rings.map((r) => r.map((v) => ({ ...v, p: [-v.p[0], v.p[1], v.p[2]] as V3, w: v.w.map(([b, w]) => [MIRROR_BONE[b]!, w] as [number, number]) })));

/**
 * A tube along two bones that share a hinge axis (the thigh and the shin,
 * the upper arm and the forearm): straight along each, round a short curve
 * at the joint (`blend` either side), its rings across the tube in the
 * hinge axis X and Z = X x tangent. `ring(s)` gives the half axes along X
 * and Z (`rx`, `rz`) and what the ring is; `s` is metres from A's joint.
 */
function tube(
  A: BoneFrame,
  lengthA: number,
  B: BoneFrame,
  stations: readonly number[],
  N: number,
  ring: (s: number, i: number) => { rx: number; rz: number; region: number },
  weights: (s: number) => Infl,
  uv: (s: number, t: number) => [number, number],
  blend = 0.05,
): Vtx[][] {
  const X = v3(A.x);
  const centre = (s: number): V3 => {
    if (s <= lengthA - blend) return add(v3(A.o), v3(A.y), s);
    if (s >= lengthA + blend) return add(v3(B.o), v3(B.y), s - lengthA);
    const p0 = add(v3(A.o), v3(A.y), lengthA - blend);
    const p1 = v3(B.o);
    const p2 = add(v3(B.o), v3(B.y), blend);
    const t = (s - (lengthA - blend)) / (2 * blend);
    return add(add(p0.map((c) => c * (1 - t) * (1 - t)) as V3, p1, 2 * t * (1 - t)), p2, t * t);
  };
  return stations.map((s, i) => {
    const T = norm(sub(centre(s + 1e-4), centre(s - 1e-4)));
    const Z = norm(crossV(X, T));
    const Xp = norm(crossV(T, Z));
    const c = centre(s);
    const r = ring(s, i);
    return Array.from({ length: N + 1 }, (_, j) => {
      const th = (2 * Math.PI * j) / N;
      const p = add(add(c, Xp, r.rx * Math.cos(th)), Z, r.rz * Math.sin(th));
      const [u, v] = uv(s, j / N);
      return { p, u, v, region: r.region, w: weights(s) };
    });
  });
}

/** The trouser leg's profile along the leg, metres from the hip joint: radius and region, as keys (repeated places are steps). */
function legProfile(): { s: number; r: number; region: number }[] {
  const L1 = LEG.thigh;
  const L2 = LEG.shank;
  const T = TROUSER;
  const C = T.cuff;
  const B = T.bunch;
  const top = L2 + C.drop - C.height;
  const end = L2 + C.drop;
  const from = top - B.height;
  const tr = REGION.trouser;
  const keys: { s: number; r: number; region: number }[] = [
    { s: T.top, r: 0, region: tr },
    { s: T.top + 0.006, r: 0.05, region: tr },
    { s: T.top + 0.025, r: 0.08, region: tr },
    { s: -0.04, r: T.thigh.hip, region: tr },
    { s: 0.02, r: T.thigh.hip, region: tr },
    { s: 0.16, r: 0.079, region: tr },
    { s: 0.3, r: 0.069, region: tr },
    { s: L1 - 0.03, r: T.thigh.knee, region: tr },
    { s: L1, r: T.knee, region: tr },
    { s: L1 + T.shank.calfAt * L2, r: T.shank.calf, region: tr },
    { s: L1 + from, r: T.shank.hem, region: tr },
  ];
  for (let i = 0; i < B.count * 4; i++) {
    const k = (i + 0.5) / (B.count * 4);
    keys.push({ s: L1 + from + k * B.height, r: T.shank.hem + B.depth * Math.abs(Math.sin(k * B.count * Math.PI)), region: tr });
  }
  const ankleAt = Math.sqrt(Math.max(0, T.shank.ankle ** 2 - (end - L2) ** 2));
  keys.push(
    { s: L1 + top, r: T.shank.hem, region: REGION.fold },
    { s: L1 + top, r: C.radius - C.edge, region: REGION.fold },
    { s: L1 + top + C.edge, r: C.radius, region: tr },
    { s: L1 + end - C.edge, r: C.radius, region: tr },
    { s: L1 + end, r: C.radius - C.edge, region: REGION.fold },
    { s: L1 + end, r: ankleAt, region: REGION.sock },
  );
  // The rest of the ankle's cap, inside the shoe.
  for (const k of [0.35, 0.7, 0.92, 1]) {
    const y = lerp(end, L2 + T.shank.ankle, k);
    keys.push({ s: L1 + y, r: Math.sqrt(Math.max(0, T.shank.ankle ** 2 - (y - L2) ** 2)), region: REGION.sock });
  }
  return keys;
}

/** Stations along a profile: each key, with extra rings between keys further apart than `step`. */
function profileStations<T extends { s: number }>(keys: readonly T[], step: number): { s: number; key: number; t: number }[] {
  const out: { s: number; key: number; t: number }[] = [{ s: keys[0]!.s, key: 0, t: 0 }];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!.s;
    const b = keys[i]!.s;
    const n = Math.max(1, Math.ceil(Math.abs(b - a) / step));
    for (let k = 1; k <= n; k++) out.push({ s: lerp(a, b, k / n), key: i - 1, t: k / n });
  }
  return out;
}

function rightLeg(bind: BodyPose): Vtx[][] {
  const thigh = bind.bones[BONE.thighR]!;
  const shin = bind.bones[BONE.shinR]!;
  const keys = legProfile();
  const st = profileStations(keys, 0.02);
  const U = RIDER_UV.trouser;
  const L1 = LEG.thigh;
  return tube(
    thigh,
    L1,
    shin,
    st.map((x) => x.s),
    RIDER_MESH.leg,
    (_s, i) => {
      const { key, t } = st[i]!;
      const a = keys[key]!;
      const b = keys[Math.min(keys.length - 1, key + 1)]!;
      const r = lerp(a.r, b.r, t);
      return { rx: r, rz: r, region: t < 0.5 ? a.region : b.region };
    },
    (s) => {
      const pelvis = 1 - smooth(-0.06, 0.1, s);
      const shinW = smooth(L1 - 0.06, L1 + 0.05, s);
      // The cuff and the sock lean on the foot, so they stay on the shoe as the shin swings over it (ADR-98).
      const foot = shinW * HEM_FOOT.jeans * smooth(L1 + LEG.shank - HEM_FOOT.from, L1 + LEG.shank - HEM_FOOT.to, s);
      return [
        [BONE.pelvis, pelvis],
        [BONE.thighR, (1 - pelvis) * (1 - shinW)],
        [BONE.shinR, shinW - foot],
        [BONE.footR, foot],
      ];
    },
    (s, t) => [t * U.around, (s + 0.2) / U.tile],
  );
}

/** Rings stacked up the body (bind pose upright, so each ring is level): superellipse half axes, front and back. */
function stack(
  keys: readonly { h: number; a: number; f: number; b: number; z: number; n?: number }[],
  baseY: number,
  N: number,
  step: number,
  vertex: (p: V3, h: number, c: number, s: number, t: number) => Omit<Vtx, 'p'> & { p?: V3 },
): Vtx[][] {
  const rings: Vtx[][] = [];
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i]!;
    const b = keys[i + 1];
    const n = b ? Math.max(1, Math.ceil(Math.abs(b.h - a.h) / step)) : 1;
    for (let k = 0; k < n; k++) {
      if (!b && k > 0) break;
      const t = k / n;
      const m = (x: keyof typeof a) => (b ? lerp((a[x] as number) ?? 2.4, (b[x] as number) ?? 2.4, t) : ((a[x] as number) ?? 2.4));
      const h = m('h');
      const R = { a: m('a'), f: m('f'), b: m('b'), z: m('z'), n: m('n') };
      rings.push(
        Array.from({ length: N + 1 }, (_, j) => {
          const th = (2 * Math.PI * j) / N;
          const c = Math.cos(th);
          const s = Math.sin(th);
          const p: V3 = [R.a * sq(c, R.n), baseY + h, R.z + (s > 0 ? R.b : R.f) * sq(s, R.n)];
          const v = vertex(p, h, c, s, j / N);
          return { ...v, p: v.p ?? p };
        }),
      );
    }
  }
  return rings;
}

function seat(hipY: number): Vtx[][] {
  const U = RIDER_UV.trouser;
  return stack(SEAT, hipY, RIDER_MESH.seat, 0.025, (p, h, _c, _s, t) => {
    const side = p[0] >= 0 ? BONE.thighR : BONE.thighL;
    const toThigh = 0.4 * (1 - smooth(-0.15, -0.02, h)) * smooth(0.02, 0.1, Math.abs(p[0]));
    return {
      u: t * Math.round(0.95 / U.tile),
      v: (h + 0.4) / U.tile,
      region: REGION.trouser,
      w: [
        [BONE.pelvis, 1 - toThigh],
        [side, toThigh],
      ],
    };
  });
}

/** The torso's weights by height: pelvis, lumbar spine, chest, a little neck at the collar, the clavicle toward each shoulder. */
function torsoWeights(p: V3, h: number): Infl {
  const pelvis = 1 - smooth(0.0, 0.16, h);
  const chest = smooth(0.22, 0.4, h);
  const spine = Math.max(0, 1 - pelvis - chest);
  const neck = 0.5 * smooth(0.55, 0.59, h);
  const clav = 0.55 * smooth(0.09, 0.18, Math.abs(p[0])) * smooth(0.4, 0.5, h);
  const rest = 1 - neck - clav;
  return [
    [BONE.pelvis, pelvis * rest],
    [BONE.spine, spine * rest],
    [BONE.chest, chest * rest],
    [BONE.neck, neck],
    [p[0] >= 0 ? BONE.clavicleR : BONE.clavicleL, clav],
  ];
}

function torso(hipY: number): Vtx[][] {
  const H = HOODIE;
  const P = H.pocket;
  const tile = RIDER_UV.hoodie.tile;
  return stack(TORSO, hipY, RIDER_MESH.torso, 0.012, (p, h, _c, s, t) => {
    let region = h >= H.rib.low && h <= H.rib.high ? REGION.rib : REGION.hoodie;
    let q: V3 | undefined;
    // The kangaroo pocket, on the front: its seam round the edge, the patch standing off the hoodie.
    if (s < 0 && h >= P.low - P.seam && h <= P.high + P.seam) {
      const half = P.half - P.slant * (h - P.low);
      const inside = Math.min(h - P.low, P.high - h, half - Math.abs(p[0]));
      if (inside > -P.seam) {
        if (inside < P.seam) region = REGION.seam;
        q = [p[0], p[1], p[2] - P.lift * smooth(-P.seam, P.seam, inside)];
      }
    }
    return { p: q, u: t * Math.round(1 / tile), v: (h + 0.4) / tile, region, w: torsoWeights(p, h) };
  });
}

/** The hood lying on the back: a roll round the collar, thickest behind the neck, tapering to the front. */
function hoodRoll(hipY: number): Vtx[][] {
  const R = HOODIE.roll;
  const tile = RIDER_UV.hoodie.tile;
  const N = RIDER_MESH.hood;
  const from = (R.from * Math.PI) / 180;
  const at = (phi: number): V3 => {
    const k = Math.abs(phi) / from;
    return [R.rx * Math.sin(phi), hipY + lerp(R.hBack, R.h, k), 0.012 + R.rz * Math.cos(phi)];
  };
  const stations = samples([-from, from], 0.16);
  return stations.map((phi, i) => {
    const k = Math.abs(phi) / from;
    const end = i === 0 || i === stations.length - 1;
    const r = end ? 0 : lerp(R.back, R.side, k ** 0.7) * Math.sqrt(1 - k ** 6);
    const c = at(phi);
    const T = norm(sub(at(phi + 1e-4), at(phi - 1e-4)));
    const out = norm([Math.sin(phi), 0, Math.cos(phi)]);
    const up = norm(crossV(T, out));
    return Array.from({ length: N + 1 }, (_, j) => {
      const th = (2 * Math.PI * j) / N;
      const p = add(add(c, out, r * Math.cos(th) * 0.9), up, r * Math.sin(th) * 0.62);
      const w: Infl = [
        [BONE.chest, 0.7 + 0.3 * (1 - k)],
        [BONE.neck, 0.3 * k],
      ];
      return { p, u: (j / N) * 12, v: (phi + 2.5) / (tile * 5), region: REGION.hoodie, w };
    });
  });
}

/** The hood's panel on the upper back, under the roll. */
function hoodBack(hipY: number): Vtx[][] {
  const B = HOODIE.back;
  const tile = RIDER_UV.hoodie.tile;
  const keys = [-1, -0.9, -0.6, -0.2, 0.2, 0.6, 0.9, 1];
  return keys.map((k) => {
    const s = Math.sqrt(Math.max(0, 1 - k * k));
    return Array.from({ length: RIDER_MESH.hood + 1 }, (_, j) => {
      const th = (2 * Math.PI * j) / RIDER_MESH.hood;
      const p: V3 = [B.a * s * Math.cos(th), hipY + B.h + B.b * k, B.z + B.t * s * Math.sin(th) * 0.5 + B.t * 0.2 * (1 - k)];
      return { p, u: (j / RIDER_MESH.hood) * 20, v: (B.b * k + 0.2) / tile, region: REGION.hoodie, w: [[BONE.chest, 1]] };
    });
  });
}

/** The two drawstrings, down the hoodie's front from the collar. */
function drawstring(hipY: number, side: 1 | -1): Vtx[][] {
  const S = HOODIE.strings;
  const N = RIDER_MESH.string;
  const hs = samples([S.top, S.h], 0.02);
  const front = (h: number) => {
    const t = interp(TORSO.slice(5, 17) as unknown as { h: number; a: number; f: number; b: number; z: number; n: number }[], 'h', h);
    return t.z - t.f * 0.995 - S.r - 0.002;
  };
  const centre = (h: number): V3 => [side * (S.x + (S.top - h) * 0.04), hipY + h, front(h)];
  const stations = [hs[0]!, ...hs, hs[hs.length - 1]!];
  return stations.map((h, i) => {
    const end = i === 0 || i === stations.length - 1;
    const aglet = h < S.h + 0.03 ? 1.35 : 1;
    const c = centre(h);
    return Array.from({ length: N + 1 }, (_, j) => {
      const th = (2 * Math.PI * j) / N;
      const r = end ? 0 : S.r * aglet;
      return { p: [c[0] + r * Math.cos(th), c[1], c[2] + r * Math.sin(th)] as V3, u: FLAT.u, v: FLAT.v, region: REGION.string, w: [[BONE.chest, 1]] };
    });
  });
}

function rightSleeve(bind: BodyPose): Vtx[][] {
  const H = HOODIE;
  const upper = bind.bones[BONE.upperArmR]!;
  const fore = bind.bones[BONE.forearmR]!;
  const C = H.cuff;
  const keys = [
    ...H.sleeve.map((k) => ({ s: k.s, r: k.r, region: REGION.hoodie })),
    { s: C.from + 0.008, r: C.r, region: REGION.rib },
    { s: C.to, r: C.r, region: REGION.rib },
    { s: C.to + 0.002, r: C.inner, region: REGION.seam },
    { s: C.to + 0.003, r: 0, region: REGION.seam },
  ];
  const st = profileStations(keys, 0.022);
  const U = RIDER_UV.sleeve;
  const Lu = BODY.upperArm;
  return tube(
    upper,
    Lu,
    fore,
    st.map((x) => x.s),
    RIDER_MESH.sleeve,
    (_s, i) => {
      const { key, t } = st[i]!;
      const a = keys[key]!;
      const b = keys[Math.min(keys.length - 1, key + 1)]!;
      const r = lerp(a.r, b.r, t);
      return { rx: r, rz: r * 0.94, region: t < 0.5 ? a.region : b.region };
    },
    (s) => {
      const top = 1 - smooth(-0.06, 0.09, s);
      const foreW = smooth(Lu - 0.06, Lu + 0.05, s);
      return [
        [BONE.clavicleR, top * 0.55],
        [BONE.chest, top * 0.45],
        [BONE.upperArmR, (1 - top) * (1 - foreW)],
        [BONE.forearmR, (1 - top) * foreW],
      ];
    },
    (s, t) => [t * U.around, (s + 0.2) / U.tile],
    0.045,
  );
}

/** The right mitten round the hand bone: thickness along X (the palm at -X), width along Z (the thumb's side, +Z). */
function rightMitten(bind: BodyPose): Vtx[][][] {
  const hand = bind.bones[BONE.handR]!;
  const M = MITTEN;
  const profile = [
    { y: M.from, x: 0, z: 0 },
    { y: M.from + 0.004, x: M.wrist.thick * 0.8, z: M.wrist.width * 0.8 },
    { y: -0.02, x: M.wrist.thick, z: M.wrist.width },
    { y: 0.01, x: M.wrist.thick * 1.02, z: M.wrist.width * 1.2 },
    { y: 0.05, x: M.thick, z: M.width },
    { y: 0.1, x: M.thick, z: M.width * 1.02 },
    // The fingers end blunt, not in a point (ADR-91): nearly full width to the knuckles of the tips, then rounded off.
    { y: 0.13, x: M.thick * 0.95, z: M.width * 0.96 },
    { y: 0.152, x: M.thick * 0.85, z: M.width * 0.86 },
    { y: 0.163, x: M.thick * 0.62, z: M.width * 0.66 },
    { y: 0.168, x: M.thick * 0.3, z: M.width * 0.36 },
    { y: M.to, x: 0, z: 0 },
  ];
  const ys = samples(
    profile.map((p) => p.y),
    0.018,
  );
  const weights = (y: number): Infl => {
    const f = 1 - smooth(-0.03, 0.012, y);
    return [
      [BONE.forearmR, f],
      [BONE.handR, 1 - f],
    ];
  };
  const body = ys.map((y) => {
    const P = interp(profile, 'y', y);
    const cx = -M.curl * clamp01(y / M.to) ** 2;
    return Array.from({ length: RIDER_MESH.hand + 1 }, (_, j) => {
      const th = (2 * Math.PI * j) / RIDER_MESH.hand;
      // Bare skin (ADR-91): no cloth, so the skin's flat coordinates and region, as the head and neck have.
      return { p: local(hand, cx + P.x * Math.cos(th), y, P.z * Math.sin(th)), u: FLAT.u, v: FLAT.v, region: REGION.skin, w: weights(y) };
    });
  });
  // The thumb: out from the thumb's side, toward the tip and a little toward the palm.
  const T = M.thumb;
  const start: V3 = [-0.004, T.at, T.side * 0.6];
  const dir = norm([-0.3, 0.78, 0.45]);
  const ax = norm(crossV(dir, [0, 0, 1]));
  const az = norm(crossV(ax, dir));
  const ts = [-0.01, -0.006, 0.0, 0.02, 0.04, T.length - 0.008, T.length - 0.002, T.length];
  const rs = [0, 0.008, T.r, T.r, T.r * 0.95, T.r * 0.8, T.r * 0.45, 0];
  const thumb = ts.map((t, i) => {
    const c = add(start, dir, t);
    return Array.from({ length: 9 }, (_, j) => {
      const th = (2 * Math.PI * j) / 8;
      const q = add(add(c, ax, rs[i]! * 0.8 * Math.cos(th)), az, rs[i]! * Math.sin(th));
      return { p: local(hand, q[0], q[1], q[2]), u: FLAT.u, v: FLAT.v, region: REGION.skin, w: weights(T.at + t) };
    });
  });
  return [body, thumb];
}

function neck(bind: BodyPose): Vtx[][] {
  const nk = bind.bones[BONE.neck]!;
  const ys = samples([NECK.from, BODY.neck + NECK.to], 0.02);
  const stations = [ys[0]!, ...ys, ys[ys.length - 1]!];
  return stations.map((y, i) => {
    const end = i === 0 || i === stations.length - 1;
    const k = end ? 0 : 1;
    const chest = 1 - smooth(-0.03, 0.03, y);
    const head = smooth(0.06, 0.12, y);
    return Array.from({ length: RIDER_MESH.neck + 1 }, (_, j) => {
      const th = (2 * Math.PI * j) / RIDER_MESH.neck;
      const s = Math.sin(th);
      const p = local(nk, k * NECK.a * Math.cos(th), y, NECK.z + k * (s > 0 ? NECK.b : NECK.f) * s);
      return {
        p,
        u: FLAT.u,
        v: FLAT.v,
        region: REGION.skin,
        w: [
          [BONE.chest, chest],
          [BONE.neck, (1 - chest) * (1 - head)],
          [BONE.head, head],
        ] as Infl,
      };
    });
  });
}

const headAt = (y: number) => interp(HEAD, 'y', y);

function head(bind: BodyPose): Vtx[][] {
  const hd = bind.bones[BONE.head]!;
  const ys = samples(
    HEAD.map((k) => k.y),
    0.012,
  );
  return ys.map((y) => {
    const H = headAt(y);
    return Array.from({ length: RIDER_MESH.head + 1 }, (_, j) => {
      const th = (2 * Math.PI * j) / RIDER_MESH.head;
      const s = Math.sin(th);
      // Short hair from the nape round to the brow: its line rises from the back to the front.
      const line = s >= 0 ? lerp(HAIR.side, HAIR.nape, s) : lerp(HAIR.side, HAIR.front, -s);
      const hair = smooth(line - 0.004, line + 0.004, y);
      const k = 1 + (HAIR.lift * hair) / Math.max(0.02, H.a);
      const p = local(hd, sq(Math.cos(th), 2.2) * H.a * k, y, H.z + (s > 0 ? H.b : H.f) * sq(s, 2.2) * k);
      // The jaw's underside blends into the neck.
      const n = 0.25 * (1 - smooth(-0.07, -0.03, y));
      return {
        p,
        u: FLAT.u,
        v: FLAT.v,
        region: hair > 0.5 ? REGION.hair : REGION.skin,
        w: [
          [BONE.head, 1 - n],
          [BONE.neck, n],
        ] as Infl,
      };
    });
  });
}

/**
 * The beanie: the skull's shape `gap` further out from the hem up, a rolled
 * brim at the bottom standing `roll` further out with a fold line along its
 * top, the hem tucked in under, a slouch at the back of the crown, its ribs
 * running up it.
 */
function beanie(bind: BodyPose): Vtx[][] {
  const hd = bind.bones[BONE.head]!;
  const B = BEANIE;
  const top = HEAD[HEAD.length - 1]!.y;
  const U = RIDER_UV.beanie;
  const rows: { y: number; off: number; region: number }[] = [
    { y: B.hem + 0.004, off: -0.002, region: REGION.brim },
    { y: B.hem, off: B.gap + B.roll * 0.6, region: REGION.brim },
    { y: B.hem + 0.006, off: B.gap + B.roll, region: REGION.brim },
    { y: B.hem + B.brim - 0.006, off: B.gap + B.roll, region: REGION.brim },
    { y: B.hem + B.brim - 0.002, off: B.gap + B.roll * 0.7, region: REGION.brim },
    { y: B.hem + B.brim, off: B.gap + B.roll * 0.2, region: REGION.brim },
    { y: B.hem + B.brim + 0.002, off: B.gap, region: REGION.beanie },
  ];
  for (const y of samples([B.hem + B.brim + 0.002, top - 0.004], 0.012).slice(1)) rows.push({ y, off: B.gap, region: REGION.beanie });
  rows.push({ y: top, off: B.gap, region: REGION.beanie });
  return rows.map(({ y, off, region }, i) => {
    const H = headAt(y);
    const last = i === rows.length - 1;
    const crown = smooth(0.06, top, y);
    return Array.from({ length: RIDER_MESH.head + 1 }, (_, j) => {
      const th = (2 * Math.PI * j) / RIDER_MESH.head;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const back = Math.max(0, s);
      const grow = last ? 0 : 1;
      const lx = sq(c, 2.2) * (H.a + off) * grow;
      const lz = H.z + crown * B.slouch * 0.6 + sq(s, 2.2) * ((s > 0 ? H.b : H.f) + off) * grow;
      const ly = y + off * crown * 1.3 + crown * B.slouch * (0.4 + 0.6 * back) + (last ? B.gap + B.slouch * 0.7 : 0);
      const t = j / RIDER_MESH.head;
      const w = (ly - B.hem) / U.tile;
      return { p: local(hd, lx, ly, lz), u: 0.5 * t * U.ribs * 0.25 + 0.5 * w + 64, v: 0.5 * t * U.ribs * 0.25 - 0.5 * w + 64, region, w: [[BONE.head, 1]] as Infl };
    });
  });
}

export interface RiderBuild {
  geometry: BufferGeometry;
  /** The bind pose: each joint's frame, as the GLB's joints and inverse bind matrices. */
  bind: BodyPose;
  /** Triangles per part, for the build's report. */
  triangles: Record<string, number>;
}

/** Builds the whole rider in its bind pose: one geometry, every part in one draw. */
export function buildRider(): RiderBuild {
  const bind = writeBindPose(newBodyPose());
  const hipY = bind.bones[BONE.pelvis]!.o.y;
  const mesh = new Mesh();
  const triangles: Record<string, number> = {};
  const part = (name: string, rings: Vtx[][]) => {
    const before = mesh.index.length;
    mesh.loft(rings);
    triangles[name] = (triangles[name] ?? 0) + (mesh.index.length - before) / 3;
  };
  const leg = rightLeg(bind);
  part('legs', leg);
  part('legs', mirrored(leg));
  part('seat', seat(hipY));
  part('torso', torso(hipY));
  part('hood', hoodRoll(hipY));
  part('hood', hoodBack(hipY));
  part('strings', drawstring(hipY, 1));
  part('strings', drawstring(hipY, -1));
  const sleeve = rightSleeve(bind);
  part('sleeves', sleeve);
  part('sleeves', mirrored(sleeve));
  for (const m of rightMitten(bind)) {
    part('mittens', m);
    part('mittens', mirrored(m));
  }
  part('neck', neck(bind));
  part('head', head(bind));
  part('beanie', beanie(bind));
  return { geometry: mesh.geometry(), bind, triangles };
}
