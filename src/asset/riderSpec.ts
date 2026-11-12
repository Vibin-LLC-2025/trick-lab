// The rider's body as built (step 1 of ADR-85, 2026-11-11): one skinned
// mesh over the 17 bones of src/sim/body.ts, lofted round its bind pose by
// rider.ts and written to public/models/rider.glb by `npm run assets`. No
// colours here: each vertex carries a region (RIDER_REGIONS), which the scene
// paints from ART.rider (scene/riderLook.ts), so the player's and the
// computer's riders are one mesh in two outfits. Metres.

/** Node names in rider.glb: the root, and the one skinned mesh (one draw call). */
export const RIDER_ROOT = 'Rider';
export const RIDER_PARTS = [{ node: 'Body', material: 'rider' }] as const;
export const RIDER_MATERIAL = { name: 'Rider', roughness: 0.92, metalness: 0 } as const;

/**
 * What each vertex is, for its colour (ART.rider, per rider): stored as the
 * custom attribute `_REGION` (one byte), which three's loader reads as
 * `_region`.
 */
export const RIDER_REGIONS = ['hoodie', 'rib', 'seam', 'string', 'trouser', 'fold', 'sock', 'glove', 'skin', 'beanie', 'brim', 'hair'] as const;
export type RiderRegion = (typeof RIDER_REGIONS)[number];
export const REGION = Object.fromEntries(RIDER_REGIONS.map((r, i) => [r, i])) as Record<RiderRegion, number>;

/**
 * The cloth's texture coordinates (ADR-70's twill normal map, made in code by
 * scene/resources.ts) are in tiles of the map, divided by `span` so they sit
 * in [0, 1] and quantize (to `bits` bits: a tile of 64 px is then placed to
 * an eighth of a pixel); the scene's map repeats `span` times. `tile` is a
 * tile's size on each cloth: the trousers' as ADR-70 (`around` tiles round a
 * leg, a tile per 1.6 cm along it), the hoodie a finer knit, the beanie's
 * ribs turned to run up it. Skin has no cloth: its coordinates sit on `flat`,
 * a texel of the map whose normal is straight out (the ribs' slope is zero
 * there), so the head and neck shade smooth.
 */
export const RIDER_UV = {
  span: 128,
  bits: 16,
  trouser: { around: 22, tile: 0.016 },
  hoodie: { tile: 0.011 },
  sleeve: { around: 26, tile: 0.011 },
  glove: { around: 14, tile: 0.008 },
  beanie: { ribs: 40, tile: 0.02 },
  flat: { u: 2.5 / 64, v: 2.5 / 64 },
} as const;

/** Points round each loft and the rings along it, per part. */
export const RIDER_MESH = {
  leg: 20,
  torso: 36,
  seat: 28,
  sleeve: 18,
  hand: 14,
  head: 28,
  neck: 14,
  hood: 16,
  string: 6,
} as const;

/**
 * The trousers (ADR-70's look, kept): the leg as one tube from inside the
 * seat, past the hip joint, through the knee to the cuff, so the knee bends
 * without a seam. `thigh` radii at the hip and the knee, then the shank's as
 * the old shank (scene/resources.ts shankProfile until ADR-85): calf at
 * `calfAt` of the shank, the hem, two soft rolls of bunching above a turned-up
 * cuff that ends `cuff.drop` below the ankle joint over the shoe collar, then
 * the step in to a dark sock inside the shoe.
 */
export const TROUSER = {
  top: -0.09,
  thigh: { hip: 0.085, knee: 0.061 },
  shank: { calf: 0.058, calfAt: 0.3, hem: 0.057, ankle: 0.034 },
  cuff: { height: 0.032, drop: 0.025, radius: 0.0605, edge: 0.003 },
  bunch: { count: 2, height: 0.05, depth: 0.0025 },
  knee: 0.06,
} as const;

/**
 * The seat: the trousers round the pelvis, from the crotch to under the
 * hoodie, wider than the thighs at the hip joints so the legs come out of it
 * below. Rings at `h` metres above the hip joints: half width, half depth in
 * front and behind, the centre's z (+ is back).
 */
