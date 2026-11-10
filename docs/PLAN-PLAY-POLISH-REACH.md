# Plan: play, polish and reach (2026-11-09, revised the same day)

**Status, 2026-11-10: revised, in progress.**
- Steps 1 to 11 are committed: phases A and B are done. The owner played both rough controls and picked the timing bar (2026-11-09); step 9 built it properly (ADR-65) and step 10 made the game screen a game (ADR-66). Step 11 was taken out of order while waiting for the pick.
- Steps 1 to 11 are live on `main` (91dfb4c, 2026-11-10). The second half started on 2026-11-10, step to step without a stop except where this plan has one.
- **Steps 12 (rolling, ADR-67), 13 (landings with weight, ADR-68), 14 (the skate spot, ADR-69), 15 (the legs on by default, ADR-70), 16 (decks, ADR-71), 17 (the game's camera and instant replay, ADR-72), 18 (sound, ADR-73), 19 (dust, ADR-74), 20 (the smoothness pass, ADR-75), 21 (phones and touch, ADR-76) and 22 (Firefox and Safari, ADR-77) are done.** The merge point after step 16 is asked; the owner's list of changes to the sounds is asked (the owner will listen later, 2026-11-10); step 23 is next. The phone and Safari checklists are in "Checklists for the owner". One target is not met on High (step 20): about one late frame in a whole game.
- The first version of this plan (commit b80ad3c, 23 steps) was reviewed by a second model (sol, high effort) over eight rounds.
- This revision has not had that review. It was written after the owner changed the plan's aim (below).
- Where a step here keeps an idea from the first version, that version's longer notes still apply unless this one says otherwise. Read them with `git show b80ad3c:docs/PLAN-PLAY-POLISH-REACH.md`.

How it runs:
- Each step is one commit, and `npm run verify` passes at every step.
- Each decision gets its own ADR (ADR-61 onward). BRIEF.md, DESIGN.md, PERF-BUDGET.md, ASSET-PIPELINE.md and CLAUDE.md are updated wherever a rule changes.
- Anything that changes how the game plays or feels is tried rough first, then built properly. The owner plays the rough version before the polish goes in.
  - **Changed for steps 12, 13 and 17 (the owner, 2026-11-10, decision 26):** no rough look and no stop. Each is decided here and built in full, and the owner gives one list of changes at the end.
- Nothing is pushed or merged without the owner's say. Good moments to merge are marked "Merge point".

## What changed in this revision

The owner's new aim (2026-11-09): the lab, students and Chromebooks matter less. The work goes into four things:

1. the game of SKATE;
2. the assets and graphics;
3. performance;
4. how the game feels to play.

What that does to the plan:

- **The game gets real controls.** Two rough versions are built and the owner picks one (step 8).
- **The board rolls.** It rolls in, pops, and rolls away or tumbles (steps 12 and 13). There are still no obstacles to clear.
- **The rider is shoes and legs** by default (step 15).
- **The design target is good hardware.** High is what the game is designed for. Low is kept as a simple fallback and gets no new features. The strict draw-call caps become frame-time targets (step 6).
- **The classroom work is parked:** the session surviving a reload, "New student", today's trick in the lab, the flight path in the lab, the offline cache and the Chromebook checklist. See "Parked".

Old step numbers and where they went:

| First version | This version |
| --- | --- |
| 1 to 5 | 1 to 5, unchanged |
| 6 graded landings | 7 |
| 7 and 8 timed pop | 8 and 9 (a choice between two controls first) |
| 9 records and today's trick | 11 (records only) |
| 10 the settle | 13 (joined with rolling away, with a simpler frame rule) |
| 11 dust | 19 |
| 12 instant replay | 17 |
| 13 a spot | 14 (its own model, not merged into the ground) |
| 14 flight path | parked |
| 15 pick your deck | 16 (and the computer gets its own deck) |
| 16 placeholder, 17 session, 18 and 19 offline | parked |
| 20 phones, 21 Firefox and Safari | 21 and 22 |
| 22 measure, 23 last pass | 23 |

## Where it stands

Branch `play-polish-reach`, off `look-feel-perf`. **Everything through step 11 is live (2026-11-10, decision 23):** pull request 1 ran the three CI jobs for the first time, all three passed on 91dfb4c, `main` was fast-forwarded to it and the site was published. Later steps stay on this branch, not pushed, until the next merge point (after step 16).

| Commit | Step |
| --- | --- |
| ee92a68 | 1: the measurement, upgraded |
| f12eac5 | 2: the legs in one draw (ADR-60). Every switch on: High 34, Medium 19, Low 12 draw calls |
| fec3a19 | 3: a download budget at the end of `npm run verify` |
| c297ea4 | 4: one texture decoder instead of two |
| 470bdc1 | This revision of the plan |
| 9b7c140 | A memory leak fix the long-run test found: shared materials are freed with each Canvas |
| e6ab283 | 5: browser checks in CI (ADR-61). 16 checks, about 4.5 minutes; the long-run test is its own CI job |
| 2dcf12f | 6: the new targets (ADR-62). The measurement prints a targets table; every tier passes on today's build |
| fa866c2 | 7: graded landings (ADR-63): clean, sketchy, bail; Hard counts only clean; the export is `trick-lab.events/2` |
| e19c135 | 8, rough: both game controls behind `?controls=flick` and `?controls=bar`. The owner picked the bar |
| 2dc5543 | 11, out of order: records and the trick list (ADR-64) |
| ef7e8ea | 9: the timing bar, built properly (ADR-65); the computer times the same bar; the rough controls are gone |
| f0c9a3f | 10: the game screen as a game (ADR-66): the stage fills it, the panels are cards over it, the first game teaches |
| beea48d | The halfway pause, and notes for the stretch from step 12 |
| 786d5c1 | The owner's answers at the pause (decisions 23 to 26); the four approved deck drawings saved in `assets/source/decks/` |
| e72b079 | 12: rolling (ADR-67). The ground's textures and a print on the wheels slide; no draw call added. Every switch on: still High 34, Medium 19, Low 12 |
| 2fb9f74 | 13: landings with weight (ADR-68): clean rolls on, sketchy rocks and swerves with the rider on, a bail falls onto its nearest side and slides away. A bail in the air now comes down on the pad. Rolling for a regular rider fixed (it went tail first). No draw call added |
| 21bac64 | 14: the skate spot (ADR-69): a kerb, a flat rail, a ledge and a wall behind the board, rolling past on the game screen, with soft shadows, on Medium and High. Every switch on: High 36, Medium 21, Low 12 (the check now measures the game screen too) |
| 8762405 | 15: the legs on by default on High and Medium (ADR-70), in trousers with a cuff over the shoe, a little bunching and a twill cloth; the hip fade a third shorter. The loading pictures show the legs, encoded at WebP 0.6 to stay in budget. No draw call added to the worst case |
| 1c6bb20 | 16: decks (ADR-71): Trick Lab, Dusk, Bolt or Ripple, chosen on the welcome screen; the computer rides Circuit, with teal soles and laces. KTX2 textures per board level, downloaded only when shown, each with a budget. No draw call added |
| 22f13d2 | 17: the game's camera and instant replay (ADR-72): Filmer, Side and Above, lower than the lab's; after a made set or copy the flight again in slow motion from a low, wide camera, with a fisheye bend on High and Medium; Skip replay on Pop and Escape. The legs never hide the board (checked in six poses, both stances, High and Medium). No draw call added |
| bf51c25 | 18: sound (ADR-73): CC0 recordings from Kenney's Impact Sounds for the pop, a new catch, the landing and the bail (11 MP3s, 32 KB, two or three takes each at a random pitch), a synthesized rolling sound that ticks on the concrete's joints, a synthesized scuff, better synthesized fallbacks, and a sound check under ?debug. Nothing sound-related downloads while sound is off; the main page went from 106.0 to 104.9 KB. The Sound switch stays in the top bar, not a second one beside Start game. The owner's list of changes is asked |
| 57adb49 | 19: dust (ADR-74): small puffs at the wheels when a game's landing touches down, left behind as the board rolls on, and a trail behind a bailed board while it slides; Medium and High, with the Motion cues switch, never under reduced motion. One draw while it is in the air; the expected worst case did not move (High 36, Medium 21, Low 12) |
| 09e176d | 20: the smoothness pass (ADR-75): the measurement plays a whole game; the dust's program is built before the first pop; the long-run test plays games. Every level is inside the graphics and work targets through a whole game; High misses about one refresh per game (not the 3D view's doing; left, and the gate not moved) |
| 56b0691 | 21: phones and touch (ADR-76): no sideways scroll and working dialogs at 360, 390, 768 and 1024 px wide already; controls are now 44 px tall where the pointer is a finger; five new browser checks; the phone checklist |
| (step 22) | 22: Firefox and Safari (ADR-77): a pass by hand in Firefox 156 and WebKit 26.6. Firefox passes everything. WebKit's Windows build plays on every level but has no audio and loses the picture after a canvas resize; real Safari is the owner's check. No code changed |
| 91dfb4c | The first CI run (pull request 1, 2026-11-10) timed out in one test: building the High board twice took 31.9 s on GitHub's machine against the 30 s every test gets. That test now has 120 s; what it compares is unchanged |

