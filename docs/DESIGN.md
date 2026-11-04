# trick-lab design (2026-11-04)

Owner: design agent. Files: `src/styles/tokens.css`, `src/styles/app.css`, this document.

## 1. Rationale

1. Audience is students on low-end Chromebooks, so the UI is plain DOM, system fonts, no webfonts, no images, no blur. Panels are flat cards with hairlines and one soft shadow.
2. Mood is a skatepark at the end of the day: poured concrete (light theme) or grip tape (dark theme, the default), one burnt orange-red accent that matches the deck graphic, cream wheels. Nothing neon.
3. One accent only. Presets, the Pop button, slider thumbs, the slow-motion toggle and event types all use it, so "what is interactive" is one color. The focus ring is a cool blue in both themes, so a focused control and a selected control never look the same.
4. Outcomes get their own two colors: a "good" green and a "bad" red. The bad red is a cooler crimson, deliberately distinct from the orange accent, so a bailed trick does not look like a selected preset. Both pass 4.5:1 as text on every surface they sit on, and white or near-black text passes on them as fills.
5. State is never color alone: an active preset gets a thick left bar, bold text and a filled key chip; the slow-motion toggle moves its knob; a landed outcome gets a solid green bar and a check glyph, a bailed outcome a dashed red frame and a cross glyph; good and bad telemetry values get a glyph and bold weight; a done objective gets a filled tick.
6. Every text and background pair was computed against WCAG 2.2 AA and the ratio is written beside each token in `tokens.css`.
7. Range inputs are native. Chromium and Firefox are styled separately to the same look: a 6px track in `--color-line-strong` (3:1 or better), a 20px accent thumb with a surface-colored border, and a focus ring drawn on the thumb (3px surface gap, then 3px `--color-focus`) rather than around the whole input, so a student tabbing through three sliders sees exactly which thumb they are moving.
8. The 3D stage is the picture; the DOM stays quiet. The stage frame uses `--color-line-strong` instead of a hairline because the pad and the page can be close in tone in light theme.
9. Motion is short (120 to 360 ms) and is zeroed under `prefers-reduced-motion`, which the app also uses to skip auto-play (the trick resolves instantly and the timeline becomes the way to step through it).
10. The scene clear color follows the theme (`--scene-bg` per theme, asserted by a test against `artDirection.ts`). Lights and materials do not change with the theme, so a theme toggle costs one `setClearColor` and no material rebuild.

## 2. Scene art direction (pasteable numbers)

Units are metres. The pad top surface is y = 0. Origin is the centre of the pad, under the resting board. The board's long axis is X; the camera looks from +X, +Z (toe side, slightly in front of the nose). Rotation direction is fixed in ADR-10: a kickflip rolls the grip toward the heel side, so the graphic turns toward the viewer first. All colors are sRGB hex; pass them straight to `color=` props.

### Renderer

| Setting | Value |
| --- | --- |
| `gl.toneMapping` | `THREE.ACESFilmicToneMapping` |
| `gl.toneMappingExposure` | `1.0` |
| `gl.outputColorSpace` | `THREE.SRGBColorSpace` |
| `gl` options | `{ powerPreference: 'low-power', antialias: false }` |
| `dpr` | `[1, 1.5]` |
| Clear color, dark theme | `#1e2124` (equals `--scene-bg` under `:root[data-theme="dark"]`) |
| Clear color, light theme | `#d7d3cb` (equals `--scene-bg` under `:root`) |
| Fog | none |
| Shadows | none (a flat disc stands in, see below) |

`artDirection.ts` should export `clearColor: { light: '#d7d3cb', dark: '#1e2124' }` and the theme test reads the computed `--scene-bg` for each theme and compares.

### Lights (Three r155+ physically based intensities, fixed across themes)

| Light | Color | Intensity | Position / target |
| --- | --- | --- | --- |
| `scene.environment` (realistic board pass, 2026-11-04) | RoomEnvironment PMREM | `scene.environmentIntensity = 0.55` | n/a, `scene.background` stays the clear color |
| `ambientLight` | `#dde2e8` (was `#d9dde3`) | `0.3` (was `0.65`) | n/a |
| `directionalLight` | `#fff1e0` (was `#ffead2`) | `2.2` (was `2.4`) | position `[2.5, 5.0, 3.0]`, target `[0, 0.3, 0]` |

Retuned on 2026-11-04 for the realistic board (section 7): the environment map carries the fill, so the ambient drops and the key light loses some warmth. The key light sits camera-left and high, so whichever face of the deck is up during the flip is lit and the face that is down falls to ambient. That is what makes the alternation grip, graphic, grip legible.

### Camera and controls

