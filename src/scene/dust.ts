// Dust (step 19, ADR-74): a small puff at each wheel when the board touches
// down in a game, and a trail under a bailed board while it slides. Soft discs
// that face the camera, all in one geometry (resources.ts geo.dust) and one
// draw call, on Medium and High.
//
// Everything is worked out here on the CPU and written into that geometry's
// two arrays, so one plain material draws it on both renderers and there is
// no shader to keep in two languages. FlightDriver is the only caller, on its
// own frames; nothing here allocates after the module has loaded, and nothing
// is random: a puff's size, drift and timing come from its number, so the
// same landing always draws the same dust.
//
// Frame: the world's, as the scene draws it (the board at the origin, y up).
// The ground rolls under the board (ADR-67), so dust that has left the wheels
// stays with the ground: it falls behind by the distance rolled since.
import { WHEEL } from '../asset/spec';
import { SETTLE } from '../sim/settle';
import type { Grade } from '../sim/landing';
import { ART } from './artDirection';

const D = ART.dust;

/** Puffs at touchdown (some at each wheel), then the slide's. */
export const TOUCHDOWN_PUFFS = 4 * D.touchdown.perWheel;
export const DUST_PUFFS = TOUCHDOWN_PUFFS + D.slide.puffs;
/** Vertices in one puff: its centre and its rim. */
export const PUFF_VERTICES = 1 + D.segments;

/** One landing's dust. Seconds are the roll's (slowed with the playback speed). */
export interface Dust {
  /** A landing has happened and its dust is not yet placed (set from the store, placed on the next frame). */
  pending: boolean;
  /** Dust is in the air: the mesh is drawn. */
  live: boolean;
  /** Seconds since touchdown. */
  t: number;
  /** The roll's distance at touchdown. */
  from: number;
  /** Whether the slide's puffs are used (a bail). */
  slides: boolean;
  /** Per puff: when it is born, how long it lives, where (on the ground, at birth), its drift (m/s), its size (a factor) and whether it has been placed. */
  born: Float32Array;
  life: Float32Array;
  x: Float32Array;
  z: Float32Array;
  vx: Float32Array;
  vz: Float32Array;
  size: Float32Array;
  /** The roll's distance when the puff was born: it falls behind from there. */
  at: Float32Array;
  placed: Uint8Array;
}

export const newDust = (): Dust => ({
  pending: false,
  live: false,
  t: 0,
  from: 0,
  slides: false,
  born: new Float32Array(DUST_PUFFS),
  life: new Float32Array(DUST_PUFFS),
  x: new Float32Array(DUST_PUFFS),
  z: new Float32Array(DUST_PUFFS),
  vx: new Float32Array(DUST_PUFFS),
  vz: new Float32Array(DUST_PUFFS),
  size: new Float32Array(DUST_PUFFS),
  at: new Float32Array(DUST_PUFFS),
  placed: new Uint8Array(DUST_PUFFS),
});

/** The one dust, shared by every mount of FlightDriver (a tier change remounts it mid-landing). */
export const dust = newDust();

/** A repeatable number in [0, 1) for puff `i`, stream `k` (no Math.random: the same landing draws the same dust). */
export function dustNoise(i: number, k: number): number {
  const x = Math.sin(i * 127.1 + k * 311.7 + 1.3) * 43758.5453;
  return x - Math.floor(x);
}

/** The unit rim of a puff, cos and sin per vertex, worked out once. */
const RIM_COS = new Float32Array(D.segments);
const RIM_SIN = new Float32Array(D.segments);
for (let j = 0; j < D.segments; j++) {
  RIM_COS[j] = Math.cos((j / D.segments) * Math.PI * 2);
  RIM_SIN[j] = Math.sin((j / D.segments) * Math.PI * 2);
}

/**
 * Places a landing's dust. `yaw` is the board's turn about the vertical as
 * the scene has it (radians, the board group's rotation.y), so the puffs
 * start at its four wheels whichever way it landed; `distance` is the roll's
 * distance now. A sketchy landing and a bail kick up more than a clean one,
 * and a bail also arms the slide's puffs (stepDust places each as it is born).
 */
export function spawnDust(d: Dust, yaw: number, grade: Grade, distance: number) {
  const T = D.touchdown;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const more = grade === 'clean' ? 1 : grade === 'sketchy' ? T.sketchy : T.bail;
  d.pending = false;
  d.live = true;
  d.t = 0;
  d.from = distance;
  d.slides = grade === 'bail';
  for (let i = 0; i < TOUCHDOWN_PUFFS; i++) {
    const wheel = i % 4;
    const lx = (wheel < 2 ? 1 : -1) * WHEEL.centerX;
    const side = wheel % 2 === 0 ? 1 : -1;
    const lz = side * WHEEL.centerZ;
    // Out to the wheel's own side, with a little along the board either way.
    const ox = (dustNoise(i, 1) - 0.5) * 0.8;
    const oz = side * (0.6 + 0.4 * dustNoise(i, 2));
    const speed = T.spread * (0.5 + dustNoise(i, 3));
    // The board's frame to the world's: a turn of `yaw` about +Y.
    d.x[i] = lx * c + lz * s;
    d.z[i] = -lx * s + lz * c;
    d.vx[i] = (ox * c + oz * s) * speed;
    d.vz[i] = (-ox * s + oz * c) * speed;
    d.born[i] = 0;
    d.life[i] = T.life * (0.7 + 0.3 * dustNoise(i, 4));
    d.size[i] = more * (0.75 + 0.5 * dustNoise(i, 5));
    d.at[i] = distance;
    d.placed[i] = 1;
  }
  const SL = D.slide;
  for (let k = 0; k < SL.puffs; k++) {
    const i = TOUCHDOWN_PUFFS + k;
    // Born one after another while the board still slides fast.
    d.born[i] = ((k + 0.5) / SL.puffs) * SL.until * SETTLE.bail.slideS;
    d.life[i] = SL.life * (0.7 + 0.3 * dustNoise(i, 4));
    d.size[i] = 0.75 + 0.5 * dustNoise(i, 5);
    d.placed[i] = 0;
  }
}