What was waiting on the owner at the pause, all answered on 2026-11-10. Nothing is waiting now.

| What | Asked | Answer |
| --- | --- | --- |
| Merge `look-feel-perf`, with the leak fix, to `main` (the merge point after step 6) | 2026-11-09, once | Yes, with the game: everything so far goes live (decision 23) |
| Put the game live (the merge point after step 11) | 2026-11-09, at the pause | Yes (decision 23) |
| The five checks of step 8 on the finished timing bar, and the bar by ear with sound on | 2026-11-09, with step 9 | Played it, keep it as built (decision 24) |
| The deck drawings for step 16, shown early as first drafts: Dusk, Bolt and Ripple for the player, Circuit for the computer | 2026-11-09 | All four approved as drawn (decision 25) |

## What the review found (2026-11-09, at a0a2c86), kept for this aim

- **Your attempt can't miss.** In the game your attempt is your slider values, exactly. Once you know a trick's numbers you land it every time. Only the computer can miss. A game of SKATE turns into looking up numbers.
- **The game is played on the lab's panel.** You set three sliders and press Pop. Nothing about doing a trick feels like doing a trick.
- **Landing is yes or no.** A trick lands within 30 degrees of a whole flip and 25 of a half shove (`src/sim/landing.ts`), so a near-miss and a perfect landing look and count the same.
- **Nothing happens after touchdown.** Frames stop the moment the board lands, so a landing has no weight, and a bail looks like a landing with the feet beside the board.
- **The board pops on the spot, on an empty pad.** There is no speed, no place, and no rider above the ankles by default.
- **Sound is off by default** and has six short sounds (`src/audio/sounds.ts`).
- **The middle quality level has no room.** Medium draws 19 of an allowed "under 20", so nothing new could be added to it under the old cap.
- **Never tested:** phones and touch, Firefox, Safari.

## The owner's decisions

Answered 2026-11-09 for the first version, and still standing unless marked.

| # | Question | Answer | Now |
| --- | --- | --- | --- |
| 1 | Where the work goes | A new branch, `play-polish-reach`, off `look-feel-perf` | Stands |
| 2 | Playwright as a pinned dev dependency, for browser checks in CI | Yes | Stands (step 5) |
| 3 | What Medium is for | Keep Medium as it is | Stands, with new targets (step 6) |
| 4 | The game's default way to pop | Timed, with Exact one choice away | **Changed:** two rough controls, then the owner picks (step 8). Exact stays one choice away |
| 5 | Two players on one device | No | Stands |
| 6 | Recorded sounds | No: keep the synthesized sounds | **Changed (see 17 below):** the owner will not record any, and said yes to free recordings that others have given away for the impacts, with synthesized rolling (step 18) |
| 7 | New deck graphics | Drawn here, three of them, for the owner to approve | Stands (step 16) |
| 8 | Rolling over a kerb, nollie and 180s, a full rider | None of them | **Changed:** the board rolls in and away, with nothing to clear (step 12). Still no nollie, no 180s, no full rider |
| 9 | Firefox and WebKit browsers for playwright-cli | Yes, install them | Stands (step 22) |
| 10 | A class report for teachers | No | Stands |
| 11 | A student name in the export | No names | Stands |
| 12 | Hosting | Stay on GitHub Pages | Stands |

Answered 2026-11-09 for this revision:

