// The skate shoe, as numbers (feet pass, 2026-11-04). One right shoe; the
// runtime mirrors it for the left foot. Units are metres. Conventions: origin
// at the centre of the footprint's bounding box on the bottom of the sole
// (the sole rests on y = 0), toe +X, heel -X, up +Y, lateral (little-toe)
// side +Z, medial (big-toe) side -Z. Pure data: no three, no React.

/**
 * Overall size. Must equal FOOT in src/sim/feet.ts (shoe.test.ts asserts it),
 * which places the feet on the board from these numbers.
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
  /** Plan points per side (heel tip to toe tip) and sole ring resolution. */
  sidePoints: 48,
} as const;

/** Sole profile: outline rings (inset d, height h), top spine to bottom spine, like the deck. */
export const SOLE = {
  bevel: 0.004,
  /** Foxing stripe band on the side wall, as fractions of the sole height (v on the sole texture). */
  foxing: { from: 0.55, to: 0.8 },
  rings: [
    { d: 0.03, h: 1, spine: true as const },
    { d: 0.03, h: 1 },
    { d: 0.012, h: 1 },
    { d: 0.002, h: 1 },
    { d: 0.0006, h: 0.92 },
    { d: 0, h: 0.8 },
    { d: 0, h: 0.2 },
    { d: 0.0006, h: 0.08 },
    { d: 0.002, h: 0 },
    { d: 0.012, h: 0 },
    { d: 0.03, h: 0 },
    { d: 0.03, h: 0, spine: true as const },
  ] as readonly { d: number; h: number; spine?: true }[],
} as const;

/**
 * Upper: a lofted grid of cross sections along x. Each section is a
 * superellipse arch over the footprint (medial edge to lateral edge), with a
 * valley sunk into its top where the tongue and the ankle opening are.
 */
export const UPPER = {
  /** Stations along the length (sine spaced at both ends) and points per section. */
  stations: 72,
  sectionPoints: 48,
  /** Arch height above the sole top at t, piecewise linear (t, height). */
  heightProfile: [
    [0, 0.045],
    [0.06, 0.061],
    [0.14, 0.061],
    [0.3, 0.056],
    [0.5, 0.05],
    [0.66, 0.042],
    [0.8, 0.034],
    [0.92, 0.022],
    [1, 0.004],
  ] as readonly (readonly [number, number])[],
  /** Superellipse exponent of the section (boxier toward the toe), (t, p). */
  exponentProfile: [
    [0, 2.0],
    [0.5, 2.2],
    [1, 2.7],
  ] as readonly (readonly [number, number])[],
  /** Valley depth below the arch at t (the ankle opening and the tongue), (t, depth). */
  valleyProfile: [
    [0, 0],
    [0.07, 0],
    [0.15, 0.032],
    [0.3, 0.03],
    [0.42, 0.022],
    [0.55, 0.012],
    [0.64, 0],
    [1, 0],
  ] as readonly (readonly [number, number])[],
  /** Half angle of the valley around the top of the arch, radians, (t, angle). */
  valleyWidthProfile: [
    [0, 0.8],
    [0.2, 0.85],
    [0.55, 0.6],
    [1, 0.5],
  ] as readonly (readonly [number, number])[],
  /** The upper's bottom edge is tucked this far into the sole. */
  tuck: 0.002,
  inset: 0.0008,
  /** Texture bands on the upper, as fractions of u (along the length). */
  toeCap: { from: 0.8 },
  /** Eyelets: along the valley rims between these t values. */
  eyelets: { from: 0.3, to: 0.58, count: 6, radiusPx: 5 },
} as const;

export const LACES = {
  count: 6,
  radius: 0.0022,
  segments: 8,
  /** Laces run between the eyelets, lifted a little above the rim. */
  lift: 0.0015,
} as const;

export const SHOE_MATERIALS = {
  sole: { name: 'Sole', color: '#ffffff', roughness: 0.85, metalness: 0, map: 'sole' },
  upper: { name: 'Upper', color: '#ffffff', roughness: 0.9, metalness: 0, map: 'upper' },
  laces: { name: 'Laces', color: '#f1eee7', roughness: 0.8, metalness: 0 },
} as const;

export type ShoeMaterialKey = keyof typeof SHOE_MATERIALS;

export const SHOE_TEXTURES = {
  sole: { file: 'shoe-sole.png', width: 16, height: 64, wrap: 'clamp' },
  upper: { file: 'shoe-upper.png', width: 512, height: 512, wrap: 'clamp' },
} as const;

export type ShoeTextureKey = keyof typeof SHOE_TEXTURES;

/** Shoe colours (sRGB hex) and the upper's weave recipe. */
export const SHOE_COLORS = {
  sole: '#e9e5db',
  foxing: '#cfc9bb',
  upper: '#23262c',
  toeCap: '#2e3238',
  eyelet: '#8d9096',
  tongue: '#1d2025',
  heelTab: '#3a3e45',
} as const;

export const UPPER_WEAVE = { seed: 20261106, jitter: 6, period: 4, weaveLift: 4 } as const;

/** GLB node names, one mesh with one primitive each: 3 draw calls per shoe. */
export const SHOE_PARTS = [
  { node: 'Shoe_Sole', material: 'sole' },
  { node: 'Shoe_Upper', material: 'upper' },
  { node: 'Shoe_Laces', material: 'laces' },
] as const satisfies readonly { node: string; material: ShoeMaterialKey }[];

export type ShoePartName = (typeof SHOE_PARTS)[number]['node'];
