# Plan: restructure

Written 2026-11-13. Approved by the owner on 2026-11-13. Status: phase 0 in progress. Steps 1 and 2 are done (`steady-checks` merged as PR #4 on 2026-11-14); step 3, `fisheye-view`, is in review.

The aim is to cut what it costs to change the game, without changing what a player sees. The core stays as it is: the pure `src/sim`, the store owning the event log and the announcements, the DOM owning accessibility, and budgets enforced by scripts.

## Where things stood on 2026-11-13

- About 52,500 lines of code, 107 ADRs and 121 commits since 2026-11-04.
- Every Verify run on GitHub is red, on main since 2026-11-10. PR #4 (`steady-checks`) is open and its browser job fails.
- `fisheye-view` (head 90be0c7) is pushed and not merged into main. It contains `polish-ui-rider` (2a92ebd).
- Low is the only tier on WebGLRenderer. Medium and High run WebGPURenderer, which has its own WebGL2 backend. Each custom shader exists twice: GLSL in `src/scene/resources.ts`, TSL in `src/scene/nodeRenderer.ts`.
- The game and the lab share one `App.tsx`, one store and one Canvas. 19 files branch on which screen is showing (58 checks), among them `FlightDriver`, `SceneCamera` and seven store files.
- The rules of SKATE already have a phase in `src/sim/skate.ts` (whose turn, set or copy). A single go has none: its state is spread over `status`, `roll`, `landing`, the replay state and the notice.
- `src/scene/FlightDriver.tsx` is 426 lines. `src/styles/app.css` is 3,211 lines.

## Decisions the owner made (2026-11-13)

1. The game and the lab stay one site and become two modules in code (option B below).
2. Low is dropped if the measurement in phase 1 passes.
3. Merge order for phase 0: `steady-checks` first, then `fisheye-view`, into main.
4. Phase 6 (art from Blender) is in.
5. No old branch or worktree is deleted without asking.

### Option B, as chosen

Same URL, same welcome screen, same saved preferences and records. The game and the lab each get their own UI, scene composition, frame systems and store slice, loaded lazily. They share `src/sim`, the assets, the renderer and the preferences. One Canvas is kept across the switch, so the loaded models and the graphics context survive it.

Rejected: keeping them joined as today (every game feature keeps carrying a lab clause), and two separate sites (two builds, two deploys, two budget tables, and preferences that no longer travel).

## Working rules for every phase

- Each phase lands as its own pull request, or several smaller ones. No pull request spans two phases.
- `npm run verify` and `npm run test:browser` are green before the next phase starts.
- Phases 0 to 5 change nothing a player can see, except that Low goes in phase 1. Phase 6 is the only one that changes the look.
- A test changes only where behaviour changes on purpose, in the same commit, with the reason.
- A phase that alters a rule in `CLAUDE.md` or a budget records one decision in `docs/DECISIONS.md` and edits the rule in the same pull request.

## The phases

| # | Phase | Size |
| --- | --- | --- |
| 0 | Green baseline | S |
| 1 | One renderer, two tiers | M |
| 2 | Game and lab as two modules | L |
| 3 | A phase for each go | M |
| 4 | Frame systems | M |
| 5 | CSS split | S |
| 6 | Art from Blender | L |
| 7 | Docs | S |

### Phase 0: green baseline

1. Read the failing browser job on PR #4 (run 43121697895) and fix it.
2. Merge `steady-checks` into main.
3. Bring `fisheye-view` up to date with main, get it green, and merge it.
4. Tag main `pre-restructure`.

Done when: Verify is green on main.

### Phase 1: one renderer, two tiers

Starts with a measurement, not a deletion.

**Measured 2026-11-15: no-go** (PERF-BUDGET.md, "Restructure phase 1"). On a software GPU Medium on WebGL2 draws a frame in about 520 ms against Low's 40 ms, and its picture lifts 3.4 s later; on the reference GPU it misses its own 3 ms target. Per step 2, Low stays frozen, steps 3 to 6 are not done, and the phases below go ahead with three tiers.

1. Run Medium on WebGPURenderer's WebGL2 backend on a software GPU and with the CPU throttled. Compare startup and frame time with Low today, using `scripts/measure/measure.js`.
2. Go or no-go. If startup or frame time misses the targets in `docs/PERF-BUDGET.md`, stop and report. Low then stays frozen and the rest of this plan goes ahead with three tiers.
3. If it passes: remove the Low tier, the WebGLRenderer path, the GLSL twins in `resources.ts`, the toon shading and `rendererKind.ts`'s second branch.
4. Keep the primitive board as the fallback when a model fails to load, now under Medium.
5. A saved "low" setting becomes Medium. The tier pick (`store/quality.ts`) returns High or Medium only.
6. Update `LEDGER` in `browser/helpers.ts`, the Low rows in `scripts/lib/bundleBudget.ts`, and the browser checks that loop over tiers.

What is given up: a weak machine's first visit goes from Low's 500 KB budget to Medium's 1,350 KB, and Low's flat toon look is deleted.

Done when: the frame-time targets hold on the reference machine, both tiers pass the browser checks, and no GLSL shader source is left in `src/scene`.

### Phase 2: game and lab as two modules

1. Split the UI: the game's components and the lab's components each become one lazily loaded module. `App.tsx` keeps the shell, the welcome screen, the shortcuts table and the one mount choice.
2. Split the scene: one composition for the game (rider, spot, roll, game camera) and one for the lab (feet, legs, foot trails, lab camera), inside the one Canvas.
3. Split the store: a game slice and a lab slice over a shared core (inputs, the flight, preferences, records, focus, announcements).
4. Replace the screen checks in shared code with the module that is mounted. Selectors such as `riderShown` stop reading `screen`.

Done when: the 58 screen checks in 19 files are down to the mount choice in `App` and the hash routing, a lab visit downloads no game UI code and the other way round, and switching screens does not remount the Canvas.

### Phase 3: a phase for each go

1. Add one pure state machine in `src/sim` for a single go: `idle`, `windUp`, `bar`, `flight`, `landing`, `notice`, `replay`, with the allowed transitions and a test for each.
2. The store holds one `goPhase`. `rollMoves`, `landingMoves`, `replayMoves`, `noticeUp` and `windUp` become reads of it, then are removed where nothing else needs them.
3. The rules phase in `src/sim/skate.ts` stays as it is. The go's phase sits under it.
4. The frameloop rule (rule 4) becomes one line: which phases draw frames.

Done when: the store's tests pass with no change in behaviour, and no component decides whether frames run from more than `goPhase`.

### Phase 4: frame systems

1. `FlightDriver` keeps the one loop and calls small pure steps in a fixed order: wind-up, flight, roll, landing, replay, rider, dust. The lab's list is shorter. The camera's `Rise` stays its own.
2. Move the roll model to `src/sim`. `src/scene/roll.ts` and `src/audio/rolling.ts` both import it, and the copy in audio goes.
3. Rule 5 becomes: one loop, these systems, in this order.

Done when: `browser/landing.spec.ts` draws the same frames, the long-run test's counts do not move, and no step allocates in the loop.

### Phase 5: CSS split

1. `src/styles/app.css` becomes one file per block, imported by the module that uses it, so the lab's styles load with the lab.
2. `tokens.css` stays central. Class names and the contract in `docs/BRIEF.md` and `docs/DESIGN.md` do not change. No CSS modules.

Done when: the stylesheet budget holds per visit and every screen looks the same on both tiers and both themes.

### Phase 6: art from Blender

1. The shoe first, then Medium's rider, authored the way High's rider is now (`assets/source/models/`, a build script, the licence beside it), and built by `npm run assets` through the same pipeline.
2. The board stays procedural, because `src/sim` depends on its dimensions. The feet model's `FOOT` must still equal the shoe's size.
3. `src/asset/shoe.ts` (920 lines) and `src/asset/rider.ts` (724 lines) go once their replacements are approved.
4. One asset per pull request, each with its `assets:check` table and screenshots. The owner approves each by eye.

Done when: `assets:check` passes and the owner has approved each asset. This phase has the most risk for the least payoff, and it is last so that it can be dropped without affecting the others.

### Phase 7: docs

1. Fold the 107 ADRs into current-state docs. `docs/DECISIONS.md` keeps the decisions that still bind (about 15), each as it stands today.
2. Cut `CLAUDE.md` to the rules. The map of the code lives in `docs/REPO-GUIDE.md` only.
3. Remove `docs/PLAN-LOOK-FEEL-PERF.md` and `docs/PLAN-PLAY-POLISH-REACH.md`, both finished, and rewrite `docs/ROADMAP.md`.
4. Mark this plan done.

Done when: every rule in `CLAUDE.md` matches the code, and nothing in `docs/` describes a tier, a renderer or a file that no longer exists.

## Why this order

- Phase 1 is early because every later phase is then tested on two tiers, not three.
- Phase 2 is before 3 and 4 because the state machine and the frame systems belong to the game once the seam exists.
- Docs are last because phases 1 to 4 rewrite rules 4, 5, 7 and 14.
