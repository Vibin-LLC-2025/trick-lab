// The concrete ground, as numbers (realistic ground pass, 2026-11-04, ADR-31).
// One texture tile is one slab bay of the old pad's size; the GLB is a large
// plane whose UVs repeat that tile, so the resting board sits centred in a bay
// and the slab grid runs off into the fog. Units are metres, sRGB hex colours.
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
 * Texture resolution. Colour and normal at 1024 (1.56 x 1.17 mm per texel,
 * about one screen pixel at the home view on a 1000 px tall stage); roughness
 * is low-frequency, so 512 is enough and saves bytes.
 */
export const GROUND_TEXTURES = {
  color: { file: 'concrete-color.png', width: 1024, height: 1024 },
  normal: { file: 'concrete-normal.png', width: 1024, height: 1024 },
  roughness: { file: 'concrete-roughness.png', width: 256, height: 256 },
} as const;

export type GroundTextureKey = keyof typeof GROUND_TEXTURES;

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
  /** Fine grain: smooth noise a couple of texels across, so the PNG predicts it well. */
  grain: { cell: 0.0035, amplitude: 2.5 },
  /** Exposed aggregate: specks lighter or darker than the paste, slightly proud, a little smoother. */
  aggregate: { count: 9000, radius: [0.0008, 0.0026] as const, levels: 14, height: 0.00005, proudAbove: 0.002, roughness: -0.08 },
  /** Shallow pits (air voids): darker, rougher, sunk. */
  pits: { count: 1400, radius: [0.0006, 0.0018] as const, depth: 0.0006, levels: -18 },
  /** Hairline cracks: seeded random walks from a few starting points. */
  cracks: { count: 5, length: [0.18, 0.5] as const, step: 0.003, wander: 0.35, depth: 0.0004, width: 0.0012, levels: -16 },
} as const;

/**
 * Expansion joint along the bay edges, baked into all three maps: `width`
 * across, `depth` deep, with rounded `shoulder`s. Darker (dirt) and rough.
 */
export const JOINT = { width: 0.012, depth: 0.004, shoulder: 0.003, levels: -42, roughness: 1.0 } as const;

/**
 * The worn painted centre mark, where the pad's mark mesh was: 0.9 x 0.02 m
 * along X at the bay centre. Faint (it lifts the grey by at most `levels`),
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
 * matte; worn patches (and the area around the bay centre, where boards
 * roll) are a little smoother, dust specks rougher.
 */
export const ROUGHNESS = {
  base: 0.93,
  worn: { cell: 0.22, octaves: 2, below: 0.45, to: 0.78 },
  centre: { radius: [0.5, 0.35] as const, by: 0.06 },
  dust: { count: 3000, radius: [0.001, 0.003] as const, to: 1.0 },
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
