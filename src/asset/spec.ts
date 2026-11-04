// The realistic board, as numbers. Pasted from docs/DESIGN.md section 7
// "Realistic board (2026-11-04)". Units are metres. Conventions: origin at the
// deck centre (midpoint of the wheelbase), long axis X, nose +X, grip faces +Y,
// toe side +Z. Pure data: no three, no React, so the build script, the tests
// and the runtime all read the same numbers.

export type V3 = readonly [number, number, number];

/** 7.2 plan outline: half width as a function of x, for the outer edge (inset 0). */
export const OUTLINE = {
  tailTip: -0.397,
  noseTip: 0.4095,
  length: 0.8065,
  width: 0.2032,
  /** Middle region: w = halfWidth - drop * (x / dropAt)^2. */
  middle: { from: -0.25, to: 0.26, halfWidth: 0.1016, drop: 0.0031, dropAt: 0.26 },
  /** Superellipse ends: w = size * (1 - s^p)^(1/p), s = distance from the join / length. */
  tail: { join: -0.25, length: 0.147, size: 0.0987, exponent: 2.4 },
  nose: { join: 0.26, length: 0.1495, size: 0.0985, exponent: 2.2 },
  /** Points per side per region (7.2 "nested outline rings"). */
  intervals: 24,
} as const;

/** 7.2 kicks: a cubic in s = (|x| - start) / L with zero slope at the start. */
export const KICK = {
  start: 0.235,
  nose: { length: 0.1745, a: 0.0595, b: 0.0185, tipHeight: 0.041, tipAngleDeg: 20 },
  tail: { length: 0.162, a: 0.0552, b: 0.0182, tipHeight: 0.037, tipAngleDeg: 19 },
} as const;

/** 7.2 concave: rails 12 mm above the centreline in the flat, 40 percent of that at the tips. */
export const CONCAVE = { depth: 0.012, tipKeep: 0.4 } as const;

/** 7.2 thickness and edge profile. */
export const DECK = {
  thickness: 0.0115,
  plies: 7,
  bevelRadius: 0.004,
} as const;

export type DeckGroup = 'grip' | 'wood' | 'graphic';

/**
 * 7.2 ring table: inset d from the outline, height h along the surface normal.
 * `spine: true` means half width 0 (all z = 0); a spine takes its x positions
 * from the 0.082 ring next to it. A band between ring i and ring i + 1 belongs
 * to `group` of ring i (grip 0 to 5, wood 6 to 12, graphic 13 to 18).
 *
 * 20 rings, not the 19 DESIGN.md names: its row "14 to 18" lists five insets
 * and then the spine, which is six rings for five slots. Reading it as the
 * mirror of the top (spine, 0.082, ..., 0.004) gives rings 0 to 19, with the
 * spines at 0 and 19, and the same tessellation on the graphic as on the grip.
 */
export const RINGS: readonly { d: number; h: number; spine?: true; group: DeckGroup }[] = [
  { d: 0.082, h: 0.00575, spine: true, group: 'grip' },
  { d: 0.082, h: 0.00575, group: 'grip' },
  { d: 0.064, h: 0.00575, group: 'grip' },
  { d: 0.046, h: 0.00575, group: 'grip' },
  { d: 0.03, h: 0.00575, group: 'grip' },
  { d: 0.016, h: 0.00575, group: 'grip' },
  { d: 0.004, h: 0.00575, group: 'wood' },
  { d: 0.002, h: 0.00521, group: 'wood' },
  { d: 0.00054, h: 0.00375, group: 'wood' },
  { d: 0, h: 0.00175, group: 'wood' },
  { d: 0, h: -0.00175, group: 'wood' },
  { d: 0.00054, h: -0.00375, group: 'wood' },
  { d: 0.002, h: -0.00521, group: 'wood' },
  { d: 0.004, h: -0.00575, group: 'graphic' },
  { d: 0.016, h: -0.00575, group: 'graphic' },
  { d: 0.03, h: -0.00575, group: 'graphic' },
  { d: 0.046, h: -0.00575, group: 'graphic' },
  { d: 0.064, h: -0.00575, group: 'graphic' },
  { d: 0.082, h: -0.00575, group: 'graphic' },
  { d: 0.082, h: -0.00575, spine: true, group: 'graphic' },
];