| # | Question | Answer |
| --- | --- | --- |
| 13 | How you do a trick in the game | Build both rough (flick it yourself, and sliders plus a timing bar), then pick |
| 14 | How far the world goes | Roll in, roll away, in a real skate spot. No obstacles to clear |
| 15 | The rider | Shoes and legs |
| 16 | Weak devices | Design for good hardware. Low is a frozen fallback. Frame-time targets replace the tight caps |
| 17 | Better sounds without recording any | Yes to step 18's mix: free public-domain (CC0) recordings for the impacts, a synthesized rolling sound, and a synthesized fallback for any sound without a good recording |
| 18 | Sound on by default | No. Sound stays off by default |
| 19 | Should the lab roll too | Left to the plan: no. The lab stays on the spot. A still board is easier to study and scrub, and the lab keeps drawing nothing while idle |
| 20 | Phones | They don't matter enough to move up. Step 21 stays late and small, and is the first step to drop |
| 21 | Who picks the recordings | The plan picks and builds them in. The owner listens afterwards and lists changes (step 18) |
| 22 | Which control (the step 8 gate) | Sliders plus a timing bar, after playing both rough versions. "Flick it yourself" is deleted (step 9, ADR-65) |

Answered 2026-11-10, at the halfway pause:

| # | Question | Answer |
| --- | --- | --- |
| 23 | What goes live now (the merge points after steps 6 and 11) | Everything so far: the look-and-feel work and the new game |
| 24 | The finished timing bar | Played it, keep it. No changes |
| 25 | The deck drawings (the step 16 gate) | All four approved as drawn: Dusk, Bolt and Ripple for the player, Circuit for the computer. Step 16 builds them in without asking again |
| 26 | The rough looks of steps 12, 13 and 17 (the plain roll, the three landing motions, the camera angles) | Skip them. The plan decides and builds the full version straight away. The owner gives one list of changes at the end |

## Performance targets (replaces the draw-call ledger)

The first version had a strict table of draw calls per step, because Medium had to stay under 20. With good hardware as the target, the question becomes "does it stay smooth", measured as time per frame. Step 6 writes these into an ADR and the docs. The numbers below are the proposal.

Reference machine: the owner's desktop (RTX 3060), Chromium, 1440 x 900, the build served by `scripts/measure/serve.ts`.

| | High (the design target) | Medium | Low (frozen) |
| --- | --- | --- | --- |
| Who it is for | A desktop or laptop with a real graphics chip | A laptop with built-in graphics | Old or weak machines |
| Graphics time per frame, in a trick and while rolling | under 4 ms | under 3 ms | under 2 ms (step 6: "as today, about 1 ms" would fail by timer noise alone) |
| The app's own work per frame | under 4 ms | under 4 ms | under 4 ms |
| Longest single frame, after the first second on screen | 16.7 ms | 16.7 ms | 16.7 ms |
| Draw calls, every switch on | under 60 | under 40 | under 20, unchanged |
| Measured today | 34 calls, 0.9 to 1.8 ms | 19 calls, 1.4 to 1.5 ms | 12 calls, 1.0 ms |
| New features | all | all but real shadows, motion blur and glow | none, except rolling |

- **Draw calls stay a gate, with room.** The browser checks (step 5) enforce the caps. Each visual step says how many calls it adds.
- **Downloads keep their budget** (`npm run bundle:check`). A new file needs a budget of its own and an ADR that says why.
- **Medium's target is a stand-in.** It is measured on the reference machine with Medium chosen. If the owner has a laptop with built-in graphics, one check there in step 20 is worth more than the number.

What the steps are expected to add (every switch on):

| Step | High | Medium | Low |
| --- | --- | --- | --- |
| Today | 34 | 19 | 12 |
| 12: rolling, as built: texture offsets only (planned +1 each for the wheels) | 0 | 0 | 0 |
| 14: the spot, as built: the model and one soft shadow mesh on both tiers (planned +2 / +1) | +2 | +2 | 0 |
| 19: dust | +1 | +1 | 0 |
| **Expected** | **37** | **22** | **12** |

## Rules this plan changes, and the ones it keeps

**Changes.** Each is made in its step's ADR, with the docs updated in the same commit.

- **BRIEF.md, "Honest and modest: a demo, not a game engine."** The game becomes the main thing, with its own controls and screen (steps 8 to 10). The lab stays the exact, repeatable experiment.
- **ROADMAP.md, "every new visual feature gets an off switch, and the Low setting uses it."** Replaced in step 6: Low is frozen and simply does not get new features. New switches are added only where a player would want one.
- **CLAUDE.md rule 14 and the verify loop's draw-call line.** The caps become the targets above (step 6).
- **CLAUDE.md rule 4 (frames only while something plays).** In the game, frames also run while the board rolls (step 12) and while a landing plays out (step 13). They still stop when nothing moves.
- **CLAUDE.md rule 5.** FlightDriver also writes the roll, the wheel spin, the landing's pose and the dust (steps 12, 13 and 19). It is still the only code that poses anything.
- **CLAUDE.md rule 7.** Shared materials are freed each time the 3D view is rebuilt, not only when the scene goes away (the leak fix, step 5).
- **CLAUDE.md, verify loop item 4, "Do not install Playwright in this project."** Changed with the owner's yes (step 5).
- **ADR-48 (shoes only by default).** The legs are on by default on High and Medium (step 15).
- **The export** gains each landing's grade and how the pop was made (steps 7 and 9). It becomes `trick-lab.events/2`.

**Kept:**

