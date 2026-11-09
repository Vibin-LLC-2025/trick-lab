# Performance budget

Target device (quality pass, 2026-11-04, ADR-16): a desktop with a real GPU on High; a mid-range laptop on Medium; a low-end Chromebook (integrated GPU, 4 GB RAM, often throttled) on Low, which keeps the original budget below unchanged. Written 2026-11-04; re-measured 2026-11-04 after the realistic board pass and again after the quality pass (last section).

## Frame budget

At 60 fps a frame has **16.7 ms**. The app's own work per frame (FlightDriver, React commits, `gl.render`) should stay under about **8 ms** on the target. A trick lasts 0.35 to 0.70 s at real speed (1.4 to 2.8 s in slow motion), so the loop runs only for that long per pop.

| Budget | Limit | Board detail High (GLB) | Board detail Low (primitive) |
| --- | --- | --- | --- |
| Scene draw calls | under 20 | 11: pad slab, pad edge lines, centre mark, shadow disc, 7 board meshes | 9: pad 3, shadow disc 1, primitive board 5 |
| Board draw calls | at most 8 | 7 | 5 |
| Board triangles | at most 25,000 | 13,904 | 436 |
| Board GLB on disk | at most 300 KB | 250.2 KB (256,204 bytes) | not downloaded if Low was chosen before the scene loaded |
| Board textures | at most 4, at most 1024 px, power of two, mipmapped | 4 (512 x 512, 1024 x 256, 16 x 128, 16 x 256), about 2.70 MB GPU with mips | 0 |
| Lights | 1 directional + 1 ambient + one RoomEnvironment PMREM (made once, never changes) | same | same |
| Shadows | none (flat disc instead) | none | none |
| Device pixel ratio | `dpr={[1, 1.5]}` | same | same |

The board budget is enforced on the committed GLB by `npm run assets:check`, which is part of `npm run verify` (table in `docs/ASSET-PIPELINE.md`).

## What the app does to stay under it

- `frameloop="demand"` except while `status === 'playing'`, or while the welcome screen's preview plays (`previewAnimates`: home, motion allowed, a 3D view, Medium or High; ADR-45), when it is `"always"`. Landing calls `land()`, which flips the loop back to demand. Idle, paused and done cost zero frames; scrubbing and orbiting render one frame per change. The environment map and the GLB arriving each request one frame.
- `gl={{ powerPreference: 'low-power', antialias: false }}` and DPR capped at 1.5.
- The board GLB is one mesh per material (7 draw calls for 51 parts: 18 per truck, 8 bolts, 4 wheels, 3 deck surfaces), compressed with meshopt and quantized (ADR-12, ADR-13). The primitive board and the pad stay merged per material in `scene/resources.ts`.
- The GLTF loader and the meshopt decoder are their own lazy chunk, fetched only on High (ADR-15). Board detail Low is the escape hatch back to the original scene cost.
- The cached GLB is rendered with `dispose={null}`, so Low/High toggles and remounts never re-upload it. The PMREM is built once per Canvas mount and disposed on unmount.
- No allocations in `useFrame`: `writePose` mutates one object, rotation is set with `Euler.set`, the shadow disc's scale and the shadow material's opacity are mutated in place.
- Progress reaches the store at most 10 times a second (ADR-4); per-frame numbers go to `scene/perfStats.ts`, not the store.
- three.js is code-split (`React.lazy` on `TrickScene`), so the DOM UI is usable before the 3D chunk arrives.
- The event log panel renders at most 200 rows (ADR-8).
- `prefers-reduced-motion` removes playback entirely (ADR-6): a pop renders one frame.

## How to profile

1. `npm run build && npm run preview`. Profile the production build, never the dev server.
2. Chrome DevTools Performance panel, CPU throttling 4x or 6x. Record a pop at 1x and one in slow motion.
3. Press `p` for the perf badge: render time, draw calls, triangles, live geometries, frames rendered. The frame counter must stop moving within one frame of the board landing.
4. Memory panel: heap snapshot after load, after 10 pops, after 10 pop/reset cycles. Geometry count (`info.memory.geometries`) must stay flat.
5. `?debug` exposes the R3F store as `window.__trickLab`; call `window.__trickLab.get()` for the live state (`gl.info`, `scene`, `controls`).

## How to measure (2026-11-09, ADR-48)

Every change from `docs/PLAN-LOOK-FEEL-PERF.md` on reports before and after from one script, `scripts/measure/measure.js`, run by the global `playwright-cli` against a production build (Playwright is not a project dependency):

```
npm run build && npx tsx scripts/measure/serve.ts dist 4173
playwright-cli -s=measure open "http://localhost:4173/?tiers=high,medium,low&nets=full,10,3"
playwright-cli -s=measure --raw run-code --filename=scripts/measure/measure.js > measure.json
playwright-cli -s=measure close
```

`scripts/measure/serve.ts` serves the build the way GitHub Pages, the live host, does: gzip for HTML, CSS, JS, JSON, SVG, `.wasm` and `.glb` (checked against Pages on 2026-11-09) and `Cache-Control: max-age=600`. `vite preview` gzips the JS, CSS and HTML but sends `.glb` and `.wasm` uncompressed, which overstates the model download; the baseline and step 1 tables were taken through it, before the server existed, and the step 3 section compares gzipped runs.

The options are the query of the page the session is on (tiers, networks, screens, feet, legs, theme, viewport, the preset, the number of timed tricks, the base path; the script's header lists them). The result is JSON with a `markdown` field holding the two tables used below. For each tier it loads the welcome screen with the HTTP cache off at full speed and at 10 and 3 Mbps (Chromium's own throttling, 60 ms latency) and records first contentful paint, the first frame of the lit 3D scene, the frame where every model of the tier is on screen, and the bytes by kind. Then, at full speed on each screen, the draw calls and triangles (the most over half a second of frames after a forced frame), and in the lab, after one untimed trick, `gl.render` CPU time and GPU time (`EXT_disjoint_timer_query_webgl2`, where the browser exposes it) over four tricks, and the frames drawn in the 1.5 s after the last landing's own frame (must be 0). Where the welcome preview loops (Medium and High) it times three seconds of it too. It reads the renderer through `?debug` and sets each load's storage from the URL (the `m-*` parameters, applied by an init script before the app runs), so nothing in the app changes for it.