/** 7.4 hardware, nose truck. The tail truck mirrors x. */
export const TRUCK = {
  centerX: 0.208,
  /** Deck bottom under a truck (flat, no kick, zero concave on the centreline). */
  deckBottom: -0.00575,
  bolts: { x: [0.181, 0.235], z: 0.0205, radius: 0.00475, height: 0.002, base: 0.0055, segments: 8 },
  baseplate: { size: [0.1, 0.008, 0.06] as V3, radius: 0.002, center: [0.2155, -0.00975, 0] as V3 },
  pivotCup: { radius: 0.011, length: 0.016, segments: 12, center: [0.2448, -0.0203, 0] as V3 },
  /** 40 deg from vertical, leaning outboard. */
  pivotAxis: [0.6428, 0.766, 0] as V3,
  kingpin: { radius: 0.0045, length: 0.052, segments: 10, start: [0.198, -0.01375, 0] as V3 },
  /** 20 deg from vertical, leaning inboard. */
  kingpinAxis: [-0.342, -0.9397, 0] as V3,
  /** Stack on the kingpin, distances along kingpinAxis from kingpin.start. */
  cupWasherTop: { radius: 0.0125, from: 0, to: 0.0012, segments: 16 },
  bushingTop: { radiusFrom: 0.0125, radiusTo: 0.0115, from: 0.0012, to: 0.0157, segments: 16 },
  bushingBottom: { radiusFrom: 0.0115, radiusTo: 0.0105, from: 0.0277, to: 0.0397, segments: 16 },
  cupWasherBottom: { radius: 0.012, from: 0.0397, to: 0.0409, segments: 16 },
  kingpinNut: { radius: 0.0075, from: 0.0409, to: 0.0479, segments: 6 },
  yoke: { size: [0.03, 0.036, 0.04] as V3, radius: 0.004, center: [0.1993, -0.046, 0] as V3, rotZDeg: -20 },
  axleHousing: { size: [0.028, 0.022, 0.122] as V3, radius: 0.006, center: [0.208, -0.05775, 0] as V3 },
  pivot: { radius: 0.0075, length: 0.03, segments: 10, start: [0.22, -0.04975, 0] as V3 },
  axle: { radius: 0.004, length: 0.203, segments: 12 },
  speedWashers: { radius: 0.0065, ranges: [[0.061, 0.062], [0.094, 0.095]] as const, segments: 12 },
  axleNuts: { radius: 0.0062, range: [0.095, 0.101] as const, segments: 6 },
  /**
   * Rounded-box arc segments. DESIGN.md says 4 per edge; three's
   * RoundedBoxGeometry spends (2s + 1)^2 quads per face, so 4 costs 972
   * triangles per box (2,916 per truck for three boxes). 2 and 3 keep the
   * fillets visible at close range for 300 and 588.
   */
  roundSegments: { baseplate: 2, yoke: 3, axleHousing: 3 },
} as const;

/** 7.5 wheel lathe profile, (r, z) with z along the axle, +z outboard. */
export const WHEEL = {
  centerX: 0.208,
  centerY: -0.05775,
  centerZ: 0.078,
  radius: 0.0265,
  width: 0.032,
  radialSegments: 32,
  profile: [
    [0.004, -0.015],
    [0.011, -0.015],
    [0.011, -0.016],
    [0.02, -0.016],
    [0.0235, -0.0155],
    [0.0255, -0.013],
    [0.0263, -0.0105],
    [0.0265, -0.009],
    [0.0265, 0.009],
    [0.0263, 0.0105],
    [0.0255, 0.013],
    [0.0235, 0.0155],
    [0.02, 0.016],
    [0.011, 0.016],
    [0.011, 0.015],
    [0.004, 0.015],
  ] as readonly (readonly [number, number])[],
} as const;

