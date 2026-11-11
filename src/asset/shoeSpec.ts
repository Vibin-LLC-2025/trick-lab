// The skate shoe, as numbers (feet pass, 2026-11-04; construction pass,
// 2026-11-05, ADR-39). One right shoe; the runtime mirrors it for the left
// foot. Units are metres. Conventions: origin at the centre of the
// footprint's bounding box on the bottom of the sole (the sole rests on
// y = 0), toe +X, heel -X, up +Y, lateral (little-toe) side +Z, medial
// (big-toe) side -Z. Positions along the shoe are t (0 heel tip, 1 toe tip).
// Pure data: no three, no React.

/**
 * Overall size. Must equal FOOT in src/sim/feet.ts (shoe.test.ts asserts it),
 * which places the feet on the board from these numbers. The construction
 * pass keeps this envelope: the toe spring lifts the upper and the foxing,
 * never the sole's underside, and adds nothing outside the footprint.
 */
export const SHOE = {
  length: 0.285,
  width: 0.105,
  soleHeight: 0.024,
} as const;

/**
 * Footprint half widths per side as a function of t (0 heel tip, 1 toe tip).
 * Rounded ends are superellipses from the joins; between them the half width
 * eases from the heel value to the ball value, with a dip for the arch on the
 * medial side (and a smaller one laterally). The widest point is the ball at
 * the toe join, where lateral + medial = SHOE.width.
 */
export const FOOTPRINT = {
  heel: { join: 0.22, exponent: 2.4, lateral: 0.034, medial: 0.034 },
  toe: { join: 0.74, exponent: 2.2, lateral: 0.05, medial: 0.055 },
  arch: { at: 0.42, halfWidth: 0.12, lateral: 0.004, medial: 0.011 },
  /** Plan points per side (heel tip to toe tip): 24 intervals per region, so the rounded toe and heel read in the outline. */
  sidePoints: 72,
} as const;

/**
 * Toe spring: the upper and the foxing (every sole ring above the underside)
 * rise toward the toe by rise x s^2, s from 0 at t `from` to 1 at the toe
 * tip. The underside stays flat on y = 0, and the upper at t = 0.8 (the toe
 * cap height the clearance test assumes) does not move.
 */
export const TOE_SPRING = { from: 0.8, rise: 0.004 } as const;

/**
 * Sole profile: outline rings (inset d, height h as a fraction of the sole
 * height), top spine to bottom spine, like the deck. The side wall is the
 * foxing; a shallow groove (`step`) separates it from the outsole edge below,
 * which is what the foot stands on (the real outsole is a few millimetres of
 * rubber, the rest of the 24 mm wall is the foxing wrap).
 */
export const SOLE = {
  /** Foxing stripe band on the side wall, as fractions of the sole height. */
  foxing: { from: 0.55, to: 0.8 },
  /** The groove between the foxing and the outsole edge: h band and inset. */
  step: { from: 0.21, to: 0.3, inset: 0.0008 },
  rings: [
    { d: 0.03, h: 1, spine: true as const },
    { d: 0.03, h: 1 },
    { d: 0.012, h: 1 },
    { d: 0.002, h: 1 },
    { d: 0.0006, h: 0.92 },
    { d: 0, h: 0.8 },
    { d: 0, h: 0.3 },
    { d: 0.0008, h: 0.28 },
    { d: 0.0008, h: 0.23 },
    { d: 0, h: 0.21 },
    { d: 0.0006, h: 0.08 },
    { d: 0.002, h: 0 },
    { d: 0.012, h: 0 },
    { d: 0.03, h: 0 },
    { d: 0.03, h: 0, spine: true as const },
  ] as readonly { d: number; h: number; spine?: true }[],
} as const;

/**
 * Toe bumper: a rubber band in the sole material over the front of the
 * upper, `thickness` proud of it, rising from nothing at t `from` to `height`
 * above the sole top by t `full`, with a lip back onto the upper at its edge.
 */
export const BUMPER = { from: 0.8, full: 0.9, height: 0.011, thickness: 0.0009, baseThickness: 0.0006, stations: 18, halfPoints: 8 } as const;

/**
 * Upper: a lofted shell of cross sections along x. Each section is a
 * superellipse arch over the footprint (medial edge to lateral edge). Over
 * the ankle and the lace gap the arch is cut open (`opening`): the shell
 * stops at the rim, a padded collar roll and an edge bead finish the cut, a
 * lining and an insole close the inside, and the tongue is its own shape
 * under the eyestays.
 */
