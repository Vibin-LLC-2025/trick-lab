// The detailed rider (ADR-94): MakeHuman's body (assets/source/models/rider,
// built in Blender by make_rider.py) fitted onto the game's 19-bone rider
// (src/sim/body.ts), so the same pose code drives it. Pure: arrays in, a
// geometry in the bind pose out; scripts/lib/build.ts reads the source file
// and writes public/models/rider-high.glb.
//
// The fit, per bone of ours: the source bone it stands for (and the ones
// folded into it: the fingers into the hand, the foot into the shin, the
// third spine joint into the chest), turned so the source bone's direction is
// ours, moved to our joint and stretched along the bone to our length. A
// vertex goes where its weights blend those moves (linear blend skinning from
// the source's rest pose to our bind pose), so the joints stay smooth.
import { BufferAttribute, BufferGeometry, Uint16BufferAttribute } from 'three';
import { BODY, BONE, RIDER_BONES, type BodyPose, type RiderBone } from '../sim/body';
import { LEG } from '../sim/legs';
import { HEM_FOOT, REGION, type RiderRegion } from './riderSpec';

type V3 = [number, number, number];

/** The source's arrays, as the glTF file has them (its own axes: y up, facing +Z). */
export interface RiderSource {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  /** Four joints per vertex, indices into `jointNames`. */
  joints: ArrayLike<number>;
  weights: Float32Array;
  /** Each vertex's region code (make_rider.py: 0 skin, 1 shirt, 2 jeans, 3 hair, 4 beanie, 5 eyes, 6 brows). */
  regions: Uint8Array;
  index: Uint32Array;
  jointNames: readonly string[];
  /** Each joint's rest position (world, the source's axes). */
  jointPositions: readonly V3[];
}

/**
 * Each of our bones: the source bone it stands for, the source joint its
 * direction points to (null: the bone's own direction is taken from `aim`),
 * and the source bones folded into it.
 */
interface BoneMap {
  from: string;
  to: string | null;
  /** For a bone with no child joint (the head, the hands): the source joint it points toward instead. */
  aim?: string;
  folded: readonly string[];
}

const side = (s: 'l' | 'r') => {
  const fingers = ['index', 'middle', 'pinky', 'ring', 'thumb'].flatMap((f) => [1, 2, 3].map((k) => `${f}_0${k}_${s}`));
  return {
    clavicle: { from: `clavicle_${s}`, to: `upperarm_${s}`, folded: [] },
    upperArm: { from: `upperarm_${s}`, to: `lowerarm_${s}`, folded: [] },
    forearm: { from: `lowerarm_${s}`, to: `hand_${s}`, folded: [] },
    hand: { from: `hand_${s}`, to: null, aim: `middle_01_${s}`, folded: fingers },
    thigh: { from: `thigh_${s}`, to: `calf_${s}`, folded: [] },
    shin: { from: `calf_${s}`, to: `foot_${s}`, folded: [`foot_${s}`, `ball_${s}`] },
  } satisfies Record<string, BoneMap>;
};
const L = side('l');
const R = side('r');

/** The foot bones (body.ts, 2026-11-13): no source bone stands for them; only the hem's weights (HEM_FOOT) reach them. */
type FootBone = 'footL' | 'footR';
const isFoot = (b: RiderBone): b is FootBone => b === 'footL' || b === 'footR';
/** Our bones a source bone stands for: every one but the feet, in RIDER_BONES order. */
export const RIDER_FIT_BONES = RIDER_BONES.filter((b): b is Exclude<RiderBone, FootBone> => !isFoot(b));

/** MakeHuman's game-engine rig onto ours (MakeHuman's _l is the character's left, as our L is). */
export const RIDER_FIT: Record<Exclude<RiderBone, FootBone>, BoneMap> = {
  pelvis: { from: 'pelvis', to: 'spine_01', folded: ['Root'] },
  spine: { from: 'spine_01', to: 'spine_02', folded: [] },
  chest: { from: 'spine_02', to: 'neck_01', folded: ['spine_03'] },
  neck: { from: 'neck_01', to: 'head', folded: [] },
  head: { from: 'head', to: null, folded: [] },
  clavicleL: L.clavicle,
  upperArmL: L.upperArm,
  forearmL: L.forearm,
  handL: L.hand,
  clavicleR: R.clavicle,
  upperArmR: R.upperArm,
  forearmR: R.forearm,
  handR: R.hand,
  thighL: L.thigh,
  shinL: L.shin,
  thighR: R.thigh,
  shinR: R.shin,
};

