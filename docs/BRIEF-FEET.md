# trick-lab: feet and quality brief (written 2026-11-04)

Request from Dylan: make the skateboard look more realistic still (it reads
pixelated), add shoes that move around the board the way a skater's feet
would for the trick, and raise the budget for a desktop machine (RTX 3060,
i7, 32 GB) while keeping fallbacks for low-end Chromebooks. Read
`docs/BRIEF.md` and `docs/BRIEF-BOARD.md` first; everything there still holds
unless this file changes it.

## Decisions taken with Dylan before the work

1. **Feet follow the inputs, not the recognized trick.** Shoe placement and
   motion are computed from pop height, flick rate and scoop rate (and the
   resulting flight), so a bad setting shows a visibly wrong foot motion: a
   weak flick barely leaves the rail, an overscooped back foot swings wide,
   a low pop keeps the feet near the deck, and a trick that does not land
   ends with the feet stepping off the board (a bail). The student sees the
   cause, not just the recognized result.
2. **Three quality tiers.** High is the new desktop look (MSAA, DPR up to 2,
   16x anisotropy, real shadows, the high-detail board, the shoe model).
   Medium is the original GLB board with no shadows (a mid-range laptop).
   Low is the primitive board (the Chromebook fallback). The tier is picked
   on first visit from what the browser says about the device, persisted,
   and can be changed in the View panel.
3. **Frame the flight, not the pad.** The default camera fits the board and
   its highest pop; the pad may run off the edges (ADR-18 replaces ADR-11).

## Why the board looked pixelated

Measured in the browser before any change: `antialias: false`, DPR capped at
1.5, no anisotropic filtering on the GLB textures, a flat shadow disc, and a
camera that fits the whole 1.6 m pad so the board is about 300 px long at
1440 x 900. The 13,900-triangle mesh and the 1024 px graphic were not the
limit at that size. All of those were deliberate Chromebook trade-offs, so
they become the Low tier and High undoes them.

## Feet model (src/sim/feet.ts, pure)

- Frame: the board's rest frame (origin at the deck centre at rest, nose +X,
  up +Y, toe side -Z, heel side +Z). The rider is goofy (ADR-24, 2026-11-04):
  facing -Z with the nose on their right, so in the rider's view from the
  heel side the front foot is the right-hand shoe. Each foot is a position
  (sole bottom centre), a yaw about Y, a pitch about the shoe's own Z and a
  roll about its long axis. The front foot is the right shoe, the back foot
  the left (mirrored). The numbers are the regular-stance research mirrored
  across z = 0.
- Stance control (ADR-25, 2026-11-04): the View panel's "Stance" group
  switches Goofy (the default) and Regular, persisted under
  `trick-lab.stance`, never logged. Regular keeps the camera on the heel
  side, turns the board 180 degrees on the pad (nose -X, `ART.stance.regular`
  is rollSign -1, yawSign -1, baseYaw 180) and mirrors both feet along X as a
  last step in `writeFeetPose` (x to -x, yaw to 180 - yaw); the front foot is
  then the left shoe and `applyFoot`'s edge signs swap.
- The feet do not rotate with the board. After the pop they are in the air
  above a spinning board and come down where the bolts are if the trick
  lands (the bolt pattern is symmetric, so a 180 shove lands on them too).
- Stance from the inputs (no flight, or progress 0): the front foot is
  across the board behind the front bolts at flick 0 and turns up to 50
  degrees toward the nose with the heel over the heel-side edge as the flick
  rate rises to 2 rev/s; the back foot sits across the tail pocket and moves
  its toes toward the toe-side pocket as the scoop rises.
- Flight phases (fractions of the airtime): pop (back foot presses the tail,
  toes down, 0 to 0.12); scoop drag (back foot toward the heel side, 0 to
  0.2, distance proportional to scoop); slide (front foot up the board, 0.02
  to 0.22); flick (front foot off the heel-side edge, 0.12 to 0.32, distance
  and toe dip proportional to flick); hover (both feet up to 0.12 m above
  the board at mid-flight, on top of the board's own height); gather (both
  feet over the bolts, 0.35 to 0.72); landing on the grip at 1. If the
  flight does not land (the same tolerance rule as recognition), from 0.62
  the feet step off to the heel side (+Z) and land on the pad.