export const UPPER = {
  /** Base stations along the length (cosine spaced, so dense at both tips) and points per half section. */
  stations: 60,
  halfPoints: 22,
  /** Arch height above the sole top at t, piecewise linear (t, height); over the opening it is the arch the rim is cut from. */
  heightProfile: [
    [0, 0.046],
    [0.04, 0.052],
    [0.075, 0.054],
    [0.14, 0.061],
    [0.3, 0.061],
    [0.42, 0.054],
    [0.5, 0.05],
    [0.66, 0.042],
    [0.8, 0.034],
    [0.92, 0.022],
    [1, 0.004],
  ] as readonly (readonly [number, number])[],
  /** Superellipse exponent of the section, (t, p): near-vertical quarters at the collar, rounder over the instep, boxier at the toe. */
  exponentProfile: [
    [0, 2.4],
    [0.1, 3.0],
    [0.38, 3.0],
    [0.55, 2.4],
    [1, 2.7],
  ] as readonly (readonly [number, number])[],
  /** The upper's bottom edge is tucked this far into the sole. */
  tuck: 0.002,
  inset: 0.0008,
  /**
   * The opening, as a half gap in metres from the section's centre line:
   * the larger of the collar oval (from `collar.from` to `collar.to`, a
   * superellipse of exponent `collar.exponent`, `collar.halfGap` at its
   * widest) and the lace gap (`throat`, narrowing from `halfGap[0]` to
   * `halfGap[1]` and closing in a round end over `roundEnd`).
   */
  opening: {
    collar: { from: 0.075, to: 0.43, halfGap: 0.028, exponent: 2.2 },
    throat: { from: 0.38, to: 0.665, halfGap: [0.011, 0.0075] as const, roundEnd: 0.03 },
    /** Extra stations near both ends of the opening (`span` of t each) so its rounded ends are smooth. */
    refine: { span: 0.04, count: 7 },
  },
  /** Collar roll and edge bead: a tube along the rim, `collar` radius around the ankle easing to `bead` along the lace gap. */
  rim: { collar: 0.0045, bead: 0.0013, easeFrom: 0.36, easeTo: 0.43, segments: 12, sink: 0.85 },
  /** Lining down from the collar to an insole `insole` above the sole top; the front wall crosses under the tongue at t `frontAt`, `frontDrop` below the rims. */
  lining: { frontAt: 0.38, frontDrop: 0.004, insole: 0.005, shrink: 0.9, rows: 5, crossPoints: 6 },
  /** Texture bands on the shell: the toe cap seam (t at the top, t at the bottom edge) and the heel counter. */
  toeCap: { top: 0.8, edge: 0.73 },
  heelCounter: { top: 0.06, edge: 0.15 },
  /** Eyelets on the eyestays, `edge` outside the lace gap, between these t values. */
  eyelets: { from: 0.43, to: 0.64, count: 6, edge: 0.0055, hole: 0.0021, rim: 0.0033, height: 0.0006, segments: 10 },
} as const;

/**
 * The tongue: a padded slab under the lace gap, `depth` below the eyestays
 * and `overlap` wider than the gap on each side (the eyestays cover that),
 * from its root under the vamp to its top, which rises `rise` above the arch
 * in front of the ankle with a rounded end of `endLength`.
 */
export const TONGUE = {
  root: 0.7,
  top: 0.36,
  riseFrom: 0.47,
  rise: 0.011,
  depth: 0.0035,
  thickness: 0.004,
  overlap: 0.003,
  topHalfWidth: 0.02,
  endLength: 0.012,
  rows: 26,
  endRows: 5,
  widthPoints: 11,
} as const;

/**
 * Laces: flat ribbons (10 x 1.5 mm) crossing between the eyelets, a bar
 * across the bottom pair, a small knot over the top pair and two short ends.
 */
export const LACES = {
  count: 6,
  width: 0.01,
  thickness: 0.0015,
  /** Width where a lace goes into an eyelet, and the share of a span it narrows over. */
  eyeletWidth: 0.004,
  taper: 0.2,
  samples: 9,
  /** Clearance above whatever the lace passes over; the upper lace at a crossing rides `cross` higher. */
  clearance: 0.0004,
  cross: 0.002,
  knot: { size: [0.005, 0.004, 0.0065] as const, lift: 0.003, widthSegments: 10, heightSegments: 6 },
  /** The two ends: length along the shoe surface, the side each falls to, aglet length and size. */
  ends: { length: [0.042, 0.036] as const, aglet: 0.009, agletWidth: 0.003, agletThickness: 0.0024, samples: 10 },
} as const;

export const SHOE_MATERIALS = {
  sole: { name: 'Sole', color: '#ffffff', roughness: 0.85, metalness: 0, map: 'sole' },
  // Grey map, tinted by the base colour factor (shoeTextures.upperTint).
  // Double sided: the inside of the shell shows through the opening and under the tongue.
  upper: { name: 'Upper', color: '#ffffff', roughness: 0.9, metalness: 0, map: 'upper', doubleSided: true },
  laces: { name: 'Laces', color: '#f1eee7', roughness: 0.8, metalness: 0 },
} as const;

