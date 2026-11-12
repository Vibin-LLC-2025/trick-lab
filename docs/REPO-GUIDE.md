# Repo guide

A map of the repo: where things live, and where to look for a given feature. Paths are links, so this page works as an index on GitHub.

- [Find it fast](#find-it-fast): a feature, and the file that has it
- [The big picture](#the-big-picture): how the pieces fit
- [Top level](#top-level), [inside `src/`](#inside-src), [the docs](#inside-docs), [checks and scripts](#checks-and-scripts)
- [Commands](#commands-you-will-use)

## Find it fast

### The physics and the trick rules (`src/sim/`, pure TypeScript, no React or 3D)

| What | Where |
| --- | --- |
| How the board flies (height, airtime, flip and spin) | [`src/sim/flight.ts`](../src/sim/flight.ts), `computeFlight` |
| Which trick it was | [`src/sim/tricks.ts`](../src/sim/tricks.ts), `recognize` |
| Trick presets, slider ranges, lab objectives | [`src/sim/tricks.ts`](../src/sim/tricks.ts), `PRESETS`, `INPUT_LIMITS`, `OBJECTIVES` |
| Land or bail, and the landing's grade (clean, sketchy, bail) | [`src/sim/landing.ts`](../src/sim/landing.ts) |
| The rider's feet (where each shoe is through a trick) | [`src/sim/feet.ts`](../src/sim/feet.ts), research behind it in [`docs/RESEARCH-FEET.md`](RESEARCH-FEET.md) |
| The rider's legs and whole body | [`src/sim/legs.ts`](../src/sim/legs.ts), [`src/sim/body.ts`](../src/sim/body.ts) |
| The board as a solid, so feet do not pass through it | [`src/sim/boardVolume.ts`](../src/sim/boardVolume.ts) |
| How a board settles after landing | [`src/sim/settle.ts`](../src/sim/settle.ts), [`src/sim/boardSection.ts`](../src/sim/boardSection.ts) |
| Numbers and foot steps as readable text | [`src/sim/format.ts`](../src/sim/format.ts) |

### The game of SKATE

| What | Where |
| --- | --- |
| The rules: letters, copy or take a letter, no repeats, last-letter tries | [`src/sim/skate.ts`](../src/sim/skate.ts), `afterAttempt`, `callProblem`, `openTricks` |
| The computer player: what it calls, how well it lands | [`src/sim/skate.ts`](../src/sim/skate.ts), `pickCall`, `computerAttempt` |
| The trick guide (how to set the sliders for a trick) | [`src/sim/skate.ts`](../src/sim/skate.ts), `trickGuide` |
| The timing bar: from a release to an attempt | [`src/sim/bar.ts`](../src/sim/bar.ts), `timedAttempt`, `barFeedback` |
| The landing zones on the sliders | [`src/sim/zones.ts`](../src/sim/zones.ts), shown through [`src/store/forecast.ts`](../src/store/forecast.ts) |
| The game's state and actions (call a trick, pop, turns) | [`src/store/skate.ts`](../src/store/skate.ts), `callTrick`, `pressPop` |
| The notices over the stage (coin flip, each go's result) | [`src/store/notice.ts`](../src/store/notice.ts) |
| The game screen (cards, dock, sliders, Pop, the end) | [`src/ui/Skate.tsx`](../src/ui/Skate.tsx) |
| Game settings (camera, replay and others) | [`src/ui/Settings.tsx`](../src/ui/Settings.tsx) |
| Tricks landed, wins and losses, kept on the device | [`src/store/records.ts`](../src/store/records.ts), shown in [`src/ui/Tricks.tsx`](../src/ui/Tricks.tsx) |
| The instant replay | [`src/store/replay.ts`](../src/store/replay.ts), [`src/scene/replayClock.ts`](../src/scene/replayClock.ts) |

### The app's state (`src/store/`, one Zustand store)

| What | Where |
| --- | --- |
| Where the store is put together | [`src/store/index.ts`](../src/store/index.ts), `createTrickStore` |
| Shared types | [`src/store/types.ts`](../src/store/types.ts) |
| Slider values | [`src/store/inputs.ts`](../src/store/inputs.ts) |
| Playing, paused, progress | [`src/store/playback.ts`](../src/store/playback.ts), [`src/store/playhead.ts`](../src/store/playhead.ts) |
| Results, objectives, the event log | [`src/store/assessment.ts`](../src/store/assessment.ts) |
| Screen, theme, focus, announcements | [`src/store/ui.ts`](../src/store/ui.ts) |
| Saved preferences | [`src/store/prefs.ts`](../src/store/prefs.ts) |
| Graphics tier picked from the device, and the automatic step-down | [`src/store/quality.ts`](../src/store/quality.ts), [`src/store/pace.ts`](../src/store/pace.ts) |
| The board rolling in a game, and the landing's motion | [`src/store/roll.ts`](../src/store/roll.ts) |
| Deck choice | [`src/store/deck.ts`](../src/store/deck.ts) |
| Playback speed, the game's slower pace | [`src/store/speed.ts`](../src/store/speed.ts) |
| The JSON export | [`src/store/export.ts`](../src/store/export.ts) |

### The 3D view (`src/scene/`, three.js through React Three Fiber)

| What | Where |
| --- | --- |
| The canvas and everything in it | [`src/scene/TrickScene.tsx`](../src/scene/TrickScene.tsx) |
| The per-frame animation (board, feet, rider, roll, landing, replay) | [`src/scene/FlightDriver.tsx`](../src/scene/FlightDriver.tsx), with [`src/scene/flightClock.ts`](../src/scene/flightClock.ts) |
| The board | [`src/scene/Board.tsx`](../src/scene/Board.tsx) picks [`BoardModel.tsx`](../src/scene/BoardModel.tsx) (the 3D model) or [`BoardPrimitive.tsx`](../src/scene/BoardPrimitive.tsx) (the simple one) |
| The rider | [`src/scene/Rider.tsx`](../src/scene/Rider.tsx), [`RiderModel.tsx`](../src/scene/RiderModel.tsx), [`riderPose.ts`](../src/scene/riderPose.ts); shoes in [`Feet.tsx`](../src/scene/Feet.tsx) and [`ShoesModel.tsx`](../src/scene/ShoesModel.tsx) |
| The ground and the skate spot (kerb, rail, ledge) | [`src/scene/Pad.tsx`](../src/scene/Pad.tsx), [`Spot.tsx`](../src/scene/Spot.tsx) |
| The camera | [`src/scene/SceneCamera.tsx`](../src/scene/SceneCamera.tsx), [`cameraFit.ts`](../src/scene/cameraFit.ts), [`cameraPlacement.ts`](../src/scene/cameraPlacement.ts) |
| Lighting, sky, fog | [`src/scene/SceneEnvironment.tsx`](../src/scene/SceneEnvironment.tsx), [`sky.ts`](../src/scene/sky.ts), [`skyDome.ts`](../src/scene/skyDome.ts), [`rangeFog.ts`](../src/scene/rangeFog.ts) |
| Every color, light, camera and renderer number | [`src/scene/artDirection.ts`](../src/scene/artDirection.ts) |
| Shared geometry and materials | [`src/scene/resources.ts`](../src/scene/resources.ts) |
| The WebGPU renderer and post-processing (Medium and High) | [`src/scene/nodeRenderer.ts`](../src/scene/nodeRenderer.ts), [`effects.ts`](../src/scene/effects.ts) |
| What each graphics tier draws | [`src/scene/sceneTier.ts`](../src/scene/sceneTier.ts) |
| Loading 3D models | [`src/scene/gltf.ts`](../src/scene/gltf.ts), [`modelCache.ts`](../src/scene/modelCache.ts) |
| Foot trails, motion arrows, landing dust | [`FootPaths.tsx`](../src/scene/FootPaths.tsx), [`MotionCues.tsx`](../src/scene/MotionCues.tsx), [`dust.ts`](../src/scene/dust.ts) |
| Frame timing and draw counts | [`src/scene/PerfProbe.tsx`](../src/scene/PerfProbe.tsx), shown by [`src/ui/PerfBadge.tsx`](../src/ui/PerfBadge.tsx) (press `p` in the lab) |

### The page around the 3D view (`src/ui/`, React)

| What | Where |
| --- | --- |
| The app shell: screens, keyboard shortcuts, focus | [`src/ui/App.tsx`](../src/ui/App.tsx) |
| The welcome screen | [`src/ui/Home.tsx`](../src/ui/Home.tsx) |
| The lab: presets, sliders, playback, results | [`Presets.tsx`](../src/ui/Presets.tsx), [`Inputs.tsx`](../src/ui/Inputs.tsx), [`Playback.tsx`](../src/ui/Playback.tsx), [`Telemetry.tsx`](../src/ui/Telemetry.tsx), [`FootMotion.tsx`](../src/ui/FootMotion.tsx), [`Objectives.tsx`](../src/ui/Objectives.tsx), [`EventLog.tsx`](../src/ui/EventLog.tsx) |
| Theme, graphics and view switches | [`src/ui/ViewPanel.tsx`](../src/ui/ViewPanel.tsx), [`Utilities.tsx`](../src/ui/Utilities.tsx), [`TopBar.tsx`](../src/ui/TopBar.tsx) |
| Screen reader announcements | [`src/ui/Announcer.tsx`](../src/ui/Announcer.tsx) |
| Keyboard help (`?`) | [`src/ui/ShortcutsDialog.tsx`](../src/ui/ShortcutsDialog.tsx) |
| The stickers on a landed trick | [`src/ui/Celebration.tsx`](../src/ui/Celebration.tsx) |
| The loading picture, and the fallback if 3D fails | [`src/ui/StageStill.tsx`](../src/ui/StageStill.tsx), [`src/ui/SceneBoundary.tsx`](../src/ui/SceneBoundary.tsx) |
| Colors, fonts, sizes (both themes) | [`src/styles/tokens.css`](../src/styles/tokens.css) |
| Layout and component styles | [`src/styles/app.css`](../src/styles/app.css) |

### Sound

| What | Where |
| --- | --- |
| The sounds as data, and the recorded takes | [`src/audio/sounds.ts`](../src/audio/sounds.ts), [`src/audio/soundSpec.ts`](../src/audio/soundSpec.ts) |
| Playing them (Web Audio) | [`src/audio/player.ts`](../src/audio/player.ts), [`src/audio/context.ts`](../src/audio/context.ts) |
| The React hook that plays the store's sound cues | [`src/hooks/useSound.ts`](../src/hooks/useSound.ts) |
| The rolling sound | [`src/audio/rolling.ts`](../src/audio/rolling.ts), [`src/store/sound.ts`](../src/store/sound.ts) |

### The 3D models, built in code

| What | Where |
| --- | --- |
| Every board measurement and each model's size budget | [`src/asset/spec.ts`](../src/asset/spec.ts) |
| The board: deck, trucks, wheels, textures | [`deck.ts`](../src/asset/deck.ts), [`hardware.ts`](../src/asset/hardware.ts), [`board.ts`](../src/asset/board.ts), [`textures.ts`](../src/asset/textures.ts) |
| Deck graphics the player chooses | [`src/asset/deckSpec.ts`](../src/asset/deckSpec.ts), art in [`assets/source/decks/`](../assets/source/decks) |
| Shoes, rider, ground, skate spot | [`shoe.ts`](../src/asset/shoe.ts), [`rider.ts`](../src/asset/rider.ts), [`ground.ts`](../src/asset/ground.ts), [`spot.ts`](../src/asset/spot.ts) |
| The build script that writes the GLB files | [`scripts/build-board.ts`](../scripts/build-board.ts) (run with `npm run assets`) |
| The built models (generated, never edited by hand) | [`public/models/`](../public/models) |

### Why something is the way it is

| What | Where |
| --- | --- |
| Every design decision, numbered (ADR-1 to ADR-92) | [`docs/DECISIONS.md`](DECISIONS.md) |
| What the app must do | [`docs/BRIEF.md`](BRIEF.md) |
| The visual design system | [`docs/DESIGN.md`](DESIGN.md) |
| Performance limits and measurements | [`docs/PERF-BUDGET.md`](PERF-BUDGET.md) |
| The rules the code keeps | [`CLAUDE.md`](../CLAUDE.md), "Conventions" |

## The big picture

Trick Lab is a web page with three screens: the welcome screen, the game of SKATE against the computer, and the lab (the exact, repeatable experiment). It has four layers:

- **The physics** (`src/sim/`): pure math. How the board flies, where the feet go, which trick happened, whether it landed, and the game's rules. No React, no 3D, so it is easy to test.
- **The store** (`src/store/`): the app's one shared memory (Zustand). Every change goes through a store action, and only store actions write the event log, the announcements and the sound cues.
- **The 3D view** (`src/scene/`): the board, the rider, the ground and the spot, drawn with three.js through React Three Fiber. It reads the store and never decides anything.
- **The page** (`src/ui/`): the buttons, sliders, cards and dialogs. Every action has a real HTML control, so the app works by keyboard and screen reader. The 3D canvas is hidden from screen readers and described in text instead.

When you press Pop: the UI calls a store action, the store asks the physics for the flight, the 3D view animates it frame by frame (`FlightDriver.tsx`), and when the board lands the store records the result, which the UI then shows and announces.

## Top level

| File or folder | What it is |
| --- | --- |
| [`README.md`](../README.md) | The front page: what the app is, how to run it, screenshots |
| [`CLAUDE.md`](../CLAUDE.md) | The project's rules and layout (written for AI agents, also a good summary of the conventions) |
| [`package.json`](../package.json) | Dependencies and commands (`npm run dev`, `verify` and others) |
| [`index.html`](../index.html) | The single HTML page the app runs in |
| [`vite.config.ts`](../vite.config.ts) | Settings for Vite, which runs the dev server and builds the site |
| `tsconfig*.json`, `eslint.config.js` | TypeScript and lint settings |
| [`src/`](../src) | All the app's code |
| [`public/`](../public) | Files served as-is: the built 3D models, the loading pictures, the sounds |
| [`assets/source/`](../assets/source) | Source art and recordings the models and sounds are built from |
| [`scripts/`](../scripts) | Build and check scripts (models, sounds, download budget, measurements) |
| [`browser/`](../browser) | Checks that run the built site in a real browser |
| [`docs/`](.) | Written documentation |
| [`.github/workflows/`](../.github/workflows) | CI: `verify.yml` (checks on every push and PR), `deploy.yml` (GitHub Pages) |

## Inside `src/`

| Folder | In plain terms |
| --- | --- |
| [`src/main.tsx`](../src/main.tsx) | The starting point: puts the app on the page |
| [`src/sim/`](../src/sim) | Physics, feet and body model, trick recognition, the game's rules and the computer player |
| [`src/store/`](../src/store) | The shared state and every action that changes it |
| [`src/scene/`](../src/scene) | The 3D view |
| [`src/ui/`](../src/ui) | Everything outside the 3D view |
| [`src/asset/`](../src/asset) | The code that builds the 3D models (board, shoes, rider, ground, spot) |
| [`src/audio/`](../src/audio) | Sound data and the Web Audio player |
| [`src/hooks/`](../src/hooks) | React helpers: `useSound`, `useReducedMotion` |
| [`src/styles/`](../src/styles) | `tokens.css` (design tokens, both themes), `app.css` (layout and components), the display font |
| [`src/test/`](../src/test) | Test setup |

Unit tests sit next to the code they test, named `*.test.ts` or `*.test.tsx`.

## Checks and scripts

| What | Where |
| --- | --- |
| Every screen on every graphics tier | [`browser/screens.spec.ts`](../browser/screens.spec.ts) |
| Draw-call caps | [`browser/ledger.spec.ts`](../browser/ledger.spec.ts), limits in `LEDGER` in [`browser/helpers.ts`](../browser/helpers.ts) |
| The frames a landing draws, frame pacing | [`browser/landing.spec.ts`](../browser/landing.spec.ts), [`browser/frame.spec.ts`](../browser/frame.spec.ts) |
| Phone and tablet sizes with touch | [`browser/touch.spec.ts`](../browser/touch.spec.ts) |
| The long-run memory test | [`browser/soak.spec.ts`](../browser/soak.spec.ts) |
| Model budgets (size, triangles, textures) | [`scripts/check-assets.ts`](../scripts/check-assets.ts) |
| Download budget per first visit | [`scripts/check-bundle.ts`](../scripts/check-bundle.ts), limits in [`scripts/lib/bundleBudget.ts`](../scripts/lib/bundleBudget.ts) |
| Performance measurement | [`scripts/measure/measure.js`](../scripts/measure/measure.js) |

## Inside `docs/`

| File | What it covers |
| --- | --- |
| [`BRIEF.md`](BRIEF.md) | The spec: what the app must do |
| [`BRIEF-BOARD.md`](BRIEF-BOARD.md), [`BRIEF-FEET.md`](BRIEF-FEET.md) | The specs for the realistic board, and for the feet and graphics tiers |
| [`RESEARCH-FEET.md`](RESEARCH-FEET.md) | The research the feet model is built from |
| [`DESIGN.md`](DESIGN.md) | The visual design system: colors, type, spacing, contrast |
| [`DECISIONS.md`](DECISIONS.md) | Why things were built the way they were (ADR-1 to ADR-92) |
| [`PERF-BUDGET.md`](PERF-BUDGET.md) | Performance limits and every measurement taken |
| [`ASSET-PIPELINE.md`](ASSET-PIPELINE.md) | How the 3D models, loading pictures and sounds are built |
| [`AGENT-WORKFLOW.md`](AGENT-WORKFLOW.md) | How AI agents were used to build the app |
| [`ROADMAP.md`](ROADMAP.md) | What comes next |
| [`research/`](research) | Audits and evidence the decisions cite |
| [`screenshots/`](screenshots) | The images used in the README |

## Commands you will use

| Command | What it does |
| --- | --- |
| `npm install` | Installs the dependencies (once, after cloning) |
| `npm run dev` | Runs the app at http://localhost:5173 while you edit (updates live) |
| `npm run build` then `npm run preview` | Builds the real website and serves it at http://localhost:4173. Use this for performance checks |
| `npm run verify` | Every check: types, lint, unit tests, model budgets, then a production build and its download budget. Run it before committing |
| `npm run test:browser` | The browser checks against the build `verify` just made (about 12 minutes). Run it after changing the 3D view or the game |
| `npm run assets` | Rebuilds the 3D models from `src/asset/` |