/** 7.1: group height at rest, so the wheel bottoms touch y = 0. */
export const REST_Y = -(WHEEL.centerY - WHEEL.radius);

/** 7.3 to 7.5 materials, sRGB hex. `map` names a texture in TEXTURES. */
export const MATERIALS = {
  grip: { name: 'Grip', color: '#ffffff', roughness: 0.95, metalness: 0, map: 'grip' },
  wood: { name: 'Wood', color: '#ffffff', roughness: 0.7, metalness: 0, map: 'ply' },
  graphic: { name: 'Graphic', color: '#ffffff', roughness: 0.45, metalness: 0, map: 'deckBottom' },
  aluminium: { name: 'Aluminium', color: '#b7babd', roughness: 0.5, metalness: 0.85 },
  steel: { name: 'Steel', color: '#cfd2d5', roughness: 0.28, metalness: 1.0 },
  bushing: { name: 'Bushing', color: '#d9a441', roughness: 0.55, metalness: 0 },
  wheel: { name: 'Urethane', color: '#ffffff', roughness: 0.55, metalness: 0, map: 'wheel' },
} as const;

export type MaterialKey = keyof typeof MATERIALS;

/** 7.1 and 7.3 to 7.5 textures. */
export const TEXTURES = {
  grip: { file: 'grip.png', width: 512, height: 512, wrap: 'repeat', tile: 0.2 },
  deckBottom: { file: 'deck-bottom.png', width: 1024, height: 256, wrap: 'clamp' },
  ply: { file: 'ply.png', width: 16, height: 128, wrap: 'clamp' },
  wheel: { file: 'wheel.png', width: 16, height: 256, wrap: 'clamp' },
} as const;

export type TextureKey = keyof typeof TEXTURES;

/** 7.3 grip grit recipe. */
export const GRIP_RECIPE = {
  seed: 20261104,
  fill: [26, 26, 28] as V3,
  jitter: 3,
  grains: 60000,
  /** [radius px, weight] */
  grainRadii: [
    [0.6, 0.6],
    [0.9, 0.3],
    [1.3, 0.1],
  ] as const,
  lift: { base: 6, scale: 30 },
  glints: 1500,
  glintLift: 50,
} as const;

/** 7.3 ply stripes, top ply first. */
export const PLY_COLORS = ['#dcc79e', '#cdb384', '#d7c096', '#7a2e1c', '#d2b98f', '#c9ae7f', '#d9c39a'] as const;
export const GLUE_COLOR = '#8a7652';

/** 7.5 wheel bands, one per lathe segment (15). */
export const WHEEL_BANDS = {
  shield: '#2c2d30',
  race: '#a6aaae',
  urethane: '#ece6d6',
  shoulder: '#e4ddcc',
  tread: '#dcd4c2',
  raceRows: 3,
} as const;

/**
 * Glb node names, one mesh with one primitive each, so one draw call each.
 * GLTFLoader keeps these names (underscores survive its sanitizer).
 */
export const PARTS = [
  { node: 'Deck_Grip', material: 'grip' },
  { node: 'Deck_Wood', material: 'wood' },
  { node: 'Deck_Graphic', material: 'graphic' },
  { node: 'Truck_Aluminium', material: 'aluminium' },
  { node: 'Truck_Steel', material: 'steel' },
  { node: 'Truck_Bushings', material: 'bushing' },
  { node: 'Wheels', material: 'wheel' },
] as const satisfies readonly { node: string; material: MaterialKey }[];

export type PartName = (typeof PARTS)[number]['node'];

/** BRIEF-BOARD.md budget, checked by scripts/check-assets.ts. */
export const BUDGET = {
  drawCalls: 8,
  triangles: 25000,
  fileBytes: 300 * 1024,
  textures: 4,
  textureMaxSide: 1024,
  sceneDrawCalls: 20,
} as const;

/** Where the build writes and the runtime loads the model (relative to public/). */
export const BOARD_GLB = 'models/board.glb';