- The exact, hand-written flight model, with no physics engine. Rolling is added around it, not inside it.
- No DOM inside the 3D view. Every control is in the page, works by keyboard, and says what changed.
- No CDNs. Assets are generated, never hand-edited.
- Store actions own the event log, announcements and sound cues.
- Focus moves only where convention 10 says.
- The pinned feet poses (`feet.pinned.test.ts`) and the preset checks do not change, except where an ADR says so.
- Exact (today's sliders and Pop) stays in the game for anyone who can't or won't use the new controls.

## Phase A: foundations

### 1 to 4. Done
The measurement, Medium back under its cap, the download budget, and one texture decoder. See "Where it stands".

### 5. Browser checks in CI. Done (ADR-61)
`@playwright/test`, pinned, Chromium only, run in CI after the build as `npm run test:browser`. It is not part of `verify`.

- **The leak fix is its own commit** (9b7c140). It is a real bug in code that is already on `look-feel-perf`, so it should be easy to carry there.
- **The long-run test's limits can't fail by chance.**
  - The hard check is the count of 3D objects and textures: they must equal the first sample's.
  - Memory growth has a loose limit of 4 MB, about twice what was measured (2.07 to 2.13 MB), since CI machines are slower and noisier.
- **In `.github/workflows/verify.yml`:** the quick checks are one job and the long-run test its own, both on the build `verify` uploads. They have not run in CI yet: that happens on the first push.
- **Docs and ADR-61.** The practical notes from the temporary hand-off note are now in `docs/AGENT-WORKFLOW.md`.

### 6. New targets, written down. Done (ADR-62)
- **An ADR (ADR-62)** records the owner's change of aim and the targets above, and why the caps moved: the target device changed, not a failing check.
- **Docs in the same commit:** BRIEF.md's opening, ROADMAP.md's ground rule, CLAUDE.md's intro, rule 14 and the verify loop, PERF-BUDGET.md's target table.
- **The browser check's caps** (`browser/ledger.spec.ts`) move to under 60, 40 and 20.
- **The measurement** (`scripts/measure/measure.js`) reports the longest frame and the frame-time spread, not only the middle value.
- **Done when** a run on today's build prints the new table and passes it. It does (PERF-BUDGET.md, "Step 6"): High 1.05 ms of graphics time and 1.4 ms of work, Medium 0.66 and 1.0, Low 0.2 and 0.7, at the 95th percentile.
- **Two things settled while building it.** The longest-frame gate is under 20 ms (16.7 ms plus timer jitter; the reference browser draws at 120 frames a second). The app's own work is a new number, `perfStats.workMs`: FlightDriver's pose and the draw together.

**Merge point.** The game of SKATE and the look-and-feel work are finished and not live. This is a good moment to merge `look-feel-perf` (with the leak fix) to `main`. Answered 2026-11-10: yes, together with phase B (decision 23).

## Phase B: the game

### 7. Graded landings: clean, sketchy, bail. Done (ADR-63)
Small, and it comes first because the controls need it to tell you how close you were.

As built:
- **The computer on Hard was recalibrated.** With only clean landings counting, its old miss would have made a kickflip 54 times in 100 instead of 97. Its spread went from 0.035 to 0.012, which keeps every trick within 4 points of before (the table is in ADR-63).
- **The sketchy look is a narrow, uneven stance:** the shoes come down toward the middle of the board, the front up to 6 cm and the back up to 3.5 cm. The rock and swerve come in step 13.
- **Not done here:** the session's start time in the export (it belonged to the parked session work), and the scuffed landing sound (step 18).

- **Three grades** in `src/sim/landing.ts`:
  - **clean:** within 10 degrees on the flip and 8 on the shove;
  - **sketchy:** landed, but outside a clean limit;
  - **bail:** not landed.

  `isLanded` stays exactly as it is, so recognition, the catch and the feet still agree.
- **`TrickResult` gains `grade`.** Every preset lands clean at pop 0.35 m (tested).
- **The words.** "Landed clean", or "Landed, sketchy: 18 degrees past on the flip". The celebration says "Clean!" for clean.
- **The look.** On a sketchy landing the shoes come down off the bolts. Clean is today's motion exactly.
- **The game.** On Hard a set or a copy counts only if clean, for both players, and the guide says so.
- **Tests** use inputs the sliders can reach, as the first version explains (`cleanSetup`).

### 8. Two rough controls, then the owner picks. Done: the timing bar (2026-11-09)
Both are built quickly, behind a URL switch (`?controls=flick` and `?controls=bar`), with no polish, no docs and no ADR. Each has one pure function in `src/sim` that turns what the player did into pop, flick and scoop, with a few tests.

- **A. Flick it yourself.** No sliders and no numbers.
  - **Mouse or touch:** press and hold on a pad over the lower part of the stage to crouch. The longer you hold, the higher the pop. Drag sideways for flick (one way kickflip, the other heelflip) and along the board for scoop. Let go to pop.
  - **Keyboard:** hold Space to crouch. While holding, the arrow keys add flick (Left and Right) and scoop (Up and Down), more the longer each is held. Let go of Space to pop.
  - A small line of text shows the trick you are winding up.
  - Nobody's hand is exact, so a miss comes from you, with no dice.
- **B. Sliders plus a timing bar.** The first version's design: the sliders say what you are going for, Pop starts a bar that sweeps for 1.2 seconds, and Pop again releases. In the band, you get exactly what you set. Early under-rotates, late over-rotates.
- **The owner plays each for ten minutes** and picks. What to look for:
  - a new player lands a kickflip within five tries;
  - after practice, a 360 flip lands about half the time;
  - when you miss, you can say what you did wrong;
  - it can be played with the keyboard alone;
  - it is still fun after ten minutes.
- **The pad is a page element**, not part of the 3D view. In the game, dragging on the stage no longer turns the camera where the pad is.
- **Done when** the owner has picked. The other one's code is deleted in step 9.

As built, rough (2026-11-09): `src/sim/controls.ts` (the two pure mappings, tested), `src/ui/RoughControls.tsx` (the pad, the bar, inline styles) and `popAttempt` in the store. Open the game with `?controls=flick#/skate` or `?controls=bar#/skate`; with neither it is today's sliders and Pop.
- **Flick it:** the crouch reaches the highest pop in 2 seconds, so a 0.35 m pop is a hold of about 0.9 s. A drag of 60 pixels is 1 rev/s (a kickflip at that pop is about 112 pixels to the right). By keyboard each arrow adds 3 rev/s per second held. Right is a kickflip and left a heelflip; down (toward the heels) is backside and up frontside. The plan said "along the board" for scoop; up and down was chosen so the mouse and the arrow keys agree, and it is one line to swap.
- **The bar:** a 1.2 s sweep with the band centred at 0.8 s, 280, 200 and 120 ms wide on Easy, Normal and Hard. Outside the band the rates scale by up to 50, 60 and 70 percent per half sweep.
- **Known rough edges, on purpose:** in flick mode the shoes and the motion cues do not follow the wind-up, the trick guide still talks about sliders, and neither control announces anything of its own.

### 9. The chosen controls, built properly. Done (ADR-65)
As built, where it differs from the list below or adds to it:
- **A late release may pass the sliders' limits.** As written, the scaled rates were held to the sliders, and a double flip (flick 3.0, the limit) could then never be missed late. The test "every trick bails at the sweep's end" found it. The rates now go up to about 4.2 rev/s, and the feet clearance check covers that.
- **The sliders are not disabled while the bar runs.** The attempt is the sliders as the bar started, which does the same job without taking focus from a slider.
- **By ear it is a count:** a tick at the start, a tick at 400 ms and a higher click on the band's centre at 800 ms, over the rising tone.
- **The computer's before-and-after table is in ADR-65.** Easy and Normal are within 5 points on every trick. On Hard three kinds are not, and are accepted there: double flips 6 more, 360 shove-its 7 more, varials 6 less.
- **The computer's release is shown on the bar,** with a line of text, but not announced.
- **Not checked by the plan, and the owner's to judge:** the five checks of step 8 on the finished version, and the bar by ear with the screen covered. The mechanics were checked in a browser by keyboard, mouse and emulated touch on every quality level.
- **Left for step 10:** the bar sits in the lab-style column under Pop; the game screen as a game moves it.

- **The store owns an attempt in progress**, with an id, so a late or doubled callback does nothing. It reads an injected clock, so tests are exact.
- **Cancelled with no attempt and no letter**, and announced, on: a screen change, quit, a new game, Reset, a dialog opening, or the tab being hidden.
- **Feedback names the mistake.** "Too much flick: 18 degrees past. Landed, sketchy."
- **Announcements:** the start and the result only, never the wind-up.
- **Exact stays one choice away** at the game's start, remembered as a preference and never logged.
- **The record.** `trick.popped` records how the pop was made and the inputs it produced.
- **The computer.**
  - If "flick it" wins, the computer keeps today's way of missing: it aims and misses by a random amount for its level.
  - If the bar wins, the computer goes through the bar too, as the first version describes, with a before-and-after table of how often it makes each trick.
- **By ear, if the bar wins:** a rising tone and a click at the band. Bluetooth headphones delay sound by a tenth to a third of a second, so the Easy band must be wide enough for that, and Exact is offered when sound is off.
- **An ADR, BRIEF.md and DESIGN.md.**
- **Done when** the owner's five checks from step 8 hold on the finished version, by mouse, by touch (emulated) and by keyboard.

### 10. The game screen, as a game. Done (ADR-66)
As built, where it differs from the list below:
- **"The sliders show only in Exact" could not work as written.** It was written before the pick. With the timing bar the sliders are the control in both ways of popping, so they are always in the tray at the bottom.
- **The first game walks you through your first go, whatever its trick.** The coin flip stays, so that go may be a copy of the computer's trick; it is a kickflip when you are up to set and have not called yet. Three prompts on the bar, two in Exact. It gives the slider values, the one place the game does.
- **"The computer goes on its own by default" was already so** (ADR-46). Nothing changed.
- **A narrow screen keeps the stacked layout** until step 21.
- **Room is short for more interface:** the stylesheet is 7.4 of 8.0 KB and the main script 103.0 of 106.0 KB.

Today the game uses the lab's side panel. The design side draws the new screen in DESIGN.md first, then it is built.

- **The stage fills the screen.** The letters, whose turn it is and the trick in play sit over it as a heads-up display (page elements over the stage, not inside the 3D view).
- **The controls' hints sit at the bottom.** The sliders show only in Exact.
- **Turns flow.** The computer goes on its own by default, after a short beat, so you never press a button to make it play.
- **The first game teaches.** Your first turn walks you through one kickflip with the controls, in three short prompts, then gets out of the way. "How to play" shrinks to match.
- **Kept:** every control has a name, a visible focus style and an announcement where state changes. Focus moves only as convention 10 says.
- **Done when** a whole game can be played by keyboard alone and by mouse alone, with no console errors, on every quality level.

### 11. Records and the trick list. Done, out of order (ADR-64)
As built: a lab landing counts as much as a game landing; a game that is quit is not a record; today's date is a parameter of the store; nothing is announced for a first landing (the list shows it). The one dialog that asks before something is lost is now shared with leaving a game.

- **Records**, saved on the device (`trick-lab.records`, versioned): for each named trick, the first date it was landed and its best grade; games won and lost against each level; the current winning streak.
- **A trick list on the welcome screen:** the 15 settable tricks plus the ollie, as a grid. Landed and clean are marked in text, not only colour.
- **"Clear records"** asks first.
- Store actions write the records, never components. They are never logged or exported.

**Merge point.** The game now plays differently. A good moment to put it live and play it for a few days before the art goes in. Answered 2026-11-10: yes, everything so far goes live (decision 23).

## Phase C: the world and the rider

### 12. Rolling. Done (ADR-67)
As built, where it differs from the list below:
- **No draw call was added.** The wheels' texture was bands, the same all the way round, so two spinning axle pairs would have looked exactly like still ones. The wheels got a print on their outer face instead, and the print turns by sliding the wheel map, one turn per circumference; the ground's textures slide the same way. Nothing moves but texture offsets.
- **The go starts at the bar, not at the turn.** On the player's turn the board waits while they set the sliders, and the timing bar is the push. The computer stops, pushes off and pops inside its 2.2 s wait. An Exact pop pushes off with the pop.
- **The numbers chosen** (`ART.roll`): a 2.4 m/s cruise, 0.7 s to reach it, 1.3 s to stop after the landing, steadily. The print: a long and a short arc (`WHEEL_PRINT`). All on the owner's list at the end.
- **Checked in a browser** on High, Medium and Low: the ground is pixel for pixel the same 9.6 m apart (only the wheels' pixels differ, the print having turned), the board pushes, cruises and stops, no frame is drawn in the two seconds after it stops, and no console errors.

- **The board stays where it is and the world moves.** The ground slides under the board and wraps so it never ends, the wheels spin, and the scenery (step 14) slides past. The camera, the shadows and the fog stay as they are.
  - This is why the flight model does not change: a board in the air keeps moving with the ground, so the pop, the spin and the catch are the same as today.
- **The wheels become two axle pairs** in the board models, so each pair can spin: one more draw call.
- **When it rolls.** In the game, from the start of a turn until the board comes to rest after the landing. The lab stays on the spot.
- **When it does not.** Under reduced motion the board pops on the spot, as today. Frames stop when the game is paused, a dialog is open or the tab is hidden.
- **The speed and the slow-down** are art numbers in `artDirection.ts`. FlightDriver writes them, with no per-frame allocation.
- **Low rolls too**, since sliding a texture costs almost nothing.
- **No rough look** (the owner, 2026-11-10, decision 26; the first plan had a plain version shown first). Built in full straight away. The speed, the slow-down and how the wrap is hidden are decided here, said in the step's report, and go on the owner's one list of changes at the end.
- **Done when:**
  - the ground never visibly jumps where it wraps (checked in screenshots either side of the wrap);
  - the scene's text description says the board is rolling;
  - a steady roll stays inside the targets.

### 13. Landings with weight. Done (ADR-68)
As built, where it differs from the list below or adds to it:
- **In a game only.** The lab stays the exact experiment: its timeline ends at the touchdown.
- **In a bail the rider stops and the board slides on**: the roll stops at once (the camera stays with the rider), and the board slides 0.6 m along the nose and 15 cm away from the feet. The feet stay where they stepped down and are cleared against the moving board every frame, so one it slid out from under comes down to the pad.
- **The board falls over its own edge**: the board seen end on (`boardSection.ts`, the hull of the built boards) gives its height at every roll. A bail in the air now also comes down on the pad: it used to end through it.
- **Found and fixed:** step 12 rolled a regular rider tail first.
- **The numbers chosen** (`SETTLE` in `src/sim/settle.ts`): sketchy rock 5 degrees over 0.5 s, swerve 7 degrees and back over 1 s ending 5 cm to the side; bail fall 0.4 s a quarter turn, slide 1.1 s.
- **Checked in a browser** on High, Medium and Low, both stances: a sketchy landing, a bail onto a rail, one upside down and one wheels down (the shove off), each to rest, no console errors. A new browser check counts no frame between one and three seconds after rest, on every level.

This joins the first version's "settle" with rolling away.

- **Clean:** the board rolls on straight and slows to a stop.
- **Sketchy:** the board rocks once about its wheels, swerves a little, and the shoes ride it.
- **Bail:** the board falls onto its nearest resting side and slides away from the feet, and the feet step off.
- **One pose for everyone.** A pure function in `src/sim` gives the board's and the feet's pose through the landing. The board, the shadow, the shoes, the legs and the scene's text description all read it.
- **Contact, tested.** Through the whole landing the board's lowest point is on the ground (within 1 mm), a riding shoe stays on the grip, and a sliding board never passes through a shoe. Both stances, both directions.
- **It can be cut short.** A new pop, a screen change, a change of quality level, reduced motion turned on, or the 3D view failing all end it at once and show the end pose. The store does this, since the 3D view may be gone.
- **A simple frame rule** (this replaces the first version's frame-by-frame gate): once everything has come to rest, frames stop within one second and stay stopped. The check: no frames drawn between one and three seconds after rest.
- **No rough look** (the owner, 2026-11-10, decision 26). The three motions and their timing are decided here and built in full; the timings are art numbers, so a change from the owner's list at the end is cheap.

### 14. A skate spot. Done (ADR-69)
As built, where it differs from the list below or adds to it:
- **Soft shadows instead of a real one on High.** One decal mesh under the pieces, on Medium and High alike: one draw call, no shadow-map cost. Medium is +2 calls, not +1.
- **On the game screen only.** The lab stays a clean experiment and the welcome screen is unchanged. The model is its own lazy download when the game screen first shows, so no first visit downloads it.
- **Behind the board, always.** Every piece is at z below -1.05 m and every camera looks from +Z, so the spot can never cover the board or the feet. Step 17 must keep its cameras on that side and check the six poses then; today's cameras were checked.
- **The loop is 50 m**, the pieces within 5.6 m of its centre: at the wrap the nearest piece is 19.4 m away, past the fog (tested).
- **Not culled**, so the draw count is the same in view or rolled away, and the browser check now measures the game screen, at rest and in a 360 flip, for every switch combination.
- **Checked in a browser** on High, Medium and Low, from the game camera and from a low camera at rest and rolled 6 m on: no console errors, Low draws no spot.

- **A kerb, a ledge, a flat rail and a wall**, as their own model (`spot.glb`), generated like the others, with its own budget.
- **It slides past with the ground** and comes round again, far enough apart that it does not look like a loop. The fog hides where it appears.
- **High and Medium.** On High it casts shadows. Low has none.
- **Never in the way.** It never covers the board or the feet from the game's camera or the replay's (checked in the six poses).
- **Scenery only.** Nothing is cleared or ground on.
- **Cost:** one draw call, two on High. Proposed budget: 300 KB, 15,000 triangles, 3 textures at 1024 px.

### 15. The rider's legs, on by default. Done (ADR-70)
As built, where it differs from the list below or adds to it:
- **The default follows the level** until the student chooses: on with High and Medium, off on Low, moving with a change of level or the automatic step-down. A saved choice wins.
- **The cuff ends 2.5 cm below the ankle joint**, over the shoe collar, and the sock is dark: at the joint the back of a forward-leaning shank showed 2 to 3 cm of white ankle.
- **The "never hides the board" check moves to step 17.** From today's overhead rider camera, at the peak of a 360 flip a shank can cover up to about a fifth of the board (checked in six poses, both stances, High and Medium). Step 17's lower game camera is the fix, and each of its angles and the replay's is checked there. The lab keeps its rider view.
- **The loading pictures** now show the legs, and are encoded at WebP 0.6 instead of 0.8 to stay inside their download budget (26.5 KB).

- **On by default on High and Medium.** Low stays as it is.
- **Better trousers:** a cloth surface, a cuff that sits over the shoe, and the fade at the hips checked again now that it is a dither (ADR-60).
- **Never hides the board** from the game's camera: checked in the six poses, both stances.
- **An ADR** that answers ADR-48's reasons for shoes only.

### 16. Decks: yours and the computer's. Done (ADR-71)
As built, where it differs from the list below or adds to it:
- **The computer's shoe colour** is Circuit's teal on the soles and laces (High's shoe model, Medium's simple shoes).
- **Whose board shows**: the rider of the go in view while its flight and landing show, otherwise whoever is up next, so a landing never changes deck under the board.
- **On Low** nothing changes: its board has no graphic and Low is frozen (ADR-62). The choice's hint says the decks show on High and Medium.
- **A failed download** of the student's deck puts the choice back and says so; a failed Circuit only warns in the console, and the computer's board keeps the student's deck.
- **Budgets**: 40 KB per Medium file and 96 KB per High file (the largest built is 25.5 and 57.5 KB). No first visit downloads a deck, so the download budget is unchanged.
- **Checked in a browser** on High, Medium and Low: each deck from below, the computer's go with Circuit and teal shoes, the choice by keyboard at 1400 and 390 px wide. A new browser check swaps a deck on High and Medium and blocks a download.

- **Four deck graphics:** today's, plus three new ones drawn here as SVGs. The owner approves them before they are built in, so the drawings are started early and shown as soon as they exist.
  - **Approved as drawn, 2026-11-10 (decision 25):** Dusk, Bolt and Ripple for the player, Circuit for the computer. The four SVGs are in `assets/source/decks/`. Nothing reads them yet; this step builds them in.
  - That makes five graphics with today's: the player chooses between today's, Dusk, Bolt and Ripple, and Circuit is the computer's own.
- **The computer rides its own deck and shoe colour**, so you can see whose turn it is from the board.
- **A "Deck" choice on the welcome screen**, remembered. A failed download keeps the current deck and says so.
- **Built as textures downloaded only when chosen**, with a budget each. The first version's notes on loading, late downloads and freeing each texture exactly once still apply.

**Merge point.**

## Phase D: feel

### 17. The game's camera, and instant replay
- **A game camera:** lower and closer than the lab's, like a friend filming. Two or three fixed angles to choose from, by buttons. The lab keeps its free camera.
- **The legs never hide the board** from any of its angles or the replay's (moved here from step 15, ADR-70): checked in six poses of a 360 flip, both stances, High and Medium. The skate spot stays behind the board (ADR-69): every angle looks from the +Z side.
- **Instant replay.** After your made set or copy, the flight plays once more in slow motion, with a fisheye bend on High and Medium.
  - It has its own start and end, apart from scoring: events, records and the automatic quality step-down do not see it.
  - The Pop button reads "Skip replay" while it plays, so focus never moves. Escape skips too.
  - Nothing else moves during it: the computer's turn waits.
  - An "Instant replay" switch, on by default, off under reduced motion.
- **No rough look** (the owner, 2026-11-10, decision 26). The angles are chosen here and built in full, with the buttons to switch between them; the owner's list of changes at the end can move or drop one.

### 18. Sound
Today there are six short sounds, each made in the browser from a few beeps and bursts of hiss (`src/audio/sounds.ts`). That suits a steady hiss like wheels on concrete. It does not suit a sharp knock like wood hitting the ground, which is why the pop and the landing sound thin. So the two kinds are made differently.

- **Rolling: synthesized, and better than a recording here.**
  - Wheels on concrete are close to filtered hiss, which the browser makes well.
  - It follows the board's speed exactly, and stops with the board.
  - It ticks each time an axle crosses a joint in the concrete (the joints are 1.6 m apart, `groundSpec.ts`), front axle then back, in step with the picture. A looped recording can't do that.
- **Impacts: free recordings that other people have given away.**
  - For the pop, the catch, the landing, the scuff of a sketchy landing and the clatter of a bail.
  - Only recordings released as CC0 (public domain: free to use and to ship in a public repo, with no credit owed), for example from Freesound. Nothing with "no redistribution" or "credit required" terms.
  - Two or three takes of each, picked at random and played at a slightly different pitch each time, so ten pops in a row do not sound like one sound ten times.
  - Trimmed and levelled to match each other, kept in `public/sounds/`, with a `CREDITS.md` beside them: each file's source page, its licence, and the date it was fetched.
  - Slow motion lowers and stretches them by the rule the synthesized sounds use today (`slowMotion`).
- **If no good free recording exists for a sound, or a file fails to load,** a synthesized version plays. Today's pop, landing and bail are improved for that: a knock made of a few ringing tones, in place of one sliding beep.
- **Off by default** (the owner's answer, 2026-11-09). The Sound switch sits beside "Start game", so it is one press away. **Changed in step 18 (ADR-73):** it was already one press away in the game screen's top bar, and a second switch would give screen readers two buttons named "Sound", so there is still one, on every screen.
- **Nothing is downloaded until sound is turned on.** Each file has a size limit, and the whole set stays under about 150 KB. The files are served from this site, never a CDN.
- **One file format that every target browser plays,** checked in step 22.
- **Cues still come from store actions only.** The rolling sound follows the store's "rolling" state. It is not called every frame.
- **An ADR** updates ADR-58, which says nothing is downloaded and nothing is licensed.
- **Where they come from,** in this order:
  - CC0 collections that download without an account (for example OpenGameArt's CC0 section and Kenney's sound packs);
  - Freesound, filtered to CC0. Its full-quality downloads need a free account, so if a sound can only be found there, the owner's login is asked for at that point.
- **The plan picks, the owner reviews after** (the owner, 2026-11-09). There is no listening round first: the recordings are chosen, trimmed and built in, and the step is finished like any other.
  - Then the owner listens and lists changes.
  - A swap is cheap by design: replace the file, update `CREDITS.md`, and nothing else changes.
- **A sound check page for that review.** Under `?debug`, a plain list of every sound with a Play button for each take and for its synthesized fallback, at normal speed and in slow motion. So the owner can hear each one alone, not only in the middle of a game.
- **Done when:**
  - every impact has a recording or a stated reason it stayed synthesized;
  - `CREDITS.md` lists every file;
  - with sound off, a visit downloads no sound file (step 1's run);
  - the owner's list of changes has been asked for. The changes themselves are a follow-up commit.

### 19. Dust. Done (ADR-74)
- **A small puff at the wheels** on touchdown and under a sliding board: one draw call, on High and Medium.
- **No switch of its own.** It follows the existing motion cues switch, and is off under reduced motion.
- **As built:** soft discs worked out on the CPU, not a points shader (one plain material for both renderers). In a game only: the lab draws no frames after a landing. The expected worst case did not move (High 36, Medium 21): the motion cues' draw has faded by the landing, so the dust takes its place.

## Phase E: performance and reach

### 20. A smoothness pass. Done (ADR-75), with one target not met
Rolling means frames run for a whole turn, not half a second, so this is measured again.

- **A whole game, measured:** the frame-time spread and the longest frame over a full game on each quality level, against the targets.
- **The first trick:** if the first pop of a visit stutters while the graphics card prepares new effects, they are prepared during loading.
- **The long-run test** (step 5) plays with rolling, landings and replays.
- **Loading:** the full scene still appears as fast as today at full speed (about 1.0 to 1.2 s), with the new models.
- **Fix what fails.** Results go into PERF-BUDGET.md.
- **If the owner has a laptop with built-in graphics,** one game on it on Medium.
- **As it went (2026-11-10):** the graphics and the app's work are well inside the targets through a whole game on every level, loading is unchanged, and the long-run test passes with games in it. Medium and Low missed no refresh. **High misses about one refresh per game** (one frame in 3,000 to 5,500, 20 ms on a 100 Hz display, once 30 ms), so "no frame longer than 16.7 ms" is not met there by the letter. It comes from the page redrawing a card, not from the 3D view; nothing was changed for it and the gate was not moved. The first trick of a visit has two late frames of the same kind. The numbers are in PERF-BUDGET.md, "Step 20".

### 21. Phones and touch. Done (ADR-76)
Small, late, and the first step to drop (the owner, 2026-11-09: phones don't matter enough to move it up).

- **Checked in Chromium with touch turned on** at 360 x 780, 390 x 844, 768 x 1024 and 1024 x 768: no sideways scroll, the controls reachable with a thumb, the heads-up display readable, the dialogs usable.
- **Fixes** by the design side, in `app.css`.
- **Real phones:** the owner, from a short checklist.
- **As it went (2026-11-10):** the layout already held at all four sizes. The one fix: controls are 44 px tall where the pointer is a finger (they were 24 to 36). `browser/touch.spec.ts` keeps it. The checklist is under "Checklists for the owner".

### 22. Firefox and Safari. Done (ADR-77), with Safari left to the owner's check
- **Firefox and WebKit installed for playwright-cli** (the owner's yes, 2026-11-09), for testing on this machine only.
- **A quick pass in each:** the 3D view starts, the textures load, sound starts, the controls work, the layout holds.
- **Fixes**, and a "Browsers" table in PERF-BUDGET.md.
- **As it went (2026-11-10):** Firefox passes everything, sound included. WebKit's Windows test build starts and plays on every level, but has no audio at all, and stops showing the picture after the canvas changes size although the app still draws it. That looks like the test build, not the app, and cannot be settled without real Safari: five questions for the owner are under "Checklists for the owner". No code changed.

### 23. Measure everything, and the last pass
- **Before (a0a2c86) and after**, from step 1's script, into PERF-BUDGET.md: every quality level, both themes, the game and the lab.
- **Keyboard only, through every screen.** A screen reader spot check: the owner, from a checklist.
- **Docs:** the README (features, numbers, screenshots, and a GIF of a turn in the game), the ROADMAP, CLAUDE.md, and this plan's status line.

## Checklists for the owner

### On a real phone (step 21)

Open the live site on a phone, in the phone's own browser. Each line is a yes or a no.

1. The welcome screen loads, and the board is shown (a moving preview, or a still picture on an older phone).
2. Nothing is cut off at the sides, and the page never slides sideways.
3. "Play SKATE" opens the game. Every button and switch is easy to hit with a thumb, with no wrong taps.
4. Start a game. The board stays in view at the top while you scroll down to the sliders and Pop.
5. Tap Pop, then tap again when the marker is in the green band: the board pops.
6. Drag a slider with a thumb: it moves, and the page does not scroll instead.
7. After the trick, the result and the letters are readable without zooming.
8. "Quit game" asks first, and both of its buttons fit on the screen.
9. Turn the phone sideways: the board and the controls are both still usable.
10. Turn Sound on and pop: you hear it (on an iPhone, with the ring switch not on silent).
11. The game does not stutter. If it does, open the practice lab, then View, and say which Quality it is on.

### In Safari, on a Mac or an iPhone (step 22)

The test build of Safari's engine on this Windows machine could not answer these. Each is a yes or a no.

1. The welcome screen shows the board.
2. Open the practice lab, then "Game of SKATE" from its top bar: the board is still shown on the game screen (not an empty, plain-coloured stage).
3. Make the window narrower and wider (or turn the phone): the board is still shown.
4. Turn Sound on and pop a trick: you hear the pop, the catch and the landing.
5. Play one whole go in the game: the board rolls, pops, lands, and the replay plays.

## If time runs short

The order of value:
1. Steps 5 and 6 (finish the foundations).
2. Steps 7 to 10 (the game plays like a game).
3. Steps 12 and 13 (rolling and landings).
4. Steps 17 and 18 (camera, replay and sound).
5. Everything else, with step 21 (phones) the first to drop.

## Expected results (estimates until step 23 measures them)

- **A trick in the game is something you do**, not numbers you look up, with three grades of landing.
- **The board rolls, lands with weight, and a bail looks like one.**
- **The game has a place, a rider with legs, a choice of deck, and sound:** recorded impacts and a rolling sound that follows the board.
- **Smooth on good hardware:** inside the frame-time targets through a whole game, with no stutter on the first trick.
- **Playable by keyboard, mouse and touch**, and checked in Firefox and Safari.

## Parked (not in this plan; pick up later if wanted)

- **The session's log surviving a reload, and "New student".**
- **The offline cache (a service worker).** If it comes back: give each model a fingerprint in its file name, so an out-of-date tab gets "file not found" and shows the simple board, which already works. That avoids checking every model's bytes while the game runs.
- **The tiny loading placeholder** for slow networks.
- **Today's trick and the flight path in the lab.**
- **A real Chromebook check.**
- **Lighthouse on the live site.**

## Left out on purpose

**By the owner's decisions (2026-11-09):** two players on one device; things to clear (kerbs, gaps); nollie and body 180s; a full rider; a class report; a student name in the export; a host move.

**By design:**
- **A physics engine.** The exact model is the project's strength.
- **Online play, accounts and cloud saves.**
- **Analytics.**
- **Camera shake.** It makes some people queasy.
- **Music.**
- **The hardflip.** ADR-41 stands.

## Risks

- **New controls can shut people out.** Exact stays one choice away, and the keyboard path is tested at every step.
- **The controls might not be fun.** That is why two are built rough and played before either is polished.
- **Rolling touches the idle rule.** A board that never stops would run the graphics card all the time. The rule is: it comes to rest after every landing, and frames stop.
- **The art grows the download.** Each new model has a budget, and the deck graphics download only when chosen.
- **A recording's licence can be wrong or change.** Only CC0 files are used, each one's source page and licence are written down on the day it is fetched, and any sound can fall back to its synthesized version.
- **This revision is unreviewed.** The first version was reviewed for eight rounds. This one changes how the game is played and what the caps are, on one read of the code.