- Clearance (ADR-29, 2026-11-04): the stance and the flight phases above are
  the rider's intent. On top of them each shoe rises straight up by the least
  amount that keeps its whole sole 2 mm above the board in the board's pose
  at that progress, and no sole below the pad (`src/sim/boardVolume.ts`). At
  rest the front sole bridges the concave on the rails (0.0198 m above the
  deck centre across the flat, not the old flat 0.0095) and the back sole
  rests on the tail kick, rolled by the kick's own slope (about -11 to -14
  degrees) with the heel 4 degrees up (was 12). In the air the hover still
  peaks at 0.12 m; where the spinning deck, its wheels or its rails would
  reach a shoe, the shoe rides over them, so the board never passes through
  a foot. A bail aims at the pad and stands on the failed board where it lies
  under a shoe.
- Allocation-free writer (`writeFeetPose`) so FlightDriver can call it every
  frame; the store state object doubles as the inputs object.
- `describeFeet` and `describeScene` put the stance and the flight phase into
  `#scene-description` for screen-reader users.

## Shoes asset (src/asset/shoeSpec.ts, shoe.ts; public/models/shoes.glb)

One right shoe, procedural, original, no brand marks, from the same
scripted pipeline as the board: an extruded footprint sole with a foxing
stripe, a lofted upper with a tongue valley, eyelets and a toe cap in a
seeded 512 x 512 texture, and six lace segments. Nodes `Shoe_Sole`,
`Shoe_Upper`, `Shoe_Laces` (three draw calls per shoe). Origin at the
footprint centre on the sole bottom, toe +X, up +Y, lateral side +Z. Its
`SHOE` size must equal `FOOT` in the feet model (tested). Low and Medium
use a primitive shoe (sole slab and upper box) from `scene/resources.ts`.

## Budgets (per asset, checked by `npm run assets:check`)

| Asset | File | Draw calls | Triangles | Textures |
| --- | --- | --- | --- | --- |
| Board, Medium (`board.glb`, unchanged) | 300 KB | 8 | 25,000 | 4 at 1024 px |
| Board, High (`board-high.glb`) | 2.5 MB | 8 | 120,000 | 6 at 2048 px |
| Shoes (`shoes.glb`) | 600 KB | 3 | 30,000 | 2 at 1024 px |

Whole scene: under 20 draw calls on Low and Medium (as before); under 40
on High, where `renderer.info` also counts the shadow pass.

## Runtime rules that change

- FlightDriver stays the only per-frame writer of poses, now for the board
  and the two shoe groups. Board, Feet, BoardModel, ShoesModel and the
  primitives have no per-frame code.
- The Canvas is keyed on the tier (antialias and powerPreference are
  context options). The GLB caches survive the remount.
- Real shadows on High: the key light casts, the board and shoes cast, the
  pad receives, the flat disc is not rendered. Medium and Low keep the disc.
- "Show feet" is a pressed toggle in the View panel, persisted, announced,
  never logged. "Quality" replaces "Board detail" (a legacy saved "Low"
  still maps to Low).

## House rules

No em-dashes anywhere. Absolute dates in files. Model aliases (fable, opus)
in files, not version IDs. Never install or upgrade Playwright or
playwright-cli; browser checks use the global playwright-cli with a named
session over HTTP, closed by name. Do not commit: the lead reviews and commits.

## Follow-up request (2026-11-04, same day)

Dylan asked for research into real technique and other skate games so the shoes are positioned and moved accurately, a visual that highlights the direction and motion of each shoe, and the slow-motion button turned into a slider with a wider range that works mid-trick. Delivered: `docs/RESEARCH-FEET.md` and ADR-20 (the feet model rebuilt from it, with a roll axis), ADR-22 (foot trails with arrowheads and the "Foot motion" step list), ADR-21 (the Speed slider, 0.05x to 2x, live during a flight, keys `s`, `[`, `]`).
