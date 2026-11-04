# Asset pipeline (the board GLB)

Written 2026-11-04, realistic board pass. The board is a **procedural, scripted asset**: code generates the geometry and textures, glTF-Transform builds and compresses the GLB, and a checker enforces the budget. No artist and no Blender were involved. The decisions are ADR-12 to ADR-15 in `DECISIONS.md`; the look and every number come from `DESIGN.md` section 7.

## Commands

| Command | What it does |
| --- | --- |
| `npm run assets` | Builds `public/models/board.glb` (about 0.3 s) and prints triangles per part, dropped triangles and PNG sizes |
| `npm run assets:check` | Reads the committed GLB and prints the budget table; exits 1 on any miss. Last step of `npm run verify` |

The GLB is committed, so a fresh clone runs without building it. A test (`scripts/lib/budget.test.ts`) fails if the committed file's triangle count no longer matches the geometry source, which means "run `npm run assets`". Another test builds the GLB twice in memory and requires identical bytes.

## Flow

```
assets/source/deck-graphic.svg --resvg 1024 x 256--+
src/asset/textures.ts (grip, ply, wheel) --PNG-----+
src/asset/spec.ts     (DESIGN.md 7 numbers)        +--> scripts/lib/build.ts --> glTF-Transform Document
src/asset/deck.ts     (outline, kicks, concave)    |      dedup, prune, meshopt (reorder + quantize + EXT_meshopt_compression)
src/asset/hardware.ts (trucks, bolts, wheel lathe) +            |
                                                                v
                                                 public/models/board.glb --> scripts/check-assets.ts (budget gate)
                                                                |
                                                                v
                          src/scene/BoardModel.tsx: useGLTF(url, draco off, meshopt on), preload, dispose={null}
```

| File | Role | Tested by |
| --- | --- | --- |
| `src/asset/spec.ts` | Every number from DESIGN.md 7 (outline, kicks, concave, ring table, truck parts, wheel profile, materials, textures, budget, part names). Pure data | everything below |
| `src/asset/deck.ts` | Outline half width, kick cubic, concave, mid surface and its normal, the nested-ring deck mesh split into grip, wood and graphic | `deck.test.ts` |
| `src/asset/hardware.ts` | Trucks from three's cylinders and rounded boxes, bolt heads, wheels from three's `LatheGeometry` | `board.test.ts` |
| `src/asset/board.ts` | One merged geometry per material, in the GLB's part order | `board.test.ts` |
| `src/asset/textures.ts` | mulberry32 seeded grip grit, ply stripes, wheel bands (raw pixels) | `textures.test.ts` |
| `scripts/lib/png.ts` | Minimal deterministic PNG encoder on `node:zlib` (grey or RGB, adaptive filters) | `png.test.ts` (round trip) |
| `scripts/lib/build.ts` | Materials, samplers, `KHR_texture_transform` on the grip, accessors, nodes, compression | `budget.test.ts` (determinism) |
| `scripts/lib/inspect.ts`, `budget.ts` | Read the GLB back, count draw calls, triangles, textures and bounds; evaluate the budget | `budget.test.ts` |

## What is in the GLB

| Node (one mesh, one primitive, one draw call) | Material | Triangles |
| --- | --- | --- |
| `Deck_Grip` | Grip: grey grip PNG 512 x 512, repeating every 0.2 m, roughness 0.95 | 1,724 |
| `Deck_Wood` | Wood: ply PNG 16 x 128, roughness 0.7 | 2,016 |
| `Deck_Graphic` | Graphic: deck-bottom PNG 1024 x 256, roughness 0.45 | 1,724 |
| `Truck_Aluminium` | `#b7babd`, roughness 0.50, metalness 0.85 (baseplates, pivot cups, yokes, axle housings, pivots) | 3,128 |
| `Truck_Steel` | `#cfd2d5`, roughness 0.28, metalness 1.0 (kingpins, washers, nuts, axles, 8 bolt heads) | 1,216 |
| `Truck_Bushings` | `#d9a441` urethane, roughness 0.55 | 256 |
| `Wheels` | Urethane: wheel band PNG 16 x 256, roughness 0.55 (4 wheels merged) | 3,840 |
| **Total** | 7 materials, 4 textures | **13,904** |

All seven sit under a root node `Board`, whose extras record the units, rest height and source. Conventions: metres, Y up, origin at the deck centre (midpoint of the wheelbase), nose +X, grip +Y, toe side +Z, wheel bottoms at y = -0.08425, so `ART.board.restY = 0.08425` puts them on the pad. Quantization moves a dequantization scale and offset onto each mesh node, which is why `BoardModel` renders every mesh with its node's position, quaternion and scale (the gltfjsx pattern).

## Budget (checked by `npm run assets:check`, measured 2026-11-04)

