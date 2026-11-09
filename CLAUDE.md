# trick-lab

A small 3D skateboard flip-trick lab ("Land the trick"). A student sets pop height, flick rate and scoop rate, pops, watches the flight and the rider's feet, and the app recognizes the trick (kickflip, heelflip, backside and frontside pop shove-its, varial flip, 360 flip and more; flick and scoop are signed, ADR-30; no hardflip, ADR-41) and whether it landed. A game of SKATE against the computer (ADR-43, real-game rules ADR-44) sits on top: a coin flip, called sets, copy or take a letter, two tries on the last letter, no repeats. Target: a desktop with a real GPU by default, with quality tiers down to low-end Chromebooks; keyboard and screen-reader users. The spec is `docs/BRIEF.md` (plus `docs/BRIEF-BOARD.md` for the realistic board and `docs/BRIEF-FEET.md` for the feet and quality tiers); the visual system is `docs/DESIGN.md`.

## Stack

React 19, TypeScript (strict, `noUncheckedIndexedAccess`), Vite, Zustand (one store, five slices), three.js via `@react-three/fiber`, `@react-three/drei` for `OrbitControls` and `useGLTF`. Vitest + React Testing Library + jsdom. ESLint with typescript-eslint and react-hooks. Node 22. Asset pipeline dev dependencies (pinned): `@gltf-transform/core`, `extensions` and `functions` 4.5.1, `meshoptimizer` 1.3.0, `@resvg/resvg-js` 2.6.2, `ktx2-encoder` 0.6.0 and `ktx-parse` 1.1.0 (KTX2 textures, ADR-49), `tsx` 4.23.15, `@types/node` 22.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run preview` | Serve `dist/` |
| `npm run typecheck` / `lint` / `test` | One step each (typecheck covers `src/` and, with `tsconfig.scripts.json`, `scripts/`) |
| `npm run assets` | Rebuild `public/models/board.glb`, `board-high.glb`, `shoes.glb` and `ground.glb` from `src/asset/` and `assets/source/` (deterministic, KTX2 textures, about 13 s), and copy three's Basis transcoder into `public/basis/`; `npm run assets -- ground` builds one |
| `npm run assets:check` | Read the committed GLBs and enforce each asset's budget (KTX2 with full mip chains included); prints a table per file; checks `public/basis/` is three's transcoder and the loading pictures in `public/stills/` fit `src/asset/stillSpec.ts` |
| `npm run verify` | typecheck, `eslint .`, `vitest run`, then `assets:check`. Must pass before any hand-off. |
| `playwright-cli -s=still run-code --filename=scripts/still/capture.js`, then `npx tsx scripts/still/write.ts` | Rebuild the loading pictures `public/stills/*.webp` from the real scene (ADR-56), against the same served build; steps in ASSET-PIPELINE.md |
| `playwright-cli -s=measure run-code --filename=scripts/measure/measure.js` | The repeatable measurement (draw calls, triangles, CPU and GPU frame time, load times at full speed, 10 and 3 Mbps, bytes) against a build served by `npx tsx scripts/measure/serve.ts dist 4173` (gzip like GitHub Pages); options and usage in the script's header and PERF-BUDGET.md |

## Layout

```
src/sim/        pure flight model (flight.ts), feet model (feet.ts, from docs/RESEARCH-FEET.md; signed flick and scoop pick the direction, ADR-30), the board as a solid for the feet clearance (boardVolume.ts, ADR-29), recognition, presets, objectives (tricks.ts), text and foot steps (format.ts), the game of SKATE's rules, the computer player and the trick guide (skate.ts, ADR-43, ADR-44)
src/store/      Zustand slices: inputs, playback, assessment, ui, skate; prefs.ts (saved preferences); pace.ts (the automatic step-down's rule, ADR-59); index.ts composes them (createTrickStore takes the clock and the computer's random source); export.ts builds the JSON; quality.ts picks the tier from the device; speed.ts the playback speed stops
src/asset/      pure board and shoe geometry and textures (no React): spec.ts (DESIGN.md 7 numbers, per-asset budgets), deck.ts, hardware.ts, board.ts, textures.ts, shoeSpec.ts, shoe.ts; groundSpec.ts, groundTextures.ts, ground.ts (the concrete ground tile and plane, ADR-31); stillSpec.ts (the loading picture's files, ADR-56)
src/scene/      R3F: TrickScene (Canvas, keyed on the tier, with fog to the clear colour; StageReady tells the store when the tier's real scene is first drawn, ADR-56), showcase.ts (the welcome screen's preview clock, ADR-45), Pad (the ground: GroundModel's GLB on Medium and High, a plain plane on Low and as the fallback), Board, BoardModel (GLB), BoardPrimitive (fallback and Low: the real deck mesh, toon shaded on Low, ADR-54), Feet, ShoesModel (GLB), FootPaths (the foot trails; footPathGeometry.ts builds it), FlightDriver, SceneCamera, SceneEnvironment (prefilters the procedural sky of outdoorEnvironment.ts, ADR-31), rangeFog.ts (the fog by distance from the camera on both renderers, ADR-55), PerfProbe; flightPace.ts (the pace of a landed flight from PerfProbe's record, ADR-59)
                gltf.ts loads and frees every GLB (one patched GLTFLoader, ADR-48); modelCache.ts starts the tier's downloads early and releases models on a lower tier
                sky.ts (pure: the sky's colours and its city) and skyDome.ts (the dome's geometry), ADR-52
                nodeRenderer.ts is the WebGPURenderer path (Medium and High, its own lazy chunk, ADR-50): the renderer, the TSL twins of the two GLSL materials, its PMREM; effects.ts its post-processing (occlusion, motion blur, glow, grade, ADR-51); rendererKind.ts tells the renderers apart and reads their counts
                artDirection.ts holds every scene color, light, camera and per-tier renderer number (from DESIGN.md); modelUrls.ts the GLB paths
                resources.ts holds shared, merged geometries and materials (pad, shadow, primitive board, primitive shoe, the foot-trail shader)
                cameraFit.ts frames the board and its highest pop (ADR-18); boardPose.ts maps a sim pose to the board rotation and its stance signs (ADR-10)
src/ui/         DOM UI: App (three screens: home, skate, lab, ADR-45; the hash follows the screen), Home (the welcome screen), TopBar, Utilities (Shortcuts, the theme switch, the preview's pause), Toggle, Fold (the lab's sections that open, ADR-47), Skate (the game screen's column: how to play, letters, the turn card, controls, the end, the leave dialog and the stage's turn chip; the computer's auto turn, ADR-46), Presets, Inputs, Playback (Speed, Timeline), Telemetry, FootMotion, Objectives, EventLog, Announcer, PerfBadge, ShortcutsDialog, ViewPanel, StageStill (the loading picture over the stage until the scene is ready, ADR-56), Celebration (the stickers over the stage on the student's landed trick, ADR-57)
src/hooks/      useReducedMotion; useSound (plays the store's sound cues while sound is on, ADR-58)
src/audio/      sounds.ts (the synthesized sounds as pure data, slow motion) and player.ts (Web Audio, made on first use), ADR-58; no React, no three
src/styles/     tokens.css and app.css (owned by the design agent; do not restyle from components); fonts/ the display face (Bungee, woff2) and its license, OFL.txt (ADR-57)
scripts/        build-board.ts, check-assets.ts; lib/ build.ts (GLB, KTX2 textures), inspect.ts and budget.ts (checker); measure/measure.js (the playwright-cli measurement, ADR-48) and serve.ts (a node:http server that gzips like GitHub Pages); still/capture.js and write.ts (the loading pictures, ADR-56); lib/webp.ts (their checks)
assets/source/  design source art (deck-graphic.svg, wheel-print.svg), owned by the design agent
public/models/  board.glb, board-high.glb, shoes.glb and ground.glb, generated by npm run assets and committed
public/basis/   three's Basis transcoder for the KTX2 textures (ADR-49), copied by npm run assets and committed
public/stills/  the loading pictures, one WebP per theme (ADR-56), rendered by scripts/still and committed
docs/           BRIEF, BRIEF-BOARD, BRIEF-FEET, RESEARCH-FEET, CAPTURE-PROTOCOL (the reference video capture plan), DESIGN, DECISIONS, PERF-BUDGET, ASSET-PIPELINE, AGENT-WORKFLOW; research/2026-11-05 (the model and visual realism audits ADR-36 to ADR-40 cite, and the hardflip evidence ADR-41 cites); screenshots/ (the README images)
.github/        workflows: verify.yml (npm run verify on push and PR), deploy.yml (GitHub Pages, built with --base=/trick-lab/)
```

## Conventions (the rules a change must keep)

1. **Store actions own the event log.** Only actions in `src/store/` call `log()`. Components never append events, never compute objectives or recognize tricks. UI preferences (theme, quality, feet, foot trails, speed, motion blur, sound) are never logged. Sound cues (`soundCue`) come from store actions only, like announcements (ADR-58).
2. **The DOM owns accessibility.** The canvas is `aria-hidden`. Every action has a DOM control. `#scene-description` is the text equivalent of the scene (derived by `describeScene`). One polite live region (`Announcer`); messages come from store actions only.
3. **No drei `Html` or any DOM inside the Canvas.** UI goes in `src/ui/`.
4. **Demand frameloop.** `frameloop` is `"always"` only while `status === 'playing'` or the welcome screen's preview plays (`previewAnimates`, ADR-45), `"demand"` otherwise. Any store change requests one frame (`InvalidateOnStoreChange`). Anything that changes the picture outside the store (the environment map, a GLB arriving) calls `invalidate()` once.
5. **FlightDriver is the only `useFrame` that writes a pose.** On the welcome screen it poses the preview from `showcase.ts` and leaves the store's flight alone (ADR-45). Elsewhere it keeps progress, the board pose and the feet pose in refs, applies them to the Board's outer group, the two shoe groups and the shadow disc, sets the foot trails' playhead uniform, commits progress to the store at most 10 times a second, and calls `land()` at progress 1. Board, BoardModel, BoardPrimitive, Feet, ShoesModel, ShoePrimitive and FootPaths have no per-frame code; the foot-trail geometry is rebuilt only when the shown flight changes. PerfProbe is the only other `useFrame`: it makes the one render call (through the effects' `frame.render` where the tier has them, ADR-51) and measures it, and while a flight plays writes each frame's interval into the preallocated `trickFrames` for the automatic step-down (ADR-59).
6. **No per-frame allocation.** No `new`, array or object literals inside `useFrame`. `writePose` and `writeFeetPose` mutate one object each; the store state is passed as the inputs object.
7. **Shared resources.** Procedural geometry and materials live in `scene/resources.ts` (a custom shader exists twice: GLSL there for WebGLRenderer, TSL in `nodeRenderer.ts` for WebGPURenderer, both reading the shared `uniforms`, ADR-50; the legs' dither too, ADR-60), merged per material, disposed when the Canvas unmounts. Never put `<boxGeometry>` or `<meshStandardMaterial>` JSX in scene components. The GLB's geometries, materials and textures belong to the useGLTF cache: render them with `dispose={null}` and never dispose them from a component.
8. **Scene numbers live in `scene/artDirection.ts`.** No color, intensity, camera or renderer literal elsewhere in `src/scene`; the per-tier renderer settings are `ART.quality`, the effects' numbers `ART.post`. `SCENE_BG` per theme must equal `--scene-bg` in `tokens.css` (tested). Board asset numbers live in `src/asset/spec.ts` (`ART.board.restY` reads `REST_Y` from it), shoe numbers in `src/asset/shoeSpec.ts`, and the feet model's `FOOT` must equal the shoe's `SHOE` size (tested).
9. **Class names follow the contract in `docs/BRIEF.md`** (plus `.app__still` from DESIGN.md 14.6, `.celebration`, `.celebration__shout`, `.celebration__trick` and `.skate__letter--new` from DESIGN.md 14.7, `.toggle__state`, the `.skate__*` classes from DESIGN.md 11, `.objective__text`, `.view-panel__actions`, the `.segmented*` classes and the `.foot-steps*` and `.foot-step*` classes from DESIGN.md). Do not invent styling classes.
10. **Focus management goes through the store.** Actions call `requestFocus`; `App` applies it. After reset, focus is on the setup heading; after a screen change, on the new screen's h1 (`#screen-heading`); when a game starts, ends or is quit, on the game's heading (`#skate-heading`, ADR-46: the end is the one place a resolved trick moves focus, because the turn controls are gone). Applying a preset and resolving a trick never move focus.
11. **Physics stays pure.** `src/sim` imports nothing from React, three, the store or `src/asset`. Flick and scoop are signed: the magnitude is the rate, the sign the direction (positive kickflip and backside, negative heelflip and frontside, ADR-30); positive inputs must keep the poses pinned in `feet.pinned.test.ts`. Presets are asserted in `tricks.test.ts` to land at pop 0.35 m and fail at 0.15 m. The feet model (`feet.ts`) is driven by the inputs and the flight, never by the recognized result; it decides land or bail with the same `isLanded` rule recognition uses.
12. **Writing:** no em-dashes in code, copy or docs. Absolute dates (2026-11-04). Model names as aliases (fable, opus).
13. **The assets are generated, never hand-edited.** Change `src/asset/` (or the design SVGs), run `npm run assets`, and commit the four GLBs (and `public/basis/` after a three upgrade) with the source change. `src/asset/` imports three's geometry classes but nothing from React, the store or `src/scene`. A test fails if a committed GLB no longer matches its geometry source.
14. **Budgets are gates, not goals.** `npm run assets:check` (in `verify`) enforces `BUDGETS` in `src/asset/spec.ts` per file: the Medium board 300 KB, 8 draw calls, 25,000 triangles, 4 textures at 1024 px; the High board 2.5 MB, 8 draw calls, 120,000 triangles, 6 textures at 2048 px; the shoes 600 KB, 3 draw calls, 30,000 triangles, 2 textures at 1024 px; the ground 500 KB, 1 draw call, 64 triangles, 3 textures at 1024 px. All fail on textures not power of two, not mipmapped or not KTX2 with a full mip chain (ADR-49), on missing meshopt or quantization, on Draco, and on size or rest height drifting. Do not raise a limit to pass; say why in an ADR if it must change (ADR-16 is the last time it did).
15. **No Draco, no CDN decoders.** Models load through `useModel` in `scene/gltf.ts` (drei's `useGLTF` with Draco off and meshopt on): the meshopt decoder is bundled, and the KTX2 transcoder is served from our own `public/basis/` (ADR-49). School networks block CDNs.

## Verify loop

1. Make the change.
2. `npm run verify`. Fix until green. Do not weaken a test to pass it; if behavior changed on purpose, change the test in the same commit and say why.
3. For anything visual or 3D: `npm run dev` (or `npm run build && npm run preview` for numbers), then check in a browser with the global `playwright-cli` using a named session (`-s=<task>`), over HTTP, and close it by name. Look at console errors, press `p` in the lab for the perf badge (draw calls must stay under 20 on Low and Medium, under 40 on High where the shadow pass counts), check that the frame counter stops when the board lands, and drive the flow by keyboard only. `?debug` in the URL exposes the R3F store as `window.__trickLab`; call `.get()` on it for the live state (`gl.info`, `scene`, `controls`). Check all three quality tiers and the feet on and off.
4. Do not install Playwright in this project. Do not install system tools (for example `toktx`) without asking.

## Reviewing agent output

Treat agent changes as a pull request from a capable stranger. Before accepting:

- Run `npm run verify` yourself; do not trust a pasted summary.
- Read the diff of `src/store/` first. Any component that calls `log`, sets `events`, computes objectives or calls `recognize` is a reject.
- Grep for `new ` and `{` or `[` literals inside `useFrame` callbacks, any second `useFrame` that touches the board or the feet, `<.*Geometry` and `<.*Material` JSX in `src/scene`, and `Html` from drei.
- Check that new interactive DOM has an accessible name, a visible focus style from `app.css`, and an announcement where state changes.
- Check that tests drive real behavior (real store, keyboard via user-event). New mocks beyond the canvas stub need a reason.
- For a GLB change: the `assets:check` table, the triangle and size deltas in the `npm run assets` output, and a screenshot of the board. A binary diff alone is not reviewable.
- Reject drive-by refactors, new dependencies, and style changes in `src/styles/` from implementation agents.
- Scope agents narrowly (one slice or one component) and give them the file list and the rules above.
