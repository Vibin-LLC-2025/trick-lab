// Deterministic shoe textures (feet pass, 2026-11-04): the sole's band
// strip and the upper's weave with toe cap, heel tab, tongue and eyelets.
// Same conventions as textures.ts: RGB bytes, row 0 is the top of the image.
import { eyeletTs, upperProfileAt, valleyRims } from './shoe';
import { SHOE_COLORS, SHOE_TEXTURES, SOLE, UPPER, UPPER_WEAVE } from './shoeSpec';
import { hexToRgb, mulberry32, type Pixels } from './textures';

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

function put(p: Pixels, x: number, y: number, rgb: readonly [number, number, number]) {
  const i = (y * p.width + x) * 3;
  p.rgb[i] = rgb[0];
  p.rgb[i + 1] = rgb[1];
  p.rgb[i + 2] = rgb[2];
}

/** Sole strip: v = 0 is the top of the sole; the foxing stripe sits on the side wall. */
export function solePixels(): Pixels {
  const { width, height } = SHOE_TEXTURES.sole;
  const p: Pixels = { width, height, rgb: new Uint8Array(width * height * 3) };
  const sole = hexToRgb(SHOE_COLORS.sole);
  const foxing = hexToRgb(SHOE_COLORS.foxing);
  for (let y = 0; y < height; y++) {
    // Texture v is 1 - h (sole height fraction), so the stripe's h range maps to rows from the bottom.
    const h = 1 - (y + 0.5) / height;
    const inStripe = h >= SOLE.foxing.from && h <= SOLE.foxing.to;
    for (let x = 0; x < width; x++) put(p, x, y, inStripe ? foxing : sole);
  }
  return p;
}

/**
 * Upper: u (columns) runs heel to toe, v (rows) runs from the medial edge
 * over the top to the lateral edge, so the valley (tongue and ankle opening)
 * is the middle rows. Canvas weave is a seeded jitter plus a 4 px check.
 */
export function upperPixels(): Pixels {
  const { width: W, height: H } = SHOE_TEXTURES.upper;
  const p: Pixels = { width: W, height: H, rgb: new Uint8Array(W * H * 3) };
  const rand = mulberry32(UPPER_WEAVE.seed);
  const base = hexToRgb(SHOE_COLORS.upper);
  const toe = hexToRgb(SHOE_COLORS.toeCap);
  const heel = hexToRgb(SHOE_COLORS.heelTab);
  const tongue = hexToRgb(SHOE_COLORS.tongue);
  for (let y = 0; y < H; y++) {
    const s = (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const t = (x + 0.5) / W;
      const { valley, valleyWidth } = upperProfileAt(t);
      const inValley = valley > 0 && Math.abs(s - 0.5) < valleyWidth / Math.PI;
      let c: readonly [number, number, number] = t >= UPPER.toeCap.from ? toe : t < 0.06 ? heel : base;
      if (inValley) c = tongue;
      const weave = ((Math.floor(x / UPPER_WEAVE.period) + Math.floor(y / UPPER_WEAVE.period)) & 1) * UPPER_WEAVE.weaveLift;
      const j = Math.floor(rand() * (2 * UPPER_WEAVE.jitter + 1)) - UPPER_WEAVE.jitter + weave;
      put(p, x, y, [clampByte(c[0] + j), clampByte(c[1] + j), clampByte(c[2] + j)]);
    }
  }
  // Eyelets: a dot on each rim at each lace station.
  const eyelet = hexToRgb(SHOE_COLORS.eyelet);
  const r = UPPER.eyelets.radiusPx;
  for (const t of eyeletTs()) {
    const rims = valleyRims(t);
    for (const s of [rims.medial, rims.lateral]) {
      const cx = t * W;
      const cy = s * H;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) put(p, x, y, eyelet);
        }
    }
  }
  return p;
}