| Setting | Value |
| --- | --- |
| Camera position | `[1.3, 1.5, 1.9]` |
| Camera target (OrbitControls `target`) | `[0, 0.3, 0]` |
| `fov` | `36` (vertical) |
| `near` / `far` | `0.05` / `30` |
| `minPolarAngle` | `0.25` rad (about 14 degrees, near top-down) |
| `maxPolarAngle` | `1.25` rad (about 72 degrees, never below the pad) |
| `minDistance` | `1.6` |
| `maxDistance` | `4.5` |
| `enablePan` | `false` |
| `enableDamping` | `false` (damping needs a continuous loop; the app runs `frameloop="demand"`) |
| `enableZoom` | `true` |
| Stage fit | changed in the integration pass (2026-11-04, ADR-11): the camera backs off along its view direction until the whole pad and the board at a 0.6 m pop fit the stage with a 5 percent margin (`scene/cameraFit.ts`); zoom-out may pass `maxDistance` up to 1.25 times the fit |
| Reduced motion | no easing in either mode; "Reset view" snaps |

The default view is about 27 degrees above the horizon, which keeps the whole flight arc (peak 0.6 m) in front of the pad instead of against the clear color. Distance from target is about 2.6 m, so the 0.81 m board fills roughly a third of the stage width at 16:10.

### Pad (ground)

| Part | Geometry | Color | Material |
| --- | --- | --- | --- |
| Pad slab | box `1.6 x 0.04 x 1.2` (was `3.6 x 0.04 x 2.8`; cut in the integration pass so the whole pad fits the stage, ADR-11), centre `[0, -0.02, 0]` (top at y 0) | `#616466` (was `#6f6a63`) | `meshStandardMaterial`, roughness `0.95`, metalness `0` |
| Pad edge line | `lineSegments` on `EdgesGeometry` of the slab | `#3e4143` (was `#46423d`) | `lineBasicMaterial` (width is 1px in WebGL regardless) |
| Centre mark | optional thin box `0.9 x 0.002 x 0.02` at y `0.001` under the resting board | `#525557` (was `#5e5952`) | roughness `1` |

The pad is a mid concrete gray on purpose: the black grip reads dark against it (3.8:1), the cream wheels read light against it (3.5:1), and the orange graphic reads by hue and saturation rather than by luminance (1.1:1), which is what a real deck does on real concrete. The 2026-11-04 fix: the old pad `#6f6a63` was itself warm (R above G above B), and a warm key light multiplied that into brown. The new pad is neutral with a one-step blue lean, and the key is less warm, so the lit pad lands near `#7b7a77` on screen: grey concrete in both themes. The clear color then sits a step lighter (light theme) or darker (dark theme) than the pad, so the slab has an edge in both themes.

### Board (primitives only, group origin at the deck centre)

Since 2026-11-04 this primitive board is the Suspense fallback and the "Low" board detail level (section 7). Its numbers stay as written.

| Part | Geometry | Color | Material |
| --- | --- | --- | --- |
| Deck body | box `0.81 x 0.012 x 0.205`, centre `[0, 0, 0]` | see faces below | `meshStandardMaterial`, roughness `0.6`, metalness `0` |
| Deck top face (grip) | the +Y face of the deck box (use a 6-material array or a second thin box `0.80 x 0.002 x 0.20` at y `+0.007`) | `#141416` | roughness `1.0`, metalness `0` |
| Deck bottom face (graphic) | the -Y face (or a second thin box at y `-0.007`) | `#ea5a30` | roughness `0.45`, metalness `0` |
| Deck edge (wood) | the four side faces of the deck box, and the wedge sides | `#cdb68c` | roughness `0.7` |
| Nose wedge | box `0.13 x 0.012 x 0.205`, pivot at the deck end, rotated `+0.33` rad (about 19 degrees) up around Z | same face colors as the deck | |
| Tail wedge | box `0.13 x 0.012 x 0.205`, pivot at the deck end, rotated `-0.33` rad up around Z | same face colors as the deck | |
| Trucks (2) | box `0.15 x 0.03 x 0.06`, at `x = ±0.26`, `y = -0.025` | `#a9adb3` | roughness `0.35`, metalness `0.7` |
| Wheels (4) | cylinder radius `0.027`, height `0.032`, axis along Z, at `x = ±0.26`, `z = ±0.105`, `y = -0.058` | `#efe9dc` | roughness `0.5`, metalness `0` |

Resting pose: wheel bottoms touch y 0, so the group sits at y `0.085`. Flight adds `y(t)` to that. The grip top and the graphic bottom contrast at 5.5:1 against each other, so each half turn of the flip is a clear value change, not just a hue change.

