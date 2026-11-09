# Plan: play, polish and reach (2026-11-09)

**Status, 2026-11-09: final, not started.**
- A second-model reviewer (sol, high effort) reviewed this plan against the code at a0a2c86, over eight rounds, until it agreed.
- The owner then answered every open decision (below), and the plan was cut to match: 23 steps.
- A final check by the same reviewer agreed with the cut-down plan.

This plan was written after the look, feel and performance plan finished (`docs/PLAN-LOOK-FEEL-PERF.md`, ADR-48 to ADR-59). It answers the owner's question: with no rules in the way, what would make the game better to play, nicer to look at, faster, and more complete?

How it runs:
- Each step is one commit, and `npm run verify` passes at every step.
- Each decision gets its own ADR (ADR-60 onward). BRIEF.md, DESIGN.md, PERF-BUDGET.md, ASSET-PIPELINE.md and CLAUDE.md are updated wherever a rule changes.
- After each phase a second-model reviewer (sol, high effort) reviews the work. Every finding is fixed and re-checked until it agrees.
- "PERF-BUDGET.md's step 14 tables" means the before-and-after tables of the previous plan's step 14, not step 14 of this plan.

## What the review found (2026-11-09, at a0a2c86)

- **Your attempt can't miss.** In the game your attempt is your slider values, exactly (`popTrick` resolves the store's inputs), so once you know a trick's numbers you land it every time. Only the computer can miss: `computerAttempt` adds a normal miss to each rate. A game of SKATE turns into looking up numbers.
- **Landing is yes or no.** A trick lands within 30 degrees of a whole flip and 25 of a half shove (`src/sim/landing.ts`), so a near-miss and a perfect landing look and count the same.
- **Pop height has one job.** The board pops in place (the flight has height and two rotations, no travel), so height only trades airtime for spin. Not addressed: the owner left rolling and obstacles out (2026-11-09).
- **Nothing happens after touchdown.** Frames stop the moment the board lands (rule 4), so a landing has no weight, and a bail looks like a landing with the feet beside the board.
- **Medium already breaks its draw-call gate.** With every optional switch on (feet, legs, foot trails, motion cues), Medium draws 20 in a trick, against a gate of under 20. Measured 2026-11-09 on this build:

  | Tier | Defaults | + foot trails | + legs | Everything on |
  | --- | --- | --- | --- | --- |
  | High | 31 | 32 | 34 | 35 |
  | Medium | 17 | 18 | 19 | **20** |
  | Low | 10 | 11 | 12 | 13 |

  PERF-BUDGET.md's step 14 tables measured only the defaults.
- **Loading has two small gaps left.**
  - At 3 Mbps the stage is its plain colour for about 0.3 s before the loading picture arrives.
  - Medium's first visit grew to 1,158 KB (it was 1,042) for half-resolution occlusion and the grade. The owner keeps that trade (2026-11-09).
