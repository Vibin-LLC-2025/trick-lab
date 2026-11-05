// The concrete ground, as numbers (realistic ground pass, 2026-11-04, ADR-31).
// A slab bay is the old pad's size; the GLB is a large plane whose UVs repeat
// each map's tile of bays (one bay of relief, four of colour, nine of
// roughness, ADR-40), so the resting board sits centred in a bay and the slab
// grid runs off into the fog. Units are metres, sRGB hex colours.
// Pure data: no three, no React. Read by groundTextures.ts, ground.ts, the
// build script, the budget checker and src/scene/artDirection.ts.
import { WHEEL } from './spec';

/**
 * One slab bay, the old pad (1.6 x 1.2 m: two deck lengths across, wider than
 * the 0.84 m circle the deck sweeps in a shove). x along the board, z across.
 */
export const BAY = { x: 1.6, z: 1.2 } as const;

/**
 * Bays across the plane. Odd counts put a bay centre (not a joint) at the
 * origin under the resting board, and the plane's edges on joints. 25 x 33
 * bays is 40 x 39.6 m: half of it (about 20 m) is past the fog's far
 * distance from every allowed camera, so the edge is never seen.
 */
export const PLANE_BAYS = { x: 25, z: 33 } as const;

export const PLANE = { x: BAY.x * PLANE_BAYS.x, z: BAY.z * PLANE_BAYS.z } as const;

/**
 * The three maps, each a tile of `bays` slab bays (x by z), repeated over the
 * plane by its own KHR_texture_transform (PLANE_BAYS / bays), so the bays no
 * longer repeat one identical tile (ADR-40, 2026-11-05).
 * - normal: one bay at 1024 (1.56 x 1.17 mm per texel): the joint, the
 *   aggregate and the pits, the fine relief that has to stay sharp and that
 *   nobody can tell apart from bay to bay.
 * - color: four different bays, 2 x 2, at 1024 (3.1 x 2.3 mm per texel):
 *   the fine grey detail of the normal map's bay, box filtered, plus per bay
 *   its own tone, slab shade, cracks and stains; the mark and the wheel
 *   marks are only in the bay under the board.
 * - roughness: nine bays, 3 x 3, at 512 (9.4 x 7.0 mm): worn patches, joints
 *   and a slab offset per bay.
 * 2 and 3 have no common factor, so colour and roughness line up the same
 * way only every 6 x 6 bays (9.6 x 7.2 m), most of what the fog leaves.
 */
export const GROUND_TEXTURES = {
  color: { file: 'concrete-color.png', width: 1024, height: 1024, bays: [2, 2] as const },
  normal: { file: 'concrete-normal.png', width: 1024, height: 1024, bays: [1, 1] as const },
  roughness: { file: 'concrete-roughness.png', width: 512, height: 512, bays: [3, 3] as const },
} as const;

export type GroundTextureKey = keyof typeof GROUND_TEXTURES;

/** The KHR_texture_transform scale of a map: how many of its tiles fit across the plane's UV range. */
export const groundRepeat = (key: GroundTextureKey): [number, number] => {
  const [bx, bz] = GROUND_TEXTURES[key].bays;
  return [PLANE_BAYS.x / bx, PLANE_BAYS.z / bz];
};

/**
 * The bay of a map's tile that lies under the origin (the resting board):
 * the plane's centre (UV 0.5) is at tile coordinate 0.5 * PLANE_BAYS / bays.
 */
export const originBay = (key: GroundTextureKey): [number, number] => {
  const [bx, bz] = GROUND_TEXTURES[key].bays;
  const f = (t: number) => t - Math.floor(t);
  return [Math.floor(f((0.5 * PLANE_BAYS.x) / bx) * bx), Math.floor(f((0.5 * PLANE_BAYS.z) / bz) * bz)];
};

/**
 * Base colour. The colour map is one grey channel (like the medium grip):
 * `fill` is the mean grey level, and the material's base colour factor tints
 * it so the mean lands on `color`. `color` is the old pad's #616466, which
 * the lights were tuned against; the untextured Low plane uses it directly.
 */