If the implementer uses a six-material array on one box, the index order for `BoxGeometry` is `[+X, -X, +Y, -Y, +Z, -Z]`, so pass `[wood, wood, grip, graphic, wood, wood]`. Share the four materials across the deck and both wedges.

### Ground shadow disc (instead of real shadows)

| Property | Value |
| --- | --- |
| Geometry | circle, radius `0.36`, 24 segments, flat on the pad at y `0.002`, rotated `-PI/2` around X |
| Color | `#0e0f10` |
| Material | `meshBasicMaterial`, `transparent`, `depthWrite false` |
| Opacity at height 0 | `0.35` |
| Opacity at height 0.6 m | `0.16` (linear in height) |
| Scale at height 0 | `1.0` |
| Scale at height 0.6 m | `0.72` (linear in height) |
| Position | follows the board's X and Z, never its rotation |

Under reduced motion the disc is pose-driven like everything else, so it needs no special case.

### Budget check

Pad 2 (slab, edge lines), centre mark 1, deck 1 (or 3 with separate face boxes), wedges 2, trucks 2, wheels 4, shadow disc 1. That is 13 to 15 meshes, well under the 20 draw-call budget, with four shared materials for the board and one each for pad, trucks, wheels and disc.

## 3. Slow motion and timeline

- Slow motion is a `.toggle` with `aria-pressed`, label "Slow motion", state text `.toggle__state` reading `1x` or `0.25x`. On state moves the knob right, tints the pill, and the state text goes accent and bold. Key `s`.
- The timeline is a native range, 0 to 100, in its own inset well (`.timeline`) so it reads as a scrubber and not a fourth input. Label "Timeline" on the left, a mono readout on the right: `42% of flight` or `0.22 s of 0.53 s` (either is fine; keep one). `aria-valuetext` says "42 percent of flight".
- The timeline thumb is square-cornered (3px radius) where the input thumbs are round, so a playhead looks different from a dial.
- The timeline is disabled while playing (opacity 0.55, `not-allowed` cursor) and enabled when paused or done. Under reduced motion it is always enabled and is the primary way to watch the trick.
- Arrow keys move 1 percent, Page keys 10 percent, Home and End jump to pop and landing (native behavior, do not override).
- During playback the slider position commits at most 10 times per second from the store; the thumb will step, which is acceptable and honest about the update rate.

## 4. Outcome card copy

Tone: short, plain, encouraging but honest. Name the trick, say what happened, give the numbers. No exclamation marks, no "awesome", no blame.

| Case | `.outcome__name` | `.outcome__detail` |
| --- | --- | --- |
| Landed | `Kickflip landed` | `365 deg flip, 0 deg shove, 0.53 s in the air.` |
| Under-rotated flip | `Kickflip not landed` | `Under-rotated by 48 deg of flip. More flick or more pop gives it time.` |
| Over-rotated shove | `Pop shove-it not landed` | `Over-rotated by 31 deg of shove. Ease the scoop a little.` |
| Both axes off | `Varial flip not landed` | `Under-rotated 40 deg of flip, over-rotated 28 deg of shove.` |
| Nothing set yet (idle) | `Set the board up and pop` | `Pick a preset or move the sliders, then press Pop or Space.` |
| Ollie (no rotation, landed) | `Ollie landed` | `No rotation, 0.53 s in the air. Add flick or scoop to try a trick.` |

The live announcer uses full words ("365 degrees of flip") while the card uses `deg` and `s`, because the card is scanned and the announcer is heard.

## 5. How the layout works

`.app` is a three-column CSS grid, `288px minmax(0, 1fr) 320px`, with named areas `setup stage results`, height `100dvh`, 12px gap and padding. The stage cell has `min-width: 0; min-height: 0; overflow: hidden; position: relative` so the canvas can fill it and the perf badge can sit absolutely at its top right. The two side columns are flex columns with `overflow-y: auto` and `min-height: 0`, so each scrolls on its own while the stage stays put. Panels inside are `.panel` cards stacked with a 12px gap: Presets, Inputs, Playback on the left; Outcome, Telemetry, Objectives, Event log on the right. Below 960px the grid becomes one column in the order stage, setup, results; the stage gets `aspect-ratio: 16 / 10` with a 260px minimum, and the columns flow with the page. Tab order is DOM order: presets, sliders, playback, results.

## 6. Theme note

Tokens live on `:root` (light) with a full override under `:root[data-theme="dark"]`. The app sets `data-theme="dark"` on `<html>` at startup, persists the choice in `localStorage` under `trick-lab.theme`, and offers a toggle (a `.btn--ghost` inside a panel title, key `t`). `color-scheme` is set per theme so native controls and scrollbars follow. The only scene property that follows the theme is the clear color; lights and materials are fixed. Only `.perf-badge` uses literal colors; everything else goes through tokens, so a third theme is one more attribute block.

