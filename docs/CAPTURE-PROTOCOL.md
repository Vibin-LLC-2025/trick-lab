# Reference capture protocol (2026-11-05)

Why this exists. The feet model (`src/sim/feet.ts`), the phased flight (`src/sim/flight.ts`, ADR-36) and the legs are built from coaching text and hand-fitted numbers. A source search on 2026-11-05 (`docs/research/2026-11-05/data-sources.md`, 47 sources) found no public dataset, paper or mocap release with synchronized board and shoe trajectories for any of the app's tricks. The flick delay, each foot's release and catch time, the catch order, the free flip rate, the foot clearance and the knee flexion are all unmeasured in the literature as of that date. The fastest trustworthy way to get them is a small capture we control. This page is the plan for it, condensed from section 9 of that report.

## What the sim needs from it

Every number below is a starting value in the code today. Each should come out of the capture as a mean and a spread over at least three trials, as a fraction of the airtime with t = 0 at the tail strike and t = 1 at the first wheel contact, plus the absolute airtime.

| Quantity | Where it lives today | Starting value |
| --- | --- | --- |
| Flip spin-up window (board starts rolling as the front foot leaves) | `PHASE.flipUp` in flight.ts | 0.06 to 0.16 |
| Shove spin-up window | `PHASE.shoveUp` | 0.00 to 0.10 |
| Catch window (rate decays to 0) | `PHASE.catch` | 0.64 to 0.76 |
| Front and back foot catch time and order | `CATCH` in feet.ts | 0.73 front, 0.76 back |
| Front foot release (end of the flick) | `MOTION.flick.end` | 0.22 |
| Back foot release (end of the pop or scoop) | `MOTION.pop.end`, `MOTION.scoop.end` | 0.05, 0.08 to 0.12 |
| Tuck peak time per foot | `MOTION.tuck` | 0.40 front, 0.35 back |
| Tuck height per foot above the board | `hoverHeight` | up to 0.12 m, same for both |
| Free flip and shove rate | `flipRate`, `shoveRate` (derived) | 3.2 rev/s kickflip at the preset |
| Front foot yaw at the catch | `STANCE.front.yawAcross` | 87 degrees |
| Knee flexion at the crouch, the peak and the landing | `src/sim/legs.ts` | hand-set |
| Board height and airtime per trick | `pop` input, `airtimeFor` | 0.35 m, 0.53 s |

Published anchors to check the capture against (from the same report): kickflip airtime 0.41 ± 0.06 s and board height 0.35 ± 0.13 m, ollie 0.36 ± 0.09 s and 0.41 ± 0.18 m (Scholz et al., Sensors, 2026-04-20, 23 riders); complete board 2.42 kg, roll inertia 0.0096 kg m², yaw 0.117 kg m² (Pfister et al., 2025, CAD-computed).

## Equipment

- Two phones or cameras that record a true 240 fps (check the file's frame timestamps, not the marketing number). Locked off on tripods, no digital stabilisation, no pan or zoom, short exposure (1/2000 s or faster) so shoe edges and board marks stay sharp. Good daylight.
- View A: side view from the heel side, low (about 0.3 m up), the whole rider and board in frame. View B: front or rear three-quarter view at a clearly different angle, close enough to see the shoes.
- A checkerboard or a known 3D calibration object, used at several heights across the capture volume, at the actual recording mode. A ground square alone only calibrates ground points.
- A pulsed light or a clapper visible to both cameras for synchronisation. Phones are not genlocked; measure the offset and the drift and keep them with the data.
- Small high-contrast marks on the board at known positions: nose, tail, each truck, one on the grip and one on the bottom so top and bottom and nose and tail are unambiguous in any frame. Marks on each shoe at the heel, the toe and the outer forefoot. Nothing that changes grip or contact.
- A scale for the board and its parts, and a tape for the deck length, width and wheelbase.

## The session

1. Weigh the complete board, the deck, one truck and one wheel. Measure the deck.
2. Calibrate both cameras in the recording mode, then fire the sync signal.
3. Record flat ground, stationary first, then rolling slowly. Note the stance, the shoes and the surface.
4. Order: ollie, kickflip, 360 flip (three contrasting contact patterns). Then heelflip, backside and frontside pop shove-it, varial flip, hardflip. Doubles if the rider has them.
5. Three clean makes per trick, kept separately from the bails (keep the bails too: they are the bail model's reference).
6. Keep every original file. Never work from a retimed or re-encoded export.

## Annotation (Kinovea 2025.2, free)

For every trial, mark these frames in both views: crouch minimum, first front-wheel lift, tail strike, last board contact with the ground, each foot's release, the end of the flick or scoop, the board's quarter, half and full turns, the board apex, first catch (which foot), second catch, first wheel contact, settled roll-away. Define each one in writing before the first click. The tail strike, the rider's take-off and the board's take-off are three different frames.

Then track the board marks and the shoe marks through the flight, triangulate from the two views, and fit the board as a rigid body (all marks, not a bounding box). Label contact separately as visible contact, visibly apart, or occluded. Report the reprojection residual; do not claim a precision the image does not support.

## Hand-off format

One CSV per trial: time in seconds from the tail strike, progress as a fraction of airtime, board centre x y z, board roll pitch yaw (degrees, turn count preserved), each shoe's sole centre x y z and yaw pitch roll, each shoe's contact label, and each foot's ankle and knee position if the body is tracked. Frames: world X along the board's rest long axis, nose positive, Y up; also the board frame for contacts. Plus one text file per session with the rider's height, stance, the shoe model, the board numbers, the camera positions, the sync offset and the event frame list.

## What not to do

- Do not feed an AI pose estimator slow-motion footage as if it were real time. ExMR (preprint 2026-10-19) and FootMR are initialisers at best (about 20 degrees of ankle error, non-commercial licences), and they do not track the board.
- Do not buy the commercial flatground mocap pack (Reallusion) before a coverage, export and licence check against this list.
- Do not treat one rider's technique as the one correct technique. Three exemplars with event timings for the rest is the realistic first result.