Two cautions. The throttling shares the bandwidth between requests and ignores priority hints, so it shows what order buys on a bandwidth-bound link and not on a latency-bound one. GPU timer results vary between runs by more than a small change makes (one trick's median moved from 0.13 to 1.32 ms on Medium between two runs of the same build, before the script warmed the GPU up and timed four tricks); compare runs from the same session, and repeat a run before calling a difference under about 0.3 ms.

## Measured, realistic board pass (2026-11-04)

Measured by the implementation agent (opus) on a **desktop Chromium, not a Chromebook**: Windows 11, headless Chromium driven by the global `playwright-cli` (session `board-impl`), the same RTX 3060 machine as below, a display loop of about 100 Hz. Production build served by `vite preview`, viewport 1440 x 900, dark theme, storage cleared. `renderer.info` read through `?debug` after forcing a frame; "6x CPU" is CDP `Emulation.setCPUThrottlingRate`. Treat these as the best case. A Chromebook run is still owed.

| Measurement | Setting | Value |
| --- | --- | --- |
| Draw calls and triangles, after load | High, `renderer.info.render` | **11 calls, 13,952 triangles** (board 13,904; pad, centre mark and disc 48), 12 line segments (pad edge) |
| Same, after 10 preset/pop/land/reset cycles by keyboard | High | 11 calls, 13,952 triangles |
| Same, board detail Low | `Low` radio | **9 calls, 436 triangles** (identical to the scene before this pass) |
| Geometries / textures / shader programs | after load; after 10 cycles; after Low, High and 5 more Low/High toggles | 16 / 6 / 4 at every point (flat) |
| What the 6 textures are | `renderer.info.memory` | 4 board PNGs, the PMREM environment, three's `dfgLUT` |
| What the 16 geometries are | | 7 GLB meshes, 5 primitive-board geometries (uploaded while the fallback showed during streaming), pad slab, pad edges, centre mark, shadow disc |
| Wheel bottoms at rest | world-space min y of the `Wheels` mesh | -0.00001 m (touching the pad) |
| Environment | `scene.environment`, `scene.environmentIntensity`, `scene.background` | PMREM set, 0.40, `#1e2124` (the clear colour; never the environment) |
| `gl.render` CPU time per frame during a 360 flip at 1x | no throttle | median 0.2 ms, p95 1.0 ms, max 1.1 ms (56 frames) |
| Same | 6x CPU | median 1.0 ms, p95 2.5 ms, max 3.1 ms (57 frames) |
| Frames rendered while idle | 10 s, no input, after a 360 flip landed | **0** |
| JS heap after load, after 10 cycles | forced GC via CDP, `Runtime.getHeapUsage` | 6.11 MB, 7.62 MB (the event log grows by design, ADR-7) |
| Network on High | resource timing | `BoardModel` chunk 20.9 KB transferred, `board.glb` 250.5 KB |
| Load failure | `board.glb` blocked with a route abort | primitive board shown (9 calls), both radios disabled with Low checked, announcer: "The board model did not load. Showing the simple board." |
| Keyboard run | 1 Space, 2 Space, 3 Space, 4 Space from a fresh load | all four tricks land, Objectives 4 of 4 |

Before and after, whole scene: **9 draw calls and 436 triangles before** (primitive board, measured by the integration pass below), **11 draw calls and 13,952 triangles after** on High, and back to 9 and 436 on Low. `gl.render` median went from 0.1 to 0.2 ms unthrottled and from 0.6 to 1.0 ms at 6x CPU: well inside the 8 ms budget, but it is the number to watch on a real Chromebook GPU, where fill rate and the PBR shader with an environment map cost more than here.

### Bundle (`npm run build`, Vite 8.3.5, 2026-11-04, after the realistic board pass)

| Chunk | Minified | Gzip |
| --- | --- | --- |
| `index` (React, Zustand, DOM UI) | 245.59 KB | 77.42 KB |
| `TrickScene` (three, R3F, drei OrbitControls, scene, RoomEnvironment) | 952.12 KB | 253.57 KB |
| `BoardModel` (drei useGLTF, three-stdlib GLTFLoader, meshopt decoder), lazy, High only | 71.81 KB | 21.24 KB |
| CSS | 20.65 KB | 4.14 KB |
| `models/board.glb` (static file, not a chunk) | 250.2 KB | n/a |

Before this pass: `index` 244.17 / 76.99 KB, `TrickScene` 945.55 / 250.87 KB, CSS 18.60 / 3.86 KB. With `BoardModel` inside `TrickScene` the scene chunk was 1,022.66 KB, which is why it was split out.

### Open issues from this pass

1. **Pad lighter than the design intent.** With the environment map the pad renders `#959696` at environment intensity 0.40 (`#a2a4a4` at the design's 0.55), against an intended `#7b7a77`. It reads as grey concrete in both themes, which was the fix asked for, but it is lighter than designed. Reaching `#7b7a77` needs either intensity near 0.25 (below the design's range; metals get duller) or a darker pad colour. A design-agent call.
2. **No Chromebook numbers.** Same as before.

## Startup main thread (2026-11-04)

Lighthouse 13.6.0, mobile preset (simulated 4x CPU), production build (`npm run build && npm run preview`), Apple M3, 4 runs each. Do not audit `npm run dev`: Vite serves unbundled modules and React's development build, which scored 55 to 60 on the same page.

Cause: three compiles and links each shader program synchronously the first time it is used, and the first Canvas mount did all of it in one task: create the renderer, prefilter the RoomEnvironment PMREM (its own shaders), then draw the first frame (the scene's shaders). A CPU profile at a real 4x throttle put that mount task at 176 ms, 75 ms of it in `PMREMGenerator.fromScene`.

Change: `SceneEnvironment` keeps the pad and board hidden, prefilters the PMREM in its own macrotask, then precompiles the scene with `renderer.compileAsync` (KHR_parallel_shader_compile, no blocking wait) in another, and only then shows them and calls `invalidate()` once. Compiling after `scene.environment` is set avoids compiling every material twice, since the envMap is part of the program.

| Metric | Before | After |
| --- | --- | --- |
| Lighthouse performance score | 91 to 95 | 95 to 96 |
| Total Blocking Time (Lighthouse) | 240 to 370 ms | 220 to 260 ms |
| Longest task (Lighthouse, simulated) | 264 to 384 ms | 134 to 155 ms |
| Canvas mount task (CDP profile, real 4x CPU) | 176 ms | 103 ms; PMREM 79 ms as its own task |
| Draw calls and triangles after load, High | 11 and 13,952 | 11 and 13,952 (unchanged) |

FCP and LCP (0.8 s or 1.4 s in both builds, the LCP element is a preset button) did not change beyond run-to-run noise. What is left: the renderer and context creation (about 29 ms at 4x) and the PMREM task. A prebaked environment would remove the PMREM task, but changes the look and needs an ADR.

## Measured, integration pass (2026-11-04, before the realistic board)

Measured 2026-11-04 by the integration agent on a **desktop Chromium, not a Chromebook**: Windows 11, headless Chromium 156 driven by the global `playwright-cli` (session `tricklab`), NVIDIA RTX 3060 through ANGLE/D3D11, a display loop of about 100 Hz in headless mode (rAF interval 10 ms). Production build served by `vite preview`, viewport 1440 x 900, dark theme. `renderer.info` was read through `?debug`, which exposes the R3F state as `window.__trickLab` (nothing is attached without the query). "6x CPU" is Chrome DevTools Protocol CPU throttling (`Emulation.setCPUThrottlingRate`): a rough stand-in for a weak CPU that does nothing to model a weak GPU. Treat these numbers as the best case. A Chromebook run is still owed.

| Measurement | Setting | Value |
| --- | --- | --- |
| Draw calls, board at rest | perf badge and `renderer.info` | 9 (436 triangles) |
| Draw calls, mid-flip | kickflip scrubbed to 50 percent | 9 (436 triangles) |
| Triangles | perf badge | 436 |
| Geometries on GPU, after load and after 10 pop/reset cycles | `renderer.info.memory` | 9 and 9 (flat); shader programs 3 and 3 |
| Textures | `renderer.info.memory` | 1: three's built-in `dfgLUT` lookup texture for `MeshStandardMaterial`, not an app texture |
| `gl.render` CPU time per frame during a trick | no throttle | 360 flip at 1x: median 0.1 ms, p95 0.3 ms, max 0.3 ms (55 frames). At 0.25x: median 0.2, p95 0.4, max 0.8 (215 frames) |
| `gl.render` CPU time per frame during a trick | 6x CPU | 1x: median 0.6 ms, p95 1.1 ms, max 1.6 ms. 0.25x: median 0.5, p95 0.9, max 2.6 |
| Frame interval during a trick (rAF) | no throttle | median 10.0 ms, p95 10.1 ms, max 10.6 ms (display bound) |
| Frame interval during a trick (rAF) | 6x CPU | median 10.0 ms, p95 10.1 ms, max 20.1 ms (one dropped frame per trick, at the pop) |
| Frames rendered while idle | 10 s, no input, after a 360 flip landed | **0** |
| Frames rendered for one 360 flip at 1x and at 0.25x | `renderer.info.render.frame` | 55 and 214 (airtime 0.534 s and 2.14 s at about 100 Hz) |
| Frames rendered for one pop under reduced motion | `prefers-reduced-motion: reduce` | 1 |
| JS heap after load, after 1 pop, after 10 pops | forced GC via CDP, `Runtime.getHeapUsage` | 5.20 MB, 5.81 MB, 6.60 MB (+0.09 MB per pop, follows the event log: 2 events per pop) |
| JS heap after a further 10 preset/pop/reset cycles | same | 6.95 MB; geometries still 9 |

Reading: the scene costs well under 1 ms of the 16.7 ms frame even at 6x CPU, it renders only while the board is in the air (about one frame per display refresh), and it renders nothing once the board lands. Heap growth tracks the event log, which is kept across resets by design (ADR-7) while the panel renders at most 200 rows (ADR-8).

Bundle at that point (Vite 8.3.5): `index` 244.17 / 76.99 KB, `TrickScene` 945.55 / 250.87 KB, CSS 18.60 / 3.86 KB (minified / gzip).

## Quality pass (2026-11-04): tiers, feet, shadows

Per-tier budget (ADR-16). The Low column is the table at the top of this file, unchanged. "Scene draw calls" is `renderer.info.render.calls`, which on High includes the shadow pass.

| Budget | High | Medium | Low |
| --- | --- | --- | --- |
| Scene draw calls | under 40 | under 20 | under 20 |
| Board asset (`BUDGETS` in spec.ts) | `board-high.glb`: 2.5 MB, 8 calls, 120,000 triangles, 6 textures at 2048 px | `board.glb`: 300 KB, 8 calls, 25,000 triangles, 4 textures at 1024 px | primitive |
| Shoes | `shoes.glb`: 600 KB, 3 calls per shoe, 30,000 triangles, 2 textures | primitive (2 calls per shoe) | primitive |
| Renderer | MSAA, DPR up to 2, 16x anisotropy, PCF soft shadow map 2048 px | MSAA, DPR 1.5, 4x anisotropy, disc | no MSAA, DPR 1.5, disc |

### Measured, quality pass (2026-11-04)

Measured by the lead's agent (fable) on the **same desktop as before, not a Chromebook**: Windows 11, headless Chromium through the global `playwright-cli` (sessions `feetcheck` and `highcheck`), RTX 3060 via ANGLE/D3D11, Vite dev server (not the production build: the numbers below are renderer counts, not timings), viewport 1440 x 900, dark theme, feet shown, after the kickflip preset. Headless reports DPR 1, so the DPR 2 path is untested here.

| Measurement | High | Medium | Low |
| --- | --- | --- | --- |
| Draw calls at rest and after landing (`renderer.info.render.calls`) | **29** (board 7, two shoes 6, pad 3, plus the shadow pass over the 13 casters) | **15** (board 7, two primitive shoes 4, pad 3, disc 1) | **13** (primitive board 5, shoes 4, pad 3, disc 1) |
| Triangles | 122,352 (42,736 board plus 2 x 9,214 shoes, counted twice with the shadow pass) | 14,000 | 484 |
| Geometries / textures on the GPU | 20 / 11 (board 7, shoe 3, primitives 8, pad and disc; textures: 5 board, 2 shoe, PMREM, dfgLUT, shadow map and one more) | 16 / 6 as before | 9 / 1 as before |
| Antialias, shadow map | on, on | on, off | off, off |
| Camera distance after the fit (ADR-18) | 2.47 m (was 3.52 m when the pad had to fit) | same | same |
| Console errors | none (one three.js `Clock` deprecation warning from R3F, pre-existing) | none | none |

What was looked at, each screenshot opened: the kickflip stance from the sliders (front foot turned toward the nose, heel over the far rail; back foot across the tail), the pop (back foot pressing the tail), the flick (front foot off the heel-side rail, toes down, board showing its graphic), the gather and landing on the bolts, and a 360 flip at pop 0.15 m that bails (board on its side, feet on the pad to the heel side).

### Bundle (`npm run build`, 2026-11-04, after the quality pass)

| Chunk | Minified | Gzip |
| --- | --- | --- |
| `index` (React, Zustand, DOM UI, the feet model) | 249.94 KB | 79.27 KB |
| `TrickScene` (three, R3F, drei OrbitControls, scene, RoomEnvironment) | 957.16 KB | 255.33 KB |
| `BoardModel` (drei useGLTF, GLTFLoader, meshopt decoder), lazy, High and Medium | 72.18 KB | 21.41 KB |
| `ShoesModel`, lazy, High only | 0.80 KB | 0.48 KB |
| CSS | 20.65 KB | 4.14 KB |
| `models/board.glb` / `board-high.glb` / `shoes.glb` (static) | 250.2 KB / 1,709.4 KB / 241.8 KB | n/a |

### Open issues from this pass

1. **No timings yet for High.** Draw calls and triangles are counted; `gl.render` time with the shadow pass and DPR 2 on a real display is still to measure with the production build.
2. **The bail ignores the board's yaw.** The feet step to fixed heel-side spots in the rest frame, so a board that stopped at a quarter turn can overlap a shoe (visible in the bail screenshot). ADR-17.
3. **Still no Chromebook numbers.** Low is unchanged, so the earlier measurements stand as the best estimate.

## Foot trails and speed pass (2026-11-04)

Measured on the dev server at 1440 x 900 (headless, DPR 1) with feet and foot trails on, kickflip preset: Low 14 draw calls, Medium 16, High 30 (was 13, 15 and 29: the trails add one call on every tier). No console errors. The trail geometry is a few thousand triangles and is rebuilt only when the shown flight changes (a pop, or a slider move before a pop); the per-frame cost is one uniform write.

Open items from the research (`docs/RESEARCH-FEET.md` section 4, see ADR-20): an eased board rotation for an earlier catch, distinct bails for flip and shove failures, a thinner vulcanised sole.

## Motion cues, tail-pivot pop and shadow pass (2026-11-04)

Measured on the dev server at 1600 x 1000 (headless, DPR 1) with feet, foot trails and motion cues all on, 360 flip preset, `renderer.info.render.calls` after one `gl.render`: **Low 15, Medium 17, High 31** (budgets 20, 20 and 40; was 14, 16 and 30). The cues are one mesh with one material on every tier (ADR-26): unlit, `forceSinglePass` so the double-sided transparent material does not split into two passes, no shadow casting, so the High shadow pass is unchanged. Once a flight has faded them out the material is hidden and the call is skipped (landed: Low 14, Medium 16, High 30 with trails off 29). The cue geometry is under 600 triangles, rebuilt only when flick, scoop, the flight or the stance change. Per frame: one opacity write and one visibility flag for the cues, one rotation and one scale write for the Medium and Low footprint, and the contact lift in `writePose` (a few sines and cosines, no allocation). The frame counter stops on landing on all three tiers. No console errors; the known warnings are PCFSoftShadowMap (falls back to PCF) and the THREE.Clock deprecation from R3F.

## Ground pass (2026-11-04): concrete ground, fog, outdoor environment

ADR-31, DESIGN.md section 10. Measured by the implementation agent (opus) on the same desktop as above, **not a Chromebook**: headless Chromium through the global `playwright-cli` (session `scene-b`), Vite dev server, viewport 1600 x 1000, DPR 1, feet, foot trails and motion cues on, kickflip preset; `renderer.info` read through `?debug` after one `gl.render`, and the perf badge, which agreed on every tier. Both themes gave the same counts.

| Measurement | High | Medium | Low |
| --- | --- | --- | --- |
| Draw calls at rest, before the pop (budget) | **29** (40) | **15** (20) | **13** (20) |
| Same before this pass (previous section) | 31 | 17 | 15 |
| Draw calls mid kickflip (50 percent), landed, and in a low orbit (cues faded) | 28 | 14 | 12 |
| Triangles at rest | 125,125 | 16,869 | 3,353 |
| Same before (derived: the slab and the mark were 24 triangles, the ground is 2; the slab never cast a shadow) | 125,147 | 16,891 | 3,375 |
| Textures on the GPU (`info.memory.textures`) | 14 (11 before: +3 ground maps) | 9 (6 before) | 2 (unchanged: PMREM and the BRDF LUT) |
| Geometries on the GPU | 21 | 19 | 11 |
| `gl.render` time at rest (perf badge, dev server, not a timing run) | 0.3 to 0.4 ms | 0.3 to 0.4 ms | 0.3 to 0.6 ms |
| Frames rendered in 1.5 s after the landing | 0 | 0 | 0 |
| Ground download | `ground.glb` 434.9 KB | same | none |
| Ground GPU memory (estimate, RGBA8 plus mips) | 11.00 MB | 11.00 MB | 0 |
| Console errors | none | none | none |

The pad was three draw calls (slab, edge lines, mark) and is now one on every tier, the ground plane. The fog adds no pass and no call (it is a shader define). The outdoor environment replaces RoomEnvironment one for one (one PMREM render target, built once per Canvas mount); the hemisphere light replaces the ambient light. With `ground.glb` blocked, Medium shows the untextured plane (15 calls), the Medium board stays loaded and nothing is announced. The shadow footprint on Medium and Low was not changed.

### Bundle (`npm run build`, Vite 8.3.5, 2026-11-04, after the ground pass)

| Chunk | Minified | Gzip |
| --- | --- | --- |
| `index` (React, Zustand, DOM UI, the sim; includes the other agent's concurrent ADR-30 work) | 271.56 KB | 86.87 KB |
| `TrickScene` (three, R3F, drei OrbitControls, scene, the outdoor environment; RoomEnvironment no longer bundled) | 966.60 KB | 258.92 KB |
| `BoardModel` (drei useGLTF, GLTFLoader, meshopt decoder), lazy, High and Medium | 72.19 KB | 21.44 KB |
| `GroundModel`, lazy, High and Medium | 0.74 KB | 0.48 KB |
| `ShoesModel`, lazy, High only | 0.80 KB | 0.49 KB |
| CSS | 21.65 KB | 4.56 KB |
| `models/board.glb` / `board-high.glb` / `shoes.glb` / `ground.glb` (static) | 250.2 KB / 1,709.4 KB / 241.8 KB / 434.9 KB | n/a |

### Open issues from this pass

1. **11 MB more texture memory on Medium.** The three ground maps upload as RGBA8 with mips. Medium is the mid-range laptop tier; if that is too much, Medium could take a 512 px colour and normal map (a second ground file) or KTX2 (ADR-14).
2. **Still no Chromebook numbers.** Low gained nothing but a cheaper ground (one call instead of three), so the earlier Low measurements stand as the best estimate.
3. **The bay tile repeats.** Every bay has the same cracks and mark. Fog hides it in low orbits; from a high orbit the pattern shows.

## Shadow and camera pass (2026-11-05): fitted PCF, projected footprints, detail preset

ADR-38. Measured by the implementation agent (opus) on the same desktop as above, **not a Chromebook**: headless Chromium through the global `playwright-cli` (session `render`), Vite dev server, viewport 1600 x 1000, DPR 1, kickflip preset with feet, legs, foot trails and motion cues on; `renderer.info.render` read through `?debug` after the landing. "Before" is HEAD (61079eb) served from a scratch checkout on the same machine.

| Measurement | High | Medium | Low |
| --- | --- | --- | --- |
| Draw calls after the landing (budget) | **31** (40) | **16** (20) | **14** (20) |
| Same before this pass | 31 | 16 | 14 |
| Draw calls at rest, cues showing (before and after) | 32 | 17 | 15 |
| Same from the detail camera preset | 31 landed, 32 at rest | 16, 17 | 14, 15 |
| Triangles after the landing | 127,354 (unchanged) | 18,690 (18,330 before) | 5,174 (4,814 before) |
| Frames rendered in 1.5 s after the landing | 0 | 0 | 0 |
| Console errors | none | none | none |

The two shoe footprints and the contact shadow are instances of the board's shadow mesh, so Medium and Low gain triangles (four 120-triangle discs instead of one) but no call. Per frame FlightDriver writes four instance matrices, four opacities and three uniform vectors (no allocation). On High the shadow pass is unchanged in calls; the map now covers 1.54 x 1.68 m instead of 2 x 2 m and 1.76 m of depth instead of 11 m, and `PCFShadowMap` with radius 3 is the same five comparison taps r187 already ran when it substituted PCF for the deprecated PCFSoft request (that warning is gone). The detail preset costs nothing at steady state.

## Screens pass (2026-11-08): the welcome preview, the game and the tidied lab

Measured on the production build (`vite preview`, 1440 x 900, `?debug`, `gl.info.render.calls` after load), ADR-45 to ADR-47. The welcome screen's preview renders continuously only on Medium and High; Low holds a still frame. In the lab a pop plays and the loop returns to demand at the landing (the frame counter stops).

| Tier | Feet | Welcome (loop) | Game | Lab |
| --- | --- | --- | --- | --- |
| High | on | 30 (always) | 31 | 31 |
| High | off | 15 (always) | 16 | 16 |
| Medium | on | 15 (always) | 16 | 16 |
| Medium | off | 9 (always) | 10 | 10 |
| Low | on | 13 (demand) | 14 | 14 |
| Low | off | 7 (demand) | 8 | 8 |

All under the gates: 40 on High (the shadow pass counts), 20 on Medium and Low. The game and lab add one call over the welcome screen for the motion cues, which the preview hides.

## Look, feel and performance plan (2026-11-09)

Measured with `scripts/measure/measure.js` (above) on the same desktop as every section here, **not a Chromebook**: Windows 11, headless Chromium 156 through the global `playwright-cli`, an RTX 3060 through ANGLE and Direct3D 11, production build from `vite preview`, 1440 x 900, DPR 1, dark theme, feet on, the app's default legs, HTTP cache off. "Before" is commit 87ccd92 (the plan's starting point) built and served from a scratch worktree in the same session.

### Baseline (before step 1; legs on by default)

| Tier | Network | UI (FCP) | First 3D frame | All models on screen | JS | Models |
| --- | --- | --- | --- | --- | --- | --- |
| high | full speed | 0.05 s | 0.52 s | 0.79 s | 375.5 KB | 2777.2 KB |
| high | 10 Mbps | 0.28 s | 0.69 s | 3.12 s | 375.5 KB | 2777.2 KB |
| high | 3 Mbps | 0.48 s | 1.39 s | 9.17 s | 375.5 KB | 2777.2 KB |
| medium | full speed | 0.05 s | 0.53 s | 0.76 s | 374.5 KB | 714.7 KB |
| medium | 10 Mbps | 0.29 s | 0.69 s | 1.56 s | 374.5 KB | 714.7 KB |
| medium | 3 Mbps | 0.49 s | 1.39 s | 3.50 s | 374.5 KB | 714.7 KB |
| low | full speed | 0.05 s | 0.45 s | none | 352.4 KB | 0 KB |
| low | 10 Mbps | 0.28 s | 0.69 s | none | 352.4 KB | 0 KB |
| low | 3 Mbps | 0.49 s | 1.41 s | none | 352.4 KB | 0 KB |

| Tier | Screen | Draw calls | Triangles | Frameloop | Textures | gl.render CPU, median / p95 | GPU, median / p95 | Idle frames after the landing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| high | home | 30 | 164,206 | always | 16 | 0.6 / 1.9 ms | 3.29 / 5.65 ms |  |
| high | lab | 31 | 164,307 | demand | 16 | 0.5 / 1 ms | 2.62 / 4.03 ms | 0 |
| high | skate | 30 | 164,206 | demand | 16 |  |  |  |
| medium | home | 15 | 18,446 | always | 10 | 0.3 / 1.1 ms | 2.64 / 4 ms |  |
| medium | lab | 16 | 18,547 | demand | 10 | 0.2 / 0.5 ms | 1.27 / 3.02 ms | 0 |
| medium | skate | 15 | 18,446 | demand | 10 |  |  |  |
| low | home | 13 | 4,562 | demand | 3 |  |  |  |
| low | lab | 14 | 4,663 | demand | 3 | 0.3 / 0.6 ms | 0.89 / 0.97 ms | 0 |
| low | skate | 13 | 4,562 | demand | 3 |  |  |  |

Against the plan's own baseline (2026-11-08, measured by hand): the same draw calls and triangles, and the same load times within 0.05 s (High at 3 Mbps: first 3D frame 1.39 s, every model 9.17 s, the plan had 1.42 and 9.51 s for the board and all models).

### Step 1: shoes only, heading focus, earlier downloads, release (ADR-48)

| Tier | Screen | Draw calls before | After | Triangles before | After |
| --- | --- | --- | --- | --- | --- |
| High | welcome (loop) | 30 | **27** | 164,206 | 161,838 |
| High | lab | 31 | **28** | 164,307 | 161,939 |
| Medium | welcome (loop) | 15 | **13** | 18,446 | 16,846 |
| Medium | lab | 16 | **14** | 18,547 | 16,947 |
| Low | welcome | 13 | **11** | 4,562 | 2,962 |
| Low | lab | 14 | **12** | 4,663 | 3,063 |

| Tier | Network | First 3D frame before | After | Every model on screen before | After |
| --- | --- | --- | --- | --- | --- |
| High | 10 Mbps | 0.69 s | 0.69 s | 3.12 s | 3.02 s |
| High | 3 Mbps | 1.39 s | 1.40 s | 9.17 s | 9.10 s |
| Medium | 10 Mbps | 0.69 s | 0.68 s | 1.56 s | 1.47 s |
| Medium | 3 Mbps | 1.39 s | 1.39 s | 3.50 s | 3.42 s |

The legs were two draw calls on every tier plus the shanks' shadow pass on High. GPU time over the looping welcome preview did not move beyond noise (High 3.29 to 3.54 ms, Medium 2.64 to 2.70 ms, medians). The models now start downloading when the 3D code arrives (High's request at 1.27 s instead of 1.43 s at 3 Mbps), which brings every model in 0.07 to 0.1 s sooner; starting them when the page opens, as first tried, delayed the first 3D frame to 3.51 s at 3 Mbps for 0.2 s on the models (ADR-48). JS: the first chunk is unchanged, the 3D chunk 0.7 KB larger. With `board-high.glb` loaded, a move to Medium frees it after a second and a move back loads it again (checked in the browser by its second resource entry); no console errors, only R3F's known `THREE.Clock` deprecation warning.

### Step 3: KTX2 textures (ADR-49)

Measured through `scripts/measure/serve.ts` (gzip like GitHub Pages), so the bytes are what a student downloads. "Before" is step 2 (b063522) from the scratch worktree, served the same way in the same session. Models and JS are gzipped transfer sizes; the transcoder (`basis_transcoder.wasm`, 242 KB gzipped, plus its 15 KB JS, in the JS column) is fetched once and then cached.

| Tier | Network | Every model on screen before | After | Models before | After | JS before | After |
| --- | --- | --- | --- | --- | --- | --- | --- |
| High | full speed | 0.80 s | 0.78 s | 2,584 KB | **754 KB** + 242 KB transcoder | 376 KB | 414 KB |
| High | 10 Mbps | 2.89 s | **1.92 s** | | | | |
| High | 3 Mbps | 8.60 s | **4.60 s** | | | | |
| Medium | full speed | 0.76 s | 0.74 s | 660 KB | **274 KB** + 242 KB transcoder | 375 KB | 414 KB |
| Medium | 10 Mbps | 1.38 s | 1.60 s | | | | |
| Medium | 3 Mbps | 3.23 s | 3.36 s | | | | |

| | High | Medium |
| --- | --- | --- |
| GPU texture memory, estimate (`assets:check`) | 33.5 to **8.4 MB** | 14.7 to **3.7 MB** |
| Texture format on the GPU (read in the browser) | BC7 (`RGBA_BPTC_Format`), every texture, full mip chains | same |

High's first visit is about twice as fast to every model on a slow link. Medium's first visit is about even (its 386 KB of savings are spent on the transcoder, and the transcoder has to arrive and compile before any texture is read: 0.1 to 0.2 s slower here, within this setup's run-to-run spread at 10 Mbps); every later visit saves the 386 KB, and the GPU keeps a quarter of the texture memory. The transcoder starts downloading with the first model request, beside the GLBs (starting it only when the first texture needed it cost Medium another 0.1 s). The first 3D frame, draw calls (High 27 and 28, Medium 13 and 14, Low 11 and 12), triangles and Low's downloads are unchanged; Low fetches neither the transcoder nor the model chunk. GPU time per frame did not move beyond noise (looping welcome preview, High 3.50 to 3.46 ms, Medium 2.55 to 1.81 ms). The model chunk is 45.9 KB gzipped (was 21.7: KTX2Loader and its zstd decoder).

### Steps 4 and 5: the WebGPURenderer and the go/no-go check (ADR-50)

"Before" is HEAD at f5d408d (WebGLRenderer on every tier) from the scratch worktree; "after" is the WebGPURenderer on Medium and High. Same session, both served by `scripts/measure/serve.ts`.

GPU time per frame (timestamp queries on WebGPU, timer queries on WebGL; medians, then p95):

| Tier | View | 1440 x 900, WebGL | WebGPU | 2560 x 1440, WebGL | WebGPU |
| --- | --- | --- | --- | --- | --- |
| High | welcome preview, looping | 3.35 / 5.58 ms | **1.05 / 2.10 ms** | 4.01 / 6.46 ms | **1.44 / 1.70 ms** |
| High | lab, four kickflips | 1.19 / 2.76 ms | 0.79 / 1.90 ms | 2.26 / 4.60 ms | 1.18 / 2.23 ms |
| Medium | welcome preview, looping | 2.55 / 5.32 ms | **0.72 / 1.77 ms** | 2.64 / 3.75 ms | **0.46 / 1.25 ms** |
| Medium | lab, four kickflips | 1.35 / 2.93 ms | 0.52 / 2.23 ms | 2.29 / 2.41 ms | 1.31 / 1.97 ms |

The two kinds of query are not identical (WebGPU times its passes, WebGL the whole frame), but the gap is two to three times, at both sizes and on both tiers. `gl.render` CPU time stayed 0.3 to 0.6 ms.

Loading (the first 3D frame, then every model on screen):

| Tier | Network | WebGL | WebGPU |
| --- | --- | --- | --- |
| High | full speed | 0.49 s, 1.08 s | 0.91 s, 1.08 s |
| High | 10 Mbps | 0.68 s, 1.93 s | 1.70 s, 2.17 s |
| High | 3 Mbps | 1.36 s, 4.71 s | 3.91 s, 5.07 s |
| Medium | full speed | 0.49 s, 0.85 s | 0.89 s, 1.06 s |
| Medium | 10 Mbps | 0.69 s, 1.63 s | 1.31 s, 1.60 s |
| Medium | 3 Mbps | 1.41 s, 3.42 s | 3.27 s, 3.84 s |
| Low | full speed | 0.45 to 0.51 s (three runs) | 0.45 and 0.65 s (two runs; WebGLRenderer as before) |
| Low | 3 Mbps | 1.36 to 1.44 s (three runs) | 1.40 and 1.42 s (two runs) |

The first 3D frame comes later on Medium and High: the node renderer chunk (170 KB gzipped) loads only once the 3D code has run, beside the models, and the device and pipelines take a moment to start. The time to every model on screen, which is when step 10's loading picture is to hand over to the live scene, moves by 0 to 0.42 s, about the chunk's bytes at the link's speed. Draw calls: High 28 and 29 (welcome, lab; were 27 and 28), Medium 14 and 15 (were 13 and 14), Low unchanged; the extra one is the node renderer's output pass. Frames after a landing: 0 on every tier. Textures on the GPU: High 18, Medium 12 (three more on the node renderer, its own lookup and output textures). No console errors on any tier; with the node renderer's chunk blocked, High drew on WebGLRenderer with every model.

The look: six poses of a kickflip on High from the detail camera (rest, rising, edge-on, inverted, the catch, landed), a regular-stance kickflip at 40 percent with legs and foot trails on, and Medium's projected footprints, each side by side on the two renderers: the same board, shoes, graphic, legs, trails and shadows, with no visible difference.

**Go.** The new renderer is two to three times cheaper on the GPU, looks the same, ran without an error on every tier, and starts later only by what the loading picture of step 10 covers (0.4 s more on the time to every model at 3 Mbps). Phase B goes on with it.

### Step 6: post-processing (ADR-51)

"Before" is step 5 (b4afb13: the WebGPURenderer, no effects) from the scratch worktree; "after" is the effects with the occlusion at half resolution on both tiers. GPU time per frame, medians then p95:

| Tier | View | 1440 x 900 before | After | 2560 x 1440 before | After |
| --- | --- | --- | --- | --- | --- |
| High | welcome preview, looping | 1.05 / 2.10 ms | 1.25 / 1.97 ms | 1.05 / 1.77 ms | 2.82 / 3.41 ms |
| High | lab, four kickflips (motion blur on) | 0.79 / 1.70 ms | 1.84 / 2.56 ms | 0.85 / 2.16 ms | 2.88 / 3.01 ms |
| Medium | welcome preview, looping | 0.79 / 1.57 ms | 1.44 / 1.57 ms | 0.46 / 1.18 ms | 2.62 / 3.15 ms |
| Medium | lab, four kickflips | 0.52 / 2.29 ms | 1.31 / 1.44 ms | 0.85 / 1.31 ms | 3.01 / 3.21 ms |

With the occlusion at full resolution on High, as first built, High took 2.62 and 2.95 ms at 1440 x 900 and 7.34 and 6.49 ms at 2560 x 1440; half resolution and 8-bit normals brought that to the numbers above. With every effect on, High still costs less GPU time than the WebGLRenderer did with none (3.35 ms on the looping preview at 1440 x 900, steps 4 and 5). `gl.render` CPU time, now the whole chain, 0.5 to 0.8 ms.

Draw calls: High 29 on the welcome screen and 30 in the lab (gate 40), Medium 15 and 16 (gate 20), Low 11 and 12 (unchanged, no effects); the occlusion pass and the composite replace the renderer's own output pass. Frames after a landing: 0 on every tier. Loading did not move beyond run-to-run spread: the node renderer chunk grew by 6.6 KB gzipped (176.4 KB), and the first 3D frame and every model on screen stayed within 0.1 s of step 5 at full speed, 10 and 3 Mbps; Low's first frame 0.46 s, 0.70 s and 1.42 s. Console: no errors on any tier.

Looked at in the browser: the occlusion drawn alone (contact where shoes meet the grip, round the trucks, under the deck and wheels; none in cast shadows), the six poses with and without the chain, half and full resolution occlusion side by side, and a kickflip and a 360 flip at normal speed (blurred along their motion) against the same 360 flip in slow motion (sharp).

### Step 7: the sky, the sun and Neutral tone mapping (ADR-52)

Same setup, gzip server, 1440 x 900. The dome is one draw call and about 2,000 triangles on every tier: High 30 on the welcome screen and 31 in the lab (were 29 and 30), Medium 16 and 17, Low 12 and 13. GPU time: High's welcome loop 1.84 ms (was 1.25: the lower preview camera now frames the far ground and the sky, which the occlusion and the glow cover too), the lab 1.90 ms (1.84); Medium 1.44 and 1.25 ms; Low's lab 0.69 ms. Frames after a landing 0 on every tier. Loading is unchanged within run-to-run spread (High every model at 3 Mbps 4.90 s, Medium 3.86 s, Low's first frame 1.44 s). A theme change builds the environment map again on every tier (checked in the browser), with no console errors.

The lit concrete, measured in the detail view's empty ground (mean of 200 x 120 px): light theme #737474 before the sky pass under ACES, #6e6f70 now under Neutral at exposure 1.3; dark theme's golden hour #6c5f53.

### Step 8: clearcoat and sheen on High (ADR-53)

High, against step 7 (6e462ee) in the same session, draw calls 30 and 31 both times. GPU time, medians then p95: welcome loop 1.38 / 2.29 to 1.25 / 1.57 ms at 1440 x 900 and 2.56 / 2.69 to 2.49 / 2.69 ms at 2560 x 1440; lab 1.11 / 2.03 to 1.11 / 2.42 ms and 2.82 / 3.15 to 2.82 / 2.95 ms. No change beyond noise.

### Step 9: Low, designed (ADR-54)

Low against step 8 (6edd17d), three runs each, the welcome screen's first lit frame with the loads at 4x CPU (`cpu=4`, CDP throttling: a rough Chromebook stand-in that does nothing to the GPU):

| | Before | After |
| --- | --- | --- |
| First lit frame, full speed | 0.87, 0.58, 0.59 s | 0.59, 0.52, 0.51 s |
| First lit frame, 3 Mbps | 1.50, 1.53, 1.53 s | 1.47, 1.50, 1.48 s |
| Draw calls in the lab | 13 | **10** (the board 2, was 5) |
| Triangles in the lab | 5,083 | 10,487 (the real deck mesh) |
| GPU per frame in the lab | 0.73 to 0.76 ms | 0.98 to 0.99 ms (MSAA and the deck) |
| Frames after a landing | 0 | 0 |
| Startup long tasks over 50 ms (4x CPU) | the PMREM, 188 ms | the first frame's compile, 70 to 98 ms |

The first version of this step kept the asynchronous warm-up without the environment map, and Low's lit scene came 0.5 s later at any CPU speed (the parallel compile, with nothing drawn, reported ready late); it now reveals at once. The measurement script's first-frame watcher also counts a frame drawn in the tick where the content first shows: on a demand loop with nothing else to draw it used to wait for a later frame and report the first frame late.

### Phase C review: fog by distance (ADR-55)

Against step 9 (6395a38) in the same session, two runs each, 1440 x 900, light, the lab, a kickflip:

| | Low | Medium | High |
| --- | --- | --- | --- |
| Draw calls | 10 and 10 | 17 and 17 | 31 and 31 |
| GPU per frame, median, before | 0.87, 0.99 ms | 1.25, 1.11 ms | 0.59, 0.59 ms |
| GPU per frame, median, after | 1.00, 0.99 ms | 1.05, 1.31 ms | 0.59, 0.59 ms |
| Frames after a landing | 0 | 0 | 0 |

No change beyond noise: a length per fragment in place of three's negation per vertex. At 2560 x 400 (a 5.5:1 welcome stage, 5.9:1 in the lab) the plane's edge no longer shows on any tier or theme.

### Step 10: the loading picture (ADR-56)

Against step 9 (6395a38) in the same session, the welcome screen, 1440 x 900, light, cache off, three runs each at 3 Mbps with 60 ms latency:

| | Low | Medium | High |
| --- | --- | --- | --- |
| Stage before the 3D view, step 9 | blank to the first lit frame | blank, then the stand-in board | blank, then the stand-in board |
| Loading picture on screen (now) | 0.77 s | 0.77 s | 0.77 to 1.06 s |
| First lit frame, step 9 | 1.39 to 1.42 s | 3.43 to 3.48 s | 4.04 to 4.07 s |
| First lit frame, now | 1.47 to 1.48 s | 3.50 to 3.52 s | 4.12 to 4.20 s |
| All models on screen, step 9 | none | 3.85 to 3.91 s | 5.08 to 5.10 s |
| All models on screen, now | none | 3.95 to 3.97 s | 5.16 to 5.21 s |
| The picture lifts (now) | 1.49 s | 3.96 s | 5.48 s |

The picture is 26 KB (27 KB on the wire with headers) and shares the link with the 3D code: the scene comes 50 to 90 ms later at 3 Mbps, about the picture's own transfer time; at full speed the difference is within noise. It lifts 20 to 50 ms after the tier's scene is complete. The `measure.js` table now has a "Loading picture" and a "Picture lifts" column. Draw calls (High 30 and 31, Medium 16 and 17, Low 9 and 10), triangles and frame times are unchanged: the picture is DOM. Frames after a landing: 0 on every tier.

Checked in the browser: the stage shows the picture at 0.7 and 1.6 s on High at 3 Mbps (where step 9 showed a blank stage); popping in the lab before the models arrive lifts it at once; under reduced motion it goes with no fade; blocking `ground.glb` lifts it on High with the plain ground (1.8 s), blocking `board-high.glb` or `shoes.glb` lifts it on Low (1.5 s).

### Steps 11 and 12: skate style and sound (ADR-57, ADR-58)

No change to the scene: draw calls, triangles and frame times as at step 10 (the celebration and the letters are DOM; sound is Web Audio). What they add to a load:

| | Bytes | When |
| --- | --- | --- |
| Display face, Bungee Latin woff2 | 14.3 KB (already compressed) | with the first paint's CSS; text shows in Arial Black until it arrives (`font-display: swap`) |
| Skate style CSS | about 1 KB gzipped (CSS 35.2 KB, 6.9 KB gzipped) | with the page |
| Celebration and letters JS | under 1 KB gzipped (main bundle 311.1 KB, 98.8 KB gzipped, was 309.3 and 98.2 at step 10) | with the page |
| Sound (recipes, player, hook) | 3.3 KB, 1.5 KB gzipped (main bundle 314.4 KB, 100.3 KB gzipped) | with the page; no audio context and no nodes until sound is on and something happens |

Checked in the browser: the font loads from the app's own path; the celebration plays on a landed kickflip in both themes and on a 390 px phone stage (it scales with the stage, so the board stays in view); a new SKATE letter stamps in once; with sound off nothing is started; turning it on starts the audio context inside the click; at 0.25x the landing's sound came 2.17 s after the pop, as the board landed.

### Step 13: the automatic step-down (ADR-59)

The rule: on the device's own tier, the first 3 samples, each the frames of playing flights covering at least 250 ms (in 2 intervals or more; one trick, or several short ones pooled), are judged by their median frame interval (the first frame after a pop, a resume, any playback change or a hidden tab left out, and single stalls over a second); 2 of them over 40 ms (under 25 frames a second) drop the tier one step, said in the landing's announcement and saved as `trick-lab.quality-step` for later visits. The cost while a flight plays is one store read and one array write per frame in PerfProbe (no allocation), and one median per landing, outside the frame loop.

Checked in the browser (RTX 3060, High by the device's pick): smooth tricks kept High. With 45 ms of main-thread work forced into every animation frame, and after the Phase D review with 65 ms (about 15 frames a second, which the first rule's 12-frame minimum missed), the third trick stepped the scene to Medium with the announcement, and the next visit started on Medium (`board.glb`, View showing Medium). CPU throttling at 20x alone did not trigger it, rightly: about 0.6 ms of CPU per frame becomes about 12 ms, still smooth. The measurement script always sets a tier, so it never steps down.

### Step 14: everything, before and after

Before is 87ccd92 (the `skate-game` head the plan started from, measured 2026-11-08 in the baseline above), after is 2d396d4 (all of Phases A to D with their reviews). The same script (`scripts/measure/measure.js`), the same machine (RTX 3060, Chromium), the same session for both, 1440 x 900, cache off, each build served by `serve.ts` with gzip like GitHub Pages. Eight runs: each build in both themes with the feet on and off, every tier, the welcome screen, the lab and the game. Each build at its own defaults: the legs were on by default before (ADR-37) and are off after (ADR-48). The numbers below are copied from the script's output (its JSON was not committed).

**Loading** (dark theme, feet on; full speed is the range over both themes):

| Tier | Network | Picture (after) | First 3D frame, before | after | All models on screen, before | after | Picture lifts |
| --- | --- | --- | --- | --- | --- | --- | --- |
| High | full speed | 0.07 to 0.24 s | 0.47 to 0.48 s | 1.04 to 1.19 s | 0.75 s | **1.04 to 1.19 s** | 1.10 to 1.24 s |
| High | 10 Mbps | 0.42 s | 0.67 s | 1.73 s | 2.93 s | **1.75 s** | 1.91 s |
| High | 3 Mbps | 1.00 s | 1.37 s | 4.34 s | 8.63 s | **5.06 s** | 5.09 s |
| Medium | full speed | 0.05 s | 0.47 to 0.50 s | 0.99 s | 0.73 s | **0.99 s** | 1.02 s |
| Medium | 10 Mbps | 0.44 s | 0.69 s | 1.57 s | 1.45 s | **1.57 s** | 1.60 s |
| Medium | 3 Mbps | 0.81 s | 1.39 s | 3.52 s | 3.38 s | **3.97 s** | 3.98 s |
| Low | full speed | 0.05 s | 0.46 to 0.47 s | 0.45 s | none | none | 0.52 s |
| Low | 10 Mbps | 0.42 s | 0.69 s | 0.71 s | none | none | 0.73 s |
| Low | 3 Mbps | 0.80 s | 1.40 s | 1.50 s | none | none | 1.53 s |

| Downloads | Before | After |
| --- | --- | --- |
| JavaScript, High and Medium | 375 KB | 595 KB (the WebGPURenderer and the effects, ADR-50 and ADR-51) |
| JavaScript, Low | 352 KB | 362 KB |
| Models, High (feet on / off) | 2,585 / 2,106 KB | **755 / 588 KB** (KTX2, ADR-49) |
| Models, Medium | 661 KB | **273 KB** |
| KTX2 transcoder (`basis_transcoder.wasm`), High and Medium | none | 242 KB (its 15 KB JavaScript loader is in the JavaScript row) |
| Loading picture | none | 26 KB |
| Display face | none | 14 KB |
| **Everything on a first visit** (dark, feet on), High / Medium / Low | 2,967 / 1,042 / 360 KB | **1,639** / 1,158 / 410 KB |
| GPU texture memory, estimate (`assets:check`), High / Medium | 33.5 / 14.7 MB | **8.4 / 3.7 MB** |

A first visit to High downloads 45 percent less; Medium downloads 116 KB more (the transcoder and the WebGPU code outweigh its 388 KB of smaller models; every later visit has them cached), and Low 50 KB more (the picture, the face and 10 KB of JavaScript).

**Drawing** (the most draw calls seen over half a second; the lab's GPU time is the median over four tricks, the welcome screen's over its looping preview; GPU time is WebGL timer queries before, WebGPU timestamps after, and after includes the post-processing):

| Tier | Feet | Draw calls home / lab, before | after | Triangles in the lab, before | after | GPU per frame in the lab, before | after | Welcome loop GPU, before | after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| High | on | 30 / 31 | 30 / 31 | 164,307 | 163,961 | 2.78 to 3.71 ms | **0.92 to 1.84 ms** | 3.73 to 3.80 ms | **1.11 to 1.18 ms** |
| High | off | 15 / 16 | 18 / 19 | 95,079 | 97,101 | 2.53 to 2.71 ms | 1.64 to 1.70 ms | 2.83 to 3.03 ms | 1.18 to 1.44 ms |
| Medium | on | 15 / 16 | 16 / 17 | 18,547 | 18,969 | 1.36 to 1.37 ms | 1.38 to 1.51 ms | 2.49 to 2.53 ms | 1.31 to 1.77 ms |
| Medium | off | 9 / 10 | 12 / 13 | 14,615 | 16,637 | 1.21 ms | 0.39 to 1.25 ms | 1.50 to 1.53 ms | 1.51 to 1.64 ms |
| Low | on | 13 / 14 | **9 / 10** | 4,663 | 10,487 | 0.90 ms | 0.96 to 1.00 ms | still | still |
| Low | off | 7 / 8 | **5 / 6** | 731 | 8,155 | 0.69 to 0.70 ms | 0.91 ms | still | still |

Every tier is inside its gate (Low and Medium under 20, High under 40), the game screen draws the same as the welcome screen, gl.render's CPU time stays 0.2 to 0.8 ms, and every tier draws **0 frames** in the 1.5 s after a landing, before and after.

**What it adds up to, against the plan's expectations.** High downloads 755 KB of models instead of 2.6 MB (expected about 1 MB) and keeps 8.4 MB of textures on the GPU instead of 33.5 (expected about 10). The stage shows the stand-in board or a blank 3D view on no connection, with two limits. The loading picture arrives 0.05 to 1.0 s into the load, with the page's own first paint: about 0.3 s after it at 3 Mbps (0.1 to 0.15 s at 10 Mbps, none at full speed), so for that moment the stage is its plain background colour. And a trick popped before the models are in lifts the picture so the trick can be seen, on the stand-in board if need be (ADR-56). The picture lifts 11 to 153 ms after the tier's scene is complete (the 153 ms on High at 10 Mbps; 11 to 75 ms everywhere else). With the feet on, High draws in a third to a half of the GPU time with occlusion, motion blur, glow and the grade added (with them off, in about two thirds). Idle frames and the draw-call gates hold.

**The cost.** The WebGPURenderer and its effects are 220 KB more JavaScript, which Medium and High load and start before their first 3D frame, and their textures need the 242 KB transcoder (step 3). So on those tiers the 3D scene itself comes later: at full speed the complete scene is about 0.3 s later than before (1.0 to 1.2 s, was 0.73 to 0.75 s), and on Medium at 3 Mbps 0.6 s later (3.97 s, was 3.38). The loading picture covers that time; on High at 10 and 3 Mbps the complete scene still comes much sooner than before, since its models are a third of the size. Low, which never loads the WebGPU chunk, is unchanged within 0.1 s.
