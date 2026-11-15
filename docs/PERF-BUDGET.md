# Performance budget

Target device (quality pass, 2026-11-04, ADR-16): a desktop with a real GPU on High; a mid-range laptop on Medium; a low-end Chromebook (integrated GPU, 4 GB RAM, often throttled) on Low, which keeps the original budget below unchanged. Written 2026-11-04; re-measured 2026-11-04 after the realistic board pass and again after the quality pass (last section).

## Targets (2026-11-09, ADR-62)

The design target is good hardware. High is what the game is designed for, Medium is for built-in graphics, and Low is a frozen fallback. The question is whether it stays smooth, measured as time per frame on the reference machine (the owner's desktop, an RTX 3060, Chromium, 1440 x 900, the build served by `scripts/measure/serve.ts`). These replace the "under 20 draw calls" budget below for High and Medium; Low keeps it.

| | High (the design target) | Medium | Low (frozen) |
| --- | --- | --- | --- |
| Who it is for | A desktop or laptop with a real graphics chip | A laptop with built-in graphics | Old or weak machines |
| Graphics time per frame, in a trick and while rolling | under 4 ms | under 3 ms | under 2 ms |
| The app's own work per frame | under 4 ms | under 4 ms | under 4 ms |
| Longest single frame, after the first second on screen | 16.7 ms | 16.7 ms | 16.7 ms |
| Draw calls, every switch on | under 60 | under 40 | under 20 |
| New features | all | all but real shadows, motion blur and glow | none, except rolling |

- **Read by the measurement** (`scripts/measure/measure.js`, "How to measure" below): the 95th percentile of the graphics time and of the app's work over the lab's timed tricks, and the longest interval between frames (gate: under 20 ms, which is 16.7 ms plus timer jitter). Its last table says pass or fail per tier.
- **Enforced by the browser checks** (`npm run test:browser`): the draw-call caps, and the expected worst case with every switch on (High 38, Medium 23, Low 12 since ADR-102's steel for the skate spot, one draw on High and Medium; 37 and 22 since ADR-99's occlusion denoise; 36 and 21 since step 14's skate spot, ADR-69, measured on the game screen too, through the landing: step 19's dust, ADR-74, is one draw on High and Medium while a game's landing has dust in the air, and it did not move these numbers, because the motion cues' one draw has faded out by the landing).
- **Downloads keep their budget** (`npm run bundle:check`).
- **Medium's target is a stand-in:** it is measured on the reference machine with Medium chosen, not on built-in graphics.

The sections below are the history: the original Chromebook budget and every measurement since.

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

**From 2026-11-09 (PLAN-PLAY-POLISH-REACH step 1)** the script also:
- makes each load one of three visits: **cold** (a fresh browser context, cache off), **http** (the same context, its HTTP cache filled at full speed, then loaded on the network) and **sw** (the same context once a build's service worker is active; a build without `sw.js` reports it unavailable). The cold and http loads carry `?nosw`;
- loads each tier once, unmeasured, first (`warm=on`, the default): the GPU process keeps compiled shaders across contexts, so a run's first High load is 0.4 to 0.7 s slower than every later one. `warm=off` shows a browser's very first load;
- classifies requests by pathname, so `?v=` versions and hashed names still count, and lists every request with its bytes;
- counts every switch combination's draw calls (`switches=all`, the default): on the welcome screen feet and legs, in the lab over a 360 flip feet, legs, foot trails and motion cues. The most seen per tier is the draw-call ledger's number;
- reads landings from the store (`window.__trickLabStore` under `?debug`), not the frameloop: the endpoint is the frame that draws the landing; counted are the frames from it to the point where R3F reports no pending frame (at most the one the landing's write queued) and the frames after that point over 1.5 s (must be 0);
- measures a Canvas once it is ready: `__trickLabPerf.root` numbers each Canvas mount and `__trickLabPerf.ready` says when that root's startup is finished (`src/scene/rootReadiness.ts`: revealed, its effects made, every model on screen, `stageReady` published);
- reports the Chromium-only probes (throttling, CPU slowdown, the cache switch) as unavailable in other browsers. GPU time is reported only where the browser exposes a timer.

**From 2026-11-09 (step 6, ADR-62)** it reports the spread, not only the middle: for the render CPU time, the GPU time, the frame's whole work (`perfStats.workMs`, from R3F's before-effect to the end of the draw) and the interval between frames, the median, the 95th percentile and the longest. A last table checks each tier against the targets above (`targets` and `pass` in the JSON).

**From 2026-11-10 (step 20, ADR-75)** it plays a whole game of SKATE on the game screen (`game=on`, the default; `gos=60` caps it): every go a real Space press, the student's sets landing and bailing in turn and every copy bailing, so the game ends. The first go of the visit and the rest of the game are reported apart, with the count of frame intervals over 20 and 34 ms, and the targets table has a row per tier for the game after its first go.

**From 2026-11-13 (the review's P-06, A11)** it also takes `dpr` (the page's device pixel ratio; the app caps it per tier, so `dpr=1.5` measures High and `dpr=1.25` Medium at their caps; every earlier table here ran at DPR 1) and `backend` (`webgpu`, or `webgl2`, which hides `navigator.gpu` so Medium and High run on the WebGPURenderer's WebGL2 backend). Each screen's row names the renderer and the stage's size in CSS and drawn pixels. It waits for the rider's mesh (`Rider_Body`) where the rider shows. The draw-call verdict counts the most any screen and the whole game drew, not only the lab's switches. The game's first go is shown in the targets' table, not gated.

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

## Play, polish and reach plan (2026-11-09)

The plan is `docs/PLAN-PLAY-POLISH-REACH.md`. Its baseline is a0a2c86, the end of the look, feel and performance plan.

### Step 1: the measurement, upgraded

The new script (above) on a0a2c86's build, 2026-11-09, dark theme, feet on, warmed up, served by `serve.ts`. The cold loads reproduce the step 14 tables within run-to-run noise (0.1 s): High 1.04 / 1.79 / 4.93 s at full speed, 10 and 3 Mbps (step 14: 1.04 to 1.19 / 1.75 / 5.06), Medium 1.02 / 1.67 / 4.04 (0.99 / 1.57 / 3.97), Low 0.45 / 0.75 / 1.53 (0.45 / 0.71 / 1.50); the same bytes (JavaScript 595 / 594 / 362 KB, models 755 / 273 / 0 KB) and the same draw calls and triangles. GPU times came out lower than step 14's (High 0.66 ms, Medium 0.46 ms in the lab), and so did a0a2c86's own script run in the same session (0.92 and 0.72 ms): the GPU's state, not the build. A visit from the HTTP cache downloads nothing and shows the complete scene in 0.97 to 1.06 s at any speed on Medium and High (0.40 s on Low).

Draw calls in the lab during a 360 flip, every switch combination (motion cues are on by default, so "defaults" is feet and cues):

| Tier | Feet off | Defaults | + foot trails | + legs | Everything on | Gate |
| --- | --- | --- | --- | --- | --- | --- |
| High | 18 to 20 | 31 | 32 | 34 | **35** | under 40 |
| Medium | 12 to 14 | 17 | 18 | 19 | **20** | under 20: broken |
| Low | 5 to 7 | 10 | 11 | 12 | **13** | under 20 |

The welcome screen draws at most 33 / 18 / 11 (feet and legs on). Landings: 0 frames after the idle point on every tier. a0a2c86's build has no store under `?debug`, so its frames to the idle point are not counted; on this step's build they are 1, the frame the landing's write queues.

### Step 2: the legs in one draw (ADR-60)

The same switch run on this step's build: the legs cost one draw call instead of two on every tier.

| Tier | Defaults | + foot trails | + legs | Everything on | Gate |
| --- | --- | --- | --- | --- | --- |
| High | 31 | 32 | 33 | **34** | under 40 |
| Medium | 17 | 18 | 18 | **19** | under 20: kept again |
| Low | 10 | 11 | 11 | **12** | under 20 |

The welcome screen draws at most 32 / 17 / 10 with feet and legs on.

### Step 3: a download budget in `npm run verify`

`npm run verify` now ends with `vite build` (with `build.manifest`) and `npm run bundle:check` (`scripts/check-bundle.ts`). The check lists every first visit explicitly (`scripts/lib/bundleBudget.ts`): for each tier, theme and feet setting, the page, the entry chunk with its static imports, its stylesheet and the display face, the tier's lazy chunks (the 3D chunk; on Medium and High the WebGPURenderer's and the model chunks; on High with the feet on the shoe chunk) with their imports from the build's manifest, and the public files fetched at run time (the tier's models from `modelFiles.ts`, the theme's loading picture, the transcoder on Medium and High). Shared files count once. Each file is measured compressed the way GitHub Pages sends it (`serve.ts`'s rule). It fails, naming the file or the visit, when a file is over its budget, a file has no budget, or a visit is over its tier's limit; it prints what the build emits that no visit downloads (today the spare transcoder, step 4).

The budgets are step 14's sizes plus about 5 percent: per file (for example `models/board-high.glb` 470 KB, `nodeRenderer` 185 KB) and per visit (High 1,721 KB, Medium 1,216 KB, Low 431 KB, from 1,639, 1,158 and 410). On this step's build the visits are High 1,636 KB (feet on, dark) and 1,468 KB (feet off), Medium 1,154 KB, Low 408 KB. The listed inventory equals the requests step 1's cold run recorded on every tier (16, 14 and 7 files besides the page). `bundleBudget.test.ts` checks the inventory of each tier, and that a file of random bytes (gzip makes it larger) over its budget fails the check by name.

*Loosened 2026-11-10 (ADR-79):* the main script from 106 to 160 KB, its stylesheet from 8 to 16 KB, and the visits to High 1,900, Medium 1,350 and Low 500 KB, so the game's interface can grow. On that day's build, before any new interface, the main script was 104.8 KB and the stylesheet 7.5 KB.

### Step 4: one transcoder (ADR-49, updated)

The KTX2 loader now fetches the transcoder Vite emits from three's own files instead of a second copy in `public/basis/`. `dist/` went from 4,527,311 to 3,942,373 bytes (584,938 smaller). A build with `--base=/trick-lab/` loads every texture compressed on High and Medium, with one transcoder download of the same size (15,469 and 247,919 bytes transferred); `npm run bundle:check` lists it from the manifest and finds nothing built that no visit downloads.

### Step 5: browser checks, the long-run test and a leak (ADR-61)

`npm run test:browser` (Playwright, Chromium with SwiftShader, no GPU, the build served by `serve.ts`): 16 checks in about 4.5 minutes on this desktop, 2026-11-09. Every screen starts on every tier with no console error; every switch combination stays inside the tier's cap (High 34, Medium 19, Low 12 with everything on); a landing draws at most the one frame its own write queued, then none in 1.5 s.

The long-run test: 5 warm-up tricks on High, then 50 in blocks of ten on High, Low, High, Low, High. A sample is taken after the warm-up and at the end of each block, one second and two frames after the last landing and after two garbage collections.

| | Geometries | Textures |
| --- | --- | --- |
| High, all four samples | 19 | 24 |
| Low, both samples | 8 | 2 |

Those counts are the hard check: at a tier they must equal its first sample. The heap, first High sample to last:

| Build | Total heap (`Runtime.getHeapUsage`) | Without compiled code (heap snapshot) |
| --- | --- | --- |
| before the leak fix (c297ea4) | 2.44 MB | 530 KB |
| with the fix (9b7c140), four runs | 2.07 to 2.13 MB | 255 to 260 KB |

- **The leak.** Shared materials were freed only when the whole scene went away, so each tier change kept the last renderer's programs alive through the dispose listeners it had put on them. With the fix the growth without compiled code halved; what is left is mostly the event log, which keeps every trick by design (ADR-7).
- **About 1 MB of the total is V8's compiled code** warming up over four tier changes (a heap snapshot diff by node type), not a leak.
- **The limit on the total is 4 MB**, about twice the measurement, for slower and noisier CI machines. It is loose on purpose: the two builds above differ by 0.3 MB of total heap, less than run-to-run noise would be on another machine, so the heap check catches only a large leak, and the counts catch a leaked model, map or shared resource exactly. The run prints its growth, so a CI log shows how close to the limit it came.

### Step 6: the new targets (ADR-62)

The measurement on this step's build, 2026-11-09 (Chromium through `playwright-cli`, 1440 x 900, RTX 3060, feet on, dark theme, cold visits at full speed, four timed kickflips per tier). The browser draws at 120 frames a second here, so a frame interval is 8.3 ms.

| Tier | Screen | Draw calls | Render CPU, median / p95 / longest | GPU, median / p95 / longest | Frame work, median / p95 / longest | Frame interval, median / p95 / longest | Landing: frames to idle / after idle |
| --- | --- | --- | --- | --- | --- | --- | --- |
| high | home (the preview) | 30 | 0.6 / 1.3 / 4 ms | 0.66 / 1.7 / 2.1 ms | 0.6 / 1.4 / 4.4 ms | 8.3 / 8.4 / 8.5 ms | |
| high | lab | 31 | 0.6 / 1.4 / 2.8 ms | 0.79 / 1.05 / 1.57 ms | 0.7 / 1.4 / 3.4 ms | 8.3 / 8.4 / 16.6 ms | 1 / 0 |
| medium | home (the preview) | 16 | 0.5 / 1.3 / 2.4 ms | 0.52 / 0.66 / 0.66 ms | 0.6 / 1.4 / 2.5 ms | 8.3 / 8.4 / 8.5 ms | |
| medium | lab | 17 | 0.4 / 0.8 / 1.4 ms | 0.59 / 0.66 / 1.77 ms | 0.5 / 1 / 1.6 ms | 8.3 / 8.4 / 8.6 ms | 1 / 0 |
| low | lab | 10 | 0.2 / 0.4 / 0.9 ms | 0.18 / 0.2 / 3.25 ms | 0.3 / 0.7 / 1.8 ms | 8.3 / 8.4 / 8.5 ms | 1 / 0 |

The targets table the script prints:

| Tier | Graphics time per frame, p95 | The app's own work per frame, p95 | Longest frame interval | Draw calls, every switch on | Targets |
| --- | --- | --- | --- | --- | --- |
| high | 1.05 ms of under 4 ms: pass | 1.4 ms of under 4 ms: pass | 16.6 ms of under 20 ms: pass | 34 of under 60: pass | pass |
| medium | 0.66 ms of under 3 ms: pass | 1 ms of under 4 ms: pass | 8.6 ms of under 20 ms: pass | 19 of under 40: pass | pass |
| low | 0.2 ms of under 2 ms: pass | 0.7 ms of under 4 ms: pass | 8.5 ms of under 20 ms: pass | 12 of under 20: pass | pass |

- **One frame on High took two refreshes** (16.6 ms) in four tricks: inside the target. Nothing took three.
- **The app's own work is nearly all the render call:** the work is 0.1 ms above the render CPU time, which is FlightDriver's pose.
- **Loading is unchanged:** the complete scene at 1.07 s on High, 1.02 s on Medium, 0.45 s on Low, cold at full speed.

### Step 20: the smoothness pass (ADR-75)

Rolling means frames run for a whole go, not half a second, so the measurement now plays a whole game of SKATE on each tier (`game=on`, the default; "How to measure" and the script's header say how). Measured 2026-11-10 on step 20's build: Chromium through `playwright-cli`, 1440 x 900, RTX 3060, feet on, dark theme, cold visits at full speed. The browser drew at 100 frames a second on this day, so a frame interval is 10 ms and one missed refresh reads 20 ms (step 6's run was at 120: 8.3 and 16.7 ms).

**Loading** is where it was (the target: the full scene in about 1.0 to 1.2 s at full speed), with the skate spot, the decks and the dust in the build:

| Tier | UI (FCP) | Loading picture | First 3D frame | All models on screen | Picture lifts |
| --- | --- | --- | --- | --- | --- |
| high | 0.11 s | 0.07 s | 1.15 s | 1.15 s | 1.22 s |
| medium | 0.10 s | 0.06 s | 1.08 s | 1.08 s | 1.12 s |
| low | 0.10 s | 0.07 s | 0.46 s | none | 0.49 s |

**A whole game**, every go a real Space press, played to its end:

| Tier | Part of the game | Frames | Render CPU, median / p95 / longest | GPU, median / p95 / longest | Frame work, median / p95 / longest | Frame interval, median / p95 / longest | Intervals over 20 ms / over 34 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| high | the first go | 335 | 0.8 / 2.2 / 6.1 ms | 1.18 / 2.23 / 4.39 ms | 1 / 2.3 / 6.3 ms | 10 / 10.1 / 10.2 ms | 0 / 0 |
| high | the rest: 32 goes (14 clean, 4 sketchy, 14 bails, 4 replays), played to the end | 5566 | 0.7 / 1.7 / 4.6 ms | 0.98 / 1.9 / 2.82 ms | 0.8 / 1.9 / 4.8 ms | 10 / 10.1 / 20.1 ms | 1 / 0 |
| medium | the first go | 166 | 0.7 / 2.1 / 3.3 ms | 0.79 / 2.56 / 3.87 ms | 0.8 / 2.7 / 4.4 ms | 10 / 10.1 / 10.5 ms | 0 / 0 |
| medium | the rest: 19 goes (8 clean, 1 sketchy, 10 bails, 2 replays), played to the end | 3261 | 0.6 / 1.5 / 3.8 ms | 0.79 / 0.85 / 2.16 ms | 0.7 / 1.7 / 4.3 ms | 10 / 10.1 / 11.2 ms | 0 / 0 |
| low | the first go | 337 | 0.2 / 0.6 / 1.3 ms | 0.13 / 0.16 / 2.63 ms | 0.4 / 0.9 / 3.9 ms | 10 / 10.1 / 10.3 ms | 0 / 0 |
| low | the rest: 14 goes (6 clean, 1 sketchy, 7 bails, 1 replays), played to the end | 2098 | 0.2 / 0.4 / 1.7 ms | 0.14 / 0.15 / 1.88 ms | 0.3 / 0.6 / 2.2 ms | 10 / 10.1 / 10.5 ms | 0 / 0 |

The targets table the script prints (the game's rows are new):

| Tier | Over | Graphics time per frame, p95 | The app's own work per frame, p95 | Longest frame interval | Draw calls, every switch on | Targets |
| --- | --- | --- | --- | --- | --- | --- |
| high | the lab's tricks | 0.66 ms of under 4 ms: pass | 1.5 ms of under 4 ms: pass | 20 ms of under 20 ms: FAIL | 34 of under 60: pass | FAIL |
| high | a whole game, after its first go | 1.9 ms of under 4 ms: pass | 1.9 ms of under 4 ms: pass | 20.1 ms of under 20 ms: FAIL | | FAIL |
| medium | the lab's tricks | 0.59 ms of under 3 ms: pass | 2 ms of under 4 ms: pass | 10.2 ms of under 20 ms: pass | 19 of under 40: pass | pass |
| medium | a whole game, after its first go | 0.85 ms of under 3 ms: pass | 1.7 ms of under 4 ms: pass | 11.2 ms of under 20 ms: pass | | pass |
| low | the lab's tricks | 0.1 ms of under 2 ms: pass | 1.5 ms of under 4 ms: pass | 10.2 ms of under 20 ms: pass | 12 of under 20: pass | pass |
| low | a whole game, after its first go | 0.15 ms of under 2 ms: pass | 0.6 ms of under 4 ms: pass | 10.5 ms of under 20 ms: pass | | pass |

What it says:

- **The graphics and the app's own work are well inside the targets through a whole game** on every tier: on High the graphics card's time is 1.9 ms of 4 at the 95th percentile and the app's work 1.9 ms of 4. A game costs the graphics card about 1 ms a frame more than the lab's tricks on High (the skate spot and its shadows).
- **Medium and Low missed no refresh in a whole game.**
- **High misses about one refresh in a game, and the "longest frame" target is not met there.** Over four more High runs (12 lab tricks and a whole game each): a game's longest interval was 20.1, 19.9, 30 and 20.1 ms, one frame in 2,900 to 5,600 each time, and the lab's 12 tricks had one frame of 20 ms in each run. The target is no frame longer than 16.7 ms, and a single missed refresh at 100 Hz is 20 ms, so by the letter this fails; on step 6's 120 Hz run the same single missed refresh read 16.6 ms and passed. The gate was not moved.
  - **It is not the graphics.** The longest GPU time in a game was 2.8 ms and the longest frame of the app's own work 6.1 ms, both inside one 10 ms refresh. A probe that logged every late frame with what the store had just done found the late frame once, 40 ms after the turn changed (the page redrawing its turn card while the board rolled), and in two other whole games (4,076 and 2,610 frames) found none.
  - **No fix was made for it:** nothing in the scene causes it, and it is one frame in thousands. If it matters, the next thing to try is making the turn card's update cheaper (it is the page's own layout, outside the 3D view).
- **The first trick of a visit.** In a browser started fresh for each run (five runs), the first go on High had one late frame of 20 to 30 ms just after the first pop and one about 50 ms after the first landing, when the student went first; none when the computer went first. Both come as the page draws its cards and the landing's sticker for the first time, not from the graphics card: every effect the first pop turns on is a number set on a program that already exists (the motion blur, the replay's bend).
  - **The one program that was new at the first landing is the dust's** (step 19). It is now built before the first pop: the mesh is drawn once, empty, when the game screen opens. The late frame after the landing went from 20 to 30 ms (two of five runs at 30) to 20 ms in each of four runs; the one after the pop is the page's and stayed.
  - Later goes of the same visit have neither.
- **The long-run test now plays games.** Half of every block of ten is five goes of a game on the game screen (the roll, the landings' motion, the dust, the skate spot, the computer's deck, replays), then back to the lab for the sample. The counts stayed flat: 23 geometries and 28 textures on High at every sample, 8 and 2 on Low; the heap grew 1,963 KB (limit 4,096), 271 KB without compiled code. It takes about 6 minutes here (it was about 3).
- **Not done here:** a game on a laptop with built-in graphics on Medium. That is the owner's, from the checklist at the end of the plan.

### Step 22: Browsers (Firefox and Safari, ADR-77)

A quick pass by hand, 2026-11-10, on step 21's build served like GitHub Pages, through `playwright-cli` with its own Firefox 156.0 and WebKit 26.6 (the engine Safari uses, in Playwright's build for Windows), installed on this machine for the pass. 1280 x 800, each quality level: the lab (load, preset 1, Space, the landing), the Sound switch, then the game (Start game, one go, everything at rest).

| | Chromium (the browser checks) | Firefox 156 | WebKit 26.6 (Playwright's Windows build) |
| --- | --- | --- | --- |
| The 3D view starts, High / Medium / Low | yes / yes / yes | yes / yes / yes | yes / yes / yes |
| Renderer on High and Medium | WebGPU (WebGL2 in the checks, which hide it) | WebGPU's WebGL2 fallback: this Firefox has `navigator.gpu` but blocks it ("disabled by blocklist") | WebGPU's WebGL2 fallback: no `navigator.gpu` |
| Textures load (KTX2), models on screen | yes | yes: 25 textures on High, 18 on Medium, every model | yes: the same counts |
| Draw calls, lab at rest, High / Medium / Low | 33 / 18 / 10 | 33 / 18 / 10 | 33 / 18 / 10 |
| The keyboard pops and the trick lands | yes | yes | yes |
| A go in the game, to rest (roll, landing, replay) | yes | yes | yes |
| Sound: the recordings (MP3) decode | yes | yes: all 11 | not checkable: this build has no Web Audio at all (`AudioContext` is undefined). The app stays silent, with no error |
| The layout holds, no sideways scroll | yes | yes | yes |
| Console errors on a clean load | none | none | none |

- **Firefox: nothing to fix.** It looks like Chromium's picture on every level. Errors seen in one run ("Couldn't load texture blob") came from the pass's own script leaving a page while it was still loading; a clean load has none.
- **WebKit: one thing that could not be settled here.** On a first load every level draws correctly. After the canvas changes size (going from the lab to the game inside the page, or resizing the window), this build shows the stage's background colour where the picture should be. The app is still drawing: reading the canvas's own pixels straight after a draw gives the full picture, the canvas is visible and on top, the context is not lost, and nothing is logged. More frames, hiding and showing the canvas, and resizing again do not bring it back. That points at this Windows build's compositor, not at the app (every WebGL app resizes its canvas), but it is not proof for Safari on a Mac or an iPhone. **Real Safari is the owner's check**, with sound, from the list in the plan.
- **No code changed in this step.**

### Step 23: everything, before and after

The plan's baseline (a0a2c86) and its last build (step 22's), measured the same day with the same script: 2026-11-10, Chromium through `playwright-cli`, 1440 x 900, RTX 3060, feet on, cold visits, both builds served by `serve.ts`, the baseline built in a worktree. The display ran at 100 Hz, so a frame interval is 10 ms and one missed refresh reads 20 ms. The baseline cannot play the measurement's game (it has no store under `?debug`), so the game's rows are the new build's only. Both themes were measured; they agree within run-to-run noise, so one row gives both as dark / light.

**Loading**, the frame where every model is on screen (Low: the first 3D frame):

| Tier | Network | Before | After |
| --- | --- | --- | --- |
| high | full speed | 1.05 / 1.39 s | 1.08 / 1.06 s |
| high | 10 Mbps | 1.82 / 1.80 s | 1.83 / 1.79 s |
| high | 3 Mbps | 5.24 / 5.22 s | 5.25 / 5.29 s |
| medium | full speed | 1.03 / 1.05 s | 1.25 / 1.04 s |
| medium | 10 Mbps | 1.67 / 1.64 s | 1.62 / 1.59 s |
| medium | 3 Mbps | 4.03 / 3.77 s | 4.10 / 4.09 s |
| low | full speed | 0.46 / 0.47 s | 0.46 / 0.45 s |
| low | 10 Mbps | 0.74 / 0.74 s | 0.77 / 0.76 s |
| low | 3 Mbps | 1.55 / 1.55 s | 1.58 / 1.57 s |

**Bytes of a first visit** (the welcome screen, as sent):

| Tier | JavaScript, before | after | Models, before | after |
| --- | --- | --- | --- | --- |
| high | 594.6 KB | 608.1 KB | 754.6 KB | 754.9 KB |
| medium | 593.8 KB | 607.2 KB | 273.5 KB | 274.0 KB |
| low | 361.9 KB | 374.2 KB | 0 KB | 0 KB |

**Draw calls and triangles:**

| Tier | Welcome, before | after | Lab, before | after | Game at rest, before | after | Every switch on (lab), before | after | Triangles (lab), before | after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| high | 30 | 32 | 31 | 33 | 31 | 35 | 35 | 34 | 163,961 | 168,441 |
| medium | 16 | 17 | 17 | 18 | 17 | 20 | 20 | 19 | 18,969 | 21,209 |
| low | 9 | 9 | 10 | 10 | 10 | 10 | 13 | 12 | 10,487 | 10,487 |

**Frame times in the lab** (four timed kickflips; median / 95th percentile / longest, dark theme):

| Tier | Render CPU, before | after | GPU, before | after | Frame interval, before | after |
| --- | --- | --- | --- | --- | --- | --- |
| high | 0.7 / 2 / 3.3 ms | 0.6 / 1.7 / 2.6 ms | 0.66 / 0.72 / 0.79 ms | 1.05 / 1.18 / 1.44 ms | 10 / 10.1 / 19.9 ms | 10 / 10.1 / 29.9 ms |
| medium | 0.5 / 1.7 / 2.9 ms | 0.5 / 1.7 / 2.8 ms | 0.52 / 0.59 / 0.66 ms | 0.85 / 0.92 / 0.92 ms | 10 / 10.1 / 10.5 ms | 10 / 10.1 / 10.4 ms |
| low | 0.2 / 0.4 / 2.5 ms | 0.2 / 0.6 / 1.2 ms | 0.1 / 0.11 / 2.59 ms | 0.17 / 0.43 / 2.07 ms | 10 / 10.1 / 10.2 ms | 10 / 10.1 / 10.2 ms |

**A whole game on the new build** (after its first go; dark / light):

| Tier | Goes | Frames | GPU, 95th percentile | The app's work, 95th percentile | Longest frame interval | Intervals over 20 ms |
| --- | --- | --- | --- | --- | --- | --- |
| high | 25 / 15 | 4,416 / 2,444 | 1.51 / 1.51 ms of under 4 | 1.5 / 1.7 ms of under 4 | 20 / 20 ms | 0 / 0 |
| medium | 28 / 14 | 4,894 / 2,100 | 1.18 / 1.18 ms of under 3 | 1.2 / 1.1 ms of under 4 | 10.4 / 10.6 ms | 0 / 0 |
| low | 11 / 28 | 1,621 / 4,918 | 0.65 / 0.63 ms of under 2 | 0.6 / 0.5 ms of under 4 | 10.3 / 11.2 ms | 0 / 0 |

What the plan cost and bought, in numbers:

- **Loading did not move.** The complete scene is still on screen in about 1.1 s on High and Medium and under half a second on Low at full speed, with 13 KB more JavaScript (the game's controls, records, rolling, landings, the camera, the replay and the dust) and the same models. The skate spot, the decks and the sounds are downloaded only when the game or the Sound switch needs them.
- **A draw call fewer with every switch on** (the legs became one draw, step 2), **and two to three more in the game** (the skate spot and its shadows; the dust is inside that). All far inside the caps of 60, 40 and 20.
- **The graphics card does a little more per frame** on High and Medium: 0.4 ms more in the lab (the legs on by default with their cloth, the wheels' print), and about 1.5 ms at the 95th percentile through a game against a target of 4 and 3 ms.
- **Medium and Low never missed a refresh**, in the lab or through a whole game.
- **High misses a single refresh now and then, and it did before this plan too.** The baseline's lab run has the same one frame of 19.9 ms on High in both themes; the new build's has 20 to 29.9 ms, and one of 20 ms in a game of thousands of frames. By the letter the "no frame longer than 16.7 ms" target is not met on High on a 100 Hz display, on either build. Step 20 says where it comes from (the page redrawing a card, not the 3D view) and that nothing was changed for it.
- **Memory stays flat** over the long-run test with games in it (step 20).

Keyboard only, through every screen (2026-11-10, Chromium, by script): on the welcome screen, the game screen before and in a game, and the lab, every visible control is reached by Tab (8, 8, 16 and 70 of them), each with a visible focus ring and in view; Enter on the first choice opens the game with focus on its heading; Start game puts focus on the turn's heading; the leave dialog keeps Tab inside itself, Escape closes it and focus returns to "Quit game"; in the lab the number keys, Space, `r` and `?` work, the shortcuts dialog opens on Close and returns focus where it was; the live region speaks. A screen reader spot check is the owner's, from the list in the plan.

## The whole rider (2026-11-11, ADR-85)

Measured 2026-11-11 with `scripts/measure/measure.js` (`?tiers=high,medium,low&nets=full&visits=cold&gos=40`), Chromium through `playwright-cli`, 1440 x 900, RTX 3060, feet on, the switch at its default (the rider on, on High and Medium), dark theme, the build served by `serve.ts`. The display ran at 100 Hz. "Before" is step 23's "after" column above (2026-11-10, the same script on the same machine); a fresh build of the base could not be made here, and the commits between (ADR-80 to ADR-82) did not touch the 3D view's cost. The measurement's whole game had stopped at the first notice since ADR-80 (a Space press there only continues); `measure.js` now continues it before each go, so the game rows are back.

**Loading** (cold, full speed, the frame where every model is on screen; the rider is one of them on High and Medium):

| Tier | Before | After | Models, before | after |
| --- | --- | --- | --- | --- |
| high | 1.08 s | 1.05 s | 754.9 KB | 803.2 KB |
| medium | 1.25 s | 1.01 s | 274.0 KB | 322.3 KB |
| low | 0.46 s | 0.46 s | 0 KB | 0 KB |

**Draw calls**, unchanged on every tier and screen: the rider's one draw replaces the legs' one, and on High its shadow pass replaces the shanks'.

| Tier | Welcome | Lab | Game at rest | Every switch on (most) |
| --- | --- | --- | --- | --- |
| high | 32 (32) | 33 (33) | 35 (35) | 34 (34) |
| medium | 17 (17) | 18 (18) | 20 (20) | 19 (19) |
| low | 9 (9) | 10 (10) | 10 (10) | 12 (12) |

Triangles on the welcome screen and in the game: High 200,860 and 201,121, Medium 37,368 and 37,629 (the rider's 18,500 in place of the legs' about 2,000).

**A whole game** (after its first go; 95th percentile, of the target):

| Tier | GPU, before | after | The app's work, before | after | Longest frame interval, after | Intervals over 20 ms |
| --- | --- | --- | --- | --- | --- | --- |
| high | 1.51 ms | 1.31 ms of under 4 | 1.5 ms | 2.0 ms of under 4 | 10.4 ms | 0 |
| medium | 1.18 ms | 1.05 ms of under 3 | 1.2 ms | 1.6 ms of under 4 | 10.4 ms | 0 |
| low | 0.65 ms | 0.26 ms of under 2 | 0.6 ms | 0.4 ms of under 4 | 10.5 ms | 0 |

**The welcome preview** (High, always drawing): GPU 0.59 / 0.79 / 0.92 ms, frame work 0.8 / 1.5 / 4 ms (median / 95th percentile / longest). **The lab** (unchanged, the legs): High GPU 0.79 / 2.36 / 2.49 ms (before 1.05 / 1.18 / 1.44), Medium 0.72 / 0.85 / 0.85 ms.

What the rider cost: about 48 KB more models on High and Medium, nothing in draw calls, and about half a millisecond more of the app's own work per frame through a game at the 95th percentile (the skinning of 17 bones and the pose model), well inside 4 ms. The graphics card's time through a game did not rise: the rider's one skinned draw and its shadow are cheaper than the dithered legs' were, and the camera standing farther back puts fewer pixels of the board's detailed materials on screen. High's lab 95th percentile GPU read 2.36 ms in this run against 1.18 before, with the lab unchanged by this step: a few frames in four tricks, inside the 4 ms target; the game's 8,224 frames on High show no such tail. Every target passes on every tier.

## The rider's polish pass (2026-11-13, ADR-99)

Measured 2026-11-13 with `scripts/measure/measure.js` (`?tiers=high,medium&nets=full&visits=http&gos=20&switches=none`), Chromium through `playwright-cli`, 1440 x 900, RTX 3060, feet on, the rider on, dark theme, the build served by `serve.ts`; the display ran at 120 Hz. "Before" is the whole rider's "after" above (2026-11-11). What moved the graphics time is the occlusion's denoise (one more half-size pass and one more draw call on High and Medium); the High rider lost its hair cards (3,344 triangles).

| Tier | Over | GPU p95, before | after | The app's work p95, after | Longest frame interval | Draw calls, as loaded |
| --- | --- | --- | --- | --- | --- | --- |
| high | a whole game, after its first go (15 goes, 9,717 frames) | 1.31 ms | 1.7 ms of under 4 | 2.5 ms of under 4 | 16.7 ms | 35 in the game |
| medium | a whole game, after its first go (19 goes, 12,481 frames) | 1.05 ms | 1.7 ms of under 3 | 1.9 ms of under 4 | 8.6 ms | 20 in the game |
| high | the lab's tricks | 2.36 ms | 0.79 ms of under 4 | 2.1 ms of under 4 | 25 ms once; 16.6 ms in a second run of eight tricks | 34 |
| medium | the lab's tricks | 0.85 ms | 0.59 ms of under 3 | 2 ms of under 4 | 16.7 ms | 19 |

No interval over 20 ms in either game. The one 25 ms interval in High's lab came in the first run's four tricks and not in a second run of eight (`?tiers=high&screens=lab&game=off&pops=8`), where every target passed. The browser checks' expected worst case with every switch on moves to 37 on High and 22 on Medium (`LEDGER`).

## At the tiers' pixel ratios, both backends (2026-11-13, the review's A11)

Measured 2026-11-13 with `scripts/measure/measure.js` as corrected above (`?tiers=<tier>&nets=full&visits=cold&screens=home,lab,skate&switches=none&dpr=<cap>&backend=<backend>`), headed Chromium through `playwright-cli`, 1440 x 900 (a game stage of 1422 x 830 CSS px), RTX 3060 through ANGLE and Direct3D 11, the display at 120 Hz, nothing else using the GPU, dark theme, feet on, the rider on, each build served by `serve.ts`. "Before" is the pass's starting tree (the review's A0); "after" is this pass (the cameras, the High rider's hem and atlas, the fixes, the quieter dust, the replay's handoff). High at DPR 1.5 draws 2133 x 1245 px in the game, Medium at 1.25 draws 1778 x 1038. Each row is one complete game, its length set by the computer's luck; High on WebGL2 was run twice, since its first "before" game read far higher than every other run.

| Tier, backend | GPU p95 through a game after its first go, before | after | The first go's GPU p95, before / after | The app's work p95, after | Longest interval after the first go, after | Most draw calls in the game |
| --- | --- | --- | --- | --- | --- | --- |
| High, WebGPU | 4.59 ms (11 goes) | 4.78 ms of under 4 (22 goes) | 5.44 / 4.33 ms | 1.9 ms | 16.7 ms | 36 |
| High, WebGL2 | 8.52 ms, then 5.78 ms | 5.84 ms, then 5.68 ms of under 4 | 6.98 and 6.3 / 6.13 and 6.44 ms | 2.5 and 2.0 ms | 16.8 and 16.7 ms | 36 |
| Medium, WebGPU | 3.21 ms (18 goes) | 2.88 ms of under 3 (30 goes) | 3.47 / 3.74 ms | 1.8 ms | 16.7 ms | 21 |
| Medium, WebGL2 | 4.17 ms (11 goes) | 3.90 ms of under 3 (19 goes) | 4.82 / 4.59 ms | 1.5 ms | 9.5 ms | 21 |

The lab's tricks (after): High GPU p95 1.64 ms on WebGPU and 5.02 and 4.74 ms on WebGL2 (before 1.64, then 5.28 and 4.98); Medium 0.85 ms on WebGPU and 3.59 ms on WebGL2 (before 0.85 and 3.64). Draw calls as loaded: High 33, 34 and 35 on the welcome screen, the lab and the game, Medium 18, 19 and 20, the same before and after. Downloads on a cold first visit to High's welcome screen: 609 KB of script both times, models 1,185.5 KB before and 1,328.6 KB after (the High rider's sharper atlas, ADR-101). Medium's are unchanged at 322.7 KB.

**Reading.** At the tiers' own pixel ratios the graphics time through a game misses its target on High on both backends, and on Medium on its WebGL2 backend, before this pass as well as after it. The DPR 1 tables above passed because they drew 44 percent (High) or 64 percent (Medium) of the pixels. The miss is not new: this pass moved no GPU number by more than the runs' own spread (High on WebGL2 read 8.52 and 5.78 ms in two runs of the same build). The review's P-01 is confirmed; per its plan the pixel policy (a backend- and size-aware DPR) is left to a later pass, and the targets are not raised. One wider run (High, WebGPU, 1920 x 1080 at DPR 1.5, a 2853 x 1515 px stage) read 10.49 ms p95 through a game: a scale check, not a verdict.