| Check | Value | Limit |
| --- | --- | --- |
| GLB file size | 250.2 KB (of which PNG 162.2 KB) | 300 KB |
| Draw calls | 7 | 8 |
| Triangles | 13,904 | 25,000 |
| Textures | 4, all power of two, all mipmapped, long side 1024 px | 4, 1024 px |
| Texture GPU memory (estimate, RGBA8 plus mips) | 2.70 MB | info |
| Compression | `EXT_meshopt_compression` and `KHR_mesh_quantization` required, no Draco | required |
| Size | 807.9 x 204.0 mm, wheel bottoms at -84.3 mm | 806.5 x 203.2 mm within 2 mm, -84.25 mm within 0.5 mm |

## Runtime

- `Board.tsx` wraps the GLB in an error boundary and a Suspense boundary whose fallback is `BoardPrimitive` (the original primitive board), and renders `BoardPrimitive` alone on "Low" board detail (ADR-15). FlightDriver poses the outer group either way.
- `BoardModel` is its own lazy chunk: drei `useGLTF`, three-stdlib's GLTFLoader and the inlined meshopt decoder, 71.8 KB minified, 21.2 KB gzip. On High its import starts as soon as the scene module loads, and its module calls `useGLTF.preload`, so the chunk and the GLB stream while the fallback renders. On Low neither is fetched.
- `dispose={null}` on the model group: the geometries, materials and textures belong to the useGLTF cache, not to the component, so switching to Low and back reuses them. Measured: geometries and textures stay flat across 5 Low/High toggles and 10 trick cycles (PERF-BUDGET.md).
- `SceneEnvironment` makes one RoomEnvironment PMREM per Canvas mount, assigns it to `scene.environment` only (the background stays the theme colour), calls `invalidate()` once for the demand loop, and disposes the render target on unmount. Without it the metals render near black.

## Deviations from DESIGN.md section 7 (and why)

1. **20 deck rings, not 19.** The ring table's row "14 to 18" lists five insets and then the spine: six rings for five slots. Read as the mirror of the top (spine, 0.082, 0.064, 0.046, 0.030, 0.016, 0.004), the bottom gets the same tessellation as the top, with the spines at rings 0 and 19.
2. **Spines welded, zero-area triangles counted.** The two sides of a spine are the same points, so they share vertices. The top spine also shares its tip points with ring 1, which leaves 8 zero-area triangles; they are dropped, and the count is reported by `npm run assets` and asserted in `deck.test.ts`. The deck is 19 x 288 - 8 = 5,464 triangles, against the design's estimate of 4,900 to 5,200 (its "fans of 144" estimate assumed degenerate halves that a welded spine does not have).
3. **Concave normalised by the middle outline formula.** `(z / w(x))^2` with the rounded-end outline is 0/0 at the tip point, and it holds the rail at full height all the way round the nose. Normalising by the middle formula (`0.1016 - 0.0031 (x / 0.26)^2`, identical to `w(x)` in the flat) keeps the tips smooth. `S(0, 0.1016) - S(0, 0) = 0.012` still holds.
4. **Rounded boxes at 2 and 3 arc segments, not 4.** three's `RoundedBoxGeometry` spends (2s + 1)^2 quads per face, so 4 segments costs 972 triangles per box (2,916 per truck). The baseplate uses 2 (300 triangles) and the yoke and axle housing 3 (588 each). The board total is 13,904, a little over the 11,000 to 13,000 target and far under the 25,000 cap.
5. **Grip stored as one grey channel.** The recipe adds the same value to all three channels, so the PNG holds the blue value, and the base colour factor scales red and green to land the fill on `#1a1a1c`. An RGB grip alone was 218 KB and took the GLB to 309 KB, over budget. Bright grains come out a couple of levels bluer than an exact RGB grip would.
6. **Grip UVs in [0, 1] plus `KHR_texture_transform`.** glTF-Transform only quantizes UVs inside [0, 1], so the grip UVs span the deck, and the transform repeats the tile every 0.2 m as the design asks.
7. **Environment intensity 0.40, not 0.55.** Measured on screen, the pad is `#a2a4a4` at 0.55 and `#959696` at 0.40 (design intent `#7b7a77`). It reads grey, not warm, in both themes. 0.40 is the bottom of the design's range, so the pad colour was not touched; see the open issues in PERF-BUDGET.md.

## How an artist-made board would slot in

Export from Blender as glTF binary with the same conventions (metres, Y up, nose +X, origin at the deck centre, wheel bottoms at y = -0.08425) and the same seven node names, one material each. Run it through the same compression (`meshopt()` from glTF-Transform, or `gltfpack -cc`) and replace `public/models/board.glb`. `npm run assets:check` is the gate: size, draw calls, triangles, texture count, size and mips, required extensions and the physical size all apply unchanged. `BoardModel` needs no code change as long as the node names match.