/** make_rider.py's region codes onto RIDER_REGIONS: the eyes and brows are untinted, as the skin is; the sock (2026-11-13) is its own. */
const REGION_OF_CODE: readonly RiderRegion[] = ['skin', 'hoodie', 'trouser', 'hair', 'beanie', 'skin', 'skin', 'sock'];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.sqrt(dot(a, a));
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const unit = (a: V3): V3 => scale(a, 1 / (len(a) || 1));
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** The source turned to face -Z, as ours does: half a turn round Y. */
const flip = (a: V3): V3 => [-a[0], a[1], -a[2]];

/** A 3 x 3 rotation, rows. */
type M3 = [V3, V3, V3];
const apply = (m: M3, v: V3): V3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];

/** The smallest rotation taking unit a to unit b (Rodrigues). */
function rotationBetween(a: V3, b: V3): M3 {
  const v = cross(a, b);
  const c = dot(a, b);
  if (c < -0.999999) {
    // Opposite: half a turn round any axis across a.
    const axis = unit(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]));
    const [x, y, z] = axis;
    return [
      [2 * x * x - 1, 2 * x * y, 2 * x * z],
      [2 * x * y, 2 * y * y - 1, 2 * y * z],
      [2 * x * z, 2 * y * z, 2 * z * z - 1],
    ];
  }
  const k = 1 / (1 + c);
  const [x, y, z] = v;
  return [
    [1 - k * (y * y + z * z), k * x * y - z, k * x * z + y],
    [k * x * y + z, 1 - k * (x * x + z * z), k * y * z - x],
    [k * x * z - y, k * y * z + x, 1 - k * (x * x + y * y)],
  ];
}

/** One bone's move: from a source point (already flipped and scaled) to our bind pose. */
export interface Move {
  /** The source joint, flipped and scaled. */
  from: V3;
  /** Its direction (flipped), unit. */
  dir: V3;
  /** Stretch along `dir`: our length over the source's (scaled). */
  stretch: number;
  rot: M3;
  /** Our joint. */
  to: V3;
}

/** Where a source point goes under one bone's move. */
function moved(m: Move, p: V3, out: V3): V3 {
  const d = sub(p, m.from);
  const along = dot(d, m.dir);
  const s = sub(d, scale(m.dir, along * (1 - m.stretch)));
  const r = apply(m.rot, s);
  out[0] = m.to[0] + r[0];
  out[1] = m.to[1] + r[1];
  out[2] = m.to[2] + r[2];
  return out;
}

/**
 * Where a source normal goes under one bone's move, unnormalized: the stretch
 * along the bone's inverse transpose (a normal shrinks along the bone where
 * the surface grows), then the turn. The turn alone (before 2026-11-13) left
 * the normals of a stretched limb up to about 5 degrees off its surface, the
 * shading lit as if the limb had its source's length.
 */
export function movedNormal(m: Move, n: V3): V3 {
  const along = dot(n, m.dir) * (1 - 1 / m.stretch);
  return apply(m.rot, sub(n, scale(m.dir, along)));
}

/** Each of our bones' length in the bind pose: to its child joint, or (a leaf) the body's own segment. */
function ourLengths(bind: BodyPose, leaf: { head: number; hand: number; shank: number }): number[] {
  const o = (b: RiderBone): V3 => {
    const f = bind.bones[BONE[b]]!.o;
    return [f.x, f.y, f.z];
  };
  const to: Partial<Record<RiderBone, RiderBone>> = {
    pelvis: 'spine',
    spine: 'chest',
    chest: 'neck',
    neck: 'head',
    clavicleL: 'upperArmL',
    upperArmL: 'forearmL',
    forearmL: 'handL',
    clavicleR: 'upperArmR',
    upperArmR: 'forearmR',
    forearmR: 'handR',
    thighL: 'shinL',
    thighR: 'shinR',
  };
  return RIDER_BONES.map((b) => {
    const c = to[b];
    if (c) return len(sub(o(c), o(b)));
    if (b === 'head') return leaf.head;
    if (b === 'handL' || b === 'handR') return leaf.hand;
    return leaf.shank;
  });
}

