# The critics' review, 2026-11-13

Four reviewers (the model GPT-6.1 Sol, high effort, one each for visuals and animation, gameplay and feel, code and correctness, and performance) went through the game as it stood after ADR-96 (the lifelike rider, its movement, the recovery after landing and the longer replay). They played a copy of the build in Chromium with a real RTX 3060, recorded video, measured, and read the code. None of them could change a file. This is the consolidated list: all 46 findings, each with what was done about it. The reviewers' own reports are in the session's scratchpad (`critique/visual.md`, `play.md`, `code.md`, `perf.md`); what follows keeps their ids.

Each finding was checked against the code before it was acted on (the two most serious by reading the store, the rest by their tests). What was fixed is in ADR-97. What was left is left for a reason given here.

## Summary

| | Found | Fixed | Left |
| --- | ---: | ---: | ---: |
| Code and correctness (C) | 10 | 9 | 1 |
| Visuals and animation (V) | 11 | 4 | 7 |
| Gameplay and feel (G) | 13 | 7 | 6 |
| Performance (P) | 12 | 3 | 9 |
| **Total** | **46** | **23** | **23** |

No finding was critical. Nothing fixed has been looked at in a browser yet (the owner asked to skip browser checks while building, 2026-11-13); `npm run verify` is green (1,268 tests).

## Fixed

