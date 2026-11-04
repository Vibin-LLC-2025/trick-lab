# Decisions (ADR log)

Short records of choices that shaped this repo. Dated 2026-11-04. The base conventions in `CLAUDE.md` (DOM-only UI, one store whose actions own the log, shared resources) are taken as given and not repeated here.

## ADR-1: Constant-rate rotation model

**Context.** A real flip is driven by the front foot dragging off the kick, and its spin slows with air drag and changes as the board's inertia tensor wobbles. None of that is needed to teach "rotation rate times time in the air".
**Decision.** Flip and shove are constant angular rates for the whole airtime: `rollTotal = flick * T * 360`, `yawTotal = scoop * T * 360`, with `T = 2 * sqrt(2h / g)`. Height is the projectile parabola. Pitch (nose up 18 degrees easing to level by 35 percent of T) is cosmetic and not part of recognition.
**Consequence.** The whole lesson is one multiplication the student can check against the readouts: more pop buys more time, so the same flick gives more rotation. The model is pure (`src/sim/flight.ts`) and tested to the brief's numbers.

## ADR-2: Euler order YXZ

**Decision.** The board group uses `rotation.set(roll, yaw, pitch, 'YXZ')`: yaw about world Y first, then roll about the board's own long axis (X), then pitch about its own Z.
**Consequence.** The flip axis follows the shove, which is what a varial or 360 flip looks like: the board spins flat and flips about its current long axis, not about a fixed world axis. With order XYZ a varial would wobble off-axis.

## ADR-3: Board pose lives in a ref, not in React state

**Decision.** `FlightDriver` owns the only per-frame callback that writes the pose. It advances a local progress with the frame delta (clamped to 1/30 s, because the R3F clock keeps running while the demand loop idles), writes `{ y, roll, yaw, pitch }` into one reused object with `writePose`, and applies it to the Board group and shadow disc. Board has no per-frame code.
**Consequence.** No React render per frame. The pose can never disagree with the timeline because both derive from the same progress number. Deviation from the brief's wording: the brief has "the Board group reads that ref"; here FlightDriver applies the ref to the Board group in the same callback, which avoids a second `useFrame` and any ordering question between the two.

## ADR-4: Progress commits to the store at 10 Hz

**Decision.** While playing, progress reaches the store at most every 100 ms (`syncProgress`, not logged). `land()` is called the frame progress reaches 1.
**Consequence.** The timeline thumb visibly steps during playback (DESIGN.md calls this honest), React re-renders about 5 times in a 0.53 s trick, and the scene description does not churn. `frameloop` is `"always"` only while `status === 'playing'`.

## ADR-5: Landing tolerances and preset values

**Decision.** Landed if the flip is within 30 degrees of a whole revolution and the shove within 25 degrees of a half turn. When a trick is not landed, the reported axis is the one furthest past its tolerance and the sign of its error gives under- or over-rotated. Presets keep the brief's values, which `tricks.test.ts` verifies land at pop 0.35 m and fail (under-rotated) at 0.15 m:

| Preset | Pop | Flick | Scoop | At 0.35 m (T 0.534 s) | At 0.15 m (T 0.350 s) |
| --- | --- | --- | --- | --- | --- |
| Kickflip | 0.35 | 1.9 | 0 | roll 365, landed | roll 239, under by 121 |
| Pop shove-it | 0.35 | 0 | 0.9 | yaw 173, landed | yaw 113, under by 67 |
| Varial flip | 0.35 | 1.9 | 0.9 | roll 365, yaw 173, landed | under on flip |
| 360 flip | 0.35 | 1.9 | 1.9 | roll 365, yaw 365, landed | under on flip |

No adjustment was needed. The bonus is reachable: pop 0.20 m with flick 2.5 gives 364 degrees.
**Consequence.** Shove is tighter than flip because a half-turned board landing 25 degrees off is already a sketchy landing, while a flip that is 30 degrees short still gets caught by the feet.

## ADR-6: Reduced motion means scrub-only, not slow

**Decision.** Under `prefers-reduced-motion` a pop resolves at once (one announcement with the inputs and the result), the board jumps to its final pose, and the timeline is enabled so the student can step through the flight. There is no auto-play at any speed. The camera has no easing in either mode.
**Consequence.** The lesson is intact (every pose is reachable, readouts are identical) with zero animated frames. The store holds `reducedMotion`, synced from the media query by `App`, so the keyboard shortcut and the button behave the same.

## ADR-7: Reset clears the score but keeps the log

**Decision.** `session.reset` restores default inputs, playback (idle, 1x, no flight) and clears objectives, but appends to the existing event log.
**Consequence.** A teacher reviewing the export sees earlier attempts. Event `t` stays relative to the original session start.

## ADR-8: Event log panel shows the latest 200 rows