- **The build ships an unused transcoder.** three's `KTX2Loader` names its own transcoder with `new URL('../libs/basis/...', import.meta.url)`, so Vite emits a content-hashed copy into `dist/assets/` (584,862 bytes raw). Nobody downloads it, because `src/scene/gltf.ts` points the loader at `public/basis/`.
- **Nothing stops a regression automatically.** Downloads, draw calls, frames after a landing and memory are measured by hand (`scripts/measure/measure.js`), and `npm run verify` checks only the model budgets.
- **Never tested:** phones and touch (the layout has one breakpoint, at 960 px), Firefox, Safari, a real Chromebook, and the live site's Lighthouse score.
- **Assessment stops at the JSON export** (`trick-lab.events/1`, with event times relative to the session's start). Not addressed beyond the export itself: the owner left the class report out (2026-11-09).
- **A reload loses the session's log.** The event log lives only in memory (`assessment.ts` starts it empty, and nothing saves it). An accidental refresh before an export loses the student's work.

## The owner's decisions (answered 2026-11-09)

| # | Question | Answer | What it means here |
| --- | --- | --- | --- |
| 1 | Where the work goes | A new branch, `play-polish-reach`, off `look-feel-perf` | `look-feel-perf` can still be merged and go live on its own |
| 2 | Playwright as a pinned dev dependency, for browser checks in CI | Yes | Step 5; CLAUDE.md's "Do not install Playwright in this project" changes there |
| 3 | What Medium is for | Keep Medium as it is | No Medium spike; Medium keeps the WebGPU renderer, its effects and KTX2 |
| 4 | The game's default way to pop | Timed, with Exact one choice away | Step 7 |
| 5 | Two players on one device | No | Left out |
| 6 | Recorded sounds | No: keep the synthesized sounds | Left out; the new sounds (the scuff, the meter's tone) are synthesized like today's |
| 7 | New deck graphics | Drawn here, three of them, for the owner to approve | Step 15 |
| 8 | Rolling over a kerb, nollie and 180s, a full rider | None of them | Left out, with no spikes |
| 9 | Firefox and WebKit browsers for playwright-cli | Yes, install them | Step 21 |
| 10 | A class report for teachers | No | Left out |
| 11 | A student name in the export | No names | The export carries no name |
| 12 | Hosting | Stay on GitHub Pages | No host move |

## Baseline (a0a2c86, 2026-11-09, PERF-BUDGET.md's step 14 tables, plus the switch table above)

Desktop Chromium, RTX 3060, 1440 x 900, cache off, served by `scripts/measure/serve.ts` with gzip like GitHub Pages.

| What | High | Medium | Low |
| --- | --- | --- | --- |
| Draw calls in the lab, defaults / every switch on (gate) | 31 / 35 (under 40) | 17 / **20** (under 20) | 10 / 13 (under 20) |
| GPU per frame in a trick, feet on | 0.92 to 1.84 ms | 1.38 to 1.51 ms | 0.96 to 1.00 ms |
| Everything on a first visit, dark, feet on | 1,639 KB | 1,158 KB | 410 KB |
| JavaScript, gzip | 595 KB | 595 KB | 362 KB |
| Full scene at 3 Mbps | 5.06 s | 3.97 s | 1.50 s (no models) |
| Frames in the 1.5 s after a landing | 0 | 0 | 0 |

Verify: 51 test files, 780 tests passed, 1 todo; `assets:check` passed.

## Rules this plan changes, and the ones it keeps

**Changes.** Each is made in its step's ADR, with the docs updated in the same commit.

- **BRIEF.md, "Honest and modest: a demo, not a game engine."** The game screen gets an execution step (steps 7 and 8). The lab stays the exact, deterministic experiment.
- **CLAUDE.md rule 4, and PERF-BUDGET's "0 frames after a landing."** After a natural landing, frames run for the settle (step 10), at most `ART.settle.ms`, and only when there is something to show. The new gate (step 10):
  - after the frame that drew the endpoint (`settledAt`), at most the one frame the landing's own write already queued;
  - then none, from the point where R3F reports no pending frame.
- **CLAUDE.md rule 5.** FlightDriver also writes the settle's pose and the dust's uniform (steps 10 and 11).
- **ROADMAP.md, "every new visual feature gets an off switch, and the Low setting uses it."** Kept, with one listed exception: the settle's poses (a sketchy landing's rock, a bail's fall and slide) run on every tier, because they carry information. They cost at most `ART.settle.ms` of frames, and none under reduced motion.

  Low's defaults for the new features:

  | Feature | On Low |
  | --- | --- |
  | Scenery | off |
  | Dust | never drawn |
  | Instant replay | off |
  | Flight path | off, as on every tier |
- **CLAUDE.md rule 14.** The ground asset becomes the ground and the spot, merged into one draw (step 13). Its triangle budget changes, with an ADR saying why: the draw-call gate, not a failing check.
- **CLAUDE.md, verify loop item 4, "Do not install Playwright in this project."** Changed with the owner's yes of 2026-11-09 (step 5): `@playwright/test`, pinned, Chromium only, for CI.
- **`npm run verify`** gains a production build and a download budget (step 3).
- **ADR-49 and rule 15.** The transcoder comes from three's own bundled copy instead of `public/basis/` (step 4). It is still served from this site, never a CDN.
- **The export** becomes `trick-lab.events/2` (step 6, extended in step 7 before the branch merges). Nothing in the app reads exports, and `/1` files stay as they are.
- **The session's log survives a reload in the same tab** (step 17). It is kept in `sessionStorage`, which normally goes with the tab. Chromium can bring it back with a restored browser session or a reopened tab, so a new "New student" action clears it on purpose. Reset still keeps the log (ADR-7).

**Kept:**

- The exact, hand-written flight model, with no physics engine. It is why everything is deterministic, testable and nearly free per frame.
- The demand frameloop everywhere else.
- No DOM inside the Canvas.
- No CDNs.
- Budgets as gates; no limit is raised to pass a check.
- Store actions own the event log, announcements and sound cues.
- Focus moves only where convention 10 says. The instant replay's skip reuses the Pop button in place, so nothing new takes focus.
- Every new control is in the DOM, works by keyboard, and says what changed.

## Draw-call ledger (the lab in a trick, every switch on, the worst case)

The gates are strict: under 20 on Low and Medium, under 40 on High. Every visual step must fit this table. Step 1's measurement checks every switch combination, and the browser checks (step 5) enforce it in CI.

| | High | Medium | Low |
| --- | --- | --- | --- |
| Today, every switch on (measured 2026-11-09) | 35 | 20 (over) | 13 |
| Step 2: the legs' two meshes drawn as one | -1 | -1 | -1 |
| Step 13: the spot, merged into the ground's draw (on High it also casts a shadow) | +1 | 0 | 0 |
| Step 11: dust in the settle, High only (it can overlap the motion cues and the trails, so it counts in full) | +1 | 0 | 0 |
| Step 14: flight path and ghost-board outlines, built into the foot trails' geometry and material (one draw for trails and path, on or off) | 0 | 0 | 0 |
| **Worst case** | **36** | **19** | **12** |

The instant replay's fisheye (step 12) folds into the existing grade pass, so it adds no pass. After this plan Medium has no room left: anything new on Medium replaces something.

## Phase A: foundations (no visible change)

### 1. The measurement, upgraded first
Later steps depend on these changes to `scripts/measure/measure.js`:
- **URLs classified by pathname**, not by suffix, so `?v=` versions (step 18) and hashed names still count.
- **Three visit modes:**
  - **cold:** a fresh browser context, cache off;
  - **HTTP cache:** the same context, reloaded;
  - **service worker:** the same context, after the worker is active (step 18).

  From step 18 on, the cold and HTTP-cache modes load with `?nosw`, so no worker registers and nothing is bootstrapped during them.
- **Every switch combination's draw calls**, per tier, in the lab and on the welcome screen: feet, legs, foot trails, motion cues, and later scenery and flight path. This is the ledger's check.
- **Landings by the store, not the frameloop.**
  - Until step 10 exists, a landing's frames are counted from the landing.
  - From step 10 on, they are counted against its gate: from the endpoint frame (`settledAt`) to the point where R3F reports no pending frame, at most one; after that, none.
  - The frameloop switching to `demand` no longer counts as the end.
- **A readiness flag per Canvas.** `stageReady` is sticky across tier changes, so it can't say a new root is ready. Under `?debug`, PerfProbe numbers each Canvas mount (`__trickLabPerf.root`) and keeps a per-root `ready` flag.
  - **Every startup publication must be finished.** That is every write or invalidate a root's startup makes after its first frames:
    - the root's scene is revealed (SceneEnvironment's `reveal`, after the environment map and the parallel compile where the tier has them);
    - the effects are created, where the tier has them;
    - every model of the tier has been shown (`allShown`);
    - `stageReady` is published. StageReady sets it on the animation frame after its after-effect (`TrickScene.tsx`), and that store write asks for one more frame. On later roots it is already true, because it is sticky.
  - **Ready is decided after a render.** PerfProbe's single after-effect sets `ready` after a frame's render, when all of the above hold. The frame that `stageReady`'s write asks for is therefore drawn before `ready` is set, never after it.
  - **The list is the contract.** Any later step that adds a deferred startup write or invalidate adds it to this list. The cold-start regression in step 10 catches one that was missed.

  Steps 5 and 10 use it.
- **Portable probes split from Chromium-only ones.** Draw calls, frames, the store's flags and bytes from resource timing are portable. CDP network throttling, CPU slowdown and WebGL timer queries are Chromium-only. In Firefox and WebKit (step 21) the throttled loads and GPU times are reported as unavailable, not guessed.
- **Done when:** a run on a0a2c86's build reproduces PERF-BUDGET.md's step 14 tables within their stated ranges, and prints the switch table above.

### 2. Medium back under its gate
- **The fix:** the legs' two skinned meshes (opaque shanks, thighs fading toward the hips) become one. A single opaque material does the fade as a dither (screen-door), so solid and fading parts share one draw on every tier. The dither exists twice, GLSL for WebGLRenderer and TSL for WebGPURenderer, both in the shared resources (rule 7).
- **Checked:** in the six poses (rest, rising, edge-on, inverted, the catch, landed) against today's look. The legs stay off by default (ADR-48).
- **Done when:** step 1's every-switch run shows High 34, Medium 19 and Low 12.

### 3. A download budget in `npm run verify`
- **`verify` ends with `vite build`** (not `npm run build`, which would typecheck again), then a new `npm run bundle:check` (`scripts/check-bundle.ts`).
- **Each first visit is listed explicitly** in `scripts/lib/bundleBudget.ts`, per tier, theme and feet setting:
  - the entry's import graph and the tier's lazy chunks, from `dist/.vite/manifest.json` (`build.manifest: true`);
  - the public files fetched at run time: the tier's models (`modelUrls.ts`), the theme's loading picture, the transcoder on Medium and High, and the font.

  Shared files are counted once. An emitted file nobody fetches (today's spare transcoder) counts nowhere. Sizes are compressed by `serve.ts`'s rule: gzip for HTML, JS, CSS, JSON, SVG, WASM and GLB; WebP and WOFF2 as they are.
- **Budgets:** the sizes in PERF-BUDGET.md's step 14 tables plus about 5 percent, per tier and per file. The check prints a table like `assets:check`, and a failure names the file.
- **Done when:**
  - the listed inventory for each tier equals the requests step 1's cold run records;
  - a test with an incompressible fixture (random bytes whose gzip size exceeds a file's budget) fails the check;
  - PERF-BUDGET.md documents the gate.

### 4. One transcoder, not two
- **Use the copy Vite already emits.** Drop `setTranscoderPath` in `gltf.ts` (three's `KTX2Loader` then loads its own `WASM_JS_URL` and `WASM_BIN_URL`, and hands them to its workers), `public/basis/`, the copy step in `npm run assets`, and that section of `assets:check`.
- **A side benefit:** a three upgrade now changes the transcoder's file name by itself, so no cache can serve a stale one.
- **Done when:**
  - a build with `--base=/trick-lab/` loads its textures in a browser;
  - step 1's run shows one transcoder download of the same size;
  - `dist/` is 584 KB smaller;
  - ADR-49 has an Update paragraph, and CLAUDE.md's commands, layout and rule 15 are updated.

### 5. Browser checks in CI
`@playwright/test`, pinned, Chromium only (the owner's yes, 2026-11-09), run in CI after the build as `npm run test:browser`. It is not part of `verify`, which stays quick and needs no browser.

- **Rendering without a GPU.** Chromium runs headless with SwiftShader WebGL2 (`--use-angle=swiftshader --enable-unsafe-swiftshader`). Each test asserts the tier from the store and the renderer through `?debug`: `WebGPU on WebGL2` for High and Medium (there is no WebGPU adapter in CI), and `WebGL` for Low. So a fallback can't pass silently as High. If SwiftShader can't start the WebGPURenderer's WebGL2 backend, the step stops and says so.
- **What it checks:**
  - every screen loads on every tier with no console errors;
  - draw calls fit the ledger for every switch combination;
  - step 10's settle gate: at most the one queued frame after `settledAt`, then none;
  - the soak test (below).
- **The soak test** (roadmap "later" item 9):
  - five warm-up tricks, then 50 tricks switching High and Low every ten;
  - after each switch, the Canvas remounts and the old tier's models are released (ADR-48).
- **When a soak sample is taken.** After a switch, wait for the new root's `ready` flag (step 1). Then:
  1. Wait out `RELEASE_AFTER_MS` (1,000 ms) plus two frames, so the old models are released and the old root is torn down.
  2. Collect garbage twice (`--js-flags=--expose-gc`).
  3. Sample.
- **What must hold:**
  - geometry and texture counts at a tier equal that tier's first sample;
  - heap growth from the first sample to the last stays under a limit set from a hand-run soak in this step (about 2 MB expected), then fixed in the test.
- **Timings are not checked in CI.**

## Phase B: landing is a skill

### 6. Graded landings: clean, sketchy, bail
- **Three grades.** `src/sim/landing.ts` gets `CLEAN = { roll: 10, yaw: 8 }` beside the tolerances, and `gradeOf(rollTotal, yawTotal)`:
  - **clean:** inside both clean limits;
  - **sketchy:** inside the tolerances, outside a clean limit;
  - **bail:** outside a tolerance.

  `isLanded` stays exactly as it is, so recognition, the catch and the feet still decide land or bail by one rule (ADR-36). The catch's timing does not change (`PHASE.catch`, `rideCatch`).
- **`TrickResult` gains `grade`.** Every preset lands clean at pop 0.35 m (the largest preset miss is the shove's 6.9 degrees), asserted in `tricks.test.ts`.
- **Reachable on the sliders.** `cleanSetup(call)` (pure) finds the slider-grid setup that lands each settable trick cleanest. Every settable trick has one; checked 2026-11-09 over every pop and rate step. The double kickflip, double heelflip and double tre have exactly one: pop 0.55 m, flick ±3.0 (and scoop 1.5 for the tre).
  - Tests use these reachable inputs, not `aimFor`'s exact rates. Those snap off the grid: a double kickflip at `aimFor`'s pop of 0.6 m snaps from 2.859 to 2.9 rev/s and misses by 10.3 degrees, which is sketchy.
  - The computer's own tests keep `aimFor`, because the computer is not on the slider grid.
- **The look.** A sketchy landing's shoes come down off the bolts, sliding along the deck by an amount from the miss. They stay on the grip: `boardVolume` clearance checks run for roll, yaw and combined misses, in both stances, both directions. The rock that follows comes in the settle (step 10). Clean is today's motion exactly, so `feet.pinned.test.ts` does not change.
- **The words.** "Landed clean", or "Landed, sketchy: 18 degrees past on the flip" (outcome card, announcer, DESIGN.md 4). The celebration says "Clean!" for clean and keeps "Landed!" for sketchy. The landing sound gets a scuffed variant for sketchy, synthesized like today's (ADR-58).
- **The game.** On Hard a set or a copy counts only if clean, for both you and the computer, and the guide says so. Easy and Normal count sketchy. This is a scoring rule in `afterAttempt`; the physical land or bail is unchanged.
- **The export becomes `trick-lab.events/2`.** It adds:
  - `startedAt`, the session's start on the wall clock, from an injected `Date` clock;
  - `grade` on `trick.resolved`.

  The export carries no name (the owner's decision). Step 7 extends `/2` before the branch merges, so no incomplete `/2` file exists outside the branch.

### 7. A timed pop in the game: the core
- **The sliders still say what you are going for**, so the physics stays the student's job.
- **A store-owned attempt.** The skate slice gets `pendingPop: { id, startedAt, intended, level } | null`. The timed pop is the student's; the computer never uses the meter.
  - Pop (or Space) starts it, with a snapshot of the sliders as `intended`.
  - The sliders are disabled while the meter runs.
  - Pop again releases.
- **One sweep.** The sweep lasts `METER_MS` (1,200 ms). Each level's band (a centre and a half-width in ms, at least 50 ms so it spans several frames) is in `SKATE_LEVELS`.
  - The release error `e` is the release time minus the band's centre, in ms.
  - Inside the band, the attempt is exactly `intended`.
  - Outside it, flick and scoop scale by `1 + k * (|e| - halfWidth) / (METER_MS / 2)` in the direction of `e`: early under-rotates, late over-rotates. `k` is per level. Pop is unchanged.
- **Timing comes from the store.** The store reads its injected clock at each action and gets an injected scheduler for the timeout: `schedule(fn, ms)` returns a cancel function, and is `setTimeout` in the app and a fake in tests. With no release, the timeout releases at the sweep's end.
  - Each callback carries the attempt's `id`, so a stale or second callback (a release and the timeout in the same tick, a timeout after the game ended) does nothing.
- **Cancelled with no attempt and no letter**, and announced ("Pop cancelled"), on: a screen change, quit, a new game, Reset, a dialog opening, or the tab being hidden (`visibilitychange`).
- **Repeated presses:** a press while a flight plays is ignored, as today.
- **The meter** is a DOM bar on the turn card (`.skate__meter`), started by the same action that records the start. It is animated in CSS, so it can trail the clock by at most a frame. It is `aria-hidden`; the announcements carry the state.
- **The pure function** `timedAttempt(intended, releaseMs, level)` lives in `src/sim/skate.ts`. Tests:
  - for every settable trick, at its `cleanSetup` inputs, on every level, a release at the band's centre lands clean;
  - a release at the sweep's end bails;
  - the timeout, cancellation and stale-callback cases above, with the fake clock and scheduler.
- **The computer goes through the same mapping.** It draws a release time from a spread per level instead of today's normal miss per rate.
  - Calibration: "made" means the call counts under the rules (a set landed as called, or a copy landed as set, with Hard's clean rule).
  - A seeded simulation records the made rate per call and per level before and after, including after a level's calls run out (ADR-44). The table goes in the ADR, and every difference over 5 points is called out as intended or fixed.
  - Today's miss also adds flick or scoop to an axis the call doesn't use, and the new mapping never does. The ADR says so.
- **Timed is the default** (the owner's decision, 2026-11-09). Exact is today's game, one choice away at the game's start ("How you pop: Timed or Exact"):
  - remembered under `trick-lab.pop-mode` (a preference: never logged, not exported) and announced.
- **Feedback.** After a release, the announcement says how it went: "A little late: 8 percent too much spin. Landed, sketchy." A timeout says "Released at the end: too late".
- **The record.** `trick.popped` records the mode, `e`, `intended`, and the inputs the attempt used (export `/2`).
- **Docs:** BRIEF.md (the game), DESIGN.md 11 (the meter) and CLAUDE.md rule 9 (the new class).

### 8. A timed pop: keyboard, touch and by ear
- **One activation per press:**
  - **Space** keeps today's rule. On the game and lab screens it pops from anywhere that is not a native control (`spaceIsNative`). On a focused Pop button it is the button's own click, so one press is one action. Key repeat is ignored, as today.
  - **Enter, a click, a tap or a switch** all arrive as the Pop button's click.
  - The welcome screen has no pop shortcut, as today.
- **By ear.** With sound on, the meter has a rising tone and a click at the band's centre, synthesized like today's sounds.
  - Both are scheduled on the `AudioContext` clock from the same start, not through the cue queue: today's `STAGGER` delays queued cues (`player.ts`), and would move the click away from the band.
  - Tested with other cues queued.
  - If audio is unavailable or still locked, the start announcement says so and offers Exact.
- **Announcements:** only the start ("Meter running: press Pop again in the band") and the result go through the live region, never the sweep.
- **Under reduced motion** the meter still fills, since it is the mechanic, but with no easing or pulse.
- **Exact stays fully usable** with sound off, under reduced motion, and without audio.
- **A recorded pass:** keyboard only, touch (emulated), and by ear with the screen covered. It goes into DESIGN.md.

### 9. Records and today's trick
- **Records**, under `trick-lab.records` (versioned):
  - for each named trick, the first date it was landed and its best grade;
  - games won and lost against each level, and the current streak.

  Records are never logged, never exported and not cleared by Reset. Store actions write them (`resolve`, `scoreSkate`), never components (rule 1).
- **A trick collection** on the welcome screen: the 15 settable tricks plus the ollie, as a grid. Landed and clean are marked in text, not only colour. The new classes go into the DESIGN.md contract.
- **Today's trick:** `dailyTrick(date)`, pure and seeded from the local date. It picks a named trick and a pop that `cleanSetup` can land it clean at, shown in the lab as an extra objective. Landing it counts once a day, with a day streak. In the lab, a clean landing means precise sliders, which is the physics lesson.
- **"Clear records"** asks for confirmation first.

## Phase C: feel

### 10. The settle: its state, the sketchy rock and the bail
- **Shared state.** The playback slice gets `settledFlightId`.
  - The settle plays after a natural landing (FlightDriver reached progress 1 while playing), and only when there is something to show: a sketchy rock, a bail, or dust (step 11: High, with the Dust switch on). A clean landing with no dust has no settle and no extra frames.
  - FlightDriver animates `s` from 0 to 1 over `ART.settle.ms` (about 400 ms), asking for each next frame with `invalidate()`, then calls `settled()`.
  - `resolve` marks the flight settled at once, with no animation, under reduced motion, without a 3D view, on a forced resolution (`togglePause` without motion), and when there is nothing to show.
  - `settled()` is a store write: never logged, never announced.
- **One pose for everyone.** `writeSettlePose(out, flight, s)` and `writeSettleFeet(out, flight, s)` are pure, in `src/sim`, and allocation-free. The board, the shadow disc, the shoes, the legs and `describeScene` all read the same result. `Pose` gains an x and z offset for the slide.
  - **A sketchy rock:** the board rocks once about its wheels' contact line, a few degrees, settling flat, and the shoes ride it.
  - **A bail:** the board falls onto its nearest resting side, wheels or grip down, and slides a short way away from the feet, toward the toe side (the feet stepped off to the heel side, `MOTION.bail`).
  - There is no truck-compression dip, because the board is one rigid model.
- **Contact, tested.**
  - For every `s`, the board's lowest point is within 1 mm of the pad (`contactLift`), including resting on a side and inverted.
  - A riding shoe stays on the grip, and a sliding board never passes through a bailed shoe.
  - Both stances, both directions, roll, yaw and combined misses.
- **Endpoints.**
  - The settled pose shows only at progress 1 of the settled flight. A scrub below 1 shows the flight; a scrub back to 1 shows the settled pose.
  - A scrub, a new pop or a screen change during the settle ends it at once (`settled()`). A tier change settles it in the quality write ("Scoped to a flight and a Canvas", below). Either way, the new view shows that endpoint.
  - Two interruptions have no FlightDriver left to finish them, so the store does it. Today `setReducedMotion` and `setSceneUnavailable` act only on unresolved flights (`inFlight`), and a settling flight is resolved. So both actions also settle a resolved, unsettled flight (`settledFlightId !== flightId`):
    - reduced motion turned on during the settle;
    - the 3D view failing during the settle.

    Tests cover both, with the store alone and no Canvas.
  - `describeScene` describes the settled board ("The board slid off, grip side down").
- **Frames, and where the gate starts.** PerfProbe makes the one render call (rule 5), after FlightDriver has posed. In R3F 9, a store write inside `useFrame` that invalidates queues one more frame (`internal.frames = 2`), and after-effects run in the order they were registered. The plan works with both facts instead of assuming them away.
- **One ordered completion hook.**
  - PerfProbe registers the one after-effect for the settle, on mount (R3F's `addAfterEffect`, as StageReady uses). It runs after the frame's render and is not a `useFrame`, so rule 5 holds.
  - FlightDriver never registers its own. In the frame where it poses `s = 1`, it only leaves a hand-off (`endpointPosed = flightId`, in a scene-local object like the playhead).
  - In the same frame, after the render, PerfProbe's after-effect sees the hand-off. In one call it records that frame as the flight's endpoint frame (`__trickLabPerf.settledAt` under `?debug`, a frame number), calls `settled()`, and clears the hand-off.

  So settling and recording happen together, after the frame that drew the endpoint, whatever the registration order. The logic is a pure module (`settleHandoff.ts`) with its own tests.
- **A flag-only write queues nothing.** `InvalidateOnStoreChange` compares the store's state with the previous one, and ignores a change that touches only `settledFlightId`. So the animated settle ends exactly at `settledAt`.
- **Settled by the store** (`resolve`, or an interruption). The store sets `settledFlightId` in the same write as its own change. PerfProbe's after-effect records `settledAt` at the first frame it draws with the flight settled, if not already recorded.
- **The one queued frame, allowed and bounded.** A natural landing with nothing to settle is the main case: a clean landing on Medium or Low, or on High with Dust off. There `land()` runs inside FlightDriver's frame, so `resolve`'s write (status, result, the cue, the log) queues one more frame. That frame draws the same endpoint. Today's landings already draw it.
- **Scoped to a flight and a Canvas.** A landing can change the tier: `resolve` calls `noteTrickPace`, which can step the quality down, and the Canvas is keyed on the tier, so it remounts. A new root hides its content until it reveals, then asks for frames for the reveal, the effects and models arriving. None of those frames are the settle's.
  - **Keys.** `settledAt`, the hand-off and the endpoint record are keyed by the flight and the root (`__trickLabPerf.root`, step 1).
  - **On unmount,** PerfProbe removes its after-effect and clears its hand-off, and a sample in progress is dropped and restarted on the new root, never continued.
  - **A tier change while a flight is settling settles it**, in the same write as the quality change, as the reduced-motion and 3D-view interruptions do. That includes a step-down from inside `resolve`, so the new root starts with the flight already settled and never animates the settle.
  - **On any root, the endpoint is recorded only once the root is `ready`** (step 1). This covers the first root of a cold load too: a flight can resolve while the models are still arriving.
    - The endpoint is the frame in whose after-effect the root is first both `ready` and showing the settled flight. That is decided in the same after-effect that sets `ready`, so no further frame is needed to record it.
    - Frames before then belong to startup or the remount, and step 1 measures them as loading.
- **The gate**, per flight and root:
  1. Once the flight is settled and the root is `ready`, the measurement waits until the frameloop is `demand` and R3F reports no pending frame (`internal.frames === 0`, under `?debug`). That is an exact point, not a delay.
  2. From `settledAt` to that point, at most one frame is drawn: the queued one.
  3. After it, none, over the measurement's window.
- **Tests:**
  - `settleHandoff.ts`: completion and recording happen in the same call, and an after-effect that runs before or after the hand-off is set still records the endpoint frame;
  - the real store with a stub `invalidate`: `settled()` alone requests no frame, and each interruption requests exactly one;
  - in a browser (step 1's run, and `test:browser`, step 5), with the counter checked against `settledAt` and the idle point, across the switch from `always` to `demand`:
    - a natural clean landing at normal speed with nothing to settle;
    - an animated settle (a bail);
    - a reduced-motion interruption during a settle;
    - a resolve under reduced motion;
    - a clean landing that triggers the step-down (High to Medium, so the Canvas remounts inside `resolve`): the old root's sample is dropped, the new root records its endpoint only after `ready`, and its gate holds;
    - a tier change during a bail's settle: the flight is settled in the quality write, and the new root's gate holds;
    - a cold start with the models held back (a delayed route in the test) and `stageReady` still false. A flight is popped and resolved before the models arrive, then the models arrive. Checked:
      - the endpoint is recorded only after `stageReady`'s write and the frame it asked for;
      - the gate holds from there.
- **Docs:** CLAUDE.md rules 4 and 5 and the PERF-BUDGET gate are updated, with the one queued frame written into the gate.

### 11. Dust (High only)
- **A small puff at the wheels** on touchdown, during the settle: one points draw. Its shader is driven by a time uniform that FlightDriver sets (no per-frame allocation, rule 6), and it is built once in `resources.ts` with its TSL twin (rule 7).
- **A "Dust" switch** in View, like "Motion blur": persisted, never logged, announced, on by default. It is shown on High only, since no other tier draws dust. With it off, a clean landing has nothing to settle (step 10).
- **Not on** Medium or Low, and not under reduced motion.
- **Within the ledger:** +1 on High.

### 12. Instant replay
- **After your made set or copy in the game**, the flight plays once more in slow motion from a filmer's camera: low, close and wide, framing the whole flight from one fixed spot (no per-frame camera code).
  - On High and Medium it has a fisheye bend folded into the grade pass (numbers in `ART.post`).
  - On Low, which has no grade pass, it uses a wider lens only.
- **Its own lifecycle, apart from scoring:**
  - `startReplay()` saves the rate, the camera view and the orbit target, then plays the shown flight from 0 at the replay's slow rate.
  - At progress 1 FlightDriver calls `endReplay()`, not `land()`. `resolve` returns early once a flight has a result, so `land()` would leave the status playing.
  - `endReplay()` restores what was saved and shows the settled endpoint, without a second settle.
- **Skipping.** During the replay the Pop button reads "Skip replay". It is the same element, so focus never moves (convention 10). Escape skips too, unless a dialog owns Escape.
- **Ended early** (with `endReplay()`) by: a screen change, quit, a tier remount, or a dialog opening.
- **Two interruptions are ended by the store.** A replaying flight already has its result, so `inFlight` is false and today's handlers can't finish it. So `setReducedMotion` (turned on) and `setSceneUnavailable` call `endReplay()` themselves when a replay is running, since FlightDriver may be gone. Tests cover both, with the store alone and no Canvas.
- **Nothing else moves during the replay:** manual pops and the computer's auto turn (ADR-46) wait.
- **Excluded from the step-down:** replay frames are not recorded for pace (`recordFrame`, ADR-59).
- **Tests:** after a replay, the events, objectives, records and pace samples are unchanged; the rate, view and orbit are restored; the auto turn waits and then plays; a skip and a natural end leave the same state.
- **An "Instant replay" switch** in View: persisted, never logged, on by default (off on Low and under reduced motion).

### 13. A spot
- **A kerb and a low ledge near the pad**, generated with the ground (`src/asset/ground.ts`, `spot.ts`). They reuse the ground's concrete material and textures, with their own UVs at world scale, and are merged into the ground's mesh. So `ground.glb` stays one draw on Medium and High.
  - The ground's triangle budget rises from 64 to about 2,000 in `BUDGETS`, with an ADR saying why: the draw-call gate.
  - On Low, the same geometry merges into the flat-shaded ground plane in `resources.ts`.
- **On High** the merged ground casts a shadow: +1 in the shadow pass.
- **A "Scenery" switch** in View: persisted, never logged, on by default on Medium and High, off by default on Low.
  - The spot's triangles come last in the merged index buffer, so the switch hides them with the geometry's draw range: still one draw, and no second mesh.
  - On Medium and High, `GroundModel` sets the range on the model's own geometry. That geometry belongs to the cache, so the change is limited to the draw range and is reset when the model is released (rule 7).
- **Never in the way.** It never covers the board or the feet in any camera view: checked in the six poses and in every view. It sits inside the fog.
- **Scenery only.** The board still pops in place, so nothing is cleared (the owner left rolling out, 2026-11-09).

### 14. Flight path and ghost-board outlines (roadmap item 5)
- **A "Flight path" switch** in the lab's View: persisted, never logged, off by default on every tier.
- **What it draws:** a thin ribbon through the deck's centre over the whole flight, and five deck outlines at fixed moments.
  - Built once per flight, into the same geometry and material as the foot trails (`footPathGeometry.ts`), so trails and path together are one draw, whichever are on.
  - Both shader twins learn the new ribbons (rule 7).
- **`describeScene` mentions it.**

### 15. Pick your deck
- **Four deck graphics:** today's, plus three new ones drawn here as SVGs in `assets/source/`, in the style of today's. The owner approves them before they are built in (the owner's choice, 2026-11-09).
- **Built for High and Medium as KTX2 textures** in `public/models/decks/`, each downloaded only when chosen. The default graphic stays inside the GLB.
- **A registry in `gltf.ts`**, which owns the cache (rule 7), keyed by model URL:
  - it keeps each model's original deck map and the alternates it loaded;
  - each choice carries a request number, so a slower, older download that finishes late is disposed instead of applied;
  - the persisted choice is applied to any model that loads later, including after a tier change;
  - `disposeModel` frees the original and every alternate exactly once, whichever is attached.
- **Textures match the GLB's own:** orientation (glTF's `flipY` false), colour space (sRGB), and filtering and mips.
- **On Low:** each graphic's main colour, in Low's toon style.
- **A "Deck" choice on the welcome screen:** a radio group, persisted under `trick-lab.deck`, never logged. A failed download keeps the current deck and says so.
- **Budgets:** each texture gets a new `BUDGETS` entry that `assets:check` enforces.
- **Tests:** rapid changes of choice, a failed download, back to the default, and repeated tier changes, with every texture disposed exactly once.

## Phase D: loading and offline

### 16. A placeholder in the page
- **A tiny copy of each theme's loading picture** (32 x 16, blurred, about 1 KB for both themes) is inlined as a CSS data URI on the stage, so the stage shows the scene's colours from the first paint until the full picture replaces it.
  - `scripts/still/write.ts` writes it into a generated stylesheet beside the design files.
  - `assets:check` checks it matches the stills.
- **Try preloading the full picture** from the theme script in `index.html`. Keep it only if step 1's run shows the UI's first paint does not slip at 3 Mbps.
- **Done when** the stage is never its plain colour at 3 Mbps (measured). ADR-56 gets an Update paragraph.

### 17. The session survives a reload
Today a reload loses the log. This step comes before the service worker, whose update prompt (step 19) offers a reload.

- **Saved in this tab, and bounded.** The assessment slice saves the session to `sessionStorage` (`trick-lab.session`, versioned):
  - **What:** the events, the completed objectives, `startedAt` (step 6), the id counter and the last `t`.
  - **When:** only when the assessment data changes (events or objectives), never on a UI preference. Writes are coalesced: at most one a second, trailing. Every slider change logs an event (`inputs.ts`), and Web Storage writes block the page.
  - **Flushed** on `pagehide`, on the tab being hidden, and right before the update prompt's reload.
  - **A cap of 1 MB per snapshot.** Past it, saving stops and the failure flag (below) is set. The in-memory log and the export stay complete (ADR-8): only the reload copy stops.
  - **A responsiveness check:** a long-session test with 5,000 events measures one snapshot's serialization and write. It must stay under 5 ms on the desktop, and is also measured at 4x CPU slowdown, recorded in PERF-BUDGET.md.
- **Where it can come back.** `sessionStorage` belongs to the tab and normally goes when the tab closes. But Chromium restores it with a restored browser session or a reopened tab, so nothing here promises that closing the tab erases it.
- **"New student".** On the welcome screen, with a confirmation that offers Export first. It clears both the saved session and the in-memory one, and starts a fresh session. This is how a shared device is handed over on purpose. Reset keeps its meaning (ADR-7: the log is kept, because a reset is itself an assessable action). After New student, focus goes to the welcome screen's heading (`#screen-heading`), as after a screen change (convention 10).
- **Restored on load.** The store's creation reads a valid saved session:
  - events and objectives come back as saved, and ids continue from the last one;
  - `t` never decreases: the restored offset is the larger of the last saved `t` and the wall-clock time since `startedAt` (a wall clock can move backward; the performance clock can't). From there `t` advances on the injected monotonic clock, as today;
  - a `session.restored` event is logged, since a reload is itself something a teacher may want to see.

  A game or flight in progress is not restored, and the restore event says so. Saved data that is malformed or from another version is ignored, not guessed at.
- **When saving fails.** If storage is blocked or full, or the snapshot passes the cap, the error is caught: saving stops for the session, the app keeps working, and the store remembers that saving failed. A reload prompt (step 19) then says the log will be lost and offers Export first, instead of promising anything.
- **Tests, with the real store, fake storage and fake clocks:**
  - create, log, recreate on the same storage: the events are back and ids continue;
  - `t` keeps increasing when the wall clock moved backward between saves, and when it moved forward;
  - storage blocked, a write that throws for quota, and the cap reached: no crash, saving is off, and the flag is set;
  - writes are coalesced: many slider changes in a second make one write, and a hidden tab flushes;
  - New student clears both copies and focuses the heading;
  - malformed and old-version saved data are ignored.
- **Docs:** CLAUDE.md rule 1 is unchanged, since only the store writes the log. README's assessment line, ADR-7 and ADR-8 get Update paragraphs.

### 18. A service worker: caching
- **Hand-written, with no new dependency.** A small Vite plugin emits `sw.js` with the build's version and base path baked in. `main.tsx` registers `${BASE_URL}sw.js` with scope `BASE_URL` (`/trick-lab/` on Pages), in production builds only.
- **Strategies:**
  - **The page itself:** network first, falling back to the cached copy when offline.
  - **Hashed build files** (the JavaScript, CSS, font and, after step 4, the transcoder): cache first.
  - **Models and pictures:** cache first, by a content version in their URLs (`?v=`). The same Vite plugin computes it at build time, so it can't drift, and `modelUrls.ts` and the loading picture read it. A changed model gets a new URL.
    - The digest: `?v=` is the first 16 hex characters of the SHA-256 of the file's exact bytes.
    - The same function encodes it in the plugin, the worker and the page. It lives in one small module that the plugin also inlines into `sw.js`, and a test checks all three agree.
    - Hashing every model before parsing (step 19; the largest today is 610,552 bytes) is timed in the Chromebook load check (step 22).
  - **Nothing is fetched ahead of use.** Each student caches only what they used, so Low gets no 2 MB background download on a school network.
- **Keeping the measurement clean.** A page loaded with `?nosw` does none of the following:
  - registers no worker;
  - posts no bootstrap list (step 19), so the worker fetches nothing on its behalf.

  If a worker already controls the tab, its fetch handler passes every request from a client whose URL has `nosw` straight through.
- **Measurement modes.** Step 1's cold and HTTP-cache modes load with `?nosw` in a fresh context. Only its service-worker mode loads without it.
- **Tests:**
  - a pure `strategyFor(url, base)` is unit-tested;
  - after a cold or HTTP-cache run: `navigator.serviceWorker.getRegistrations()` is empty, `caches.keys()` is empty, and no request came from a worker;
  - step 1's run gets its service-worker mode.

### 19. A service worker: offline and updates
- **Bootstrap.** On its first install, the worker caches what the page already used before the worker existed: the page posts its same-origin resource URLs (`performance.getEntriesByType('resource')`, plus the page itself), and the worker adds them. The first visit is then offline-ready for its tier and screens, without fetching any other tier.
- **Activation.**
  - The first worker claims its clients.
  - A later worker waits (the browser's default) until no tab runs the old version. Then, in `activate`, it deletes old caches, which no client can still need.
  - An open tab never mixes versions.
- **Version skew.** Waiting activation keeps the worker coherent, not the files. A Pages deployment replaces the whole site, so a tab still running version A can ask for an A file that is gone:
  - **a lazy chunk it never fetched:** a 404;
  - **a model:** `?v=A` returns B's bytes, because the server ignores the query.

  The policy:
  - **Only good responses are cached:** 2xx, and for a versioned file, bytes whose hash matches its `?v=` (checked in the worker with `SubtleCrypto`).
  - **A mismatched model never reaches the old page's parser.**
    - The worker answers a mismatch with an error response (`Response.error()`), not B's bytes, and tells the page (`postMessage`).
    - The page checks too, so this holds without a worker (a first visit, `?nosw`, a browser without one).
      - Today `gltf.ts` parses from bytes only when the early download exists (`takePrefetched`). Otherwise it hands the URL to three's own `load`, which fetches and parses in one go.
      - That path changes to fetch the bytes itself and parse them the same way. So every model's bytes are hashed against `?v=` before `loader.parse`, and a mismatch is treated as a failed load.
    - Either way, the old page falls back to what it shows today when a model fails: the simple board, with the announcement (ADR-15, AssetBoundary). It never shows a model from another build.
  - **A missing chunk** (a 404 for a lazy chunk A never fetched) fails as it does today, and each kind has its own fallback:

    | Missing chunk | What A shows |
    | --- | --- |
    | `TrickScene` | SceneBoundary: the scene as unavailable |
    | `BoardModel` | AssetBoundary (`Board.tsx`): the simple board |
    | `nodeRenderer` | TrickScene's catch: the WebGL renderer instead (Medium and High) |

    Vite's `vite:preloadError` also fires for all three, since it covers dynamic imports and `React.lazy`.
  - **A tab on an older version is told.** A `vite:preloadError`, or a mismatch from the worker or from `gltf.ts`, shows "A new version of Trick Lab is ready" with a Reload button: DOM, announced, and focus is not moved.
  - **The page never reloads itself.** The prompt is the only way, so the student picks the moment.
  - **Reloading keeps this tab's log** (step 17). If saving failed, the prompt says the log will be lost and offers Export first.
- **The kill switch** is documented: deploy a `sw.js` that unregisters itself and clears its caches.
- **Checked in a real browser** (`test:browser`, step 5, and playwright-cli):
  - fresh profile, one visit, browser closed, reopened offline: the app loads;
  - version A open in a tab while version B deploys: the tab keeps working, and the next load is B;
  - **late loads after a deployment, missing chunks:** with A open and B deployed, A requests a lazy chunk it never fetched (the 404). This is tested once for each of `TrickScene`, `BoardModel` and `nodeRenderer`. Each time A shows that chunk's fallback from the table above, plus the reload prompt;
  - **late loads after a deployment, a mismatched model:** with A open and B deployed, A switches to a tier whose model it never fetched, and B's model has different bytes. Checked:
    - B's bytes never reach A's parser (a spy on the parse);
    - A shows the simple board and the reload prompt;
    - nothing from B is cached under an A key;
    - this holds with the worker, and with `?nosw` (the page's own check);
  - **the reload:** it lands on B, with the tab's log restored (step 17);
  - a failed update (an install error, or `sw.js` returning 404): A keeps working;
  - the kill switch recovers a profile stuck on a bad worker.
- **Done when:**
  - a repeat visit at 3 Mbps shows the full scene about as fast as a first visit at full speed;
  - after one visit, that visit's tier and screens load offline (other tiers need the network).

## Phase E: reach

### 20. Phones and touch
- **Checked in Chromium with touch emulation** at 360 x 780, 390 x 844, 768 x 1024 and 1024 x 768:
  - no sideways scroll;
  - touch targets at least 24 px (WCAG 2.5.8), and 44 px for the main actions;
  - the stage readable in portrait;
  - the timed pop playable by tapping;
  - the dialogs usable.
- **Fixes:** the design side makes them in `app.css`, and DESIGN.md gets the phone layout.
- **Real phones** (iOS Safari, Android Chrome): the owner, from a checklist.

### 21. Firefox and Safari
With the owner's yes (2026-11-09), Firefox and WebKit are installed for playwright-cli, for testing on this machine only. Installing these browsers adds no project dependency.

- **Step 1's portable probes and a smoke pass in Firefox and WebKit**, checking:
  - the renderer starts (WebGPU, or its WebGL2 fallback);
  - the KTX2 textures load;
  - sound starts on the first gesture;
  - the step-down works;
  - the layout holds;
  - the service worker installs.
- **What isn't available there:** throttled loads and GPU times are Chromium-only, so they are reported as unavailable.
- **Fixes**, and a "Browsers" table in PERF-BUDGET.md.

## Phase F: wrap-up

### 22. Measure everything
- **Before (a0a2c86) and after**, from step 1's script, into PERF-BUDGET.md, with the ledger checked:
  - all three tiers, both themes, every switch combination;
  - cold, HTTP-cache and service-worker visits.
- **The owner, on a real Chromebook,** from a checklist with a source for each number:

  | Number | Where it comes from |
  | --- | --- |
  | Load time | DevTools' Performance panel, or a documented console snippet that reads the page's performance entries |
  | Frame cost in a trick | The perf badge's render CPU time, draw calls and frames (it has no GPU time) |
  | The step-down | Its announcement, and the quality shown in View |
  | Memory after 30 tricks | Chrome's Task Manager (Search + Esc on ChromeOS) |
  | Hashing each model before parsing (step 19) | A `performance.measure` that `gltf.ts` records per model, read with the same console snippet |
- **Lighthouse on the live site, after the merge** (the owner's call to merge).

### 23. The last pass
- **Keyboard only, through every screen**, as in DESIGN.md 14.10, including the timed pop, the instant replay's skip, the deck choice and New student.
- **A screen reader** (NVDA or VoiceOver): the owner, from a checklist.
- **Docs:** the README (features, numbers, screenshots, and a GIF of a timed SKATE turn), the ROADMAP, and this plan's status line.

## If time runs short

The order of value is:
1. Phase A (Medium's gate first).
2. Steps 6 to 8 (the game).
3. Steps 16 to 19 (loading, the log surviving a reload, and offline).
4. Steps 10 to 12 (feel).
5. Everything else.

## Expected results (estimates until step 22 measures them)

- **A made trick in the game is earned:** a timed pop, playable by keyboard, touch and ear, with three grades and Exact for anyone who needs it.
- **Landings have weight**, and a bail looks like one.
- **Repeat visits** show the full scene about as fast as a full-speed first visit on any network, and a visit's tier works offline afterwards.
- **A reload in the same tab keeps the session's log.** A tab left open across a deployment never runs another build's files.
- **No plain-colour stage** at 3 Mbps.
- **`dist/` is 584 KB smaller.** No tier's downloads grow past the bundle budget without an ADR.
- **Every tier inside the ledger with every switch on**, Medium included, and no frames once a flight is settled, apart from the one already queued.
- **Checked on emulated phones, in Firefox and in WebKit.**

## Left out on purpose

**By the owner's decisions (2026-11-09):**
- **Medium on WebGL with lighter textures.** Medium keeps its WebGPU renderer, occlusion, grade and KTX2 textures.
- **Two players on one device.**
- **Recorded sounds.** New sounds are synthesized like today's.
- **Rolling forward and clearing a kerb.** The spot is scenery only.
- **Nollie and body 180s.**
- **A full rider.** The shoes-only choice of 2026-11-08 stands.
- **A class report for teachers.**
- **A student name in the export.**
- **A host move.** The site stays on GitHub Pages; the service worker gives repeat visits most of what cache headers would.

**By design:**
- **A physics engine.** The exact model is the project's strength.
- **Online play, accounts and cloud saves.** They need a server, moderation and stored student data.
- **Analytics on students.** Consent and privacy in schools. If it is ever wanted: opt-in, anonymous, frame pace only.
- **Camera shake.** It fights the orbit camera and makes some people queasy.
- **Music.**
- **The hardflip.** ADR-41 stands.
- **Downloading every tier's files in the background.**
- **A truck-compression dip on landing.** The board is one rigid model.

## Risks

- **A timed input can shut people out.** Mitigated by a single-press release, playing by ear, and Exact one choice away.
- **A service worker can pin a bad version or mix two.** Mitigated by:
  - the network-first page;
  - versioned URLs checked against their bytes;
  - waiting activation;
  - the reload prompt for a tab on an older version;
  - a tested kill switch.
- **Medium ends at 19 of under 20 with every switch on.** Anything later on Medium replaces something.
- **The suite grows** with every game rule. The pinned feet poses (`feet.pinned.test.ts`) and the preset assertions must not change, except where an ADR says so.