## 7. Realistic board (2026-11-04)

Owner: design agent (fable). Implementer: opus, per `docs/BRIEF-BOARD.md`. Every number below is meant to be pasted. Units are metres unless a table says px. Conventions are unchanged: group origin at the deck centre, long axis X, nose +X, grip faces +Y, toe side +Z. The "deck centre" is the midpoint of the wheelbase (x = 0); the geometric midpoint of the outline sits 6 mm toward the nose because the nose is longer than the tail. The primitive board in section 2 stays as the Suspense fallback and the Low detail level.

### 7.1 Budget and structure

| Item | Value |
| --- | --- |
| Triangles, board total | target 11,000 to 13,000 (estimate below: about 11,700), hard cap 25,000 |
| Draw calls, board | 7: deck grip, deck wood edge, deck graphic, aluminium parts, steel parts, bushings, wheels (merged or instanced). Cap is 8. If one must go, fold steel into aluminium |
| Textures | 4: `grip` 512 x 512, `deck-bottom` 1024 x 256, `ply` 16 x 128, `wheel` 16 x 256. All power of two, mipmapped, sRGB colour maps, PNG inside the GLB. Estimated GPU memory about 2.9 MB with mips |
| Materials | all `MeshStandardMaterial` (glTF `pbrMetallicRoughness`); no clearcoat, no normal maps |
| Rest height | `restY = 0.08425` (wheel centre y `-0.05775` minus wheel radius `0.0265`) |

Triangle estimate, which the budget script should confirm:

| Part | Count | Triangles each | Subtotal |
| --- | --- | --- | --- |
| Deck (19 rings x 144 points, see 7.2) | 1 | about 5,200 | 5,200 |
| Truck: baseplate, pivot cup, kingpin, yoke, axle housing, pivot, axle, 4 speed washers, 2 axle nuts, kingpin nut, 2 cup washers | 2 | about 1,090 | 2,180 |
| Bushings (16-segment cones with caps) | 4 | 60 | 240 |
| Wheels (32 radial x 15 profile segments) | 4 | 960 | 3,840 |
| Bolt heads (8 radial segments) | 8 | 28 | 224 |
| Total | | | about 11,700 |

### 7.2 Deck geometry

**Plan outline** (half width `w(x)`, metres; symmetric in z). Overall length `0.8065` from tail tip `x = -0.3970` to nose tip `x = +0.4095`; overall width `0.2032` at x = 0.

| Region | x range | Half width |
| --- | --- | --- |
| Tail end (superellipse) | `-0.3970 <= x <= -0.2500` | `s = (-0.25 - x) / 0.147`; `w = 0.0987 * (1 - s^2.4)^(1 / 2.4)` |
| Middle | `-0.2500 <= x <= 0.2600` | `w = 0.1016 - 0.0031 * (x / 0.26)^2` |
| Nose end (superellipse) | `0.2600 <= x <= 0.4095` | `s = (x - 0.26) / 0.1495`; `w = 0.0985 * (1 - s^2.2)^(1 / 2.2)` |

Check values (x, half width): `(-0.390, 0.0394)`, `(-0.360, 0.0740)`, `(-0.300, 0.0955)`, `(-0.250, 0.0987)`, `(0, 0.1016)`, `(0.260, 0.0985)`, `(0.320, 0.0923)`, `(0.380, 0.0637)`, `(0.400, 0.0396)`. The nose exponent is lower than the tail's, so the nose is a touch pointier and 12.5 mm longer, which is the asymmetry a real popsicle has.

**Kick curve** (mid-surface height `y_k(x)`, zero in the flat). Both kicks start at the outer bolt holes, `|x| = 0.235`, and are a cubic in `s = (|x| - 0.235) / L` with zero slope at the start, so there is no crease:

| End | L | y_k(s) | Tip height | Tip angle |
| --- | --- | --- | --- | --- |
| Nose (x > 0) | `0.1745` | `0.0595 s^2 - 0.0185 s^3` | `0.0410` | `atan((2 * 0.0595 - 3 * 0.0185) / 0.1745) = 20.0 deg` |
| Tail (x < 0) | `0.1620` | `0.0552 s^2 - 0.0182 s^3` | `0.0370` | `atan((2 * 0.0552 - 3 * 0.0182) / 0.1620) = 19.0 deg` |

Check values nose `(s, y)`: `(0.25, 0.0034)`, `(0.5, 0.0126)`, `(0.75, 0.0257)`. Tail: `(0.25, 0.0032)`, `(0.5, 0.0115)`, `(0.75, 0.0234)`. The second derivative stays positive to the tip (`0.119 - 0.111 s` and `0.1104 - 0.1092 s`), which is the "smooth, no visible segments" requirement.

