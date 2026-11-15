// The skate spot (step 14, ADR-69), as numbers: a red kerb, a flat rail, a
// concrete ledge and a wall, behind the board (-Z, away from every camera),
// grouped within `SPOT.span` of x so the whole group can wrap out of sight in
// the fog as the ground rolls (scene/roll.ts). Scenery only: nothing is
// ground on or cleared. Units are metres, y up from the ground, x along the
// way the board rolls, z across (the board is at z = 0). sRGB hex colours.
// Pure data: no three, no React. Read by spot.ts, spotTextures.ts, the build
// script, the budget checker and src/scene.

/** A box piece: x from-to, z from-to, height, and its paint. */
export interface SpotBox {
  name: string;
  x: readonly [number, number];
  z: readonly [number, number];
  height: number;
  color: string;
}

export const SPOT = {
  /** Every piece lies within +- span of x = 0, so the group fits between the two fogged ends of its loop. */
  span: 5.6,
  /**
   * The loop the group wraps over as the ground rolls: it leaves the view on
   * one side at half this and comes back on the other. 50 m: at the wrap
   * the nearest piece is 19.4 m from the board's centre, past the fog (15 m
   * from the camera) for any camera within 4 m of the board along x.
   */
  loop: 50,
  /**
   * A low kerb painted red, the classic: its top front edge chamfered. Its
   * grind edge (ADR-102, 2026-11-13): the chamfer and a `wax.depth` strip of
   * the top behind it darkened by wax and trucks (`wax.color`), and the paint
   * chipped on the chamfer to the concrete under it (`chip.color`, grimy) along `chips` (x from-to).
   */
  kerb: {
    x: [-5.0, 1.0],
    z: [-1.3, -1.05],
    height: 0.15,
    chamfer: 0.03,
    color: '#7d352b',
    wax: { depth: 0.035, color: '#552420' },
    chip: { color: '#4f4842' },
    chips: [[-4.4, -4.34], [-3.05, -3.01], [-2.16, -2.08], [-0.96, -0.92], [0.24, 0.31]],
  },
  /**
   * A flat rail on two square posts with base plates, bare steel since ADR-102
   * (2026-11-13; painted near black, `#26282b`, until then), drawn with the
   * steel material; the bar's top faces ground bright (`polish`).
   */
  rail: {
    x: [1.8, 4.6],
    z: -1.6,
    height: 0.32,
    radius: 0.022,
    sides: 10,
    posts: [2.1, 4.3],
    post: 0.04,
    plate: { size: 0.14, height: 0.008 },
    color: '#6f7377',
    polish: '#a3a7ab',
  },
  /**
   * A concrete ledge, its top front edge capped by a steel angle (steel
   * material, its top ground bright, `anglePolish`). ADR-102: its top edges
   * bevelled by `bevel` (the front one under the angle), and a `wax` band of
   * the top behind the angle darkened where it is ground.
   */
  ledge: {
    x: [-3.6, 0.2],
    z: [-2.55, -2.0],
    height: 0.42,
    angle: 0.012,
    color: '#8f918d',
    angleColor: '#62666a',
    anglePolish: '#9a9ea2',
    bevel: 0.012,
    wax: { depth: 0.07, color: '#757773' },
  },
  /**
   * A plain concrete wall at the back, in formwork panels: ADR-102, its top
   * edges bevelled by `bevel`, and the front cut into `panel`-wide panels by
   * darker joints `joint` wide.
   */
  wall: { x: [-5.6, 5.6], z: [-4.4, -4.1], height: 1.7, color: '#7d7f7b', bevel: 0.02, panel: 1.2, joint: 0.014, jointColor: '#5d5f5b' },
} as const;

/** The pieces' footprints and heights, for the soft shadows under them (scene/resources.ts). */
export const SPOT_FOOTPRINTS: readonly SpotBox[] = [
  { name: 'kerb', x: SPOT.kerb.x, z: SPOT.kerb.z, height: SPOT.kerb.height, color: SPOT.kerb.color },
  {
    name: 'rail',
    x: SPOT.rail.x,
    z: [SPOT.rail.z - SPOT.rail.plate.size / 2, SPOT.rail.z + SPOT.rail.plate.size / 2],
    height: SPOT.rail.height,
    color: SPOT.rail.color,
  },
  { name: 'ledge', x: SPOT.ledge.x, z: SPOT.ledge.z, height: SPOT.ledge.height, color: SPOT.ledge.color },
  { name: 'wall', x: SPOT.wall.x, z: SPOT.wall.z, height: SPOT.wall.height, color: SPOT.wall.color },
];

/**
 * The concrete's detail texture: one grey colour map and its normal map,
 * each one tile of `tile` metres, repeated over the group by a texture
 * transform (UVs run 0 to 1 over `uvSpan` metres so they quantize). The
 * vertex colour paints each piece; the map is near white so the paint holds.
 */
export const SPOT_TEXTURES = {
  tile: 1.0,
  uvSpan: 12,
  color: { file: 'spot-color.png', width: 512, height: 512 },
  normal: { file: 'spot-normal.png', width: 512, height: 512 },
  seed: 20261110,
  /** Grey levels of the colour map: its mean, and how far tone and grain move it. */
  fill: 212,
  tone: { cell: 0.25, amplitude: 10 },
  grain: { cell: 0.02, amplitude: 5 },
  /** The normal map's relief: metres of height per unit of noise, and the strength it is drawn at. */
  relief: 0.0012,
} as const;

/**
 * Two meshes, two materials, two draw calls (ADR-102, 2026-11-13; one until
 * then): the concrete (kerb, ledge, wall) and the steel (the rail, its posts
 * and plates, the ledge's angle). Both are painted by vertex colour over the
 * same colour map; only the concrete takes the normal map.
 */
export const SPOT_PARTS = [
  { node: 'Spot_Concrete', material: 'concrete' },
  { node: 'Spot_Steel', material: 'steel' },
] as const;

export const SPOT_MATERIAL = { name: 'Spot concrete', roughness: 0.9, metalness: 0 } as const;
/** The steel: one constant roughness and metalness (ADR-102); the polished faces are lighter paint, not a roughness map. */
export const SPOT_STEEL_MATERIAL = { name: 'Spot steel', roughness: 0.42, metalness: 0.85 } as const;