export type ShoeMaterialKey = keyof typeof SHOE_MATERIALS;

/**
 * Suede's soft rim (ADR-53, 2026-11-09): KHR_materials_sheen on the upper, a
 * pale grey sheen that lifts the edges facing away from the light, as a
 * napped surface does. Factors only, no texture; the shoes are High only.
 */
export const UPPER_SHEEN = { color: '#62666d', roughness: 0.55 } as const;

export const SHOE_TEXTURES = {
  sole: { file: 'shoe-sole.png', width: 1024, height: 512, wrap: 'clamp' },
  upper: { file: 'shoe-upper.png', width: 1024, height: 1024, wrap: 'clamp' },
} as const;

/**
 * Where each surface lands in the two maps, as pixel rows (and columns),
 * inclusive of a few pixels of margin so the mips do not bleed across.
 * Sole (1024 x 512): the side wall by height, the bumper, the tread in plan.
 * Upper (1024 x 1024): the shell by (t, section), then the tongue (top and
 * underside), the collar roll, the lining, the insole and the eyelet metal.
 */
export const SOLE_ATLAS = {
  wall: [4, 196],
  bumper: [208, 248],
  tread: [262, 508],
} as const;

export const UPPER_ATLAS = {
  shell: [0, 752],
  tongueTop: { rows: [772, 888], cols: [4, 508] },
  tongueUnder: { rows: [772, 888], cols: [516, 1020] },
  collar: { rows: [900, 952] },
  lining: { rows: [966, 1018], cols: [4, 508] },
  insole: { rows: [966, 1018], cols: [516, 764] },
  eyelet: { rows: [966, 1018], cols: [776, 1020] },
} as const;

/** Shoe colours (sRGB hex). */
export const SHOE_COLORS = {
  sole: '#e9e5db',
  foxing: '#cfc9bb',
  /** The outsole edge below the groove, and the groove itself. */
  outsole: '#ddd7c9',
  groove: '#b9b2a3',
  /** Underside: the tread lands and the grooves between them, and the dirt that collects. */
  tread: '#d3ccbd',
  treadGroove: '#9d9586',
  dirt: '#6f675b',
  upper: '#23262c',
  toeCap: '#2e3238',
  eyelet: '#8d9096',
  tongue: '#1d2025',
  heelTab: '#3a3e45',
  /** The heel counter panel round the back. */
  heelCounter: '#2a2d34',
  /** Collar padding, lining and insole (inside the shoe). */
  collar: '#2a2d33',
  lining: '#33363c',
  insole: '#44474d',
  /** Suede worn through to its backing (dark), and the scuffed nap around it (lighter). */
  backing: '#1b1d21',
  scuff: '#4a4e55',
} as const;

/**
 * Surface recipe, every number seeded so the maps are the same on every
 * machine. Nap: two octaves of hash value noise (no period), in grey
 * levels. Wear (mild): one broad worn patch at the lateral forefoot (an
 * ellipse in (t, section) with a noisy edge and a dark core where the suede
 * is through to its backing), scuffs on the foxing and toe bumper at the
 * same place, flex creases across the vamp, a worn heel and ball on the tread.
 */
export const SHOE_WEAR = {
  seed: 20261105,
  nap: { fine: 2.2, fineScale: 1.6, mottle: 3, mottleScale: 22 },
  patch: { t: 0.735, s: 0.8, rt: 0.075, rs: 0.075, scuff: 0.45, core: 0.24, coreEdge: 0.07, noiseScale: 9 },
  creases: { count: 4, from: 0.69, to: 0.77, s: [0.22, 0.78] as const, depth: 5, width: 1.6 },
  toeScuff: { from: 0.93, amount: 0.35 },
  /** Foxing scuffs, at the arc position of the lateral forefoot and the toe tip, as a share of the dirt colour. */
  foxing: { at: [0.38, 0.5] as const, spread: [0.07, 0.035] as const, amount: [0.32, 0.22] as const, noiseScale: 14 },
  tread: { cell: 0.0062, groove: 0.0011, wornAt: [0.17, 0.72] as const, wornSpread: [0.1, 0.12] as const, worn: 0.55, dirt: 0.12 },
  stitch: { every: 9, length: 5, lift: 12, offset: 0.004 },
} as const;

/** GLB node names, one mesh with one primitive each: 3 draw calls per shoe. */
export const SHOE_PARTS = [
  { node: 'Shoe_Sole', material: 'sole' },
  { node: 'Shoe_Upper', material: 'upper' },
  { node: 'Shoe_Laces', material: 'laces' },
] as const satisfies readonly { node: string; material: ShoeMaterialKey }[];

export type ShoePartName = (typeof SHOE_PARTS)[number]['node'];