**Concave** (added to the mid-surface): `y_c(x, z) = 0.012 * k(x) * (z / w(x))^2`, so the rails sit 12 mm above the centreline in the flat. `k(x) = 1` for `|x| <= 0.235`, then `k = 1 - 0.6 * smoothstep(s)` over the kick (`s` as above), so the tips keep 40 percent of the concave. Mid-surface `S(x, z) = y_k(x) + y_c(x, z)`.

**Thickness and edge profile.** Total thickness `t = 0.0115`, seven plies of `0.001643`. Edge bevel radius `0.004` top and bottom, leaving a `0.0035` vertical wall. Offset the profile heights along the local normal of `S` (preferred) or along +Y (acceptable; it thins the kicks by 6 percent visually).

**Construction: nested outline rings.** Build the deck as 19 closed rings, each a plan outline inset by `d` and lifted by `h`, from the top centre spine out over the edge and back to the bottom spine. A ring at inset `d` uses the outline formulas with the middle half width `w(x) - d`, nose size `(0.0985 - d)` over length `(0.1495 - d)`, tail size `(0.0987 - d)` over length `(0.147 - d)`, and x range `[-0.397 + d, 0.4095 - d]`; clamp negative widths to 0. Every ring has the same 144 points: per side, from tail tip to nose tip, 24 tail intervals, 24 middle intervals, 24 nose intervals (73 points), mirrored in z with the two tips shared. End intervals are sine spaced toward the tip, `x_i = x_join + L_end * sin(i * pi / 48)`, i = 0..24, so the rounded ends get the density. Middle intervals are uniform in x. Corresponding points of neighbouring rings connect as quads (two triangles). Material groups follow the ring index.

| Ring | Inset d | Height h (before S) | Group |
| --- | --- | --- | --- |
| 0 | spine (w = 0) | `+0.00575` | grip |
| 1 | `0.082` | `+0.00575` | grip |
| 2 | `0.064` | `+0.00575` | grip |
| 3 | `0.046` | `+0.00575` | grip |
| 4 | `0.030` | `+0.00575` | grip |
| 5 | `0.016` | `+0.00575` | grip |
| 6 | `0.004` | `+0.00575` | grip edge; bands from ring 6 to ring 13 are wood |
| 7 | `0.00200` | `+0.00521` | wood (bevel 30 deg) |
| 8 | `0.00054` | `+0.00375` | wood (bevel 60 deg) |
| 9 | `0` | `+0.00175` | wood (wall top) |
| 10 | `0` | `-0.00175` | wood (wall bottom) |
| 11 | `0.00054` | `-0.00375` | wood |
| 12 | `0.00200` | `-0.00521` | wood |
| 13 | `0.004` | `-0.00575` | graphic edge; bands from ring 13 to ring 18 are graphic |
| 14 to 18 | `0.016, 0.030, 0.046, 0.064, 0.082`, then spine | `-0.00575` | graphic |

Rings 0 and 18 are the spine (all z = 0, the two sides coincide), so the first and last bands are fans of 144 triangles, not 288. Welding the coincident spine points is optional. Triangles: 18 bands x 288, minus 288 for the two fans, about 4,900; call it 5,200 with slack.

**UVs** (glTF convention, v = 0 is the top row of the image):

| Group | u | v | Wrap |
| --- | --- | --- | --- |
| grip | `(x + 0.397) / 0.2` | `(z + 0.1016) / 0.2` | repeat both (one 512 tile = 0.2 m, about 4 x 1 tiles) |
| wood edge | `(x + 0.397) / 0.8065` | `(0.00575 - h) / 0.0115` (0 at the top ply, 1 at the bottom ply) | clamp |
| graphic | `(x + 0.397) / 0.8065` | `(0.1016 - z) / 0.2032` | clamp |

Graphic sanity check: lying under the board looking up with the nose on your right, the toe side (+Z) is at the top of your view, so image row 0 is the toe side, the word reads left to right and the cream disc is at the nose. If the disc shows at the tail, u is flipped; if the letters are upside down, v is flipped.

**Tests worth writing from this:** extents `0.8065 x 0.2032` within 2 mm; z symmetry (nose and tail are meant to differ, so do not test x symmetry); `dS/dx` at the tips equals `tan(20 deg)` and `tan(19 deg)` within 0.5 deg; `S(0, 0.1016) - S(0, 0) = 0.012`; grip ring normals in the flat have y > 0.99; no NaN; triangle count under the cap.

### 7.3 Grip, wood and graphic materials