export const SEAT: readonly { h: number; a: number; f: number; b: number; z: number }[] = [
  { h: -0.2, a: 0, f: 0, b: 0, z: 0.01 },
  { h: -0.185, a: 0.055, f: 0.05, b: 0.06, z: 0.01 },
  { h: -0.15, a: 0.135, f: 0.085, b: 0.105, z: 0.01 },
  { h: -0.09, a: 0.172, f: 0.1, b: 0.122, z: 0.008 },
  { h: -0.02, a: 0.1711, f: 0.0957, b: 0.1141, z: 0.008 },
  { h: 0.05, a: 0.1656, f: 0.0957, b: 0.1086, z: 0.008 },
  { h: 0.14, a: 0.1518, f: 0.0957, b: 0.1012, z: 0.008 },
  { h: 0.16, a: 0, f: 0, b: 0, z: 0.008 },
];

/**
 * The hoodie's body: rings at `h` above the hip joints (half width `a`, half
 * depths `f` in front and `b` behind, centre z, superellipse exponent `n`:
 * 2 is an ellipse, more is squarer). A rib at the hem (`rib`), a kangaroo
 * pocket on the belly (`pocket`: from `low` to `high` metres, `half` its
 * half width at the bottom, narrowing by `slant` per metre up, standing `lift`
 * off the hoodie, its edge a darker seam `seam` wide), and the shoulders
 * sloping into the collar. The top closes inside the neck.
 */
export const TORSO: readonly { h: number; a: number; f: number; b: number; z: number; n: number }[] = [
  { h: -0.03, a: 0, f: 0, b: 0, z: 0.012, n: 2.4 },
  { h: -0.062, a: 0.1425, f: 0.095, b: 0.1045, z: 0.012, n: 2.4 },
  { h: -0.072, a: 0.1805, f: 0.1197, b: 0.133, z: 0.012, n: 2.4 },
  { h: -0.06, a: 0.1833, f: 0.1216, b: 0.1349, z: 0.012, n: 2.4 },
  { h: -0.015, a: 0.1767, f: 0.1172, b: 0.1283, z: 0.012, n: 2.4 },
  { h: -0.005, a: 0.1786, f: 0.119, b: 0.1283, z: 0.012, n: 2.4 },
  { h: 0.08, a: 0.173, f: 0.119, b: 0.119, z: 0.01, n: 2.5 },
  { h: 0.18, a: 0.1655, f: 0.1153, b: 0.1097, z: 0.006, n: 2.6 },
  { h: 0.29, a: 0.1693, f: 0.1209, b: 0.1097, z: 0.004, n: 2.7 },
  { h: 0.38, a: 0.1767, f: 0.1246, b: 0.1116, z: 0.004, n: 2.8 },
  { h: 0.44, a: 0.1823, f: 0.119, b: 0.1135, z: 0.006, n: 3.0 },
  { h: 0.48, a: 0.1823, f: 0.1079, b: 0.1079, z: 0.008, n: 3.2 },
  { h: 0.51, a: 0.173, f: 0.0949, b: 0.0967, z: 0.01, n: 3.2 },
  { h: 0.535, a: 0.1469, f: 0.0818, b: 0.0856, z: 0.012, n: 3.0 },
  { h: 0.555, a: 0.107, f: 0.0698, b: 0.0763, z: 0.012, n: 2.6 },
  { h: 0.57, a: 0.0744, f: 0.0614, b: 0.067, z: 0.012, n: 2.2 },
  { h: 0.585, a: 0.0595, f: 0.0577, b: 0.0614, z: 0.012, n: 2 },
  { h: 0.575, a: 0.0465, f: 0.0465, b: 0.0465, z: 0.012, n: 2 },
  { h: 0.56, a: 0, f: 0, b: 0, z: 0.012, n: 2 },
];
export const HOODIE = {
  rib: { low: -0.073, high: -0.012 },
  pocket: { low: 0.035, high: 0.2, half: 0.13, slant: 0.35, lift: 0.004, seam: 0.008 },
  /** The sleeve, from inside the shoulder (`top`, negative) past the elbow to the cuff's rib; radii along it, metres from the shoulder joint. */
  sleeve: [
    { s: -0.075, r: 0 },
    { s: -0.07, r: 0.028 },
    { s: -0.05, r: 0.047 },
    { s: -0.02, r: 0.054 },
    { s: 0.04, r: 0.055 },
    { s: 0.16, r: 0.052 },
    { s: 0.3, r: 0.049 },
    { s: 0.36, r: 0.048 },
    { s: 0.48, r: 0.045 },
    { s: 0.535, r: 0.043 },
  ],
  cuff: { from: 0.535, to: 0.575, r: 0.039, inner: 0.027 },
  /** The hood lying on the back: a roll round the collar (`roll`: half axes round the neck, height, thickness at the back and the sides) and the hood's back panel (`back`: centre and half axes). */
  roll: { rx: 0.08, rz: 0.078, h: 0.592, hBack: 0.582, back: 0.038, side: 0.024, from: 135 },
  back: { h: 0.5, z: 0.118, a: 0.092, b: 0.068, t: 0.02 },
  /** The drawstrings: from the collar's front at `x`, down to `h` metres above the hips, `r` thick. */
  strings: { x: 0.036, top: 0.568, h: 0.4, r: 0.0045 },
} as const;

