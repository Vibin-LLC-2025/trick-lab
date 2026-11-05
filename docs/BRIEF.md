# trick-lab: shared build brief (written 2026-11-04)

Purpose: a browser-based 3D virtual lab by Dylan Adams-Hegarty where
students run an experiment and get assessed, on low-end Chromebooks. Stack:
React 19, React Three Fiber (Three.js), Zustand, Vite, TypeScript,
accessibility as a core requirement, AI coding agents with a CLAUDE.md.

It is a 3D skateboard flip-trick simulator framed as a physics
experiment: angular rotation about two axes during projectile flight.
Honest and modest: a demo, not a game engine.

## The experiment: "Land the trick"

A skateboard sits on a concrete pad. The student sets three inputs and pops.
The simulation computes the flight and the board's rotation, animates it in
3D, then recognizes which trick happened and whether it was landed.

Inputs (all DOM sliders, keyboard friendly):

- Pop: peak height 0.15 to 0.60 m (step 0.05, default 0.35)
- Flick: flip rate -3.0 to 3.0 rev/s (step 0.1, default 0). Signed since
  2026-11-04 (ADR-30): above 0 a kickflip (the grip turns toward the heel
  side first), below 0 a heelflip (toward the toe side first).
- Scoop: shove rate -3.0 to 3.0 rev/s (step 0.1, default 0). Above 0
  backside (the tail swings behind the heels), below 0 frontside (in front
  of the toes).

The two rate sliders are centred on 0. Each shows the magnitude and the
direction ("1.9 rev/s heelflip", "0.9 rev/s frontside", "0.0 rev/s"), and
aria-valuetext says "1.9 revolutions per second, heelflip".

Eight trick presets (buttons, also keys 1 to 8; four until 2026-11-04) set
the sliders to values that land the trick with the default pop 0.35 m:

1. Kickflip (flick 1.9, scoop 0): 1 full flip (roll 360 deg about the board's long axis), no shove
2. Heelflip (flick -1.9, scoop 0): 1 flip the other way (roll -360)
3. Pop shove-it (flick 0, scoop 0.9): backside half shove (yaw 180 deg about the vertical axis), no flip
4. Frontside shove-it (flick 0, scoop -0.9): frontside half shove (yaw -180)
5. Varial flip (flick 1.9, scoop 0.9): kickflip + backside half shove
6. Varial heelflip (flick -1.9, scoop -0.9): heelflip + frontside half shove
7. Hardflip (flick 1.9, scoop -0.9): kickflip + frontside half shove
8. 360 flip, tre flip (flick 1.9, scoop 1.9): kickflip + backside full shove

Physics (pure, in `src/sim/flight.ts`, g = 9.81):

- airtime T = 2 * sqrt(2 * h / g)       (h = pop height)
- height y(t) = h * (1 - (2t/T - 1)^2)  (parabola, 0 <= t <= T)
- rollTotal = flick * T * 360 deg, yawTotal = scoop * T * 360 deg
- roll(t) = rollTotal * R(t / T), yaw(t) = yawTotal * R(t / T), phased (ADR-36, 2026-11-05; was
  rollTotal * t / T, a constant rate): R ramps up over 0.06 to 0.16 of T for the flip (0 to
  0.10 for the shove), runs at a constant free rate (about 1.7 times the slider's rate,
  shown as "Air spin"), and decays to 0 over the catch, 0.64 to 0.76 (`PHASE`); a landed
  board is pressed onto its whole turn and half turn in the catch, a failed one ends at
  its totals
- pitch(t): nose up at pop, easing to level by 35 percent of T (was 18 deg about the deck centre; since 2026-11-04 the board pivots on its rear wheels until the tail strikes the pad at 32.5 deg, ADR-27),
  then level (cosmetic, not part of recognition)

Recognition (pure, in `src/sim/tricks.ts`):

- rollTotal and yawTotal are signed (ADR-30). flips = round(rollTotal / 360),
  halfShoves = round(yawTotal / 180), rounded symmetrically
  (sign(x) * round(|x|)) so a heelflip rounds like its kickflip mirror
- rollError = rollTotal - flips * 360 (deg), yawError = yawTotal - halfShoves * 180
- landed if |rollError| <= 30 and |yawError| <= 25
- name by signed (flips, halfShoves): (0,0) ollie; (1,0) kickflip; (-1,0)
  heelflip; (2,0) double kickflip; (-2,0) double heelflip; (0,1) pop
  shove-it; (0,-1) frontside pop shove-it; (0,2) 360 shove-it; (0,-2)
  frontside 360 shove-it; (1,1) varial flip; (1,-1) hardflip; (-1,-1)
  varial heelflip; (-1,1) inward heelflip; (1,2) 360 flip; (1,-2) 360
  hardflip; (-1,-2) laser flip; (-1,2) 360 inward heelflip; (2,2) double
  tre; anything else "Unnamed" with direction words, for example
  "Unnamed (2 heelflips, 1 frontside half shove)"
- if not landed: outcome is "under-rotated" when the failing axis fell short
  of its nearest whole turn in its own direction of rotation, "over-rotated"
  when it went past (a magnitude test, so it reads the same for a heelflip
  or a frontside shove); failedBy keeps its sign, the copy shows degrees
- signed totals read as a magnitude and a direction: the card "365 deg
  heelflip, 173 deg frontside shove", the announcer "365 degrees of heelflip,
  173 degrees of frontside shove", the strip "365°" over "heelflip"
- Default presets with pop 0.35 m: T = 0.534 s; flick 1.9 rev/s gives
  rollTotal 365 deg; scoop 0.9 gives yaw 173 deg; scoop 1.9 gives 365 deg.
  The negative inputs give the same magnitudes with the other sign.
  Verify these in tests and adjust preset numbers if needed so each preset
  lands with the default pop and fails if pop drops to 0.15 m.

Readouts (DOM "telemetry" panel): airtime (s), peak height (m), flip
rotation (deg), shove rotation (deg), outcome (landed / under / over),
trick name.

Playback: the trick plays once at real speed when popped. Controls: Pop
(button, and Space when focus is not in a slider), slow motion toggle
(0.25x, key s), and a timeline range slider (0 to 100 percent of T) that
scrubs the frozen board when playback is finished or paused. Arrow keys on
the timeline move 1 percent, Page keys 10 percent.

Assessment objectives (checklist, scored on the fly):
1. Land a kickflip.
2. Land a heelflip.
3. Land a pop shove-it.
4. Land a frontside shove-it.
5. Land a varial flip.
6. Land a varial heelflip.
7. Land a hardflip.
8. Land a 360 flip.
Bonus text (not an objective): land any preset at pop 0.20 m or lower by
raising flick/scoop yourself.

Event log: `{ id, t (ms since session start),
type, payload }`. Types: `input.changed` (which slider, value),
`preset.applied`, `trick.popped` (inputs), `trick.resolved` (name, landed,
rollTotal, yawTotal, airtime), `playback.scrubbed` (debounced to one event
per drag), `objective.completed`, `session.reset`. Exportable as JSON.
Reset clears inputs to defaults and board pose, keeps the log.

## Architecture contract (design and implementation both follow this)

- Vite + React 19 + TypeScript strict. Zustand single store, slices:
  `inputs`, `playback`, `assessment`, `ui`. `@react-three/fiber`,
  `@react-three/drei` only for `OrbitControls`. drei `Html` is NOT used.
- Pure sim in `src/sim/flight.ts` and `src/sim/tricks.ts`, unit tested,
  no React, no Three.
- Store in `src/store/` (one file per slice plus `index.ts`, `export.ts`).
  Store actions are the only place that appends to the event log.
- Playback clock: the store holds `playback.status`
  ('idle' | 'playing' | 'paused' | 'done'), `playback.progress` (0 to 1),
  `playback.rate` (1 or 0.25). While playing, a single `useFrame` in
  `src/scene/FlightDriver.tsx` advances progress with the frame delta and
  writes the board pose into a mutable ref (no React state per frame),
  and commits progress to the store at most 10 times per second for the
  timeline slider. When done, frameloop returns to demand.
- 3D in `src/scene/`: `TrickScene.tsx` (Canvas), `Pad.tsx` (ground),
  `Board.tsx` (deck, trucks, wheels, grip top vs graphic bottom so the flip
  is readable), `FlightDriver.tsx`, `SceneCamera.tsx`, `PerfProbe.tsx`,
  `resources.ts` (shared geometries and materials, disposed),
  `artDirection.ts` (numbers from docs/DESIGN.md).
  Board is primitives only (box deck with raised nose and tail wedges,
  two box trucks, four cylinder wheels). Long axis is X. Flip is rotation
  about the board's local X; shove is rotation about world Y. Apply
  yaw, then the pop pitch, then roll (Euler order 'YZX', ADR-32) so the
  flip axis follows the shove and stays the pitched long axis.
- DOM UI in `src/ui/`: `App.tsx`, `Presets.tsx`, `Inputs.tsx` (3 sliders
  with numeric readouts), `Playback.tsx` (pop, slow motion, timeline),
  `Telemetry.tsx`, `Objectives.tsx`, `EventLog.tsx` (cap the panel at the
  latest 200 rows, export still has all), `Announcer.tsx`, `PerfBadge.tsx`,
  `ShortcutsDialog.tsx`, `ViewPanel.tsx` (theme toggle, reset view).
- Layout: canvas fills the stage; left column "setup" (presets, inputs,
  playback); right column "results" (telemetry, objectives, event log).
  Columns stack under the stage below 960 px.
- Keyboard: Tab order presets, sliders, playback, results. 1 to 8 apply
  presets, Space pops (unless focus is in a slider or button, where Space
  keeps its native meaning), s toggles slow motion, r resets, p toggles the
  perf badge, ? opens shortcuts, t toggles theme.
- Theme: `data-theme` on `:root`, localStorage key `trick-lab.theme`,
  default dark. `--scene-bg` token must equal the scene clear color, with a
  test that asserts it.

## Accessibility (non-negotiable)

- Canvas `aria-hidden="true"`, visually hidden `#scene-description`
  kept in sync (board state, inputs, last outcome).
- One `aria-live="polite"` announcer: preset applied, trick popped,
  outcome in plain language ("Kickflip landed. 365 degrees of kickflip,
  0 degrees of shove, 0.53 seconds in the air."; the direction words since
  ADR-30), objective completed,
  reset.
- Sliders are native `<input type="range">` with visible labels, units,
  `aria-valuetext` ("0.35 meters", "1.9 revolutions per second, heelflip").
- Focus management: after a preset is applied, focus stays on the preset
  button; after a trick resolves, focus is not moved (announcer carries
  the result); after reset, focus moves to the setup heading.
- `prefers-reduced-motion`: no auto-play. Pop resolves the trick instantly,
  the board jumps to the final pose, and the timeline slider lets the
  student step through. Camera has no easing in either mode.
- WCAG 2.2 AA contrast in both themes; visible focus rings.

## Performance (Chromebook target)

- `<Canvas dpr={[1, 1.5]} frameloop="demand" gl={{ powerPreference: 'low-power', antialias: false }}>`;
  `invalidate()` on store changes; `frameloop="always"` only while
  `playback.status === 'playing'`, back to demand when done or paused.
- Shared geometries and materials, disposed on unmount; no per-frame
  allocations (reuse Vector3 and Euler instances in refs).
- No shadows; one directional + one ambient light; under 20 draw calls.
- `docs/PERF-BUDGET.md` with measured numbers filled in by the
  integration agent (draw calls, frame time during a trick, frames
  rendered while idle for 10 s, heap after 10 pops, bundle sizes).

## Testing (favor real behavior)

- Vitest: `flight.test.ts` (airtime, parabola endpoints, rotation
  totals), `tricks.test.ts` (each preset lands with default pop, each fails
  at 0.15 m pop, naming table, under/over detection), `store.test.ts`
  (presets, pop, resolve, objectives, event log, reset keeps log),
  `ui.test.tsx` (RTL, real store, canvas stubbed; apply preset by key 1,
  pop by Space, assert announcer and objectives; theme toggle).
- Do not install Playwright. Browser verification uses the globally
  installed `playwright-cli` with a named session against the Vite dev
  server over HTTP (never file://).

## AI-assisted development artifacts

- `CLAUDE.md`: stack, commands, conventions (store actions own the log;
  DOM owns a11y; demand frameloop; FlightDriver is the only useFrame that
  writes pose; no drei Html), verify loop (`npm run verify` = typecheck +
  lint + test), review rules.
- `docs/DECISIONS.md`: 6 to 9 short ADR entries (constant-rate rotation
  model, Euler order, ref-based pose, 10 Hz progress commits, tolerance
  numbers, reduced motion as scrub-only, event-log cap, theme default).
- `docs/AGENT-WORKFLOW.md`: how this repo was built with agents (brief by
  the lead, design by fable, implementation by opus, independent
  integration pass by opus), honestly, with the date 2026-11-04.
- `README.md`: what it is, run commands, architecture, physics model and
  its simplifications, a11y, perf, testing, AI workflow, "what this is
  not", 10 engineering notes, and a short "why skateboarding"
  paragraph (two-axis rotation is a clean, visual physics lesson, and the
  trick taxonomy makes recognition and assessment concrete).

## Markup and class contract for the design agent

The design agent owns `src/styles/tokens.css`, `src/styles/app.css` and
`docs/DESIGN.md`. Implementation uses these class names exactly (updated for
the UI redesign, 2026-11-04, DESIGN.md section 9 and ADR-28):

```
.app, .app__stage, .app__setup, .app__results
.panel, .panel__title
.panel__head (title row with actions or a legend), .panel__count (a count in a title), .panel__note (small muted note)
.presets, .preset, .preset--active, .preset__key (small key hint)
.inputs, .field, .field__label, .field__value, .field__unit, .field__range
.playback, .btn, .btn--primary, .btn--ghost, .btn--danger, .btn--sm (small header button)
.toggle (button with aria-pressed, drawn as a switch), .toggle--on, .toggle__state
.view-panel__actions (View header buttons), .view-panel__toggles (grid of View switches)
.segmented, .segmented__legend, .segmented__options, .segmented__option, .segmented__input, .segmented__label, .segmented__hint
.timeline, .timeline__range, .timeline__label
.telemetry, .telemetry__row, .telemetry__k, .telemetry__v, .telemetry__v--bad (missed axis), .telemetry__v--none (no value yet), .telemetry__dir (direction word of a signed total, ADR-30)
.outcome, .outcome--landed, .outcome--bailed, .outcome__name, .outcome__detail
.foot-steps, .foot-steps__legend, .foot-steps__key, .foot-steps__swatch, .foot-steps__swatch--front, .foot-steps__swatch--back
.foot-step, .foot-step--front, .foot-step--back, .foot-step--both, .foot-step--now, .foot-step__who, .foot-step__text
.objectives, .objective, .objective--done, .objective__check, .objective__text
.eventlog, .eventlog__row, .eventlog__t, .eventlog__type
.perf-badge
.visually-hidden
.shortcuts (dialog)
```

Scene art direction belongs to the design agent, written as numbers in
`docs/DESIGN.md` (hex colors, light intensities, camera position, fov,
orbit limits) so the implementer can paste them into `artDirection.ts`.
Defaults the implementer uses until DESIGN.md says otherwise:
clear #23272b, ambient #d8dde2 0.7, directional #fff2dc 2.2 at [3, 6, 4]
targeting [0, 0.3, 0]; camera [1.6, 1.1, 2.4] target [0, 0.35, 0] fov 38;
orbit polar 0.3 to 1.3 rad, distance 1.8 to 5, no pan; pad #6f6a63 with a
darker edge line; deck graphic #d9553b (bottom), grip #1c1c1e (top), deck
edge #c9b58f (wood), trucks #a9adb3, wheels #efe9dc; a thin ground shadow
disc under the board (flat dark circle, opacity 0.35, scales with height)
instead of real shadows.

## Honesty notes for README copy

Built on 2026-11-04 with AI agents under Dylan's direction. Say that
plainly. Measurements are from a desktop Chromium, not a Chromebook.
