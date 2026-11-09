# Plan: look, feel and performance (2026-11-08)

**Status, 2026-11-09: done.** All 16 steps, one commit each, on the branch `look-feel-perf` off `skate-game` (the recommended choice below), with `npm run verify` passing at every step. Decisions are ADR-48 to ADR-59 in `docs/DECISIONS.md`; the before-and-after numbers are in `docs/PERF-BUDGET.md` (step 14). After each phase a gpt-6.1-sol reviewer at high effort reviewed the work, and every finding was fixed and re-checked until it agreed (review fixes are their own commits, noted in the ADRs' Update paragraphs). The text below is the plan as written.

The owner's goal: the game should look, feel and run as well as possible. This plan came out of a full review of the project on 2026-11-08 (docs, source, and the production build in a real browser) and the owner's answers to eight questions. It is the agreed gameplan; nothing in it has been started yet. Each step is one commit, `npm run verify` passes at every step, and each decision gets its own ADR (ADR-48 onward) with DESIGN.md, PERF-BUDGET.md, ASSET-PIPELINE.md and CLAUDE.md updated wherever a rule changes.

## The owner's decisions (2026-11-08)

| Question | Answer |
| --- | --- |
| What matters most | Balanced: better looks and faster loading together, Low keeps working |
| The rider | Shoes only: legs off by default, the Legs switch stays |
| The setting | Nicer street, same idea: keep the concrete, add a real sky, warmer sun, stronger shadows |
| Sound | Yes, off by default, with a switch |
| A build tool to shrink the model textures | Yes, add one |
| The Low setting | Simple but finished: a deliberate flat style, not a broken-looking High |
| Page design | Stronger skate style: a bold headline font, more colour, a celebration on a landed trick |
| Pace | All at once: do every part, then show the result |
| The newer renderer and post-processing | Add them if they help (they do; see "Why the new renderer" below) |

Still open when written: whether the work goes on a new branch off `skate-game` (recommended, so `skate-game` can be merged and go live on its own) or on `skate-game` itself. It went on a new branch, `look-feel-perf`.

## Baseline (measured 2026-11-08)

Production build (`npm run build`, `vite preview`), Chromium through the global playwright-cli, desktop with an RTX 3060, 1440 x 900, DPR 1, `?debug` for `gl.info`.

| What | Number |
| --- | --- |
| Draw calls, welcome screen, High, preview playing (legs on) | 30 (limit 40) |
| Triangles, same (shadow pass included) | 164,206 |
| Draw calls, lab, Low | 14 (limit 20), 4,720 triangles |
| JS, gzip transfer | `index` 95 KB, `TrickScene` 257 KB (984 KB minified), `BoardModel` 21 KB, CSS 6 KB |
| Models downloaded on High | `board-high.glb` 1,824 KB, `shoes.glb` 521 KB, `ground.glb` 433 KB: 2.8 MB |
| Texture memory on the GPU, High (assets:check estimates) | board 13.54 MB, ground 12.00 MB, shoes 8.00 MB: about 34 MB |
| 10 Mbps, 60 ms latency, cache off | UI 0.27 s, first 3D frame 0.72 s, High board 3.16 s, all models 3.47 s |
| 3 Mbps, same | UI 0.46 s, first 3D frame 1.42 s, High board 9.20 s, all models 9.51 s |
| Verify | 39 test files, 632 tests passed, 1 todo; assets:check passed |

What the review found, in short:

- **Running cost is already low.** About 0.2 ms of CPU per frame, zero frames while idle, every tier inside its draw-call limit.
- **Loading is the weak spot.** The stage is blank until the 3D code arrives (`Suspense fallback={null}` in `App.tsx`), then the blocky primitive board shows until the GLB arrives: about 8 seconds of it at 3 Mbps.
- **The legs are the weakest visual.** Lathed tubes whose thighs fade out at the hips. From the overhead rider view (the default in the lab and the game) they cover the board and show odd caps.
- **The setting is bare.** Flat grey concrete fading into the theme's flat background colour, and no sense of a place.
- **Low looks unfinished.** Plain grey, a box-shaped board and jagged edges (no antialiasing).
- **The page is clean but generic.** System fonts, no sound, and nothing happens on a landed trick except text. The programmatic focus on each screen's h1 draws a box across the whole top bar that looks like a text field.

## Why the new renderer (WebGPU) and post-processing

**Post-processing helps the look more than anything else left.**
- **Ambient occlusion** darkens where things touch: wheels on the ground, shoes on the grip, the trucks under the deck. It is most of what makes a scene look solid.
- **Motion blur** makes a full-speed flip read as fast instead of strobing.
- **A colour grade** gives the picture one finished look.

**The new renderer is not a speed-up for this scene** (it already draws in about 0.2 ms). It is the right vehicle for the effects, for three reasons:
- **No extra draw calls.** It writes the extra buffers the effects need (normals and per-object velocity) in the same pass as the picture (multiple render targets), so ambient occlusion and motion blur add only full-screen passes, not a second scene pass.
- **It is the only home of three's motion blur.** That blur (`MotionBlur.js`, driven by velocity) exists only for this renderer.
- **It is already installed.** three r187 ships `WebGPURenderer` and the node effects (`GTAONode`, `MotionBlur`, `BloomNode`, `SMAANode`, `Lut3DNode`, among others, checked in `node_modules/three` on 2026-11-08). React Three Fiber 9.8.2 accepts a renderer factory that returns a promise, so no upgrade is needed. On a browser without WebGPU, the renderer uses its own WebGL2 backend.

**Costs.**
- three's manual still calls the new renderer experimental.
- The two custom `ShaderMaterial`s in `src/scene/resources.ts` (the ground footprints and the foot trails) have to be written again in TSL for it.
- `renderer.info` reports differently.
- High and Medium download roughly 100 to 150 KB more JS (an estimate; step 3's texture savings are far larger).

The go/no-go check in step 5 decides before anything else depends on it.

**Left out on purpose.**
- **Depth of field:** it blurs the board and feet, which are the information.
- **Temporal antialiasing (TRAA):** it smears a fast-spinning board, and it would need extra frames after every change, against the demand frameloop. Use MSAA instead.
- **Screen-space reflections and global illumination:** no shiny surfaces to reflect, and high cost.
- **The new renderer on Low:** Chromebooks start faster on the classic `WebGLRenderer`, and it is proven there.
- **React Three Fiber 10 and drei 11:** both are pre-release (alpha).

## Phase A: foundations (no visible change yet)

### 1. Quick wins
- `legsVisible` defaults to off (the welcome preview included); the Legs switch stays in View. Fewer draw calls (two meshes and the shanks' shadow pass on High) and no leg IK per frame.
- A subtle focus style for programmatically focused headings (`#screen-heading`, `#skate-heading`, the setup heading) in place of the full-width box. Style work, owned by the design side of the project.
- The tier's GLBs start downloading when the page opens (in `main.tsx`, once the tier is known), not after the `TrickScene` and `BoardModel` chunks arrive. Expected: about a second sooner at 3 Mbps.
- Free a GLB's GPU memory when the student moves to a lower tier (`useGLTF.clear` plus disposal), the ADR-15 follow-up.
- Done when: verify passes, the measurement script (step 2) shows the earlier model start, and draw calls drop by the legs' share.

### 2. A repeatable measurement script
- A script for the global playwright-cli (`run-code --filename`), kept in `scripts/measure/`. Playwright is not installed in the project.
- For each tier and screen it records draw calls, triangles, GPU frame time where available, time to the first 3D frame, time to the real models, and bytes downloaded, at full speed and at 10 and 3 Mbps.
- The baseline above is re-taken with it and written into PERF-BUDGET.md. Every later step reports before and after from the same script.

### 3. Smaller model downloads (the new build tool)
- Pilot on `board-high.glb`, comparing two formats:
  - **KTX2 (Basis Universal):** stays compressed on the GPU, about 4x less texture memory. Players fetch a decoder of about 0.6 MB raw once (`basis_transcoder.js` and `.wasm` from `three/examples/jsm/libs/basis/`), served from our own `public/`, never a CDN.
  - **WebP (`EXT_texture_webp`):** the smallest download, no GPU memory saving.
- Pick by measured download, GPU memory, look (side-by-side crops of the grip, deck graphic and ground) and decode time. Then apply the winner to all four GLBs.
- `scripts/lib/inspect.ts` and `budget.ts` learn the new format: dimensions and mip chains are checked as strictly as PNG is now. No limit in `BUDGETS` moves.
- The encoder is added as a pinned dev dependency. If KTX2 needs a native system install (`toktx`) rather than a project package, stop and ask the owner before installing it (CLAUDE.md).
- Target: High from 2.8 MB to about 1 MB of models. If KTX2 wins, High texture memory from about 34 MB to about 10 MB.

## Phase B: the new renderer and the effects

### 4. Two renderer paths
- **High and Medium:** `WebGPURenderer` through an async `gl` factory, in its own lazy chunk.
- **Low, and any device where the new renderer fails to start:** today's `WebGLRenderer`, in its own lazy chunk. Each student downloads one path.
- **Shaders:** the ground footprints and the foot trails get TSL versions next to the GLSL ones. The pure parts (`groundShadow.ts`, `footPathGeometry.ts`) stay shared and tested.
- **Shadows:** keep the fitted PCF shadow camera (ADR-38) on the new renderer.
- **Perf badge:** `PerfProbe` and the perf badge read the new renderer's `info`.
- **Rules kept:** zero frames while idle, FlightDriver as the only pose writer, no per-frame allocation (CLAUDE.md rules 4 to 6).

### 5. Go/no-go check
- Compare High on the new renderer against today's High, using the step 2 script:
  - GPU frame time at 1440 x 900 and 2560 x 1440
  - time to the first frame and to the real models
  - draw calls
  - the look, in the same six poses (rest, rising, edge-on, inverted, the catch, landed)
- If it is slower to start by more than the poster (step 10) can cover, rougher, or unstable, stay on `WebGLRenderer` and stop to ask the owner before adding a WebGL effects library (a new dependency).

### 6. Post-processing
- **High:**
  - MSAA on the scene pass
  - ambient occlusion (GTAO) from the same pass's normals
  - motion blur from per-object velocity, at normal speed only: off in slow motion, while paused or scrubbing, and under reduced motion, plus a "Motion blur" switch in View (persisted, announced, never logged)
  - a subtle bloom on sun highlights
  - a colour grade with a light vignette
- **Medium:** a half-resolution ambient occlusion and the colour grade.
- **Low:** no post-processing.
- Every effect number lives in `ART` (`src/scene/artDirection.ts`). The draw-call limits stay 40, 20 and 20, counting the full-screen passes.

## Phase C: look

### 7. Nicer street
- A visible sky dome instead of the flat clear colour, one draw call on every tier:
  - **light theme:** daytime
  - **dark theme:** late afternoon

  The same sky feeds the environment map, so reflections match. `--scene-bg` in `tokens.css` follows the horizon colour, and its equality test (`artDirection.test.ts`) stays.
- A faint city skyline baked into the sky's colours, at no extra cost.
- A warmer, lower sun with longer, softer shadows. The shadow frustum is refitted by the existing `shadowFrustum` and its tests.
- Tone mapping compared side by side (ACES, AgX, Khronos Neutral) with the new grade.
- The ground's colour and roughness retuned to the new light.

### 8. High-only finish
- Clearcoat on the deck print and sheen on the shoe suede (glTF material extensions written by `scripts/lib/build.ts`).
- Kept only if the High frame time holds and the look improves in the six poses.

### 9. Low that looks designed
- Flat, toon-like shading with clean colours.
- A rounder primitive board built from the real deck outline (`src/asset/deck.ts`), still a few draw calls.
- Smooth edges: MSAA at DPR 1 instead of no antialiasing at DPR 1.5.
- No environment-map build: about 80 ms of startup at 4x CPU throttle, measured 2026-11-04.
- Cheap slab joints on the ground plane.
- Still under 20 draw calls, and still no model downloads.

## Phase D: feel

### 10. A loading picture
- A still of the scene per theme (WebP, built from the real scene and committed) fills the stage while the 3D view loads.
- On Medium and High it stays until the tier's real models are in, then fades to the live scene. No blank box, and no blocky stand-in board on screen.

### 11. Skate style
- A bold headline font, self-hosted as woff2 under the SIL Open Font License (no font CDN; school networks block them). Body text stays the system font.
- More colour from the deck's orange.
- Sticker-style SKATE letters that stamp in when earned.
- A short celebration over the stage on a landed trick (DOM, never inside the Canvas, rule 3), with a calm, motionless version under reduced motion.
- Recorded in DESIGN.md and `tokens.css`, with contrast ratios for both themes.

### 12. Sound, off by default
- Synthesized in the browser with Web Audio, so nothing is downloaded and nothing is licensed. The sounds:
  - the pop
  - the landing
  - the bail
  - a letter earned
  - winning and losing a game
- Driven by the store's actions, timed to the flight, and following slow motion.
- A sound switch on every screen (the top bar and the welcome screen): persisted, announced, never logged, not exported.

### 13. Automatic step-down
- If tricks run choppy on a device (frame time measured over the first few tricks), drop one tier and announce it.
- Never logged. The student can move back up in View.

## Phase E: wrap-up

### 14. Measure everything
Before and after for all three tiers, both themes, and feet on and off, from the step 2 script, in PERF-BUDGET.md.

### 15. A keyboard-only pass
In a real browser, through every screen.

### 16. Screenshots and a GIF
New README screenshots, plus a slow-motion GIF of a 360 flip.

## Expected results (estimates until step 14 measures them)

- High downloads about 1 MB of models instead of 2.8 MB.
- No blank or blocky stage on any connection.
- High texture memory about 10 MB instead of 34 MB, if KTX2 wins step 3.
- Still zero frames while idle, and every tier inside its draw-call limit.
- A clearly better picture on High and Medium (ambient occlusion, motion blur, sky, light, grade), a finished look on Low, sound, and a game screen that celebrates.