/** The lengths of our bones with no child joint, for the fit: the head and the hands (BODY), the shank (LEG). */
export const RIDER_HIGH_LEAF = { head: BODY.head, hand: BODY.hand, shank: LEG.shank } as const;

export interface FitReport {
  /** The uniform scale applied before the stretches (our trunk over the source's). */
  scale: number;
  /** Per bone of ours: its stretch along the bone. */
  stretch: Record<RiderBone, number>;
}

/** make_rider.py's code for the shirt. */
const SHIRT_CODE = 1;
/**
 * How much of a shirt vertex's thigh weight it keeps (ADR-94, 2026-11-13).
 * MakeHuman weights the tee's hem to the thighs, so a crouch pulled it into a
 * V between the legs, like a leotard; a quarter keeps the hem off the thighs
 * as they lift without leaving it stiff.
 */
export const SHIRT_THIGH = 0.25;
/** Within the first of these of the middle (metres, bind pose) a shirt vertex keeps none of its thigh weight, from the second all of SHIRT_THIGH. */
export const SHIRT_MIDDLE = [0.03, 0.08] as const;
const THIGHS = [BONE.thighL, BONE.thighR];

/** make_rider.py's code for the jeans and for the sock. */
const JEANS_CODE = 2;
const SOCK_CODE = 7;
const LEGS = [
  { shin: BONE.shinL, foot: BONE.footL },
  { shin: BONE.shinR, foot: BONE.footR },
] as const;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The crotch (2026-11-13), in the bind pose: the jeans within `x` of the
 * middle (all of it inside the first, none past the second) and between
 * `y` metres of the hip joints' height (none below the first, all from the
 * second, fading out over the last two). There the two thighs' weight is
 * shared between them by the side of the middle a vertex is on, eased over
 * `blend` either side, and `pelvis` of it moves onto the pelvis.
 */
export const CROTCH = { x: [0.04, 0.09], y: [-0.3, -0.2, -0.02, 0.04], blend: 0.035, pelvis: 0.35 } as const;

/**
 * Evens the crotch's weights in place (CROTCH): `w` holds each vertex's
 * weight on every bone. MakeHuman ties each vertex of the seam wholly to one
 * thigh (and the left leg's cloth runs past the middle), so a triangle across
 * the seam, its corners on the two thighs, tore into a spike between the legs
 * as they moved apart. Blended across the middle, the seam follows both
 * thighs and the hips, as cloth there does.
 */
export function smoothCrotch(w: Float32Array, pos: Float32Array, region: Uint8Array, bind: BodyPose) {
  const B = RIDER_BONES.length;
  const n = pos.length / 3;
  const hipY = bind.bones[BONE.thighL]!.o.y;
  const ramp = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let v = 0; v < n; v++) {
    if (region[v] !== REGION.trouser) continue;
    const x = pos[v * 3]!;
    const y = pos[v * 3 + 1]! - hipY;
    const m = (1 - ramp(CROTCH.x[0], CROTCH.x[1], Math.abs(x))) * ramp(CROTCH.y[0], CROTCH.y[1], y) * (1 - ramp(CROTCH.y[2], CROTCH.y[3], y));
    if (!(m > 0)) continue;
    const o = v * B;
    const L = w[o + BONE.thighL]!;
    const R = w[o + BONE.thighR]!;
    const thighs = L + R;
    if (!(thighs > 0)) continue;
    // Our right is +X (body.ts).
    const right = ramp(-CROTCH.blend, CROTCH.blend, x);
    const toPelvis = thighs * CROTCH.pelvis * m;
    w[o + BONE.thighL] = L + m * (thighs * (1 - right) - L) - toPelvis * (1 - right);
    w[o + BONE.thighR] = R + m * (thighs * right - R) - toPelvis * right;
    w[o + BONE.pelvis]! += toPelvis;
  }
}