**Context.** A log panel that renders every event forever grows the heap and the DOM slowly over a long session.
**Decision.** The panel renders `events.slice(-200)` and says when it is capped. The store and the JSON export keep every event.
**Consequence.** DOM size is bounded in long sessions; assessment data is never lost.

## ADR-9: Theme default dark, clear color per theme

**Decision.** `data-theme="dark"` is set in `index.html`; a saved choice in `localStorage` under `trick-lab.theme` is applied by an inline script before first paint. The scene clear color follows the theme (`SCENE_BG.dark` and `.light`), and `artDirection.test.ts` asserts each equals `--scene-bg` in the matching `tokens.css` block. Lights and materials do not change with the theme.
**Consequence.** A theme toggle costs one background color change and no shader recompile; the stage never flashes a mismatched color on resize.

## ADR-10: Rotation direction convention (integration pass, 2026-11-04)

**Context.** The sim produces unsigned totals (degrees of flip and shove); nothing said which way the board turns on screen, and the implementation rolled the grip toward the toe side, the opposite of the convention the lead asked for.
**Decision.** The rider is regular stance. The board's nose is +X, the toe side is +Z (the side facing the default camera), the heel side is -Z. Positive flick rolls the grip toward the heel side (toe edge up and over), the kickflip direction: a negative rotation about the board's +X. Positive scoop swings the tail behind the heels, clockwise seen from above, the backside shove-it direction: a negative rotation about world +Y. (The lead first specified counterclockwise; the integration pass flagged that backside means the tail swings behind the rider, and the lead corrected the sign on 2026-11-04.) The signs live in `ART.stance` (`artDirection.ts`) and are applied in one place, `setBoardRotation` (`scene/boardPose.ts`); the sim stays unsigned, so recognition is unchanged. All four presets share the convention: the varial flip is the kickflip roll plus the shove-it yaw, and the 360 flip doubles the yaw. The scene description says the convention in words.
**Consequence.** `boardPose.test.ts` checks the directions on the real Euler math (grip toward the heel side at 25 percent of a kickflip, graphic up at 50 percent, tail toward the heels and clockwise at 25 percent of a shove-it, the same senses for varial and 360 flips). Goofy stance would be a sign flip on both axes in `ART.stance`; it is not offered.

## ADR-11: Fit the whole pad and the highest pop, not a fixed width (integration pass, 2026-11-04)

**Context.** At 1440 x 900 the stage is 784 x 876 px (taller than wide) and at 1024 x 768 it is 368 x 744 px. The DESIGN.md pad (3.6 x 2.8 m) overflowed the stage on every side, and fitting it whole would need a camera 15 m away at 1024 x 768, with the board a few pixels long.
**Decision.** The pad is 1.6 x 1.2 m (two deck lengths, wider than the 0.84 m circle the deck sweeps in a shove). `scene/cameraFit.ts` computes, in closed form, the smallest distance along the home view direction at which the pad's eight corners and a box around the board at a 0.6 m pop fit the frustum with a 5 percent margin; `SceneCamera` applies it on every resize and on Reset view, and lets OrbitControls zoom out to 1.25 times the fit even past the design's 4.5 m.
**Consequence.** Pad and full arc are in frame at 1440 x 900, 1024 x 768 and the stacked 900 px layout. On the narrow 1024 x 768 stage the board is about 110 px long; a mid-width layout that gives the stage more room is a follow-up.

## ADR-12: The realistic board is a scripted GLB, not more JSX primitives (realistic board pass, 2026-11-04)

**Context.** The board had to look like a real skateboard, and the goal was a real glTF/GLB asset pipeline with budgets, compression and disposal. More primitives in JSX would have looked better but shown none of that. There is no 3D artist on this project.
**Decision.** The board is a procedural asset built by code and shipped as a compressed GLB. `src/asset/` holds the geometry as pure modules: the deck outline, kicks, concave and nested-ring deck mesh in `deck.ts`; trucks, bolts and the wheel lathe in `hardware.ts`; deterministic textures in `textures.ts`; every number from DESIGN.md section 7 in `spec.ts`. `npm run assets` (`scripts/build-board.ts`) turns them into a glTF-Transform document: 7 meshes, one per material, and 4 PNG textures (seeded grip grit, ply stripes, wheel bands, and the deck graphic rasterized from `assets/source/deck-graphic.svg` with resvg). It then applies meshopt compression and quantization and writes `public/models/board.glb`, which is committed. `npm run assets:check` (`scripts/check-assets.ts`) reads the committed file back and fails on any budget miss; it is the last step of `npm run verify`. The runtime loads the GLB with drei `useGLTF`, preloads it, and renders the cached nodes with `dispose={null}`. A RoomEnvironment PMREM, made once per Canvas mount and disposed on unmount, gives the metals something to reflect.
**Consequence.** The asset is reviewable as code. The tests check real properties: length and width within 2 mm, kick angles, 12 mm concave, z symmetry, outward winding, wheel bottoms on the pad, UV orientation, triangle counts, deterministic bytes, and that the committed GLB matches the geometry source. It is honestly a procedural, scripted asset: no sculpting, no baked lighting, no normal maps, and a modeller would do the trucks better. The artist path (a Blender export through the same `check-assets` gate) is in `docs/ASSET-PIPELINE.md`.

