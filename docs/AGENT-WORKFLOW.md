# How this repo was built with agents

An honest account. Built on 2026-11-04 by Dylan Adams-Hegarty directing AI coding agents.

## Roles

| Step | Who | Output |
| --- | --- | --- |
| Brief | Lead (Dylan, with Claude as orchestrator) | `docs/BRIEF.md`: experiment, physics, recognition rules, architecture contract, a11y and perf rules, test plan, CSS class contract |
| Design | Design agent (fable) | `src/styles/tokens.css`, `src/styles/app.css`, `docs/DESIGN.md` (rationale, contrast ratios, scene numbers, outcome copy) |
| Implementation | Implementation agent (opus) | everything else in `src/`, configs, tests, `CLAUDE.md`, `README.md`, and the other docs in `docs/` |
| Integration and verification | Independent integration agent (opus) | browser verification with `playwright-cli`, measured numbers in `PERF-BUDGET.md`, fixes, screenshots (no commit: the lead commits) |

Design and implementation ran in parallel without talking to each other. What made that work was the brief: the class-name contract and "scene numbers come from DESIGN.md". The implementation agent started with the brief's default scene numbers and pasted DESIGN.md's values into `src/scene/artDirection.ts` once it appeared.

## What the agents were told

- Follow `docs/BRIEF.md` exactly and stay inside their own files (implementation does not touch `src/styles/` or `DESIGN.md`).
- No Playwright in the project; browser checks use the global `playwright-cli` with a named session over HTTP.
- House writing rules: no em-dashes, absolute dates, model aliases.

## Implementation pass notes (2026-11-04)