/**
 * Fits the source onto our bind pose. `leaf` gives the lengths of the bones
 * with no child joint (the head and the hands, from BODY; the shank, from
 * LEG). Returns the geometry with position, normal, uv, skinIndex,
 * skinWeight and region, as rider.ts's, and what the fit did.
 */
export function fitRider(src: RiderSource, bind: BodyPose, leaf: { head: number; hand: number; shank: number }): { geometry: BufferGeometry; report: FitReport } {
  const J = (name: string): V3 => {
    const i = src.jointNames.indexOf(name);
    if (i < 0) throw new Error(`the rider source has no joint ${name}`);
    return src.jointPositions[i]!;
  };
  // One scale for girth: our trunk (pelvis to the head joint) over the source's.
  const ours = (b: RiderBone): V3 => {
    const f = bind.bones[BONE[b]]!.o;
    return [f.x, f.y, f.z];
  };
  const g = len(sub(ours('head'), ours('pelvis'))) / len(sub(J('head'), J('pelvis')));
  const lengths = ourLengths(bind, leaf);

  const moves: Move[] = RIDER_BONES.map((b, i) => {
    // A foot carries no source joint (ourOf never points at it), so its move is never used: the identity.
    if (isFoot(b)) {
      const o = ours(b);
      return { from: o, dir: [0, 1, 0] as V3, stretch: 1, rot: rotationBetween([0, 1, 0], [0, 1, 0]), to: o };
    }
    const map = RIDER_FIT[b];
    const from = scale(flip(J(map.from)), g);
    const f = bind.bones[i]!;
    const y: V3 = [f.y.x, f.y.y, f.y.z];
    let dir: V3;
    let srcLen: number;
    if (map.to) {
      const d = sub(scale(flip(J(map.to)), g), from);
      srcLen = len(d);
      dir = unit(d);
    } else if (map.aim) {
      dir = unit(sub(scale(flip(J(map.aim)), g), from));
      srcLen = lengths[i]!;
    } else {
      // The head: straight up in the source, as ours is at bind.
      dir = [0, 1, 0];
      srcLen = lengths[i]!;
    }
    const stretch = map.to ? lengths[i]! / srcLen : 1;
    return { from, dir, stretch, rot: rotationBetween(dir, y), to: ours(b) };
  });

  // Each source joint onto one of our bones.
  const ourOf = new Int16Array(src.jointNames.length).fill(-1);
  RIDER_BONES.forEach((b, i) => {
    if (isFoot(b)) return;
    const m = RIDER_FIT[b];
    for (const n of [m.from, ...m.folded]) {
      const j = src.jointNames.indexOf(n);
      if (j >= 0) ourOf[j] = i;
    }
  });
  src.jointNames.forEach((n, j) => {
    if (ourOf[j]! < 0) throw new Error(`the rider source's joint ${n} has no bone of ours`);
  });

  const n = src.positions.length / 3;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const region = new Uint8Array(n);
  const B = RIDER_BONES.length;
  const w17 = new Float32Array(B);
  /** Every vertex's weights over all of our bones, before the four heaviest are kept. */
  const all = new Float32Array(n * B);
  const tmp: V3 = [0, 0, 0];
  for (let v = 0; v < n; v++) {
    w17.fill(0);
    for (let k = 0; k < 4; k++) {
      const w = src.weights[v * 4 + k]!;
      if (w > 0) w17[ourOf[src.joints[v * 4 + k]!]!]! += w;
    }
    // A shirt vertex is placed by the hips alone (2026-11-13): MakeHuman weights the tee's front to the thighs, and
    // our bind pose bends them 20 degrees forward, so the thighs' moves pulled the hem's middle down into a point.
    const placed = w17.slice();
    if (src.regions[v] === SHIRT_CODE) {
      for (const t of THIGHS) {
        placed[BONE.pelvis]! += placed[t]!;
        placed[t] = 0;
      }
    }
    // The four heaviest of ours, normalized.
    const order = Array.from(placed.keys())
      .filter((i) => placed[i]! > 0)
      .sort((a, b) => placed[b]! - placed[a]! || a - b)
      .slice(0, 4);
    const total = order.reduce((s, i) => s + placed[i]!, 0) || 1;
    const p = scale(flip([src.positions[v * 3]!, src.positions[v * 3 + 1]!, src.positions[v * 3 + 2]!]), g);
    const nn = flip([src.normals[v * 3]!, src.normals[v * 3 + 1]!, src.normals[v * 3 + 2]!]);
    let px = 0;
    let py = 0;
    let pz = 0;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    order.forEach((b) => {
      const w = placed[b]! / total;
      const m = moves[b]!;
      moved(m, p, tmp);
      px += w * tmp[0];
      py += w * tmp[1];
      pz += w * tmp[2];
      const r = unit(movedNormal(m, nn));
      nx += w * r[0];
      ny += w * r[1];
      nz += w * r[2];
    });
    pos[v * 3] = px;
    pos[v * 3 + 1] = py;
    pos[v * 3 + 2] = pz;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nrm[v * 3] = nx / nl;
    nrm[v * 3 + 1] = ny / nl;
    nrm[v * 3 + 2] = nz / nl;
    region[v] = REGION[REGION_OF_CODE[src.regions[v]!] ?? 'skin'];
    // The skinning: the same weights, but a shirt keeps only SHIRT_THIGH of its thigh weights, the rest moved onto
    // the pelvis, so the hem hangs from the hips instead of being dragged down between the legs as a thigh lifts.
    if (src.regions[v] === SHIRT_CODE) {
      // Over the middle, between the legs, none of it (2026-11-13): pulled by both thighs at once, the hem's middle
      // dropped into a point in the crouch.
      const keep = SHIRT_THIGH * smoothstep(SHIRT_MIDDLE[0], SHIRT_MIDDLE[1], Math.abs(px));
      for (const t of THIGHS) {
        const off = w17[t]! * (1 - keep);
        w17[t]! -= off;
        w17[BONE.pelvis]! += off;
      }
    }
    // The bottom of each leg onto its foot (HEM_FOOT): the jeans' cuff and the sock, by how far down the shin they are.
    const code = src.regions[v];
    if (code === JEANS_CODE || code === SOCK_CODE) {
      for (const { shin, foot } of LEGS) {
        if (!(w17[shin]! > 0)) continue;
        const f = bind.bones[shin]!;
        const along = (px - f.o.x) * f.y.x + (py - f.o.y) * f.y.y + (pz - f.o.z) * f.y.z;
        const share = (code === SOCK_CODE ? HEM_FOOT.sock : HEM_FOOT.jeans) * smoothstep(leaf.shank - HEM_FOOT.from, leaf.shank - HEM_FOOT.to, along);
        const off = w17[shin]! * share;
        w17[shin]! -= off;
        w17[foot]! += off;
      }
    }
    all.set(w17, v * B);
  }

  // The crotch (2026-11-13): blended across the middle, so the seam no longer tears into a spike (smoothCrotch).
  smoothCrotch(all, pos, region, bind);

  for (let v = 0; v < n; v++) {
    const w = all.subarray(v * B, v * B + B);
    const skin = Array.from(w.keys())
      .filter((i) => w[i]! > 1e-4)
      .sort((a, b) => w[b]! - w[a]! || a - b)
      .slice(0, 4);
    const skinTotal = skin.reduce((s, i) => s + w[i]!, 0) || 1;
    skin.forEach((b, k) => {
      skinIndex[v * 4 + k] = b;
      skinWeight[v * 4 + k] = w[b]! / skinTotal;
    });
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new BufferAttribute(nrm, 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(src.uvs), 2));
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
  geometry.setAttribute('region', new BufferAttribute(region, 1));
  // The half turn keeps the winding: a rotation, not a mirror.
  geometry.setIndex(Array.from(src.index));
  const stretch = Object.fromEntries(RIDER_BONES.map((b, i) => [b, Number(moves[i]!.stretch.toFixed(3))])) as Record<RiderBone, number>;
  return { geometry, report: { scale: Number(g.toFixed(4)), stretch } };
}
