// The skate spot's concrete detail (step 14, ADR-69): a grey colour map and
// a normal map, each one seamless tile of SPOT_TEXTURES.tile metres, made
// from the same seeded, tiling value noise. No joints, cracks or marks: the
// pieces are small, and the vertex colour does the painting. Pure.
import { SPOT_TEXTURES } from './spotSpec';
import { mulberry32, normalMapFromHeight, type GreyPixels, type Pixels } from './textures';

const T = SPOT_TEXTURES;

/** Value noise that tiles over the texture: `cells` lattice cells across, wrapped, smoothstep between. */
function tilingNoise(rand: () => number, cells: number): (u: number, v: number) => number {
  const table = Float32Array.from({ length: cells * cells }, () => rand());
  const at = (i: number, j: number) => table[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)]!;
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * cells, y = v * cells;
    const i = Math.floor(x), j = Math.floor(y);
    const fx = fade(x - i), fy = fade(y - j);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
}

/** The concrete's height field over one tile, -1 to 1 about its mean: broad tone and fine grain. */
export function spotField(W: number = T.color.width, H: number = T.color.height): { tone: Float32Array; grain: Float32Array } {
  const rand = mulberry32(T.seed);
  const tone = tilingNoise(rand, Math.round(T.tile / T.tone.cell));
  const grain = tilingNoise(rand, Math.round(T.tile / T.grain.cell));
  const out = { tone: new Float32Array(W * H), grain: new Float32Array(W * H) };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, v = (y + 0.5) / H;
      out.tone[y * W + x] = tone(u, v) * 2 - 1;
      out.grain[y * W + x] = grain(u, v) * 2 - 1;
    }
  return out;
}

/** The grey colour map: near white (SPOT_TEXTURES.fill) so the vertex colour's paint shows true. */
export function spotColor(): GreyPixels {
  const { width: W, height: H } = T.color;
  const f = spotField(W, H);
  const grey = new Uint8Array(W * H);
  for (let i = 0; i < grey.length; i++) grey[i] = Math.max(0, Math.min(255, Math.round(T.fill + f.tone[i]! * T.tone.amplitude + f.grain[i]! * T.grain.amplitude)));
  return { width: W, height: H, grey };
}

/** The normal map: the fine grain as relief (the broad tone is colour only). */
export function spotNormal(): Pixels {
  const { width: W, height: H } = T.normal;
  const f = spotField(W, H);
  const metresPerTexel = T.tile / W;
  // Height in metres, sloped per texel: the normal map's slope is height difference over texel size.
  const lift = f.grain.map((g) => g * T.relief);
  return normalMapFromHeight(lift, W, H, 1 / metresPerTexel);
}