/**
 * Moves the dust on by `dt` seconds. `boardX` and `boardZ` are where the
 * landing has slid the board to (0, 0 unless it is a bail), along a straight
 * line from where it landed (ADR-92), so the way it slides is the way to
 * there; `nose` is that way along the world's X before it has moved. A slide
 * puff is born at the board's trailing end where that is then, so the trail
 * comes out from behind the deck instead of hiding under it. `distance` is the roll's distance now. Returns whether
 * any dust is still in the air.
 */
export function stepDust(d: Dust, dt: number, boardX: number, boardZ: number, nose: 1 | -1, distance: number): boolean {
  if (!d.live) return false;
  d.t += dt;
  const SL = D.slide;
  const slid = Math.hypot(boardX, boardZ);
  const wx = slid > 1e-6 ? boardX / slid : nose;
  const wz = slid > 1e-6 ? boardZ / slid : 0;
  let alive = false;
  for (let i = 0; i < DUST_PUFFS; i++) {
    const slide = i >= TOUCHDOWN_PUFFS;
    if (slide && !d.slides) continue;
    if (!d.placed[i] && d.t >= d.born[i]!) {
      // Behind the board the way it slides, across its width, drifting a little to either side.
      const back = SL.behind[0] + (SL.behind[1] - SL.behind[0]) * dustNoise(i, 1);
      const across = (dustNoise(i, 2) - 0.5) * 2 * SL.across;
      d.x[i] = boardX - wx * back - wz * across;
      d.z[i] = boardZ - wz * back + wx * across;
      d.vx[i] = (dustNoise(i, 3) - 0.5) * SL.spread;
      d.vz[i] = (dustNoise(i, 6) - 0.5) * SL.spread;
      d.at[i] = distance;
      d.placed[i] = 1;
    }
    if (d.t < d.born[i]! + d.life[i]!) alive = true;
  }
  d.live = alive;
  return alive;
}

/** How far through its life puff `i` is: below 0 unborn, 1 and over gone. */
export const puffAge = (d: Dust, i: number) => (d.t - d.born[i]!) / d.life[i]!;

/** A puff's opacity at age `u`: in quickly, then thinning out to nothing. */
export function puffOpacity(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  const rise = u < D.fadeIn ? u / D.fadeIn : 1;
  const fall = 1 - u;
  return D.opacity * rise * fall * fall;
}

/** A puff's radius at age `u`, for its range: it swells fast, then slowly. */
export function puffRadius(u: number, range: readonly [number, number]): number {
  const k = u <= 0 ? 0 : u >= 1 ? 1 : 1 - (1 - u) * (1 - u);
  return range[0] + (range[1] - range[0]) * k;
}

/**
 * Writes every puff into the geometry's arrays: `positions` (3 per vertex)
 * and `colors` (4 per vertex; only the alpha is written, the centre's opacity
 * and 0 at the rim, so the edge is soft). Each is a disc facing the camera:
 * `camera` is the camera's world matrix (its first two columns are its right
 * and up). `distance` is the roll's distance now and `nose` the way the nose
 * points along the world's X, so each puff falls behind by what has rolled
 * since it was born. A puff that is not in the air is written with no size
 * and no opacity. No allocation.
 */
export function writeDust(d: Dust, positions: Float32Array, colors: Float32Array, camera: ArrayLike<number>, distance: number, nose: 1 | -1) {
  const rx = camera[0]!, ry = camera[1]!, rz = camera[2]!;
  const ux = camera[4]!, uy = camera[5]!, uz = camera[6]!;
  for (let i = 0; i < DUST_PUFFS; i++) {
    const slide = i >= TOUCHDOWN_PUFFS;
    const part = slide ? D.slide : D.touchdown;
    const u = d.live && d.placed[i] && (!slide || d.slides) ? puffAge(d, i) : -1;
    const a = puffOpacity(u);
    const r = a > 0 ? puffRadius(u, part.radius) * d.size[i]! : 0;
    const age = a > 0 ? u * d.life[i]! : 0;
    const cx = d.x[i]! + d.vx[i]! * age - nose * (distance - d.at[i]!);
    const cz = d.z[i]! + d.vz[i]! * age;
    // Resting on the ground as it starts, lifting as it swells.
    const cy = r * D.sit + part.rise * (a > 0 ? u : 0);
    let p = i * PUFF_VERTICES * 3;
    let q = i * PUFF_VERTICES * 4 + 3;
    positions[p] = cx;
    positions[p + 1] = cy;
    positions[p + 2] = cz;
    colors[q] = a;
    for (let j = 0; j < D.segments; j++) {
      p += 3;
      q += 4;
      const co = RIM_COS[j]! * r;
      const si = RIM_SIN[j]! * r;
      positions[p] = cx + rx * co + ux * si;
      positions[p + 1] = cy + ry * co + uy * si;
      positions[p + 2] = cz + rz * co + uz * si;
      colors[q] = 0;
    }
  }
}