- The brief's preset values were verified in `tricks.test.ts` and needed no adjustment (ADR-5).
- `npm run verify` green with 78 tests (6 files), `npm run build` green.
- Deviations from the brief, all recorded in DECISIONS.md or below:
  - FlightDriver applies the pose ref to the Board group directly instead of Board reading it in a second `useFrame` (ADR-3).
  - The playback action is `popTrick`, because `pop` is the pop-height input in the same store.
  - The outcome card has no `role="status"` (DESIGN.md's markup comment shows one) so the single Announcer stays the only live region.
  - The timeline is disabled while playing (DESIGN.md), so "scrub pauses a playing flight" exists in the store but is not reachable from the UI.
  - Truck boxes are laid across the board (0.06 x 0.03 x 0.17) and the flat deck is 0.55 m so the kicks bring it to DESIGN.md's 0.81 m; noted in `artDirection.ts`.
- Not done in this pass (left for integration): any browser run. The scene compiles and typechecks, but WebGL is stubbed in tests, so pose direction, camera framing and shadow look have not been seen yet.

## Integration pass (2026-11-04)

An independent integration agent (opus) read BRIEF, CLAUDE, DESIGN, DECISIONS and PERF-BUDGET, then the source, and was the first to render the scene in a browser. Tools: the global `playwright-cli` (session `tricklab`) against the Vite dev server and, for measurements, `vite preview` of the production build. `npm run verify` and `npm run build` were green before (78 tests) and after (87 tests).

What was checked: layout at 1440 x 900, 1024 x 768 and 900 px wide; camera framing; the shadow disc; renderer settings through `renderer.info` and the live `WebGLRenderer`; rotation direction by scrubbing the timeline to 25 and 50 percent; a keyboard-only run from page load (1 Space, 2 Space, 3 Space, 4 Space); focus rings; console output; reduced motion (emulated `prefers-reduced-motion: reduce`); slow motion timing; both themes, with a pixel comparison of the stage background against the canvas clear color; and the perf numbers now in `PERF-BUDGET.md`.

### Found and fixed

1. **Camera framing.** The 3.6 x 2.8 m pad overflowed the stage on every side at 1440 x 900, because the stage is taller than wide (784 x 876 px) and the fit only kept a 1.1 m half-width in view. The pad is now 1.6 x 1.2 m, and a closed-form fit (`scene/cameraFit.ts`) frames the pad corners and the board at a 0.6 m pop at any aspect (ADR-11). Tested with a real three camera at the three measured stage aspects.
2. **Rotation direction.** The kickflip rolled the grip toward the toe side, against the lead's convention. The signs now live in `ART.stance` and are applied in one place, `setBoardRotation` (ADR-10). The shove-it already turned the agreed way. `boardPose.test.ts` fails on the old sign. The scene description now states the convention.
3. **One scrub event per keyboard gesture.** The timeline committed on every `keyup`, so 50 arrow presses logged 50 `playback.scrubbed` events (110 log rows after two scrubs), against the brief's "one event per drag". A keyboard run now commits 600 ms after the last key-up, or at once on blur or pointer-up. New UI test; checked in the browser with real arrow keys (one event).
4. **Idle outcome title indent.** The glyph slot in `.outcome__name::before` was 1.2em wide even with no glyph, so "Set the board up and pop" started with a gap. The slot now exists only on landed and bailed cards.
5. **Event log header clipped.** "t (ms)" wrapped to two lines and was cut off in the 320 px column once rows were present. The header no longer wraps.
6. A `?debug` query exposes the R3F state as `window.__trickLab` for measuring; nothing is attached without it.

### Checked, no change needed

- `toneMappingExposure` in the `gl` prop takes effect: R3F 9 calls `applyProps(gl, glProps)` after creating the renderer, and the live renderer reads exposure 1, ACES filmic (4), sRGB output. Left in the `gl` prop with a comment.
- Shadow disc: sits under the board, shrinks and fades with height, follows X and Z only. Reads as intended.
- Keyboard-only run: all four objectives complete; each announcement is the pop sentence followed by the result ("360 flip landed. 365 degrees of flip, 365 degrees of shove, 0.53 seconds in the air. Objective complete: Land a 360 flip. 4 of 4 objectives done."); telemetry shows landed with 365/0, 0/173, 365/173 and 365/365 degrees; focus stays on the body and the blue focus ring is clear on presets, sliders and the timeline thumb. Console: only the known `THREE.Clock` deprecation warning from R3F.
- Reduced motion: a pop resolves at once with one announcement and one rendered frame, the timeline is enabled, and scrubbing to 25 percent puts the board at the model's pose (y 0.347 m, roll -91 degrees).
- Slow motion: `s` shows 0.25x; a 360 flip takes 2148 ms against 552 ms at 1x.
- Themes: stage background and canvas clear color are pixel-identical in both (rgb 30, 33, 36 and rgb 215, 211, 203), so there is no seam.
- Perf: 9 draw calls, 0 frames in 10 idle seconds after landing, geometries flat at 9 across 10 pop/reset cycles.

### What remains (follow-ups)

1. **Chromebook run.** Every number is from a desktop GPU. Measure on a real low-end Chromebook (Performance panel, 60 Hz display) before quoting perf as proven.
2. **Mid-width layout.** At 1024 x 768 the three-column grid leaves the stage 368 px wide, and the board is about 110 px long. A layout between 960 and about 1200 px that puts the stage across the top (or narrows the side columns) would help. This is a design-agent change in `app.css`.
3. **Pad reads brown, not concrete gray.** `#6f6a63` under the warm key light and ACES renders as a dark umber, darker than the swatch. A design call: a cooler key light, a lighter pad color, or exposure above 1.
4. **Rotation naming check (resolved 2026-11-04).** The lead confirmed the integration pass was right: backside means the tail swings behind the rider, so the yaw sign was flipped to clockwise seen from above. ADR-10 records the correction.
5. **Disabled Pause contrast.** The aria-disabled ghost Pause button is pale orange text (exempt as an inactive control, but it reads as an active link at a glance).
6. **`THREE.Clock` warning.** Comes from R3F's loop with three 0.187; goes away when R3F moves to `THREE.Timer`.
7. **Telemetry labels wrap** ("Shove rotation") in the 320 px column. Harmless, a little untidy.

Item 3 (the brown pad) was addressed by the design agent in the realistic board pass below.

## Realistic board pass (2026-11-04)

Dylan asked for a board that looks like an actual skateboard, built the way production 3D web apps ship assets (glTF/GLB, compression, texture budgets, LOD, disposal). The lead wrote `docs/BRIEF-BOARD.md`. A design agent (fable) wrote `DESIGN.md` section 7 (every number: outline, kicks, concave, ring table, ply colours, grip noise recipe, truck parts, wheel profile, materials, lighting, the segmented control markup), the source art in `assets/source/`, the `.segmented*` CSS, and the pad and light retune that fixed the brown pad. Then one implementation agent (opus) built the rest and checked it in a browser. There was no separate integration agent this time, so treat the browser checks below as the implementer checking their own work.

What the implementation agent did:

- Pure modules in `src/asset/` (spec, deck, hardware, board, textures) and 59 new tests. All 87 existing tests still pass (146 total).
- `scripts/build-board.ts` and `scripts/lib/` (glTF-Transform build, a small PNG encoder, inspector, budget rules), `scripts/check-assets.ts`, `npm run assets`, `npm run assets:check`, and the check added to `npm run verify`.
- Runtime: `BoardModel` (useGLTF, meshopt, preload, `dispose={null}`, its own lazy chunk), `BoardPrimitive` (the old board, renamed), `Board` (error boundary, Suspense, detail switch), `SceneEnvironment` (RoomEnvironment PMREM), the Board detail control in the View panel, and the ui slice setting.
- Browser checks with `playwright-cli` (session `board-impl`) against the dev server and `vite preview`: draw calls, triangles, geometries and textures after load, after 10 trick cycles and across Low/High toggles; wheels touching the pad (world-space min y measured); pad colour sampled with `readPixels` at several environment intensities; the GLB blocked to exercise the fallback; the keyboard-only objectives run; and the screenshots, each looked at.

Deviations, all recorded in `docs/ASSET-PIPELINE.md` with reasons: 20 deck rings instead of 19 (the ring table has six bottom insets for five slots), the concave normalised by the middle outline formula (avoids a 0/0 at the tips), rounded boxes at 2 and 3 segments instead of 4 (972 triangles a box at 4), the grip stored as one grey channel (an RGB grip pushed the GLB to 309 KB), grip UVs in [0, 1] with `KHR_texture_transform`, and environment intensity 0.40 instead of 0.55 (the pad measured `#a2a4a4` at 0.55). The implementer did not edit `DESIGN.md` or `src/styles/`.

What went wrong on the way and was caught: the first GLB was 309 KB (over budget, fixed by the grey grip); three's `RoundedBoxGeometry` is not indexed, so merging failed until it was welded; OrbitControls' `minDistance` silently clamped the first close-up screenshots until the debug script relaxed it; the React Compiler lint rule rejected assigning `scene.environment` on a hook value (fixed by reading the scene through `get()` inside the effect); adding the GLTF loader pushed the scene chunk past 1,000 KB (fixed by making `BoardModel` its own lazy chunk, which also means Low never downloads it).

Left open: the pad is lighter than the design intent (`#959696` against `#7b7a77`), a design call; the pivot cup, at the design's numbers, pokes about 8 mm past the end of the baseplate; Low does not free the GLB's GPU memory once loaded; KTX2 (ADR-14); and still no Chromebook measurement.

## Where agents help and where they do not

Agents were fast where the contract was clear: the pure model, store slices, tests, docs scaffolding, pasting design numbers. They need tight rules where plausible code is wrong: per-frame allocations, who writes the pose, demand-loop transitions, live-region behavior, and focus management. Those rules live in `CLAUDE.md` so the next agent starts with them.
