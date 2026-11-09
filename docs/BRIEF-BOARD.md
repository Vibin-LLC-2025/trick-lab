# trick-lab: realistic board brief (written 2026-11-04)

Request from Dylan: make the skateboard look like an actual skateboard, and
make sure the code shows a production-grade 3D asset pipeline. Read
docs/BRIEF.md (the
original contract) first; everything there still holds unless this file
changes it.

## Why the approach below

Shipping 3D to low-end Chromebooks means glTF/GLB, Draco or meshopt, KTX2,
instancing, LOD, shaders, texture budgets and disposal. Asset pipelines are the part of
that list a primitives-only demo cannot show. So the realistic board is not
more JSX primitives: it is a real asset built by a scripted, tested,
budget-checked pipeline, shipped as a compressed GLB, loaded the way a
production R3F app loads assets (useGLTF, Suspense, preload, cache-aware
disposal), with the current primitive board kept as the loading fallback
and as a low-detail level. Honest and modest: a scripted procedural asset,
not an artist pipeline from Blender.

## Real-world reference (a typical street board, metres)

- Deck: 8.0 in wide (0.2032), 31.75 in long (0.8065). Popsicle outline,
  both ends rounded (nose slightly longer and a touch steeper than tail).
  Wheelbase (inner truck holes) 14.25 in (0.362). Nose about 6.9 in
  (0.1745), tail about 6.4 in (0.162), measured from the outer bolt holes
  to the tips (corrected 2026-11-05: this line said "about 7.0 and 6.5 in
  from the inner holes", which would be 0.2285 and 0.216; the mesh did not
  change).
  Medium concave about 0.012 m deep across the width. Kicks rise in a smooth
  curve (no visible segments) to about 20 deg at the nose and 19 deg at the
  tail. Seven-ply maple, total thickness about 0.0115, rounded edges, the
  plies visible as stripes on the edge.
- Griptape: black, gritty, covers the whole top, ends a hair short of the
  edge so a thin line of wood shows when seen edge-on.
- Hardware: 8 bolt heads on the grip (4 per truck), new-school pattern
  1-5/8 in x 2-1/8 in (0.041 x 0.054).
- Trucks: baseplate, kingpin with nut, two urethane bushings with cup
  washers, pivot, hanger, axle. Axle height about 0.052 above the baseplate
  (a 3 mm riser is optional). Axle-to-axle about 0.205, close to deck width.
- Wheels: 53 mm diameter, 32 mm wide, rounded lip profile, about 18 mm
  contact patch, off-white urethane, a small printed mark is optional.
  Bearings visible (608: 22 mm OD, 8 mm bore, dark shield, steel ring),
  axle nut on the outside.

Keep the existing conventions: group origin is the deck centre, long axis
X, nose +X, grip faces +Y, toe side +Z. At rest the wheel bottoms touch
y = 0, so restY must be recomputed from the new truck and wheel numbers,
and the camera fit reach/top, shadow radius and flight rest height must
follow. ADR-10 rotation signs do not change.

## Budget (board only, checked by script)

- Draw calls: at most 8 for the board (group by material, merge static
  parts; wheels may use instancing if it is cleaner, measure it).
- Triangles: at most 25,000 for the board.
- GLB file: at most 300 KB on disk, with EXT_meshopt_compression and
  KHR_mesh_quantization (not Draco: drei's Draco path fetches a decoder from
  a CDN by default; the meshopt decoder is bundled, which also works offline
  on a locked-down school network). Say why in an ADR.
- Textures: at most 4, at most 1024 px on the long side, mipmapped,
  power-of-two. Estimate GPU memory in the budget report. KTX2/Basis needs
  the native toktx binary: do not install system tools. Ship WebP or PNG
  inside the GLB and document KTX2 as the next step with the exact command.
  (Superseded 2026-11-09 by ADR-49: a WASM Basis encoder, `ktx2-encoder`,
  needs no system tool, and every texture is now KTX2.)
- Whole-scene draw calls after the change stay under 20.

## Pipeline contract (implementation)

- Pure geometry in src/asset/ (no React): deck outline, kick curve,
  concave, ply edge UVs, truck parts, wheel lathe profile. Unit tested for
  real properties: overall length and width within 2 mm of spec, wheelbase,
  left/right symmetry, kick angles, concave depth, wheel bottoms at y = 0 at
  rest, grip face normals point +Y, no NaN, triangle counts.
- scripts/build-board.ts (run with Node, for example via tsx or vite-node
  as a dev dependency): builds the glTF document with @gltf-transform/core,
  generates the textures deterministically (seeded noise for grip, ply
  stripes, the deck graphic from the design source art), compresses
  (meshopt + quantize, texture resize), writes public/models/board.glb.
  `npm run assets` builds it. The GLB is committed.
- scripts/check-assets.ts: reads the GLB with gltf-transform and fails if
  any budget above is exceeded; prints a table. `npm run assets:check`, and
  `npm run verify` runs it.
- Runtime: src/scene/Board.tsx loads /models/board.glb with drei useGLTF
  (meshopt decoder), useGLTF.preload at module load, Suspense fallback =
  the current primitive board (rename it, for example BoardPrimitive.tsx).
  The cached GLB is shared: do not let R3F dispose it on unmount
  (dispose={null}). Metal needs reflections to read as metal: use a one-time
  PMREM of three's RoomEnvironment (local, no HDR download), generated once
  and disposed on unmount. FlightDriver still writes the pose to the outer
  group only.
- Detail level: a "Board detail" setting in the View panel (High / Low,
  default High, persisted like the theme), stored in the ui slice, not
  logged (the event contract has no UI events). Low uses the primitive
  board. This is the Chromebook escape hatch and the LOD story; say so in
  the ADR.
- Reduced motion, keyboard, announcer, canvas aria-hidden and the scene
  text description stay as they are; update the description text if it
  names board parts.

## Design contract (design agent)

The design agent owns the look: a docs/DESIGN.md section "Realistic board
(2026-11-04)" with every number the implementer pastes (hex colors,
roughness, metalness, env intensity, ply color order, grip noise recipe,
bevel radius, wheel and bushing colors, truck finish, bolt color, graphic
placement on the bottom), and the source art in assets/source/ (the bottom
graphic as an SVG, original artwork, no real brand names or logos, plus a
wheel print SVG if used). Also fix the known look issue: the pad reads brown
under the warm key light; it should read as grey concrete in both themes.
Retune lights and exposure if the new materials need it, keeping
--scene-bg equal to the clear color. CSS changes only for what the new View
setting needs.

## Docs and engineering notes

Update README (engineering notes: the asset pipeline, budgets enforced in
verify, meshopt vs Draco, fallback and detail level as LOD, cache-aware
disposal), docs/ASSET-PIPELINE.md (now describes the real pipeline),
docs/PERF-BUDGET.md (re-measured), docs/DECISIONS.md (new ADRs),
docs/AGENT-WORKFLOW.md (this pass, honestly), CLAUDE.md (new commands and
rules). Replace the screenshots.

## House rules

No em-dashes anywhere. Absolute dates in files. Model aliases (fable, opus)
in files, not version IDs. Never install or upgrade Playwright or
playwright-cli; browser checks use the global playwright-cli with a named
session over HTTP, closed by name. The parent folder is not a git repo; work
only inside this repo. Do not commit: the lead reviews and commits.