| Material | Map | Base colour | Roughness | Metalness |
| --- | --- | --- | --- | --- |
| grip | `grip.png` 512 x 512, repeat | `#ffffff` (the map carries the colour) | `0.95` | `0` |
| wood edge | `ply.png` 16 x 128 | `#ffffff` | `0.7` | `0` |
| graphic | `deck-bottom.png` 1024 x 256 | `#ffffff` | `0.45` (satin print) | `0` |

**Grip grit recipe** (deterministic; PRNG is mulberry32 seeded with `20261104`; RGB, sRGB; wrap all coordinates modulo 512 so the tile seams):

1. Fill with `#1a1a1c` (26, 26, 28: a two-step blue lean so the grip reads cool black against the warm wood).
2. Per pixel, add one integer in `[-3, 3]` to all three channels.
3. Scatter 60,000 grains. Each: centre uniform in the tile; radius `0.6` (weight 0.6), `0.9` (0.3) or `1.3` px (0.1); lift `L = 6 + 30 * r^2` where `r` is uniform in `[0, 1]` (most grains dim, a few bright). Add `L * (1 - distance / radius)` to every pixel within the radius.
4. Scatter 1,500 single-pixel glints at `+50` (silicon carbide sparkle).
5. Clamp. Expected range about `#171719` to `#5c5c5e`, mean near `#1e1e20`.

No roughness or normal map; the grain is value only. The grip covers the top flat to ring 6, which is the 4 mm bevel inset, so a thin line of wood shows edge-on as the brief asks.

**Ply edge stripes** (`ply.png`, 16 x 128, v runs top ply to bottom ply): seven bands of `128 / 7` rows (row starts `0, 18, 37, 55, 73, 91, 110`), the last row of bands 1 to 6 drawn as a glue line.

| Ply (top to bottom) | Colour | Note |
| --- | --- | --- |
| 1 | `#dcc79e` | natural maple, under the grip |
| 2 | `#cdb384` | natural, a shade darker (cross ply) |
| 3 | `#d7c096` | natural |
| 4 | `#7a2e1c` | dyed centre ply, the accent family |
| 5 | `#d2b98f` | natural |
| 6 | `#c9ae7f` | natural |
| 7 | `#d9c39a` | natural, carries the graphic |
| glue line | `#8a7652` | 1 px between plies |

**Deck graphic.** Source `assets/source/deck-graphic.svg`, 2048 x 512, nose at the right (+X); rasterize with resvg at 1024 x 256 (half scale) for the GLB. It is original art: a burnt orange field `#e0532c`, the word TRICK LAB in near-black `#17181a` pixel letters (5 x 7 cells of 26 px, x 280 to 1554, 182 px tall), three tally marks at the tail (x 98 to 252, 220 px tall: count the rotations) and a cream `#f3eadb` disc of radius 170 at (1770, 256) with a black chevron pointing at the nose. The field covers the whole texture so the outline can cut it anywhere. Contrast: ink on field 4.6:1, cream on field 3.2:1, grip mean against the field 4.3:1, so each half flip is a clear value change. The disc is the single strongest shape and sits only at the nose, so a viewer can count rotations and tell nose from tail mid-flip. All art is rects, paths and circles: no fonts, filters or gradients, so resvg and a browser agree pixel for pixel. The chevron fits inside the disc with 50 px to spare, and the disc clears the outline by at least 100 px where they are closest (x 1900).

### 7.4 Hardware and trucks

Positions are for the nose truck, centred at `x_c = +0.208` (midpoint of the bolt pattern, which runs `x = 0.181` to `0.235`). Mirror x for the tail truck. Deck bottom under a truck is `y = -0.00575` (flat, no kick, zero concave on the centreline).

**Bolt heads** (8): flat cylinders radius `0.00475`, height `0.002`, 8 radial segments, base at `y = +0.0055` (sunk 0.25 mm into the grip), at `x in {0.181, 0.235}` and mirrored, `z = +-0.0205` (pattern `0.054 x 0.041`). Steel material.

