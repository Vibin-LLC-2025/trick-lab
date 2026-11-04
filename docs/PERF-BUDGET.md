# Performance budget

Target device: a low-end Chromebook (integrated GPU, 4 GB RAM, often throttled). Written 2026-11-04; re-measured 2026-11-04 after the realistic board pass.

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

- `frameloop="demand"` except while `status === 'playing'`, when it is `"always"`. Landing calls `land()`, which flips the loop back to demand. Idle, paused and done cost zero frames; scrubbing and orbiting render one frame per change. The environment map and the GLB arriving each request one frame.
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
