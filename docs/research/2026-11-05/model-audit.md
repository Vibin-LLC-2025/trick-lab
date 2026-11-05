# trick-lab: why the shoe motion still reads as unrealistic, and what to do first

Audit written 2026-11-05 (opus, research only; no file in C:\dev\trick-lab was changed). Sources: the code at commit 3b8f1ce, `docs/RESEARCH-FEET.md`, `docs/DECISIONS.md` (ADR-1, ADR-17, ADR-20, ADR-27, ADR-29 to ADR-35), `docs/BRIEF.md`, `docs/BRIEF-FEET.md`, a numeric probe of the sim (tsx, run from the scratchpad against `src/sim`), and screenshots from the running dev server (High tier, goofy, feet on, playwright-cli session `model-audit`, closed).

Labels used below: **[code]** verified by reading the code, **[probe]** measured by running the sim, **[browser]** seen in a screenshot, **[infer]** my inference or estimate, not verified.

Screenshots (all in `C:\Users\dylan\AppData\Local\Temp\claude\96683fe376dc941d\b8ea5f31-a861-4099-97b1-af16878f499a\scratchpad\shots\`):
- Home (rider) view: `kf-003.png` to `kf-100.png`, `tre-003.png` to `tre-100.png`, `shove-003.png` to `shove-100.png` (progress 3, 10, 20, 35, 50, 65, 80, 90, 100 percent).
- Low side view from the heel side (camera at 0.25, 0.32, 1.55, target 0, 0.25, 0): `side-kf-005.png` to `side-kf-095.png`, same for `side-tre-*` and `side-shove-*` (5, 15, 25, 40, 55, 70, 85, 95 percent).
- Console: 0 errors, 2 warnings.

---

## 0. The short answer

The shoes are not the main problem. The board is. `writePose` spins the board at a constant rate from progress 0 to progress 1 (`src/sim/flight.ts:207-208`), so there is no moment at which the feet can catch it. Everything the feet model does after about 50 percent of the airtime is a workaround for that: the feet gather to the bolts on a fixed schedule (0.35 to 0.75) while the board is upside down or on its edge, the clearance step (ADR-29) then props them up on whatever part of the spinning board is highest, and they only meet the grip at the instant the wheels hit the pad. A viewer reads that as "two shoes balancing on a rolling log", not as a catch.

The single most effective change is to give the flight phases: a spin-up while the front foot is still in contact, free rotation at a higher constant rate, a catch window in which the feet stop the rotation and press the board flat, and a ride-down with the feet on the grip. This can be done inside `src/sim/flight.ts` without changing `rollTotal`, `yawTotal`, recognition, the presets or `tricks.test.ts`. Then re-time the feet to that catch. Legs come after, and reference data drives the numbers for both.

---

## 1. Diagnosis: specific defects and how a viewer perceives them

### Measured state of the sim [probe]

Preset kickflip (pop 0.35, flick 1.9), goofy, `feetPoseAt` against `writeFeetIntent` (the model before the clearance). "lift" is how much the clearance step had to raise the shoe; non-zero means the shoe is held up by the board, not placed by the model.

| u | board y | roll | front y | front lift | front x, z | front yaw | back lift |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.05 | 0.122 | 18 | 0.288 | 0.056 | 0.142, 0.038 | 45 | 0.055 |
| 0.16 | 0.220 | 58 | 0.414 | 0.000 | 0.266, 0.139 | 0 | 0.081 |
| 0.22 | 0.262 | 80 | 0.446 | 0.000 | 0.319, 0.179 | -19 | 0.071 |
| 0.50 | 0.350 | 183 | 0.482 | 0.000 | 0.302, 0.123 | 15 | 0.000 |
| 0.60 | 0.336 | 219 | 0.454 | 0.018 | 0.252, 0.057 | 54 | 0.050 |
| 0.70 | 0.294 | 256 | 0.410 | 0.054 | 0.214, 0.008 | 82 | 0.056 |
| 0.80 | 0.224 | 292 | 0.326 | 0.066 | 0.208, 0.000 | 87 | 0.066 |
| 0.90 | 0.126 | 329 | 0.195 | 0.052 | 0.208, 0.000 | 87 | 0.052 |
| 1.00 | 0.000 | 365 | 0.030 | 0.021 | 0.208, 0.000 | 87 | 0.020 |

Gap between the front sole and the deck centre (front y minus board y): 0.118 m at 0.6, 0.116 at 0.7, 0.102 at 0.8, 0.069 at 0.9, 0.041 at 0.95, 0.030 at 1.0. The feet reach the grip only at the landing.

Pop shove-it (scoop 0.9): the feet are at their landing spots (x plus or minus 0.208, z 0, yaw 87) from 0.75, when the board's yaw is 130 degrees; the board turns the last 43 degrees under feet that do not move.

360 flip: at 0.25 the board is yawed 90 degrees and on its edge while the shoes are 30 cm away in the rest frame; the back foot is lifted 13.6 cm by the clearance at 0.10.

### Defects

**D1. No catch: the board rotates at a constant rate until the wheels touch.** [code] `computeFlight` (`flight.ts:92-101`) and `writePose` (`flight.ts:207-208`: `roll = rollTotal * p`, `yaw = yawTotal * p`), the contract in `docs/BRIEF.md:49` and ADR-1. RESEARCH-FEET.md section 4 item 11 (line 165) and ADR-20 "Not adopted" already name this; it was never fixed. Consequence [probe]: a kickflip is at 256 degrees (edge-on) at 0.70, 311 at 0.85, 329 at 0.90, only 53 ms before landing. **Perceived** [browser, `side-kf-070.png`, `side-kf-085.png`, `side-tre-085.png`]: the shoes perch on the top rail and the wheels of a board that is still showing its graphic to the camera, then the board "finishes" its flip under the shoes as they touch down. There is no stomp, no moment of contact, and the trick looks like it was caught by luck. This is the single biggest reason the feet look wrong.

**D2. The feet are propped up by the spinning board for the last 40 percent of a flip.** [code] `clearBoard` (`feet.ts:454-461`) lifts each shoe by the least amount that clears the board in its current pose. [probe] For the kickflip the lift is 5.0 to 6.6 cm from 0.60 to 0.90 on both feet, so their height in the descent is set by the board's silhouette, not by the model. **Perceived** [browser, `kf-065.png`]: from the rider view at 65 percent both shoes are sitting on the bottom graphic of an upside-down board, exactly over the trucks. It reads as "the rider landed on the underside of the board". ADR-29 solved interpenetration, which was correct, but it made the missing catch visible.

**D3. The feet gather on a fixed clock, not to the board.** [code] `MOTION.gather` 0.35 to 0.75 (`feet.ts:283`), applied at `feet.ts:556-559` and `573-579`: x, z and yaw lerp to fixed rest-frame targets (`BOLTS_X`, z 0, `yawAcross` 87) whatever the board is doing. At 0.35 the kickflip board is at 128 degrees. **Perceived**: the feet line up "over the bolts" of a board that is upside down, then wait. In a shove-it [browser, `side-shove-085.png`] the shoes stand square across the world while the deck is still 26 to 43 degrees off under them: a lazy Susan under planted feet.

**D4. The rotation starts at full rate at progress 0, before the flick.** [code] The roll is linear from u = 0 (`flight.ts:207`) while the flick window is 0.05 to 0.22 (`feet.ts:240-241`) and the slide 0 to 0.16. [probe] The board has rolled 18 degrees at the tail strike (0.05) and 58 degrees at 0.16, while the front foot is still dragging up the grip and the clearance lifts it 3 to 6 cm off a rail that is rolling into it. **Perceived**: cause and effect are reversed. The board rolls away from a foot that has not flicked yet, so the flick looks decorative. In reality the board starts to roll "after the toes of your front foot have left the nose" (RESEARCH-FEET.md 1.3, skatedeluxe).

**D5. The free spin is too slow and too even.** [code, probe] To spread 360 degrees over the whole airtime the kickflip turns at 684 deg/s (1.9 rev/s) for 534 ms. A real kickflip does its turn between the flick and the catch, roughly half the airtime, so the free rate must be roughly twice that [infer: about 3 to 4 rev/s; needs data, section 4]. **Perceived**: a floaty, slow-motion flip even at 1x, and no deceleration at the end, which is the visual signature of a catch.

**D6. No contact model between foot and board.** [code] Feet are positions in the board's rest frame (`feet.ts:7-17`); the board never responds to a foot, and a foot touching the board only gets pushed straight up (`footLift`). The sole stays level when it meets a rolled deck (only the pitch is carried, by `rideDeck`, `feet.ts:507-515`; the board's roll and yaw are not). **Perceived**: during the slide and the descent the shoes touch the board at a point or an edge, never flat on the grip; the shoe looks stuck on, not standing on.

**D7. A landed trick lands with its residual error.** [code] A tolerated trick ends at its uncorrected totals (`flight.ts:207-208` at u = 1), for example 365 degrees of roll or 173 degrees of yaw, while the feet land at the rest-frame bolts with yaw 87. ADR-27 "Known limitation" notes the wheels then sit up to about 24 mm below the pad. [probe] At u = 1 the kickflip shoes are still lifted 2 cm by the clearance (5 degrees of residual roll). **Perceived**: up to 30 degrees of roll or 25 degrees of yaw between the shoes and the deck at the landing, a sketchy landing shown as a clean one. Real feet press the board flat or square in the catch.

**D8. The hover is a symmetric bump on top of the board's parabola.** [code] `hover * sin^2(pi u)` added to `board.y` (`feet.ts:490-495`), the same for both feet, peaking at 0.5. **Perceived**: the feet rise and fall with the board like they are tied to it with a string. Real legs act: the front knee retracts right after the flick (fast rise), the back foot lifts after the pop and scoop, both feet come down onto the board before it lands (the catch) and then ride it down. `sin^2` is still 35 percent of its peak at 0.8 and starts slowly (9.5 percent at 0.1), so neither the tuck nor the stomp is visible.

**D9. The front shoe yaws about 106 degrees in the air.** [probe] Kickflip front yaw: 45 at stance, -19 at the end of the flick (ADR-33), 15 at 0.5, 87 by 0.75. [infer] With a leg attached that is beyond a comfortable hip plus tibial rotation for an airborne leg (roughly 45 degrees hip internal or external rotation plus up to about 30 at a flexed knee), and the turn back is a smooth lerp rather than the foot coming down across the board. Without legs nobody can see the anatomy, so it reads only as "the shoe spins on its own". It will become a visible error the moment legs are added (approach d).

**D10. No legs, no body.** [code] Two free shoe groups (`FlightDriver.tsx:88-94`, `applyFoot` at 35-39). **Perceived** [infer, from the perception literature on biological motion]: humans read foot motion through the shank and knee. A shoe with no ankle above it has no visible cause for any move, so a 5 cm jump in a frame (allowed by the 8 cm per percent world bound, ADR-27) reads as levitation, and the pop (the rider's jump) is invisible: the feet only rise because `rideDeck` adds the board's height. This cannot be fixed by better foot curves; but it is also not the first thing to fix, because legs attached to feet that perch on a rolling rail would look worse, not better.

**D11. No horizontal travel.** [code] The board's centre never leaves x = z = 0 (`Pose` has only y, roll, yaw, pitch, `flight.ts:28-37`), and the feet are in the same frame. **Perceived** [infer]: a puppet feel, and the bad-input cases in RESEARCH-FEET.md 1.10 ("board flies out ahead", "board rolls away", "lands behind you") cannot be shown. Low priority: in the rider's frame a well-done stationary trick does stay close to under the rider.

**D12. Pre-pop and landing are cut.** [code] Progress 0 is the start of the nose-up pivot and the tail strikes at 0.05 (27 ms at pop 0.35); at u = 1 everything freezes. The real pre-pop (front wheels up to tail strike) is about 50 ms in the TU Delft clip (RESEARCH-FEET.md 1.1) and the landing has a 30 to 80 ms impact with knee flexion. **Perceived**: the pop is a snap with no wind-up, the landing a hard stop with no absorb. Minor next to D1 to D3.

**D13. The board's free rotation is a pure Euler composition.** [code] Yaw about world Y, then pitch, then roll about the long axis (`boardPose.ts:157-160`). [infer] For a torque-free prolate board (roll inertia roughly 0.07 to 0.15 of the yaw and pitch inertia), a 360 flip's angular momentum is tilted a few degrees off vertical, so the long axis should wobble a few degrees per turn. Small, and the composition is otherwise a good approximation of free flight; not worth a rigid-body solver on its own.

**D14. The default camera hides height.** [browser, `kf-*.png`] The rider view (ADR-23, camera at 0, 2.26, 1.13) looks almost straight down, so the hover and the tuck are nearly invisible from it and D2 reads as shoes stuck onto the board's bottom. Not a sim defect, but every fix above should be judged from a low side view as well as from the rider view.

---

## 2. Approaches ranked by accuracy gained per unit of effort

Effort is in implementation-agent sessions of the kind this repo already uses (one slice, verify green, browser check). Estimates are [infer].

| Rank | Approach | Fixes | Effort | Accuracy gained per effort |
| --- | --- | --- | --- | --- |
| 1 | **P. Phased kinematic flight with a catch** (not in the list as given; a light, closed-form cut of (c)) plus re-timed feet | D1, D2, D3, D4, D5, D7, most of D8 | 1 to 2 sessions | Highest |
| 2 | (a) Refit the procedural model to digitized reference video | The numbers inside P and the feet (timings, rates, heights, exit vectors), D8, D9 | 1 research session plus 1 fitting session; digitizing is the bulk | High, but only after P (the current board cannot be fitted after 0.5) |
| 3 | (d) Lower body with two-bone IK | D10, exposes D9 | 2 to 3 sessions plus an asset | High perceptual, medium risk |
| 4 | (b) Per-trick keyframe tables with blending | Canonical-trick fidelity | 2 to 3 sessions plus authoring | Medium; fights the "feet follow the inputs" rule |
| 5 | (c) Full rigid-body sim with impulses and contact | Emergent bad inputs, D11, D13 | 4 or more sessions | Low per effort; high risk |
| 6 | (e) ML motion from pose estimation | Only as an offline digitizing tool for (a) | Very high | Not viable at runtime |

### P. Phased kinematic flight with a catch (do this first)

- **What it fixes.** A board that spins up while the front foot leaves it (D4), spins freely and faster (D5), decelerates to zero when the feet come down and is pressed flat and square by them (D1, D7), then rides down with the feet on the grip (D2, D3). The feet descend to the board on purpose instead of being propped up by it.
- **Cost.** `flight.ts` gains a closed-form rotation profile (about 60 lines), `feet.ts` re-times gather and hover against shared phase constants (about 80 lines changed), tests change in `flight.test.ts`, `feet.test.ts`, `feet.pinned.test.ts` (re-recorded on purpose), `format.ts` foot-step timing. No asset, no new dependency, no new draw call.
- **Risks against the rules.** Pure sim: yes, closed form, no imports beyond `src/sim`. Allocation-free `useFrame`: yes, `writePose` stays a mutate-in-place function. Budgets and demand frameloop: untouched. Accessibility: the foot steps and `describeScene` must name the catch (text from `format.ts`, no new store action needed). "Feet follow the inputs": the catch or bail decision uses `isLanded` on the flight's totals, which feet.ts already does (`feet.ts:530`), never `recognize`. The lesson (rate times time) stays exact for the totals; the one real cost is pedagogical: with the totals unchanged, the board's visible spin rate in the free phase is about 1.7 times the slider value (see 3.6).

### (a) Refit to measured reference trajectories

- **What it fixes.** Every timing and amplitude that is now a coaching-text estimate (RESEARCH-FEET.md says "est." on most numbers): spin-up onset, free rate, catch time, front and back foot contact times, tuck heights per foot, exit point and direction, the front-foot yaw history (D9).
- **Cost.** Sourcing 120 or 240 fps clips with a side and a front view, digitizing about 8 keypoints per frame (nose, tail, both rails at the centre for the board's roll; toe and heel of each shoe), 30 to 60 frames per trick, 3 skaters by 3 attempts for 5 to 8 tricks. Manual digitizing in a tool such as Kinovea or Tracker is a day or two; fitting is then a scripted least-squares fit of the existing `STANCE` and `MOTION` parameters (a scratch script, not shipped).
- **Risks.** Licensing of video (keep only the extracted numbers, cite the sources, never ship frames). 2D-to-3D ambiguity for depth (z) without two views. Single-clip bias (the TU Delft clip is one skater). None against the code rules.
- **Why second.** Fitting the feet to real curves while the board still spins to u = 1 cannot work: a real foot at 0.8 is on a flat deck, the app's deck at 0.8 is at 292 degrees.

### (d) Lower body (legs with two-bone IK)

- **What it fixes.** D10: the shoes get a cause. Knees tuck at the peak, legs extend to the catch, flex on landing. It also makes D9 and any timing error obvious, which is good for accuracy and bad for "looks done".
- **Cost.** A hip trajectory (the rider's own projectile, peaking a little after the board, with a crouch before the pop and a knee bend at the landing), thigh and shank lengths, a knee pole vector per leg (forward and toward the toe side), an allocation-free two-bone solver in `src/sim` (pure maths on plain objects), two capsule meshes per leg from `scene/resources.ts` (merged, one draw call for both legs on Low and Medium, so about 16 to 17 of the 20 allowed; on High plus a shadow pass), a "Show legs" toggle, `describeScene` text.
- **Risks.** The rider view (camera above and behind the heel side, ADR-23) looks down past where the knees will be, so thighs can occlude the board. Mitigations: shins only (ankle to knee), or legs faded by camera distance; decide in the browser. The clearance (ADR-29) covers soles only; a board passing through a shin is realistic (it happens) but will look like a bug, so the clearance or the tuck must also keep the shank clear. FlightDriver stays the only pose writer (it applies the leg transforms too). Reach limits: if the feet model asks for a hip-to-ankle distance above thigh plus shank, the IK snaps straight, so the feet model needs a reach clamp.

### (b) Per-trick keyframe tables with blending

- **What it fixes.** Exact shapes for the eight presets (once data exists, it is the most faithful way to show a canonical trick).
- **Cost.** A curve table per preset per foot per channel (6 channels by 2 feet), and an interpolation scheme over the signed (flick, scoop) plane that passes through the ollie at the origin, respects the sign split (ADR-30) and stays continuous across it. Authoring is the cost, and every curve needs the same phase structure to blend.
- **Risks.** The rule "feet follow the inputs" (BRIEF-FEET.md decision 1): blending by distance to the nearest preset pulls an off-preset input toward a named trick, so a weak flick looks more like a kickflip than it should. Extrapolation beyond the presets (doubles, the hardest inputs) is undefined. The current continuous formulas already are a "fitted blend"; the better use of tables is as fitting targets for (a), not as the runtime model.

### (c) Physically based rigid-body board with impulses and contact

- **What it fixes.** In principle everything, including emergent bad-input behaviour (board flies out ahead, rolls away) and torque-free wobble (D13).
- **Cost.** An inertia tensor from the deck, trucks and wheels (cheap; the geometry is in `src/asset`, copied into `src/sim` as `BOARD` already is), an integrator, foot contact with friction against the deck plate (hard: the deck is a curved plate, ADR-29 needed 19 samples and edge sweeps just to clear it), ground contact at landing. Recognition becomes a numerical integration result, so presets must be tuned to land, and every test turns numerical.
- **Risks.** Determinism and tuning across the whole input range, frame-rate independence (precompute the trajectory into a table at pop time to keep `useFrame` allocation-free), the lesson "rate times time" stops being one multiplication, and the feet would have to drive the board, which inverts the current architecture (the board drives the feet). Free flight of a board is already close to constant-rate rotation, so the visible gain in the air over P is a few degrees of wobble. The gain is in contact, which is exactly the hardest part.
- **Verdict.** Not now. Take two small pieces of it into P: angular velocity that ramps up during foot contact and decays at the catch, and later, optionally, the torque-free wobble from the real inertia tensor as a closed-form correction.

### (e) Machine-learned motion from video pose estimation

- **What it fixes.** Nothing at runtime that (a) does not, at far higher cost.
- **Cost and risk.** Whole-body keypoint models give heel, toe and ankle points but nothing for the board, so a board detector or manual labelling is needed anyway; monocular 3D lifting of feet over a fast-flipping board is unreliable; a runtime model breaks the Chromebook budget and the no-CDN rule (CLAUDE.md rule 15). As an offline digitizing aid for (a) it can save labelling time, with manual correction.

**Which one I would actually do first: P, immediately followed by a feet re-timing against it in the same change.** Then commission (a) in parallel (section 4 is the brief for it) and refit P's constants and the feet when the data arrives. Then (d), shins and knees first.

---

## 3. The plan for P, ready to brief an implementation agent

Scope: `src/sim/flight.ts`, a new `src/sim/landing.ts`, `src/sim/tricks.ts` (re-export only), `src/sim/feet.ts`, `src/sim/format.ts`, their tests, `docs/DECISIONS.md` (new ADR-36), `docs/BRIEF.md` (physics lines), `docs/BRIEF-FEET.md` (flight phases paragraph), `docs/RESEARCH-FEET.md` (close item 11). No change in `src/scene`, `src/store`, `src/ui`, `src/asset`, the GLBs or the budgets. FlightDriver needs no change: it already calls `writePose` and `writeFeetPose` each frame.

### 3.1 Phase constants (one source of truth, in `flight.ts`)

```ts
/** Fractions of the airtime (ADR-36). Starting values; refit from reference data (RESEARCH-FEET.md section 6). */
export const PHASE = {
  pop:     { end: 0.05 },               // = POP_RISE_BY, = MOTION.pop.end (already tested equal)
  flipUp:  { start: 0.06, end: 0.16 },  // roll rate ramps 0 to full while the front foot drags off the nose
  shoveUp: { start: 0.00, end: 0.10 },  // yaw rate ramps 0 to full during the scoop
  catch:   { start: 0.64, end: 0.76 },  // rate decays to 0; a landed board is pressed to the whole turn
} as const;
```

`flipUp.end` should equal the time the little toe leaves the heel-side rail (ADR-33 asserts it crosses by 0.16), so the board starts to turn as the foot leaves it. feet.ts reads `PHASE` (feet.ts already imports flight.ts; flight.ts must not import feet.ts).

### 3.2 Rotation profile (closed form, allocation-free)

Rate shape per axis: `w(u) = W * ramp(u) * (1 - decay(u))`, with `ramp` a smoothstep from `up.start` to `up.end` and `decay` a smoothstep over `catch`. Normalise so the integral over 0 to 1 is 1: because the integral of a smoothstep over its window is half the window,

`1 / W = (catch.start + catch.end) / 2 - (up.start + up.end) / 2` (0.61 for the flip with the numbers above, so W = 1.64; 0.65 for the shove, W = 1.54).

`R(u) = integral of w from 0 to u` has a closed form (the integral of `3s^2 - 2s^3` is `s^3 - s^4 / 2`, times the window length): three pieces, no loop. Then:

- `free(u) = rollTotal * R(u)`, which reaches exactly `rollTotal` at `catch.end` and holds it.
- **Catch correction for a landed flight**: `roll(u) = free(u) - rollError * smooth(catch.start, catch.end, u)`, and the same for yaw with `yawError`. A landed board ends on the exact whole turn and half turn (the feet press it flat and square, at most 30 and 25 degrees over 64 ms at pop 0.35). This also closes ADR-27's known limitation for landed tricks.
- **A failed flight** is not corrected: it ends at `rollTotal` and `yawTotal`, as today, so the bail end pose, the bail tests and `describeScene` are unchanged.

`rollError`, `yawError` and `isLanded` move from `tricks.ts` into a new `src/sim/landing.ts` (with `ROLL_TOLERANCE`, `YAW_TOLERANCE` and the symmetric `turns`); `tricks.ts` re-exports them so no import elsewhere changes. This avoids a flight.ts to tricks.ts to flight.ts import cycle.

`Flight` gains read-only fields computed once in `computeFlight` (allocation at pop time is fine): `landed: boolean`, `rollTarget` and `yawTarget` (the whole turns, or the totals when failed), `flipRate` and `shoveRate` (the free-phase rates in rev/s, `W * flick` and `W * scoop`, for telemetry). `rollTotal`, `yawTotal`, `airtime`, `peak` keep their meaning and values. `writePose` keeps its signature; `boardHeightAt` must use the new roll at p (it calls `contactLift(pitch, flight.rollTotal * p)` at `flight.ts:177` and `181`).

Kickflip preset with these numbers [infer, computed by hand from the formula]: roll 0 at the strike (0.05), 31 degrees at 0.16, 68 at 0.22, 241 at 0.5, 328 at 0.64, 360 at 0.76 (corrected from 365); free rate 3.1 rev/s against 1.9 now.

### 3.3 Feet re-timed to the flight (`feet.ts`)

- `MOTION.gather` becomes relative to the catch: x, z and yaw reach their landing values by `PHASE.catch.end`, the front foot first (research: front foot catches first in a 360 flip and a shove-it, `catch.end - 0.03` as a starting value), the back foot at `catch.end`. Start the gather no earlier than `catch.start - 0.2` so the feet do not line up over an upside-down board (D3).
- `hover * sin^2(pi u)` (`feet.ts:490`) becomes a per-foot tuck curve `tuck(u)`: 0 at release (front: `flick.end`; back: the end of the pop or scoop), a fast rise (ease-out) to its peak at a fitted time (starting value 0.40 front, 0.35 back), an ease-in descent that reaches **0 at the foot's catch time**, then 0. The amplitudes stay `hoverHeight` (later per foot, from data). This makes the stomp visible (D8).
- **Ride-down**: from each foot's catch time to 1, the foot is on the grip in the board's frame. After the correction the board is exactly level and square from `catch.end`, so the rest-frame bolts are the board's bolts; between the foot's catch and `catch.end` the board's residual roll and yaw are carried onto the foot (rotate the foot's position and yaw by the board's current yaw, and its roll by the board's roll), so the sole sits flat on the settling deck (D6, D7).
- **Bail**: start at `PHASE.catch.start` instead of 0.62 (the feet come down, find no grip, step off), unchanged otherwise.
- The flick and the slide keep their shapes (ADR-33 to ADR-35 stand). Optionally cap the front-foot yaw swing in the air (D9) once data gives the real catch yaw.
- The clearance step (ADR-29) stays exactly as it is, as the safety net. The acceptance criterion for this plan is that it **stops doing visible work** in a landed trick after the catch.

### 3.4 Text equivalents (`format.ts`)

`footSteps` (`format.ts:206-265`) takes its start and end times from `PHASE` and the new tuck and catch times; the "both feet lift" step ends at the catch; a new step "Both feet catch the board at about 70 percent of the flight and press it flat" for landed flights (the bail step is unchanged in wording, retimed). `describeFeetInFlight` (`format.ts:268-276`) can add "Feet on the board, riding it down" after the catch. These are pure functions read by existing UI; no new store action, no new announcement path (rule 1 and 2 hold).

### 3.5 Tests

Changed on purpose (say so in the commit and the ADR):
- `flight.test.ts:58-63` "rotates at a constant rate" is replaced by: R(0) = 0, R(catch.end) = 1, R monotonic; roll rate continuous (no step larger than a bound per 0.001 of progress) and 0 before `flipUp.start` and after `catch.end`; the free-phase rate equals `flipRate` within 1e-9 between `flipUp.end` and `catch.start`; a landed preset ends on exact whole turns (roll mod 360 = 0, yaw mod 180 = 0); a failed flight ends at `rollTotal` and `yawTotal`; `writePose` still allocation-free; `poseAt(f, 0)` still the rest pose.
- `feet.pinned.test.ts`: re-recorded for rows after `PHASE.flipUp.start` (the board's roll under the feet changes through rideDeck and the clearance).
- `feet.test.ts`: the no-teleport bounds (3.2 cm per percent against the deck, 8 cm in the world) re-measured; the "gather" and "hover" expectations move to the new times.

New:
- **Feet on the board after the catch**: for every landed preset and for pop 0.2 and 0.5, from each foot's catch time to 1, the clearance lift (`writeFeetPose.y - writeFeetIntent.y`) is under 3 mm and each sole is within 3 mm of the deck top. Today this lift is 5.0 to 6.6 cm for the kickflip [probe]; the test fails on the current code, which is the point.
- **The board starts turning as the foot leaves**: kickflip roll at the strike (0.05) is under 1 degree and under 35 degrees at `flipUp.end`.
- **Clear in the air by intent**: between the front foot's release and the catch start, the clearance lift is 0 for every preset (the model, not the safety net, keeps the feet above the board).
- **Text**: `footSteps` has a catch step whose start is the catch time for a landed preset, and no catch step for a bail.

Unchanged and must stay green: `tricks.test.ts` entirely (the totals, the presets at pop 0.35 and 0.15, the naming table, tolerances). The presets keep landing because `rollTotal = flick * T * 360` and `yawTotal = scoop * T * 360` are untouched and recognition reads only those. `src/scene/clearance.test.ts` (the acceptance test of ADR-29) must stay green as is. `boardPose.test.ts` and `mirrorTricks.test.ts` check directions at chosen progress values; any value that relied on linear roll (for example "a quarter turn at u = 0.25") must be re-derived from `R(u)`, not loosened.

Browser check (CLAUDE.md verify loop step 3): the same two camera views as this audit at 5, 15, 25, 40, 55, 70, 85 and 95 percent for the kickflip, the 360 flip and the pop shove-it, High and Low, both stances. At 70 and 85 percent the board must be grip up with both soles on it; at 15 percent the kickflip board must be nearly flat while the front shoe is at the nose.

### 3.6 The one decision for Dylan before step 2

With P as specified, the slider value is no longer the rate the board visibly spins at in the air (about 1.6 to 1.7 times faster in the free phase). Two honest options:
1. **Keep the slider as "flip per second of airtime"** (the totals and presets unchanged, as in P) and add the free spin rate to the telemetry ("spins at 3.1 rev/s in the air"). Smallest change; the lesson is still one multiplication.
2. **Make the slider the real spin rate** and the total `flick * (catch time - release time) * T * 360`. Physically the cleanest ("rate times the time it spins"), but every preset, the slider range (doubles need about 5 to 6 rev/s), ADR-5, ADR-30, the BRIEF, the copy and the UI tests change.

I recommend option 1 now and option 2 only if the reference data shows the catch time is stable enough across pops to be a fixed fraction.

### 3.7 ADRs and docs this supersedes or updates

- **ADR-1** (constant-rate rotation): superseded in part. The totals and their formula stand; the constant rate over the whole airtime does not.
- **BRIEF.md line 49** (`roll(t) = rollTotal * t / T`): replaced by the phased profile.
- **ADR-17** consequence ("the feet hover a fixed 12 cm ... come down over the bolts"): superseded by the tuck and the catch. **ADR-20** "Not adopted: an eased board rotation so the catch happens at 0.6 to 0.8": now adopted. **RESEARCH-FEET.md section 4 item 11**: closed.
- **ADR-27** "Known limitation" (residual roll puts the wheels below the pad): resolved for landed tricks; still true for failed ones (unchanged end pose).
- **ADR-29** stands unchanged; its consequence text about descent lifts should be updated with the new measurements.
- ADR-32 to ADR-35 stand (pose order and flick shapes).

---

## 4. Quantities to source from reference data (brief for a parallel research agent)

Wanted per trick: ollie, kickflip, heelflip, backside pop shove-it, frontside pop shove-it, varial flip, hardflip, 360 flip (doubles if available). Flat ground, rolling or stationary (note which and the rolling speed). Ideally 120 fps or faster, a side view (heel side) and a front or rear view, at least 3 skaters by 3 attempts, reported as mean and spread. Times as fractions of airtime, with **t = 0 at the tail strike** and **t = 1 at the first wheel contact**, plus the absolute airtime so the fractions can be checked. Distances in metres or deck lengths in the board's own frame (nose +X, up +Y, toe side and heel side named, not signed), angles in degrees. Also record the skater's height and stance, and the deck length so pixels can be scaled.

**Flight of the board**
1. Airtime (tail strike to first wheel contact), and the pre-pop duration (front wheels leave the ground to the tail strike).
2. Board centre peak height above its rest height, and when it is reached.
3. Pitch history: peak nose-up angle and its time, time to level, pitch at touchdown, which wheels touch first.
4. Roll history, every frame: onset (first 5 degrees), the time the roll rate peaks, the **peak and plateau roll rate (deg/s)**, whether it is constant in the free phase, the roll angle when the feet first touch, the **time the rotation stops** (rate under 10 percent of peak), the residual roll at that moment, and whether the stop is gradual or abrupt.
5. Yaw history, the same items as 4 for every shove trick.
6. For the 360 flip and the varial flip: the tilt of the flip axis from horizontal over the rotation (the wobble, D13).
7. Horizontal drift of the board centre relative to the rider's pelvis (along the board and across it) at the peak and at the landing.

**Front foot**
8. Slide: start and end time, distance along the deck, the shoe's bank angle (outside edge down) during the slide.
9. Release: the time the shoe loses contact, the **exit point on the deck** (x along the deck, which rail, on the nose kick or before it), the **exit direction** (3D unit vector) and speed, the shoe yaw at release.
10. Air: maximum excursion from the board centre (x and across), peak height above the deck and its time, the shoe's yaw at the peak and just before the catch, its roll and pitch.
11. Catch: the time of first contact with the grip, the foot's placement then (x, across, yaw relative to the front bolts), the board's roll and yaw at that moment.

**Back foot**
12. Pop: heel height (or ankle angle) before and at the tail strike, the time the shoe leaves the tail.
13. Scoop (shove tricks): path length and direction (including the downward part), its end time, where it ends relative to the rail.
14. Air: peak height above the deck and its time.
15. Catch: the time of first contact (the delay after the front foot), the placement (x, across, yaw relative to the back bolts).

**Body (for approach d)**
16. Pelvis height history: standing, the crouch before the pop, the peak and its time, the lowest point after the landing and the time to recover.
17. Knee angle of each leg at the peak tuck, and the hip-to-ankle distance at the tuck and at the catch.
18. Thigh and shank lengths of the skater (or height, for the usual ratios).

**Board physical properties (for the wobble and as a check on the rates)**
19. Mass of the deck, each truck and each wheel, or an inertia tensor for a complete board.

**Sources to try first**: the Sci Rep 2024 muscle-synergy paper (Vicon at 200 Hz for the ollie, kickflip and 360 flip; check the supplementary data for board and foot markers), the TU Delft ollie paper (Heinen et al.) and its data, Determan et al. 2006 kickflip kinetics (full text), any skateboarding kinematics theses (motion capture of kickflips), and slow-motion trick-tip videos (Braille Skateboarding, Shred School, Vans or Thrasher slow-motion series) for digitizing. Keep only extracted numbers and citations; do not save video frames into the repo.

**Known open disagreements to resolve** (RESEARCH-FEET.md section 4 and 1.3): which foot catches first in a kickflip (Sidewalk says back, Braille's drill says front), the catch time relative to the peak, how far the front foot goes out after a kickflip flick, and the board pitch at the pop (32.5 degrees in the app, 45 to 60 in the frame-by-frame estimates).