| Id | Severity | What was wrong | What was done |
| --- | --- | --- | --- |
| C-01 | major | Changing quality, losing the 3D view or turning reduced motion on while a landing played could strand the go: nothing was left to start its replay or bring up its notice, so the computer never went. | New store action `settleGo` runs the same "the go has come to rest" step as a landing that ends by itself; called after each of those three interruptions. Regression tests drive all three with nothing else moving the go on. |
| C-04 | minor | Reduced motion switched on after touchdown showed the notice without focusing it (rule 10). | Same `settleGo`, which asks for focus. Test with an already-consumed focus request. |
| C-02, V-01 | major | The replay ended 0.4 s after touchdown, in the middle of the 0.55 s (0.9 s after a bail) recovery, then cut to the finished pose: the owner's "skip" again, at a different place. | The replay runs until the landing and the recovery have played out (`landingSeconds`), plus 0.12 s. |
| C-08 | minor | The run-out's pace rose without limit and passed real time (1.75 times the game's own pace) instead of easing toward it. | The pace rises 1.5 per second from 0.3 and stops at `ART.replay.cap` (1, real time). Tested: never above the cap, continuous at both joins. |
| C-03 | minor | A replay of a pop made from rest showed the ground standing still (the replay held the pop's speed through the flight; the live roll keeps pushing). | `replayRolled` follows the game's push and slowing; tested against `stepRoll` from rest, partway and at cruise. |
| C-07 | minor | The replay swayed on the final riding clock, frozen, not the go's. | The clock at the pop is noted with the roll's and the replay advances it. |
| C-05 | minor | A recovered rider stood tall but the game camera's riding lift did not follow, so the beanie could leave the frame (1 to 2 percent of the picture on a phone layout). | `recoveredBy` (settle.ts) gives the stand-up blend; the camera lifts with it. |
| C-06 | minor | The fit stretched positions along a limb but turned the normals only: shading up to about 5 degrees off the surface. | `movedNormal` applies the inverse stretch. The GLB was rebuilt (same size and triangles). |
| C-09 | polish | The source reader's inverse-bind maths silently assumed no scale. | It refuses a scaled bind with a message saying how to fix the source. |
| V-02 | major | The head looked 68 to 71 degrees down through the crouch and the catch (the look was blended from an already folded chest), hiding the face. | `MOTION.look.pitch` 55: the head never looks further down than that from the horizon. The High shadow box's ceiling rose 2 cm to hold the head held up (tested). |
| V-03, G-04 | major | The turn card and chip named the next turn (and trick) over the replay of the last go, and Pop said "Get ready" or "Computer's go" while a press could only be refused. | While a scored go still plays out (`goSettling`) the card and chip hold that go and say "Landing...", and the button says "Landing" and is dimmed. The news line still shows as it comes. |
| V-05 | minor | The welcome rider held the landing squat for 1.1 s, then snapped to the next trick's crouch. | The preview plays the recovery (hold 1.3 s) and sinks into the crouch before each pop. |
| V-09 | minor | Pausing the welcome preview jumped to a canned mid-flip still. | A pause holds the moment it was on. |
| G-01 | major | Moving a slider after Get ready made the forecast say one trick while the release popped the setup from the press: a clean forecast, a timed release in the band, a lost set. | A slider moved while the bar goes round updates the setup the release pops (ADR-65's "sliders as the bar started" is replaced; the bar already goes round until the second press, ADR-78). |
| G-02 | major | A lab speed of 0.05x carried into a game at 0.02 of real time: a kickflip took 27 s in the air, with nothing on screen saying why. | The game plays no slower than 0.25x (times its pace): `GAME_SLOWEST`. The lab keeps every stop. |
| G-07 | minor | An early kickflip was announced as "Ollie not landed: flip over-rotated by 143 degrees". | In a game a miss is told against the trick in play: "Kickflip not landed: 177 degrees short on the flip." (`describeAttempt`). |
| G-08 | minor | Shift+Tab from the notice's Continue reached the dimmed, covered game controls. | The game's main region is `inert` while a notice is up. |
| G-12 | polish | "Computer's go" ran off the right edge of a phone's Pop button. | The label wraps. |
| G-13 | polish | The shortcuts help said Space does nothing on a slider; in the game it pops. | The game has its own line. |
| P-01 | major | At a pixel ratio of 2 (a high-resolution screen) High's graphics took 4.3 ms in the lab and 6.5 ms in a game (target 4), Medium's 2.8 and 3.4 at 1.5 (target 3). | Pixel ratio caps: High 1.5, Medium 1.25. Not measured again yet. |
| P-02 | major | If the rider's file failed to load, the loading picture stayed over the stage for ever. | A failed rider publishes that its fallback is final, as the ground does. |
| P-03 | major | An Intel UHD with 8 GB and 8 cores was chosen as High. | Known built-in graphics start on Medium whatever the machine's memory and cores. |

## Left, and why

| Id | Severity | Finding | Why it was left |
| --- | --- | --- | --- |
| C-10 | polish | The pelvis's speed jumps from -4.4 m/s to -0.7 m/s at touchdown. | A landing is a sudden stop; a person's hips slow like that. Looked at as a choice, not a bug; a matched tangent would soften the impact the sound and dust now agree with. |
| V-04 | minor | On a phone the stage is about 195 px tall and the board 55 to 65 px long. | A layout change (a larger stage during an attempt); wants the owner's eye and a device. |
| G-03 | major | A long trick name makes the phone's turn chip cut 77 px of clear width from the camera's framing, so the rider is tiny. | Needs a new "top" side in the stage-framing code (`stage.ts`, `useStageClear.ts`, the camera) or a different chip; worth its own step. The most useful thing left from the gameplay review. |
| V-06 | minor | The replay's low camera crops the torso, so the new upper-body motion is not seen in it. | ADR-72's framing is a choice; a whole-rider replay option is a feature. |
| V-07 | minor | The jeans hem still reads as a rigid cut across the shoe. | Wants the model rebuilt and compared in the replay's close camera; not judged without looking. |
| V-08 | minor | The tee's hem points between the thighs at the apex of a pop, seen from the front. | Seen only from a diagnostic camera, not the game's; the weights are a model change to compare by eye. |
| V-10 | minor | Medium's rider has only a feet-and-board shadow, no torso. | A tier simplification (Medium has no shadow map); an added footprint needs a look and the draw-call ledger. |
| V-11 | polish | High's skin, cloth and eyes share one matte response. | Polish; per-region roughness is a material change to compare by eye. |
| G-05 | minor | About 6 s after every known result (the roll-out, then the replay, then Continue), and a miss is replayed too. | A design choice about pacing, for the owner: replay only made sets (as before), only on request, or a shorter roll-out. |
| G-06 | minor | The visible notice omits why a go failed (short on the shove, timing right). | A new line of copy on the notice (DESIGN.md); G-07 fixed the wording the live region uses. |
| G-09 | minor | Assisted levels offer every trick from the first turn, so harder calls only handicap the computer. | A design choice (a call progression). |
| G-10 | minor | The first Easy pop ends the only walk-through, for Hard too. | A design choice (teach by pop style). |
| G-11 | minor | Easy escalates to harder tricks without saying so. | A design choice and a notice; wants the owner's wording. |
| P-04 | minor | Long main-thread tasks (up to 296 ms at a 4x slowed CPU) while the scene loads. | Not attributed to a cause by the reviewer; needs a trace. |
| P-05 | minor | The automatic step-down only watches flights, and only the first three. | A policy change (ADR-59). |
| P-06 | minor | A direct visit to the lab downloads the rider (492 KB) it never shows. | A prefetch change; measured, real, small. Next. |
| P-07 | minor | Choosing Low does not cancel High's downloads under way. | Needs abortable loads. |
| P-08 | minor | Announcement-only store changes redraw an idle lab (one frame each). | Cheap in practice (one frame); the subscription is rule 4's. |
| P-09 | minor | High draws the velocity buffer even when motion blur cannot run (a game, slow motion). | A candidate saving, not measured; a pipeline change. |
| P-10 to P-12 | minor | The measurement script: its "all models" time precedes the rider, the draw-call verdict skips the game's peak, and the first go is excluded from the frame gate. | Tooling gaps in `scripts/measure/measure.js`; worth fixing together. |

## What the reviewers said to keep

- The timing rhythm (Get ready, then Pop! in the band, the 1.2 s bar that goes round) and its readable verdicts.
- The recovery after landing and the stumble, stand and look after a bail; the dip and rise after a clean landing.
- The close replay's board and feet; its ground motion; the touchdown being part of it.
- The sock and the slanted hem (the bare ankle is gone); the proportions and clothing texture; the asymmetric arms and the tucked knees.
- Warm frame times at a pixel ratio of 1 (High 1.3 to 1.7 ms CPU and GPU in a game, no sustained hitch over 50 goes); one draw call for the rider; every draw-call cap held (36, 21 and 11 in a game with every switch on); demand rendering at rest; no leak over 65 pops and six tier changes.
- Records, leaving mid-flight with a confirmation, reduced motion, keyboard play throughout, no console errors.