| Part | Geometry | Material |
| --- | --- | --- |
| Baseplate | rounded box `0.085 (X) x 0.008 (Y) x 0.060 (Z)`, corner radius `0.002`, 4 segments per edge, centre `(0.208, -0.00975, 0)` (top at `-0.00575`) | aluminium |
| Pivot cup | cylinder radius `0.011`, length `0.016`, 12 segments, centre `(0.2448, -0.0203, 0)`, axis `d_p = (0.6428, 0.7660, 0)` (40 deg from vertical, leaning outboard) | aluminium |
| Kingpin | cylinder radius `0.0045`, length `0.052`, 10 segments, from `K0 = (0.198, -0.01375, 0)` along `d_k = (-0.3420, -0.9397, 0)` (20 deg from vertical, leaning inboard, so the two kingpins face each other) | steel |
| Cup washer, boardside | cylinder radius `0.0125`, thickness `0.0012`, 16 segments, on the kingpin from `0` to `0.0012` | steel |
| Bushing, boardside | cone radius `0.0125` to `0.0115`, length `0.0145`, 16 segments, on the kingpin from `0.0012` to `0.0157` | bushing |
| Yoke (hanger body) | rounded box `0.030 (X') x 0.036 (Y') x 0.040 (Z)`, radius `0.004`, centre `(0.1993, -0.046, 0)`, rotated about Z so its Y' axis is parallel to the kingpin (`rotation.z = -20 deg` for the nose truck, `+20 deg` for the tail) | aluminium |
| Bushing, roadside | cone radius `0.0115` to `0.0105`, length `0.012`, on the kingpin from `0.0277` to `0.0397` | bushing |
| Cup washer, roadside | cylinder radius `0.0120`, thickness `0.0012`, on the kingpin from `0.0397` to `0.0409` | steel |
| Kingpin nut | hex prism (6 radial segments) radius `0.0075`, height `0.007`, on the kingpin from `0.0409` to `0.0479` (4 mm of thread shows beyond it) | steel |
| Axle housing | rounded box `0.028 (X) x 0.022 (Y) x 0.122 (Z)`, radius `0.006`, 4 segments, centre `A = (0.208, -0.05775, 0)` | aluminium |
| Pivot | cylinder radius `0.0075`, length `0.030`, 10 segments, from `(0.220, -0.04975, 0)` along `d_p` into the pivot cup | aluminium |
| Axle | cylinder radius `0.004`, length `0.203` along Z, 12 segments, centre `A` (axle to axle `0.203`, just under deck width) | steel |
| Speed washers (4) | cylinder radius `0.0065`, thickness `0.001`, 12 segments, at `abs(z)` in `[0.061, 0.062]` and `[0.094, 0.095]` | steel |
| Axle nuts (2) | hex prism radius `0.0062`, height `0.006`, at `abs(z)` in `[0.095, 0.101]` | steel |

Truck height from the deck to the axle centre is `0.052` (a mid truck). Wheel top at `y = -0.03125` leaves 25 mm under the deck, so no wheel bite at any pose. "Rounded box" means three's `RoundedBoxGeometry` or an equivalent (a box with its edges filleted at the given radius).

| Material | Colour | Roughness | Metalness | Used by |
| --- | --- | --- | --- | --- |
| aluminium (raw cast) | `#b7babd` | `0.50` | `0.85` | baseplate, pivot cup, yoke, axle housing, pivot |
| steel | `#cfd2d5` | `0.28` | `1.0` | kingpin, axle, nuts, washers, bolt heads |
| bushing (urethane) | `#d9a441` (amber) | `0.55` | `0` | 4 bushings |

Metal reads as metal only with the environment map (7.6); without it, both metals go near black.

### 7.5 Wheels

Four wheels, centres `(+-0.208, -0.05775, +-0.078)`, 53 mm diameter, 32 mm wide, axis along Z. Lathe the profile below about the wheel axis with 32 radial segments; the 16 points give 15 profile segments. Point order runs from the inner-face bearing bore to the outer-face bearing bore, so one lathe yields the urethane, both lips and both bearing faces. `(r, z)` in metres, z along the axle with 0 at the wheel centre and +z outboard:

| Index | r | z | Segment after it |
| --- | --- | --- | --- |
| 0 | `0.0040` | `-0.0150` | 0: inner bearing face |
| 1 | `0.0110` | `-0.0150` | 1: inner seat step (steel) |
| 2 | `0.0110` | `-0.0160` | 2: inner face flat |
| 3 | `0.0200` | `-0.0160` | 3: lip |
| 4 | `0.0235` | `-0.0155` | 4: lip |
| 5 | `0.0255` | `-0.0130` | 5: lip |
| 6 | `0.0263` | `-0.0105` | 6: lip to tread |
| 7 | `0.0265` | `-0.0090` | 7: tread (18 mm contact patch) |
| 8 | `0.0265` | `+0.0090` | 8: tread to lip |
| 9 | `0.0263` | `+0.0105` | 9: lip |
| 10 | `0.0255` | `+0.0130` | 10: lip |
| 11 | `0.0235` | `+0.0155` | 11: lip |
| 12 | `0.0200` | `+0.0160` | 12: outer face flat |
| 13 | `0.0110` | `+0.0160` | 13: outer seat step (steel) |
| 14 | `0.0110` | `+0.0150` | 14: outer bearing face |
| 15 | `0.0040` | `+0.0150` | |

