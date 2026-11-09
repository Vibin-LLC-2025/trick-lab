# Asset pipeline (the board GLB)

Written 2026-11-04, realistic board pass. The board is a **procedural, scripted asset**: code generates the geometry and textures, glTF-Transform builds and compresses the GLB, and a checker enforces the budget. No artist and no Blender were involved. The decisions are ADR-12 to ADR-15 in `DECISIONS.md`; the look and every number come from `DESIGN.md` section 7.

## Commands

| Command | What it does |
| --- | --- |
| `npm run assets` | Builds the four GLBs in `public/models/` (about 13 s since the textures are KTX2, ADR-49), prints triangles per part, dropped triangles and texture sizes. The KTX2 transcoder is three's own, emitted by Vite into the build (ADR-49), so nothing is copied |
| `npm run assets:check` | Reads the committed GLB and prints the budget table; exits 1 on any miss. Last step of `npm run verify` |

The GLB is committed, so a fresh clone runs without building it. A test (`scripts/lib/budget.test.ts`) fails if the committed file's triangle count no longer matches the geometry source, which means "run `npm run assets`". Another test builds the GLB twice in memory and requires identical bytes.

## Flow

```
assets/source/deck-graphic.svg --resvg 1024 x 256--+
src/asset/textures.ts (grip, ply, wheel) --KTX2----+
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

## Quality pass (2026-11-04): three assets from one pipeline

`npm run assets` now builds three files, all deterministic, all committed, each gated by its own `BUDGETS` entry in `src/asset/spec.ts` (ADR-16). `scripts/lib/build.ts` has one generic `buildGlb(spec)`; `buildBoardGlb(level)` and `buildShoesGlb()` describe the parts, materials and textures. `budget.ts` takes the asset key for its limits, node list and size rows; `inspect.ts` checks mipmaps on every texture slot (normal, metallic-roughness, occlusion, emissive), not only base colour. `check-assets.ts` prints one table per file.

| File | Tier | Bytes | Draw calls | Triangles | Textures |
| --- | --- | --- | --- | --- | --- |
| `board.glb` | Medium | 250.2 KB (byte for byte as before) | 7 | 13,904 | 4 |
| `board-high.glb` | High | 1,709.4 KB (of which PNG 1,496.4 KB) | 7 | 42,736 | 5: grip 1024 x 1024 RGB, grip normal 512 x 512, graphic 2048 x 512, ply 32 x 256, wheel 64 x 512 (12.21 MB on the GPU with mips) |
| `shoes.glb` | High | 241.8 KB | 3 | 9,214 | 2: upper 512 x 512, sole band 16 x 64 |

**High board.** The same `src/asset` code with a detail level (`buildBoard('high')`): outline intervals 48, a six-step bevel per side generated from the 4 mm bevel circle (`RINGS_HIGH`; the medium ring table is that at 0, 30, 60 and 90 degrees), rounded-box fillets at 4 segments, cylinders at 24 to 32, bolt heads at 16 with a round 4 mm socket, hexagon nuts, and wheels at 64 radial segments over a 28-point profile that models the 608 bearing (shield, races, bore). The grip colour map is the medium recipe scaled to 1024 px with the same seed; its normal map is derived from the same height field, box filtered to 512 px (at 1024 px the noise PNG alone was 2.1 MB and the file 3.3 MB, over the 2.5 MB gate), strength 0.6. The deck graphic is rasterised at 2048 x 512. Not done: a wheel print (the lathe's polar UVs would smear a square mark) and a hex bolt socket.

**Shoes.** One right shoe (the runtime mirrors it, `Feet.tsx`): the footprint is a half-width function per side (superellipse heel and toe, a smoothstep from heel to ball width, a cosine-windowed arch dip), the sole is 12 nested footprint rings lofted like the deck with a 16 x 64 band texture for the foxing stripe, the upper is a 73 x 48 lofted grid of superellipse arches with a height profile and a valley for the ankle and tongue, welded for smooth normals, with a seeded 512 x 512 canvas weave carrying the toe cap, heel tab, tongue and eyelets; the laces are 11 merged 8-segment cylinders. Nodes `Shoe_Sole`, `Shoe_Upper`, `Shoe_Laces`. Origin at the footprint centre on the sole bottom, toe +X, up +Y, lateral +Z; `SHOE` in `shoeSpec.ts` must equal `FOOT` in `src/sim/feet.ts` (`shoe.test.ts`). Every number is in `shoeSpec.ts`; the look is DESIGN.md 8.3.

**Runtime.** `modelUrls.ts` maps the tier to a file; `BoardModel` takes the URL, sets the tier's anisotropy on every cached texture once, and casts shadows on High; `ShoesModel` does the same for the shoe; both are lazy chunks and both preload on module load for the tier that needs them. `AssetBoundary` (in `Board.tsx`) is shared: any GLB failure drops the scene to the primitives and disables High and Medium.

## Ground pass (2026-11-04): the concrete ground, a fourth asset

ADR-31; the look and the numbers are DESIGN.md section 10. `npm run assets` now builds four files; `npm run assets -- ground` (any asset keys from `ASSET_FILES`) builds only those, which is how this pass wrote `ground.glb` without rewriting the other three (they stay byte for byte as committed, checked by building them in memory and comparing).

| File | Tier | Bytes | Draw calls | Triangles | Textures |
| --- | --- | --- | --- | --- | --- |
| `ground.glb` | Medium and High (Low draws an untextured plane) | 434.9 KB (of which PNG 431.8 KB: colour 277.8, normal 129.6, roughness 24.4) | 1 | 2 | 3: colour 1024 x 1024 grey, normal 1024 x 1024 RGB, roughness 256 x 256 grey (11.00 MB on the GPU with mips) |

| File | Role | Tested by |
| --- | --- | --- |
| `src/asset/groundSpec.ts` | Bay and plane size, texture sizes, seed, tone, aggregate, pits, cracks, joint, painted mark, roughness, wheel marks, node and material. Pure data | everything below |
| `src/asset/groundTextures.ts` | One concrete surface (grey, height in metres, roughness) on the 1024 px grid from tileable value-noise fBm and seeded stamps; encoded as the grey colour map, the normal map (`normalMapFromHeight`, which now takes a separate slope down the image for non-square texels) and the roughness map (box filtered to 256 px); `concreteTint()` is the base colour factor | `ground.test.ts` (tiling, joint in all three maps, normal convention, mean grey, roughness range) |
| `src/asset/ground.ts` | The 40.0 x 39.6 m quad on y 0, UVs 0 to 1, +u to +X and +v to +Z | `ground.test.ts` |
| `scripts/lib/build.ts` | `groundSpec()`: one material with base colour, normal and metallic-roughness textures, each with the repeat transform (25 x 33). Texture specs now carry their `repeat` (the board's grip computes it from its tile, same bytes) and materials an optional `roughnessMap` | `budget.test.ts` (determinism, and the committed `ground.glb` equals a fresh build byte for byte) |
| `scripts/lib/budget.ts` | The ground's own rows: size x and z at least 24 m and a whole odd number of bays, surface height 0 within 0.5 mm, centred on the origin within 1 mm; node `Ground_Concrete` | `budget.test.ts` |

`assets:check` for `ground.glb` (2026-11-04): 434.9 KB of 500 KB, 1 of 1 draw call, 2 of 64 triangles, 3 of 3 textures, long side 1024 of 1024 px, all power of two and mipmapped, meshopt and quantization required, no Draco, size x 40.000 m (25 bays), size z 39.600 m (33 bays), surface 0.0 mm, centred 0.0 mm.

**Why the maps are the sizes they are.** PNG cannot compress per-pixel noise. A first cut with fine grain in the height field gave a 775 KB normal map and a 329 KB colour map. The grain is now smooth noise a few texels across (+-2.5 grey levels), only stones over 2 mm across have height (0.05 mm), and the roughness, which is low frequency, is 256 px: 432 KB for all three.

**Runtime.** `GroundModel` (lazy chunk, 0.7 KB, sharing the BoardModel chunk's loader) renders the one node with `dispose={null}`, sets `ART.quality[tier].groundAnisotropy` on the cached maps (16 High, 8 Medium) and receives the shadow on High; `Pad` imports it at once on Medium and High so the GLB streams in parallel, and renders the untextured plane on Low, while it streams, and if it fails. `AssetBoundary` takes `reportToStore={false}` here, so a failed ground does not disable the board's tiers (checked by blocking the file: plain plane, Medium board still loaded, nothing announced). `SceneEnvironment` now prefilters a procedural outdoor scene (`src/scene/outdoorEnvironment.ts`) instead of RoomEnvironment, with the same lifecycle.

## Shoe construction pass (2026-11-05): `shoes.glb` rebuilt

ADR-39; the look is DESIGN.md 8.3. The numbers in the quality pass table above are superseded for the shoe: `shoes.glb` is 520.4 KB of 600 (PNG 430.0 KB), 3 draw calls, 16,715 triangles (sole 4,546, upper 10,113, laces 2,056), textures `shoe-upper.png` 1024 x 1024 grey (tinted by the Upper material's base colour factor, like the medium grip) and `shoe-sole.png` 1024 x 512 RGB (8.00 MB on the GPU with mips). The Upper material is double sided (`doubleSided` on a material spec in `scripts/lib/build.ts`). `npm run assets -- shoes` builds it alone; the other three files stay byte for byte as committed.

## Truck, wear and ground pass (2026-11-05): ADR-40

The look and the numbers are DESIGN.md 7.3, 7.4 and 10.1. Three files changed, `shoes.glb` rebuilt byte for byte.

| File | Tier | Bytes | Draw calls | Triangles | Textures |
| --- | --- | --- | --- | --- | --- |
| `board.glb` | Medium | 281.4 KB (was 250.2; PNG 192.6) | 7 | 14,272 (was 13,904) | 4: deck-bottom now carries the wear (34.8 KB, was 4.5) |
| `board-high.glb` | High | 1,823.3 KB (was 1,709.4; PNG 1,589.6) | 7 | 47,488 (was 42,736) | 6 (was 5): adds `deck-bottom-roughness.png` 1024 x 256 grey, 10.9 KB; deck-bottom-high 92.4 KB (was 10.1); 13.54 MB on the GPU |
| `ground.glb` | Medium and High | 432.7 KB (was 434.9) | 1 | 2 | 3: colour 1024 over 2 x 2 bays 280.6 KB, normal 1024 over one bay 121.2 KB, roughness 512 over 3 x 3 bays 27.7 KB; 12.00 MB on the GPU |

| File | What changed | Tested by |
| --- | --- | --- |
| `src/asset/spec.ts` | `TRUCK`: countersunk `bolts` (profile, rim, top, tint), pivot cup `socket` and `insert`, `seat`, `hanger` (the loft's circles and stations), `axleBulge`, the pivot cone; `axleHousing` is now the hanger envelope only; `HARDWARE_DETAIL` gains `hanger`, `seat`, `bulge` and `boltHex`. `DECK_WEAR`, and `TEXTURES_HIGH.deckRoughness` | everything below |
| `src/asset/hardware.ts` | `hangerSection` and `buildHangerBody` (a loft of convex hulls sampled by angle, each triangle oriented outward from the axle line, so the mirrored truck needs no negative scale), `latheOnAxis`, `boltSeat` and the countersunk `buildBoltHead` (High: a hex socket), `tint` for vertex colours | `hardware.test.ts`, `board.test.ts`, `src/sim/boardVolume.test.ts`, `src/scene/clearance.test.ts` (unchanged) |
| `src/asset/board.ts` | The steel group carries a vertex colour: 1 on the truck steel, `TRUCK.bolts.tint` on the bolt heads | `board.test.ts` |
| `src/asset/textures.ts` | `deckWear` (mask and grain in deck metres) and `wearDeckBottom` (colour and roughness from the one mask); `greyFromField` | `textures.test.ts` |
| `src/asset/groundSpec.ts`, `groundTextures.ts` | Per-map tiles of bays (`GROUND_TEXTURES[key].bays`), `groundRepeat`, `originBay`; the one-bay fine surface (`concreteSurface`, now grey detail and height only), `concreteColorField` (four bays), `concreteRoughnessField` (nine bays) | `ground.test.ts` |
| `scripts/lib/build.ts` | `COLOR_0` from a geometry's `color` attribute; the deck graphic goes through `wearDeckBottom`; the High graphic gets a metallic-roughness texture with factor 1; each ground map takes `groundRepeat(key)` | `budget.test.ts` (determinism, committed bytes, the High texture list) |

**Bytes.** The wear and the varied bays cost little because the expensive parts were made predictable for PNG's row filters. The print grain's wave is snapped to 0.2 m blocks along the deck (each texel row then repeats along a block: 2 KB, against 12 to 14 KB for the continuous wave at 2 levels, which shows no difference); texels outside the outline at the tips are plain wood without grain; the scuff haze is limited to patches near the tips. On the ground, the colour tile's grain moved from 3.5 mm to 12 mm cells: at the new 3.1 mm texel the old grain was per-texel noise and cost 154 KB.

## KTX2 textures (2026-11-09, ADR-49)

Every texture in all four GLBs is now KTX2: Basis Universal ETC1S at quality 255 with its mip chain down to 1 x 1 (`KTX2_OPTIONS` and `encodeKtx2` in `scripts/lib/build.ts`, through the pinned `ktx2-encoder`, WASM, no system tool). The raw pixels go straight to the encoder; colour maps are perceptual with the sRGB transfer function, normal maps use the normal-map preset, roughness is linear. `scripts/lib/png.ts` is gone. The texture file names in the specs still end in `.png`; the builder names them `.ktx2` inside the GLB. Everything above that gives a PNG size is history.

| File | Before (PNG) | After (KTX2) | Textures inside | GPU memory, est. (BC7 + mips) |
| --- | --- | --- | --- | --- |
| `board.glb` | 281.4 KB | **187.6 KB** | grip 78.1, deck-bottom 18.6, ply 0.8, wheel 0.9 KB | 0.67 MB (was 2.70) |
| `board-high.glb` | 1,823.3 KB | **596.1 KB** | grip-high 228.6, grip-normal 81.6, deck-bottom-high 40.7, deck-bottom-roughness 8.4, ply-high 1.7, wheel-high 1.3 KB | 3.39 MB (was 13.54) |
| `shoes.glb` | 520.4 KB | **208.9 KB** | shoe-sole 62.3, shoe-upper 56.1 KB | 2.00 MB (was 8.00) |
| `ground.glb` | 432.7 KB | **143.4 KB** | concrete-color 107.5, concrete-normal 11.1, concrete-roughness 21.4 KB | 3.00 MB (was 12.00) |

The runtime reads them with three's `KTX2Loader` (`src/scene/gltf.ts`) and its transcoder: three's own `basis_transcoder.js` and `.wasm`, which `KTX2Loader` names with `new URL(..., import.meta.url)`, so Vite emits them into the build with a content hash (until 2026-11-09 a second copy in `public/basis/`, ADR-49's update). `assets:check` adds two rows per file: every texture KTX2 with `KHR_texture_basisu` required, and every mip chain complete; the GPU estimate is 1 byte a pixel (BC7, what a desktop GPU gets) plus a third. The pilot that chose ETC1S q255 over WebP and UASTC is in ADR-49.

## High finish (2026-11-09, ADR-53)

`scripts/lib/build.ts` writes two glTF material extensions, factors only: `KHR_materials_clearcoat` on the High board's Graphic material (`GRAPHIC_CLEARCOAT` in `src/asset/spec.ts`, factor 0.6, roughness 0.22) and `KHR_materials_sheen` on the shoe's Upper material (`UPPER_SHEEN` in `src/asset/shoeSpec.ts`, colour `#62666d`, roughness 0.55). `board-high.glb` 596.2 KB and `shoes.glb` 209.0 KB; `board.glb` and `ground.glb` unchanged.

## The loading picture (2026-11-09, ADR-56)

`public/stills/welcome-light.webp` and `welcome-dark.webp` are stills of the real scene, rendered in a browser (the scene needs a GPU), so they are not part of `npm run assets`. Rebuild them when the welcome view changes (its camera, the sky, the light, the board's or the shoes' look):

```
npm run build && npx tsx scripts/measure/serve.ts dist 4173
playwright-cli -s=still open "http://localhost:4173/"
playwright-cli -s=still --raw run-code --filename=scripts/still/capture.js > stills.json
playwright-cli -s=still close
npx tsx scripts/still/write.ts stills.json
```

`capture.js` renders the welcome screen on High, the stage alone at 1600 x 800, under reduced motion (the preview holds its still pose), waits for every High model, screenshots the canvas and has the browser encode the WebP at 0.8. `write.ts` checks each file against `src/asset/stillSpec.ts` (WebP, 1600 x 800, at most 80 KB) and writes nothing if one fails. `npm run assets:check` prints a line per still and fails on the same checks. The files are not byte-deterministic (a GPU render); review a change by looking at them.