export const CONCRETE = {
  seed: 20261131,
  color: '#616466',
  fill: 150,
  /** Large-scale tonal variation (trowel passes, curing): value noise, grey levels. */
  tone: { cell: 0.4, octaves: 3, amplitude: 9 },
  /** Mid mottling. */
  mottle: { cell: 0.05, octaves: 2, amplitude: 4 },
  /**
   * Fine grain: smooth noise a few colour texels across, so the PNG predicts
   * it (12 mm since the colour texel is 3.1 mm, ADR-40: at 3.5 mm it was
   * per-texel noise and 154 KB of the colour map).
   */
  grain: { cell: 0.012, amplitude: 2.5 },
  /** Exposed aggregate: specks lighter or darker than the paste, the larger ones slightly proud. */
  aggregate: { count: 9000, radius: [0.0008, 0.0026] as const, levels: 14, height: 0.00005, proudAbove: 0.002 },
  /** Shallow pits (air voids): darker and sunk. */
  pits: { count: 1400, radius: [0.0006, 0.0018] as const, depth: 0.0006, levels: -18 },
  /**
   * Hairline cracks, colour only (the normal map is shared by every bay):
   * per bay of the colour tile `perBay[0]` to `perBay[1]` seeded random
   * walks. Thinner than a colour texel, so each is drawn a texel wide at the
   * same total darkness (levels times width over the texel).
   */
  cracks: { perBay: [0, 4] as const, length: [0.18, 0.55] as const, step: 0.003, wander: 0.35, width: 0.0012, levels: -16 },
  /** Per bay of the colour tile: each slab poured on its own day, a shade lighter or darker. */
  slab: { levels: 5 },
  /** Per bay of the colour tile: up to `max` soft dark stains (rubber, oil, water), radius in metres. */
  stains: { max: 2, radius: [0.07, 0.22] as const, levels: [-4, -9] as const },
} as const;

/**
 * Expansion joint along the bay edges, baked into all three maps: `width`
 * across, `depth` deep, with rounded `shoulder`s. Darker (dirt) and rough.
 */
export const JOINT = { width: 0.012, depth: 0.004, shoulder: 0.003, levels: -42, roughness: 1.0 } as const;

/**
 * The worn painted centre mark, where the pad's mark mesh was: 0.9 x 0.02 m
 * along X at the centre of the bay under the board (only that bay of the
 * colour and roughness tiles, so one bay in four shows it). Faint (it lifts the grey by at most `levels`),
 * thinned to `kept` where the wear noise is below `wear.below`, its edges
 * ragged by up to `edge` metres, a little smoother than the concrete.
 */
export const MARK = {
  length: 0.9,
  width: 0.02,
  levels: 8,
  wear: { cell: 0.008, below: 0.5, soft: 0.1, kept: 0.25 },
  edge: 0.0015,
  roughness: 0.8,
} as const;

/**
 * Roughness (glTF metallicRoughness green; the map is one grey channel, so
 * metalness reads the same value times a metallic factor of 0). Concrete is
 * matte; worn patches (and the area around the centre of the bay under the
 * board, where boards roll) are a little smoother. Each bay of the 3 x 3
 * tile is offset by up to `slab`. (The 3,000 dust specks of the one-bay
 * map were 1 to 3 mm, below this map's 9 mm texel, so they went.)
 */
export const ROUGHNESS = {
  base: 0.93,
  worn: { cell: 0.22, octaves: 2, below: 0.45, to: 0.78 },
  centre: { radius: [0.5, 0.35] as const, by: 0.06 },
  slab: 0.03,
} as const;

/**
 * Where the wheels rest (step 4 of the ground brief): a faint polish and
 * a urethane smudge under each of the four wheels of the resting board. The
 * board turns 180 degrees for regular, which lands on the same four points.
 */
export const WHEEL_MARKS = {
  x: WHEEL.centerX,
  z: WHEEL.centerZ,
  radius: [0.035, 0.022] as const,
  levels: -7,
  roughness: -0.12,
} as const;

/** Normal map strength (glTF normalTexture scale); the height field is in metres, so 1 is physical. */
export const GROUND_NORMAL_SCALE = 1.0;

/** GLB node names: one mesh, one primitive, one draw call. */
export const GROUND_PARTS = [{ node: 'Ground_Concrete', material: 'concrete' }] as const;

export const GROUND_MATERIAL = { name: 'Concrete', roughness: 1.0, metalness: 0 } as const;