Lathe UVs follow three's `LatheGeometry`: `u = angle / 2 pi`, `v = pointIndex / 15` (uniform per point, not by arc length). The wheel texture is therefore a band per segment: `wheel.png`, 16 x 256, band k = rows `round(k * 256 / 15)` to `round((k + 1) * 256 / 15) - 1` (row starts `0, 17, 34, 51, 68, 85, 102, 119, 137, 154, 171, 188, 205, 222, 239`).

| Segment | Colour | Note |
| --- | --- | --- |
| 0 and 14 (bearing faces) | `#2c2d30` shield; the 3 rows at each end of the band in `#a6aaae` | dark rubber shield between two thin steel races |
| 1 and 13 (seat steps) | `#a6aaae` | the bearing's outer race edge |
| 2 to 5 and 9 to 12 (faces and lips) | `#ece6d6` | off-white urethane |
| 6 and 8 (lip to tread) | `#e4ddcc` | |
| 7 (tread) | `#dcd4c2` | a touch of road grey |

Wheel material: map `wheel.png`, base `#ffffff`, roughness `0.55`, metalness `0`. One material for all four wheels; merge or instance them (instancing is one draw call either way; merged is simpler to dispose). `assets/source/wheel-print.svg` is a single-colour `#9d9789` mark (ring and chevron, 64 x 64) for a later decal on the outer face flat (segment 12, r 0.011 to 0.020). It is not used by the first build: at 53 mm it is a few pixels on screen and the band texture cannot host it without a wider image.

### 7.6 Lighting and environment

| Setting | Value |
| --- | --- |
| Environment | `new RoomEnvironment()` through `PMREMGenerator.fromScene(env, 0.04)`, once, assigned to `scene.environment`; dispose the generator and the texture on unmount. Never assign it to `scene.background`: the clear colour stays the theme colour (`--scene-bg`, unchanged: dark `#1e2124`, light `#d7d3cb`) |
| `scene.environmentIntensity` | `0.55` (`ART.lights.environment.intensity`) |
| `ambientLight` | `#dde2e8`, intensity `0.3` |
| `directionalLight` | `#fff1e0`, intensity `2.2`, position `[2.5, 5.0, 3.0]`, target `[0, 0.3, 0]` |
| `toneMappingExposure` | `1.0`, ACES filmic, sRGB output (unchanged) |
| Pad | `#616466`, edge `#3e4143`, centre mark `#525557` (lead pass 2026-11-04: darkened from #767a7d so the rendered pad reads mid grey with the environment map at 0.40) |

Intent, in on-screen terms (dark theme, default view): pad mid grey near `#7b7a77`, grip near black with visible grain, wheels near white, aluminium a soft grey with a window-shaped highlight, steel bright on the axle ends. If the picture is too flat or too bright, tune `environmentIntensity` between `0.40` and `0.70` before touching anything else; the key and ambient are already balanced against each other. Under `frameloop="demand"`, call `invalidate()` once after the environment is assigned. The Low detail board uses the same lights and environment, so the two levels share one look.

### 7.7 View panel: Board detail control

A native radio group dressed as a segmented control, placed in the View panel directly after the existing `.playback` button row (same `<section class="panel">`). Markup, exactly:

```html
<fieldset class="segmented" aria-describedby="board-detail-hint">
  <legend class="segmented__legend">Board detail</legend>
  <div class="segmented__options">
    <label class="segmented__option">
      <input class="segmented__input" type="radio" name="board-detail" value="high" checked />
      <span class="segmented__label">High</span>
    </label>
    <label class="segmented__option">
      <input class="segmented__input" type="radio" name="board-detail" value="low" />
      <span class="segmented__label">Low</span>
    </label>
  </div>
  <p class="segmented__hint" id="board-detail-hint">Low uses the simple board. Faster on Chromebooks.</p>
</fieldset>
```

Behaviour: `checked` follows the ui slice (`boardDetail: 'high' | 'low'`, default `high`, persisted like the theme under `trick-lab.board-detail`); `onChange` on each input sets it. No keyboard shortcut (the letter keys are taken; arrow keys move within the group natively). Not logged to the event contract.

Styling notes (all in `app.css`, section "Segmented control"): the input is visually hidden but keeps its hit area over the label, so it remains focusable and clickable; the label shows the state with an accent tint, an inset accent border, bold weight and a filled dot glyph (hollow when idle), so the state is never colour alone; focus draws the usual 3 px `--color-focus` ring inside the group (the group clips overflow). Contrast: text on `--color-accent-bg` 13.4:1 light and 12.4:1 dark, accent border on surface 6.1:1 and 6.4:1, focus ring on surface 6.1:1 and 8.8:1. Target size 36 px tall by at least 72 px wide meets WCAG 2.2 target size (minimum). Disabled state (if the GLB fails to load and Low is forced) uses `disabled` on both inputs and shows at 55 percent opacity.