/** The neck, a tube along the neck bone from inside the collar into the head: half width, half depth. */
export const NECK = { from: -0.04, to: 0.04, a: 0.05, f: 0.052, b: 0.056, z: 0.008 } as const;

/**
 * The head, faceless (ADR-85): rings at `y` above the atlas joint (the head
 * bone's origin) with half width `a`, half depths `f` front and `b` back,
 * centre z (negative is the face side): the chin, the jaw, the cheeks, the
 * temples, the crown. The beanie covers it from `beanie.hem` up, `gap` off
 * the skull, with a rolled brim `brim` tall that stands `roll` further out,
 * and a slouch at the back of the crown.
 */
export const HEAD: readonly { y: number; a: number; f: number; b: number; z: number }[] = [
  { y: -0.073, a: 0, f: 0, b: 0, z: -0.058 },
  { y: -0.067, a: 0.0321, f: 0.0257, b: 0.0214, z: -0.06 },
  { y: -0.045, a: 0.0578, f: 0.0449, b: 0.0428, z: -0.045 },
  { y: -0.015, a: 0.0706, f: 0.0706, b: 0.0621, z: -0.026 },
  { y: 0.015, a: 0.0781, f: 0.092, b: 0.0813, z: -0.014 },
  { y: 0.055, a: 0.0835, f: 0.1049, b: 0.0963, z: -0.006 },
  { y: 0.095, a: 0.0824, f: 0.1027, b: 0.0984, z: -0.004 },
  { y: 0.13, a: 0.0706, f: 0.0888, b: 0.0888, z: -0.002 },
  { y: 0.155, a: 0.0481, f: 0.0621, b: 0.0642, z: 0 },
  { y: 0.167, a: 0.0214, f: 0.0278, b: 0.03, z: 0 },
  { y: 0.17, a: 0, f: 0, b: 0, z: 0 },
];
export const BEANIE = { hem: 0.067, brim: 0.042, gap: 0.007, roll: 0.006, slouch: 0.02 } as const;
/** Short hair under the beanie: down to `nape` at the back, `side` over the ears, `front` at the brow (under the brim), standing `lift` off the skull. */
export const HAIR = { nape: -0.025, side: 0.027, front: 0.085, lift: 0.004 } as const;

/**
 * The hand along the hand bone from inside the cuff (a mitten in gloves until
 * 2026-11-11, ADR-91: now bare skin, thinner and curled as a relaxed hand
 * is): half thickness (palm to back), half width, the wrist's half thickness
 * and width, the fingers' curl toward the palm; the thumb.
 */
export const MITTEN = {
  from: -0.04,
  to: 0.17,
  thick: 0.0145,
  width: 0.038,
  wrist: { thick: 0.014, width: 0.026 },
  curl: 0.03,
  thumb: { at: 0.03, side: 0.03, length: 0.052, r: 0.0095 },
} as const;