## ADR-13: Meshopt over Draco (realistic board pass, 2026-11-04)

**Context.** Both shrink geometry. drei's `useGLTF` turns Draco on by default and points its decoder at a Google CDN (`gstatic.com`), fetched at runtime as a separate WASM file. School Chromebooks often sit behind filters that block CDNs, and the app should work offline once loaded.
**Decision.** Geometry uses `EXT_meshopt_compression` with `KHR_mesh_quantization` (14-bit positions, 8-bit octahedral normals, 12-bit UVs, through glTF-Transform's `meshopt()` at level `high`). The runtime calls `useGLTF(url, false, true)`: Draco off, meshopt on. The meshopt decoder ships inside the JS bundle (three-stdlib), so there is no extra request and nothing to self-host. `check-assets` fails if Draco appears.
**Consequence.** Geometry is about 88 KB of the 250 KB GLB for 13,904 triangles. Meshopt decodes faster than Draco, and its output still compresses well under gzip or brotli on the server. Draco can compress dense meshes further, which matters for scanned or sculpted assets, not for this one. If Draco is ever needed, self-host its decoder (`useGLTF.setDecoderPath('/draco/')`).

## ADR-14: KTX2 textures deferred, PNG inside the GLB for now (realistic board pass, 2026-11-04)

**Context.** KTX2 with Basis Universal keeps textures compressed on the GPU, which is the real memory win on a 4 GB Chromebook. Encoding needs the native `toktx` binary (KTX-Software), and this pass was not allowed to install system tools.
**Decision.** Ship the four textures as PNG inside the GLB: 2.70 MB of GPU memory estimated (RGBA8 plus mips), within budget. The grip is a one-channel PNG: the recipe moves all three channels together, and the material's base colour factor restores the blue lean. That took the GLB from 309 KB to 250 KB. KTX2 is the next step, once `toktx` is on the build machine:

```
npx @gltf-transform/cli@4.5.1 uastc public/models/board.glb public/models/board.glb --slots "baseColorTexture" --level 2 --zstd 18
```

or per texture, with KTX-Software directly:

```
toktx --t2 --encode uastc --uastc_quality 2 --zcmp 18 --genmipmap --assign_oetf srgb deck-bottom.ktx2 deck-bottom.png
```

The runtime then needs a `KTX2Loader` with a self-hosted Basis transcoder. Copy `three/examples/jsm/libs/basis/` to `public/basis/` and pass it through `useGLTF`'s `extendLoader` argument with `ktx2Loader.setTranscoderPath('/basis/').detectSupport(gl)`. `check-assets` should then require `KHR_texture_basisu`.
**Consequence.** UASTC transcodes to BC7 or ASTC 4x4 at 1 byte per pixel, so the estimate would drop from about 2.7 MB to about 0.7 MB. ETC1S would go lower, at some cost in quality on the grip grain. The cost is a transcoder download (a WASM file plus its JS) and a build step that depends on a native binary. Not measured yet.

## ADR-15: Board detail as the LOD and the fallback (realistic board pass, 2026-11-04)

**Context.** The GLB board costs 7 draw calls and about 13,900 triangles. That is fine on a desktop GPU and probably fine on a Chromebook, but nobody has measured one yet (PERF-BUDGET.md). The model also has to stream before it can render, and it can fail to load.
**Decision.** One component tree, two levels. The primitive board from DESIGN.md section 2 (renamed `BoardPrimitive.tsx`: 5 draw calls, 436 triangles, no textures) serves three roles: the Suspense fallback while the GLB streams, the error-boundary fallback if it fails, and the "Low" level of a "Board detail" setting in the View panel (a native radio group, DESIGN.md 7.7). The setting lives in the ui slice, defaults to High, persists under `trick-lab.board-detail` like the theme, announces changes, and is never logged (the event contract has no UI events). If Low was chosen before the scene loaded, the GLB is never downloaded: the GLTF loader and decoder are a separate 72 KB chunk (`BoardModel`), and the preload is skipped. If loading fails, the store records it, the control is disabled showing Low, and the announcer says so. FlightDriver poses the outer group, so both levels move identically.
**Consequence.** A slow machine has a one-click escape hatch back to the original scene cost (9 scene draw calls and 436 triangles, measured), and a blocked network still gets a working lab. It is a manual LOD, not distance-based: the board is the only object and is always about the same size on screen, so switching on distance would buy nothing. Switching to Low does not free the GLB's GPU memory once it has loaded (the cache keeps it, `dispose={null}`). Releasing it would take `useGLTF.clear(url)` plus disposing its geometries and textures, a follow-up if memory, not draw calls, turns out to be the Chromebook limit.
