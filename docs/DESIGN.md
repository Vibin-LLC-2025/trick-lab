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

Units are metres. The pad top surface is y = 0. Origin is the centre of the pad, under the resting board. The board's long axis is X; the home camera looks down from +Z, centred on X, from above the rider's heels (the rider's own view, ADR-23), with the nose on the right of the stage for the default goofy rider (ADR-24) and on the left for regular (ADR-25, 8.6: the board turns 180 degrees on the pad, the camera does not move). Rotation direction is fixed in ADR-10: in either stance a kickflip rolls the grip toward the heel side, so the graphic turns toward the viewer first. All colors are sRGB hex; pass them straight to `color=` props.

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
| Fog | linear `Fog` to the clear color per theme, near `5.5`, far `15` (ground pass, 2026-11-04, ADR-31; was none). See section 10 |
| Shadows | none on Medium and Low (projected footprints stand in, see below, ADR-38); real shadows on High (ADR-19): `PCFShadowMap`, radius 3, map fitted to the casters (8.1) |

`artDirection.ts` should export `clearColor: { light: '#d7d3cb', dark: '#1e2124' }` and the theme test reads the computed `--scene-bg` for each theme and compares.

### Lights (Three r155+ physically based intensities, fixed across themes)

| Light | Color | Intensity | Position / target |
| --- | --- | --- | --- |
| `scene.environment` (ground pass, 2026-11-04, ADR-31) | procedural outdoor PMREM (sky gradient, sun disc, concrete below; section 10). Was three's RoomEnvironment at `0.40` | `scene.environmentIntensity = 0.90` | n/a, `scene.background` stays the clear color |
| `hemisphereLight` (ground pass, 2026-11-04; replaces the `ambientLight` `#dde2e8` at `0.3`) | sky `#dde2e6`, ground `#6b6a66` | `0.35` | n/a |
| `directionalLight` | `#fff1e0` (was `#ffead2`) | `2.7` (ground pass; was `2.2`, before that `2.4`) | position `[0.9, 6.0, -1.2]` (was `[2.5, 5.0, 3.0]`), target `[0, 0.3, 0]` |

Retuned on 2026-11-04 for the realistic board (section 7): the environment map carries the fill, so the ambient drops and the key light loses some warmth. The key light sits high, so whichever face of the deck is up during the flip is lit and the face that is down falls to ambient. That is what makes the alternation grip, graphic, grip legible.

Moved on 2026-11-04 (art pass after the rider's-view camera, ADR-23): at `[2.5, 5.0, 3.0]` the light was behind and right of the new camera, so on High the board's shadow fell up and left, under the far rail and partly off the board. At `[0.9, 6.0, -1.2]`, high and a little behind the board and to the right, the shadow falls just below the board and slightly toward the viewer, and the gap between board and shadow reads as the height of the pop. The shadow camera bounds (`ART.shadowMap`) did not need to change.

### Camera and controls

| Setting | Value |
| --- | --- |
| Camera position | `[0, 2.552, 1.3]` (0.3 + 2.6 sin 60, 2.6 cos 60: 60 degrees above the horizon over the heel side, ADR-23; was `[1.3, 1.5, 1.9]`). Only its direction is used; the fit sets the distance |
| Camera target (OrbitControls `target`) | `[0, 0.3, 0]` |
| `fov` | `36` (vertical) |
| `near` / `far` | `0.05` / `30` |
| `minPolarAngle` | `0.25` rad (about 14 degrees, near top-down) |
| `maxPolarAngle` | `1.25` rad (about 72 degrees, never below the pad) |
| `minDistance` | `1.0` (ADR-18) |
| `maxDistance` | `4.5` |
| `enablePan` | `false` |
| `enableDamping` | `false` (damping needs a continuous loop; the app runs `frameloop="demand"`) |
| `enableZoom` | `true` |
| Stage fit | the camera backs off along its view direction until the board's flight volume at a 0.6 m pop fits the stage with a 6 percent margin (`scene/cameraFit.ts`, ADR-18, which replaced the whole-pad fit of ADR-11); zoom-out may pass `maxDistance` up to 1.25 times the fit. See 8.2 |
| Presets (2026-11-05, ADR-38) | `rider` (the rows above, the default) and `detail`: 35 degrees above the horizon, 25 degrees round from the heel side toward +X, target `[0, 0.25, 0]` (position `[0.692, 1.397, 1.485]` before the fit, `[0.84, 1.64, 1.80]` after it at 1600 x 1000). Chosen in the View panel (8.9); "Reset view" returns to the chosen one |
| Reduced motion | no easing in either mode; "Reset view" snaps |

The default view is the rider's own view (2026-11-04, ADR-23): 60 degrees above the horizon, straight over the heel side, looking down at the deck and the feet as if standing on the board. The deck runs left to right with the nose on the right and the near rail's wheels just showing under it, and the whole flight arc (peak 0.6 m) rises against the pad. The fitted distance is about 2.27 m on desktop stages, so the 0.81 m board at rest fills a little over half the stage width at 1600 x 1000. It was a 3/4 view about 27 degrees up from the toe side and in front of the nose, which showed the board at a slant and the feet from the side.

### Pad (ground)

Since the ground pass (2026-11-04, ADR-31) the pad is one 1.6 x 1.2 m bay of a concrete ground that runs off into the fog; the slab, its edge lines and the centre mark mesh below are gone, and the bay's joints and its worn centre mark are baked into the ground's textures. Section 10 has the numbers. The other rows are the pad as it was, kept for the history.

| Part | Geometry | Color | Material |
| --- | --- | --- | --- |
| Ground (2026-11-04, replaces the three rows below) | one plane `40.0 x 39.6` m on y `0` (25 x 33 bays of `1.6 x 1.2`): `ground.glb` on Medium and High, an untextured plane of the same size on Low | concrete maps tinted to a mean of `#616466`; Low plane `#616466` | `meshStandardMaterial` with colour, normal and roughness maps (Low plane: roughness `0.93`), metalness `0` |
| Pad slab | box `1.6 x 0.04 x 1.2` (was `3.6 x 0.04 x 2.8`; cut in the integration pass so the whole pad fits the stage, ADR-11), centre `[0, -0.02, 0]` (top at y 0) | `#616466` (was `#6f6a63`) | `meshStandardMaterial`, roughness `0.95`, metalness `0` |
| Pad edge line | `lineSegments` on `EdgesGeometry` of the slab | `#3e4143` (was `#46423d`) | `lineBasicMaterial` (width is 1px in WebGL regardless) |
| Centre mark | optional thin box `0.9 x 0.002 x 0.02` at y `0.001` under the resting board | `#525557` (was `#5e5952`) | roughness `1` |

The pad is a mid concrete gray on purpose: the black grip reads dark against it (3.8:1), the cream wheels read light against it (3.5:1), and the orange graphic reads by hue and saturation rather than by luminance (1.1:1), which is what a real deck does on real concrete. The 2026-11-04 fix: the old pad `#6f6a63` was itself warm (R above G above B), and a warm key light multiplied that into brown. The new pad is neutral with a one-step blue lean, and the key is less warm, so the lit pad lands near `#7b7a77` on screen: grey concrete in both themes. The clear color then sits a step lighter (light theme) or darker (dark theme) than the pad, so the slab has an edge in both themes.

### Board (primitives only, group origin at the deck centre)

Since 2026-11-04 this primitive board is the Suspense fallback and the "Low" board detail level (section 7). Its numbers stay as written, except the trucks and wheels, which moved to the realistic board's axle line on 2026-11-04 (ADR-27) so the primitive pivots on the same rear wheels in the pop instead of dipping 3 cm into the pad.

| Part | Geometry | Color | Material |
| --- | --- | --- | --- |
| Deck body | box `0.81 x 0.012 x 0.205`, centre `[0, 0, 0]` | see faces below | `meshStandardMaterial`, roughness `0.6`, metalness `0` |
| Deck top face (grip) | the +Y face of the deck box (use a 6-material array or a second thin box `0.80 x 0.002 x 0.20` at y `+0.007`) | `#141416` | roughness `1.0`, metalness `0` |
| Deck bottom face (graphic) | the -Y face (or a second thin box at y `-0.007`) | `#ea5a30` | roughness `0.45`, metalness `0` |
| Deck edge (wood) | the four side faces of the deck box, and the wedge sides | `#cdb68c` | roughness `0.7` |
| Nose wedge | box `0.13 x 0.012 x 0.205`, pivot at the deck end, rotated `+0.33` rad (about 19 degrees) up around Z | same face colors as the deck | |
| Tail wedge | box `0.13 x 0.012 x 0.205`, pivot at the deck end, rotated `-0.33` rad up around Z | same face colors as the deck | |
| Trucks (2) | box `0.06 x 0.03 x 0.124` (hanger across the board to the inner wheel faces; was `0.17` long), at `x = ±0.208` (was `±0.26`), `y = -0.025` | `#a9adb3` | roughness `0.35`, metalness `0.7` |
| Wheels (4) | cylinder radius `0.027`, height `0.032`, axis along Z, at `x = ±0.208`, `z = ±0.078` (was `±0.26`, `±0.105`), `y = -0.058` | `#efe9dc` | roughness `0.5`, metalness `0` |

Resting pose: wheel bottoms touch y 0, so the group sits at y `0.085`. Flight adds `y(t)` to that. The grip top and the graphic bottom contrast at 5.5:1 against each other, so each half turn of the flip is a clear value change, not just a hue change.

If the implementer uses a six-material array on one box, the index order for `BoxGeometry` is `[+X, -X, +Y, -Y, +Z, -Z]`, so pass `[wood, wood, grip, graphic, wood, wood]`. Share the four materials across the deck and both wedges.

### Ground shadow footprint (Medium and Low, instead of real shadows)

Was a 0.36 m disc (24 segments, opacity 0.35 to 0.16, scale 1.0 to 0.72), which from the rider's view 60 degrees up read as a big dark circle around the board. From 2026-11-04 it was a soft footprint the size of the board at x z 0, opacity 0.5 to 0.2, scale 1.0 to 0.8. Since 2026-11-05 (ADR-38) the footprints are projected along the key light, so they fall where High's shadow falls, and each shoe has one.

| Property | Value |
| --- | --- |
| Geometry | one unit soft disc (40 segments, full strength inside `0.55` of the radius, transparent at the rim), drawn as one `InstancedMesh` of four instances on the pad at y `0.002`: board soft, board contact, front shoe, back shoe (the shoes only while the feet are shown). One draw call |
| Color | `#0e0f10` |
| Material | `ShaderMaterial` (`mat.shadow`): vertex alpha times a per-instance opacity, `transparent`, `depthWrite false`, tone mapped, no fog |
| Projection | a source point `(x, y, z)` lands at `(x - y dx/dy, 0, z - y dz/dy)`, `d` the key light's direction from `[0.9, 6.0, -1.2]` to `[0, 0.3, 0]`: 0.16 m toward -X and 0.21 m toward the viewer per metre of height. Board: the deck centre. Shoes: the sole centre |
| Board, soft | half extents `0.42` x `0.13`, plus `0.07` on both at 0.6 m; opacity `0.40` at rest to `0.20` at 0.6 m (linear in height) |
| Board, contact | the soft ellipse times `0.88`, opacity `0.20` at rest, gone by `0.05` m of lift (smoothstep) |
| Board shape in flight | turns with the board's yaw; length times `abs(cos pitch)`; width times `lerp(0.5, 1, abs(cos roll))` |
| Shoes | half extents `FOOT` (0.285 x 0.105) / 2 times `1.05`, plus `0.05` at 0.6 m of sole height; turned by the shoe's yaw; opacity `0.30` to `0.14`, plus `0.12` with the sole on the pad (gone by 0.05 m) |
| Union | where a shoe's footprint overlaps the board's, the shader draws only what it adds, so the pad shows the darker of the two, never both stacked |
| Measured (Low, rider view, darkest pixel against the lit pad) | 0.28 at 40 percent of a kickflip and 0.30 at 70 (the 2026-11-04 footprint: 0.32 and 0.35); about 0.52 at rest by the numbers |

Under reduced motion the footprint is pose-driven like everything else, so it needs no special case.

### Budget check

Pad 2 (slab, edge lines), centre mark 1, deck 1 (or 3 with separate face boxes), wedges 2, trucks 2, wheels 4, shadow footprint 1. That is 13 to 15 meshes, well under the 20 draw-call budget, with four shared materials for the board and one each for pad, trucks, wheels and footprint. The motion cues (8.7) add one.

## 3. Slow motion and timeline

- Speed (2026-11-04, ADR-21, replaces the slow-motion toggle): a native range in its own `.timeline` well above the timeline, label "Speed" and a mono readout `0.25x`. Stops 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1, 1.25, 1.5, 2. `aria-valuetext` "0.25 times speed" or "normal speed". Always enabled, including while the board is in the air. Keys: `s` toggles normal and the last slow speed, `[` and `]` step one stop (announced).
- The timeline is a native range, 0 to 100, in its own inset well (`.timeline`) so it reads as a scrubber and not a fourth input. Label "Timeline" on the left, a mono readout on the right: `42% of flight` or `0.22 s of 0.53 s` (either is fine; keep one). `aria-valuetext` says "42 percent of flight".
- The timeline thumb is square-cornered (3px radius) where the input thumbs are round, so a playhead looks different from a dial.
- The timeline is disabled while playing (opacity 0.55, `not-allowed` cursor) and enabled when paused or done. Under reduced motion it is always enabled and is the primary way to watch the trick.
- Arrow keys move 1 percent, Page keys 10 percent, Home and End jump to pop and landing (native behavior, do not override).
- During playback the slider position commits at most 10 times per second from the store; the thumb will step, which is acceptable and honest about the update rate.

## 4. Outcome card copy

Tone: short, plain, encouraging but honest. Name the trick, say what happened, give the numbers. No exclamation marks, no "awesome", no blame.

| Case | `.outcome__name` | `.outcome__detail` |
| --- | --- | --- |
| Landed | `Kickflip landed` | `365 deg kickflip, 0 deg shove, 0.53 s in the air.` (since ADR-30 each non-zero total names its direction: `365 deg heelflip, 173 deg frontside shove, ...`) |
| Under-rotated flip | `Kickflip not landed` | `Under-rotated by 48 deg of flip. More flick or more pop gives it time.` |
| Over-rotated shove | `Pop shove-it not landed` | `Over-rotated by 31 deg of shove. Ease the scoop a little.` |
| Both axes off | `Varial flip not landed` | `Under-rotated 40 deg of flip, over-rotated 28 deg of shove.` |
| Nothing set yet (idle) | `Set the board up and pop` | `Pick a preset or move the sliders, then press Pop or Space.` |
| Ollie (no rotation, landed) | `Ollie landed` | `No rotation, 0.53 s in the air. Add flick or scoop to try a trick.` |

The live announcer uses full words ("365 degrees of kickflip") while the card uses `deg` and `s`, because the card is scanned and the announcer is heard.

Since the UI redesign (section 9) the "card" is no longer a box: it is the headline of the Outcome section at the top of the results column, and the copy above is unchanged.

## 5. How the layout works

`.app` is a three-column CSS grid, `272px minmax(0, 1fr) 312px` (`--col-setup`, `--col-results`), with named areas `setup stage results`, height `100dvh`, 8px gap and padding. The stage cell has `min-width: 0; min-height: 0; overflow: hidden; position: relative` so the canvas can fill it and the perf badge can sit absolutely at its top right. Each side column is one surface (`--color-surface`, a hairline border, 8px radius) with `overflow-y: auto` and `min-height: 0`, so each scrolls on its own while the stage stays put. Its `.panel`s are sections of that surface split by a hairline, not cards: Setup (presets), Inputs, Playback, View on the left; Outcome, Foot motion, Objectives, Event log on the right. Both columns fit without scrolling at 1600 x 1000 and at 1280 x 800 (measured 2026-11-04). Below 960px the grid becomes one column in the order stage, setup, results; the stage gets `aspect-ratio: 16 / 10` with a 260px minimum, the columns flow with the page, and each column lays its panels out side by side (`repeat(auto-fill, minmax(280px, 1fr))`, three across at 900px, one below about 600px). Tab order is DOM order: presets, sliders, playback, view, results. Details in section 9.

## 6. Theme note

Tokens live on `:root` (light) with a full override under `:root[data-theme="dark"]`. The app sets `data-theme="dark"` on `<html>` at startup, persists the choice in `localStorage` under `trick-lab.theme`, and offers a toggle (the "Light theme" switch in the View panel, key `t`). `color-scheme` is set per theme so native controls and scrollbars follow. The only scene property that follows the theme is the clear color; lights and materials are fixed. Only `.perf-badge` uses literal colors; everything else goes through tokens, so a third theme is one more attribute block.

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

Measured since the truck pass (2026-11-05, ADR-40, 7.4): Medium 14,272 triangles (aluminium 2,856, steel 1,760 with the bolts, bushings 352 with the pivot cup inserts), High 47,488 (9,560, 4,368, 736). The textures row above is Medium; the deck-bottom map now carries the wear of 7.3.

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

**Deck wear** (truck pass, 2026-11-05, ADR-40; `DECK_WEAR` in `src/asset/spec.ts`, `wearDeckBottom` in `textures.ts`). The build bakes a mild, used state over the rasterized graphic, placed in deck metres so both tiers get the same marks. Seed `20261106`. One wear mask, 0 clean print to 1 bare wood, drives the colour and (High) the roughness:

| Mark | Value |
| --- | --- |
| Maple grain under the print | lines along the deck, 1.6 mm apart on average, wandering up to 2.2 mm over 0.11 m; +-2 levels on the print (the wave snapped to 0.2 m blocks along the deck, which 2 levels cannot show and which a PNG row filter stores nearly free), +-14 on bare wood |
| Slide scratches | 16 between the trucks (x -0.16 to 0.16), mostly across the deck (up to 24 deg off), 3 to 11 cm long, 0.4 to 1.1 mm wide, strength 0.35 to 1, tapered at both ends |
| Tips scraped to wood | within 7.5 cm of the tail tip and 5.5 cm of the nose tip, 5.5 to 12 mm (tail) and 5 to 9 mm (nose) in from the outline, ragged by 4 mm noise, strongest at the tip (the graphic starts 4 mm in, at the bevel, so a few millimetres of bare maple show) |
| Scuff haze | patches of 18 mm noise within 9 cm of each tip, mask at most 0.24 (tail) and 0.15 (nose) |
| Colour | scuffed print goes pale toward `#f2e9da` by up to 0.42; mask 0.55 to 0.85 fades to bare maple `#d9c39c` |
| Roughness (High, `deck-bottom-roughness.png` 1024 x 256 grey, glTF green, factor 1) | print 0.45, scuffed 0.62, bare wood 0.80 |
| Medium | the same colour; the graphic keeps its constant roughness 0.45, because Medium has no texture slot left (4 of 4) |

Measured on the High map: 0.5 percent of the visible graphic is bare wood and 5.7 percent is touched at all (tested to stay within 0.1 to 3 and under 20); the nose disc stays cream (mean red above 235) and the tally marks keep their ink (tested). Nothing covers the deck uniformly.

### 7.4 Hardware and trucks

Positions are for the nose truck, centred at `x_c = +0.208` (midpoint of the bolt pattern, which runs `x = 0.181` to `0.235`). Mirror x for the tail truck. Deck bottom under a truck is `y = -0.00575` (flat, no kick, zero concave on the centreline).

**Bolt heads** (8, countersunk since the truck pass, 2026-11-05, ADR-40): at `x in {0.181, 0.235}` and mirrored, `z = +-0.0205` (pattern `0.054 x 0.041`). Each is a lathe on the local deck normal (`surfaceNormal`, tilted about 3 deg across by the concave) at the grip's top over its plan point: radius `0.00475`, rim `0.15` mm proud of the grip, chamfered to a flat top `0.7` mm proud at radius `0.0034`, and a hidden part `0.6` mm into the deck (was a flat cylinder 2 mm tall, 1.3 mm proud at the centreline). Medium 10 segments; High 24 with a hex socket for a 3 mm key (apothem 1.5 mm), its floor `0.1` mm above the grip so the grip never covers it. Steel material darkened to black oxide by a vertex colour (glTF `COLOR_0` `(0.12, 0.12, 0.125)` linear; 1 on every other steel part), so there is no eighth material.

| Part | Geometry | Material |
| --- | --- | --- |
| Baseplate | rounded box `0.085 (X) x 0.008 (Y) x 0.060 (Z)`, corner radius `0.002`, 4 segments per edge, centre `(0.208, -0.00975, 0)` (top at `-0.00575`) | aluminium |
| Pivot cup socket | cylinder radius `0.0122` on the pivot axis from `-0.003` to `0.008` about the cup centre `(0.2448, -0.0203, 0)`, axis `d_p = (0.6428, 0.7660, 0)` (40 deg from vertical, leaning outboard), 12 segments (was radius `0.011`, length `0.016`) | aluminium |
| Pivot cup insert | cylinder radius `0.0098` from `-0.0085` to `-0.0025` on the same axis: the urethane cup's lip below the socket, where the pivot enters (ADR-40) | bushing |
| Kingpin | cylinder radius `0.0045`, length `0.052`, 10 segments, from `K0 = (0.198, -0.01375, 0)` along `d_k = (-0.3420, -0.9397, 0)` (20 deg from vertical, leaning inboard, so the two kingpins face each other) | steel |
| Cup washer, boardside | cylinder radius `0.0125`, thickness `0.0012`, 16 segments, on the kingpin from `0` to `0.0012` | steel |
| Bushing, boardside | cone radius `0.0125` to `0.0115`, length `0.0145`, 16 segments, on the kingpin from `0.0012` to `0.0157` | bushing |
| Bushing seat | chamfered ring on the kingpin from `0.0157` to `0.0277`, radius `0.0136`, chamfer `0.0016`, 12 segments (High 32): the hanger's seat between the two bushings (ADR-40; replaces the rounded-box yoke) | aluminium |
| Bushing, roadside | cone radius `0.0115` to `0.0105`, length `0.012`, on the kingpin from `0.0277` to `0.0397` | bushing |
| Cup washer, roadside | cylinder radius `0.0120`, thickness `0.0012`, on the kingpin from `0.0397` to `0.0409` | steel |
| Kingpin nut | hex prism (6 radial segments) radius `0.0075`, height `0.007`, on the kingpin from `0.0409` to `0.0479` (4 mm of thread shows beyond it) | steel |
| Hanger body | a loft along the axle of convex sections about `A = (0.208, -0.05775, 0)`, each the convex hull of circles: to `abs(z) = 0.007` the yoke (the axle circle `0.011`, a lobe `0.0092` under the bushing seat, `0.0217` down the kingpin and `0.005` outboard, and the pivot boss `0.0095`, `0.006` along the pivot), blended by smoothstep to `abs(z) = 0.027` into the bar (the axle circle and a lobe `0.0015` inboard and `0.0105` above it, radius `0.0085`), tapering linearly to `abs(z) = 0.05` (axle circle `0.0094`, lobe `0.0025` up, `0.0072`); 20 points by 17 stations (High 40 by 33). Seen from the front the top edge falls from the yoke to the ends and the bottom stays on the axle line, the cast Stage 11 silhouette. Replaces the rounded-box axle housing (ADR-40) | aluminium |
| Axle bulges | chamfered barrels round the axle at `abs(z)` `0.0465` to `0.061`, radius `0.011`, chamfer `0.0015`, 12 segments (High 32), standing 1.6 mm proud of the bar's end | aluminium |
| Hanger envelope (`TRUCK.axleHousing`) | nothing of the hanger reaches below `y = -0.06875` or past `abs(z) = 0.061`, the old housing's box, so the feet clearance solids (ADR-29) are unchanged | |
| Pivot | cone radius `0.0085` at the boss to `0.0062` at the tip (was a `0.0075` cylinder), length `0.030`, 10 segments, from `(0.220, -0.04975, 0)` along `d_p` into the cup insert | aluminium |
| Axle | cylinder radius `0.004`, length `0.203` along Z, 12 segments, centre `A` (axle to axle `0.203`, just under deck width) | steel |
| Speed washers (4) | cylinder radius `0.0065`, thickness `0.001`, 12 segments, at `abs(z)` in `[0.061, 0.062]` and `[0.094, 0.095]` | steel |
| Axle nuts (2) | hex prism radius `0.0062`, height `0.006`, at `abs(z)` in `[0.095, 0.101]` | steel |

Truck height from the deck to the axle centre is `0.052` (a mid truck). Wheel top at `y = -0.03125` leaves 25 mm under the deck, so no wheel bite at any pose. "Rounded box" means three's `RoundedBoxGeometry` or an equivalent (a box with its edges filleted at the given radius).

| Material | Colour | Roughness | Metalness | Used by |
| --- | --- | --- | --- | --- |
| aluminium (raw cast) | `#b7babd` | `0.50` | `0.85` | baseplate, pivot cup socket, hanger body, bushing seat, axle bulges, pivot |
| steel | `#cfd2d5` | `0.28` | `1.0` | kingpin, axle, nuts, washers; bolt heads at vertex colour `0.12` (black oxide) |
| bushing (urethane) | `#d9a441` (amber) | `0.55` | `0` | 4 bushings, 2 pivot cup inserts |

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
| Environment | the procedural outdoor scene of section 10 (`src/scene/outdoorEnvironment.ts`; was `new RoomEnvironment()` until the ground pass, 2026-11-04) through `PMREMGenerator.fromScene(env, 0.04)`, once, assigned to `scene.environment`; the generator and the outdoor scene are freed at once, the texture on unmount. Never assign it to `scene.background`: the clear colour stays the theme colour (`--scene-bg`, unchanged: dark `#1e2124`, light `#d7d3cb`) |
| `scene.environmentIntensity` | `0.90` (ground pass; was `0.40` with the room, designed 0.55) |
| `hemisphereLight` | sky `#dde2e6`, ground `#6b6a66`, intensity `0.35` (ground pass; was an `ambientLight` `#dde2e8` at `0.3`) |
| `directionalLight` | `#fff1e0`, intensity `2.7` (ground pass; was `2.2`), position `[0.9, 6.0, -1.2]` (was `[2.5, 5.0, 3.0]`, moved 2026-11-04, see section 2), target `[0, 0.3, 0]` |
| `toneMappingExposure` | `1.0`, ACES filmic, sRGB output (unchanged) |
| Pad | `#616466`, edge `#3e4143`, centre mark `#525557` (lead pass 2026-11-04: darkened from #767a7d so the rendered pad reads mid grey with the environment map at 0.40). Since the ground pass the concrete's mean colour is still `#616466`; the edge and the mark are in its textures (section 10) |

Intent, in on-screen terms (dark theme, default view): pad mid grey near `#7b7a77` (measured after the ground pass: `#787978` to `#7e7f7e`), grip near black with visible grain, wheels near white, aluminium a soft grey with a window-shaped highlight, steel bright on the axle ends. If the picture is too flat or too bright, tune `environmentIntensity` between `0.40` and `0.70` before touching anything else; the key and ambient are already balanced against each other. Under `frameloop="demand"`, call `invalidate()` once after the environment is assigned. The Low detail board uses the same lights and environment, so the two levels share one look.

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

Styling notes (superseded on 2026-11-04 by section 9, which drops the dot glyph and puts the legend and the options on one row; the markup and behaviour here still hold) (all in `app.css`, section "Segmented control"): the input is visually hidden but keeps its hit area over the label, so it remains focusable and clickable; the label shows the state with an accent tint, an inset accent border, bold weight and a filled dot glyph (hollow when idle), so the state is never colour alone; focus draws the usual 3 px `--color-focus` ring inside the group (the group clips overflow). Contrast: text on `--color-accent-bg` 13.4:1 light and 12.4:1 dark, accent border on surface 6.1:1 and 6.4:1, focus ring on surface 6.1:1 and 8.8:1. Target size 36 px tall by at least 72 px wide meets WCAG 2.2 target size (minimum). Disabled state (if the GLB fails to load and Low is forced) uses `disabled` on both inputs and shows at 55 percent opacity.

## 8. Quality tiers, feet and framing (2026-11-04)

Written by the lead's agent (fable) for the quality pass, per `docs/BRIEF-FEET.md`. Section 7.7's "Board detail" control is replaced by the "Quality" control in 8.4; everything else in sections 2 and 7 still holds and is the Medium and Low look.

### 8.1 Renderer per tier (`ART.quality`)

| Tier | antialias | dpr | shadows | anisotropy | powerPreference | Board | Shoes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| High | true (MSAA) | `[1, 2]` | PCF (radius 3), 2048 px map | 16 | `high-performance` | `board-high.glb` | `shoes.glb` |
| Medium | true | `[1, 1.5]` | none (projected footprints) | 4 | `low-power` | `board.glb` | primitive |
| Low | false | `[1, 1.5]` | none (projected footprints) | 1 | `low-power` | primitive | primitive |

Shadow map (`ART.shadowMap`, since 2026-11-05, ADR-38): `PCFShadowMap` (was a PCFSoft request, which r187 replaced by PCF at radius 1), radius 3 texels, 2048 px. The orthographic camera is fitted to two caster boxes, `[-0.6, 0, -0.43]` to `[0.6, 1.0, 0.43]` and `[-0.37, 1.0, -0.4]` to `[0.37, 1.36, 0]`, and to where their shadows reach the pad, plus 0.03 m: left -0.768, right 0.768, bottom -0.787, top 0.889, near 4.70, far 6.46 (texels of 0.82 mm). Bias -0.0002, normal bias 0.002 (was +-1.0 m, near 1.0, far 12.0, bias -0.0004, normal bias 0.015). The key, ambient and environment numbers in 7.6 are unchanged; the shadow adds the contact under the wheels that the disc only suggested. The pad's centre mark now floats 1.5 mm above the slab (`mark.y` 0.0025) so it no longer z-fights.

### 8.2 Camera framing (`ART.camera.fit`, ADR-18)

Fit box: `reach` 0.4195 (nose tip plus 1 cm), `bottom` 0 (the pad surface under the board), `top` 0.81425 (rest height plus a 0.6 m pop plus the 0.13 m half extent). Margin 6 percent. `minDistance` 1.0 m. The pad is no longer part of the fit.

Rider's view (2026-11-04, ADR-23): the home direction is from `[0, 2.552, 1.3]` to `[0, 0.3, 0]`, 60 degrees up over the heel side. From there the box's depth in Z is its height on screen, so on stages wider than about 0.89 the height binds and the distance is 2.27 m whatever the aspect (2.31 m on the 1600 x 1000 stage from the old 3/4 view); on the 1024 x 768 stage (aspect 0.49) the width binds at 3.43 m (was 4.19 m). The fit box and margin did not change; a 0.6 m 360 flip at its peak stays in frame at both sizes.

Detail preset (2026-11-05, ADR-38): from 35 degrees up and 25 degrees round from the heel side toward the goofy nose, aimed at `[0, 0.25, 0]`, the same fit box and margin give 2.43 m on the 1600 x 1000 stage. The deck edge, both trucks and the soles' gap to the grip read, and the shadow stays in frame.

### 8.3 Shoes

One right shoe in `shoes.glb`, every number in `src/asset/shoeSpec.ts`. Size `0.285 x 0.105`, sole height `0.024` (equal to `FOOT` in `src/sim/feet.ts`). Construction pass (2026-11-05, ADR-39, written by the implementation agent (opus) from `docs/research/2026-11-05/visual-realism.md` section 3, pending the design agent's own pass); the envelope, the colours and the three materials are unchanged, so it is the same shoe, built like one:

| Part | Shape | Colour (sRGB) |
| --- | --- | --- |
| Sole wall | 15 footprint rings, 72 outline points per side. The foxing wall stands 24 mm; a groove 0.8 mm deep between 21 and 30 percent of its height parts it from the outsole edge below (fine vertical ribs), which is what the foot stands on | foxing `#e9e5db` with the stripe `#cfc9bb` from 55 to 80 percent, outsole edge `#ddd7c9`, groove `#b9b2a3` |
| Toe spring | The upper and every sole ring above the underside rise 4 mm x s^2 from t 0.8 to the toe tip; the underside stays flat on y 0 and the toe cap height at t 0.8 does not move | |
| Toe bumper | A rubber band 0.9 mm proud of the upper's toe, from nothing at t 0.8 to 11 mm above the sole top by t 0.9, with a lip back onto the upper; in the sole material | sole colour, scuffed at the tip |
| Underside | Waffle tread in the sole map: diamond lands 6.2 mm, grooves 1.1 mm, a smooth rim 4 mm in from the edge; worn smoother at the heel and the ball, dirt in the grooves | lands `#d3ccbd`, grooves `#9d9586`, dirt `#6f675b` |
| Shell | Superellipse arches over the footprint (exponent 3 at the collar for near-vertical quarters), cut open from t 0.075 to 0.665: the collar oval (half gap 28 mm at its widest) and the lace gap (11 to 7.5 mm), a rounded end at each end. Rim 54 mm above the sole top at the heel, 45 mm at the sides of the ankle | upper `#23262c`, toe cap `#2e3238` (seam from t 0.80 on top to 0.73 at the edge), heel counter `#2a2d34` (seam 0.06 to 0.15), heel tab `#3a3e45`, eyestays 3 levels lighter, stitching 4 mm into each panel |
| Collar and bead | A tube round the whole rim: 4.5 mm radius round the ankle (the padded collar), easing to a 1.3 mm bead along the lace gap from t 0.36 to 0.43 | collar `#2a2d33` |
| Lining and insole | From inside the collar roll down to an insole 5 mm above the sole top, across under the tongue at t 0.38. The upper material is double sided, so the inside of the shell shows (dark) wherever the opening lets a view in | lining `#33363c` (fine mesh), insole `#44474d`, darker under the heel |
| Tongue | A padded slab 4 mm thick, 3.5 mm below the eyestays and 3 mm wider than the gap on each side (the eyestays cover the overlap), from under the vamp at t 0.70 to a rounded top at t 0.36 that rises 11 mm out of the gap in front of the ankle | tongue `#1d2025`, underside the lining |
| Eyelets | Twelve rims, 2.1 to 3.3 mm radius, 0.6 mm proud, 5.5 mm outside the gap, six per side from t 0.43 to 0.64, over a dark hole | eyelet `#8d9096` (grey map, so a little bluer) |
| Laces | Flat ribbons 10 x 1.5 mm narrowing to 4 mm into each eyelet: a bar across the bottom pair, ten criss-cross spans (one rides 2 mm over the other at each crossing), two spans to a small knot over the top pair, two ends of 42 and 36 mm with aglets falling to each side | laces `#f1eee7` |

Wear (mild, seeded): a broad worn patch at the lateral forefoot (an ellipse round t 0.735, section 0.8, scuffed lighter `#4a4e55` with a noisy edge, through to a dark backing `#1b1d21` at its core, no alpha hole); the toe front scuffed; four flex creases across the vamp from t 0.69 to 0.77; scuffs on the foxing and the bumper at the same lateral forefoot and at the toe tip; a fine suede nap from two octaves of seeded hash value noise (2.2 and 3 grey levels), which does not repeat. Textures: `shoe-upper.png` 1024 x 1024, one grey channel tinted by the material's base colour factor (as the medium grip: red and green scaled so the stored blue value lands on the upper colour; the other panels' blue leans by a level or two); `shoe-sole.png` 1024 x 512 RGB (the wall strip by arc position round the footprint and height, the bumper, the tread in plan); both mipmapped. Roughness as before: sole 0.85, upper 0.9, laces 0.8.

The primitive shoe (`ART.feet`, Low, Medium and the High fallback; two draw calls per shoe as before): the GLB's footprint, centred across so it spans the 0.105 width mirrored or not, extruded to the sole height with a 1.5 mm bevel round the bottom and the foxing set back 1.2 mm above 6 mm (480 triangles), and an upper of 22 x 14 superellipse arches, 2 mm inside the sole's top edge: a heel counter 52 mm above the sole top, a collar notch down to 40 mm over the ankle with a valley sunk into its top, the instep at 49 mm, the toe (566 triangles). Colours as the GLB's sole and upper. It stays inside the envelope `clearance.test.ts` assumes (`ART.feet.upper`: 0.245 x 0.07 x 0.081 from the heel, plus the whole footprint up to the toe cap height), tested vertex by vertex.

Stance and motion numbers are `STANCE` and `MOTION` in `src/sim/feet.ts` (ADR-17): front foot across the board at x 0.10 at flick 0, turning 50 degrees toward the nose and moving 5 cm forward and 3.5 cm to the heel side by flick 2 rev/s; back foot across the tail pocket at x -0.30, toes 3 cm toward the toe side by scoop 2 rev/s; slide 10 cm, flick 15 cm per unit of normalised flick with 25 degrees of toe dip, scoop drag 12 cm per unit of normalised scoop, hover 12 cm, bail to z -0.26 (front) and -0.24 (back) on the pad.

Stance side (2026-11-04, ADR-24): the rider is goofy, the regular numbers mirrored across z = 0. Nose +X on the rider's right, toe side -Z, heel side +Z, so the bail goes to z +0.26 and +0.24. The front foot is the right shoe as built (unmirrored) and the back foot the mirrored left one; in the rider's view from the heel side the right-hand shoe is the front foot, the one that slides up and flicks.

Mirror setups (2026-11-04, ADR-30). Flick and scoop are signed, so the feet also set up for a heelflip and a frontside scoop (numbers in `STANCE` and `MOTION`, from RESEARCH-FEET.md 1.4 and 1.6 with z mirrored into the goofy frame). Heelflip: the front foot stays across the board just behind the bolts, the ball of the foot on the toe-side rail (centre z -0.033 since ADR-34, was -0.02) with the toes hanging 7 cm over it and the heel at the heel-side rail; it slides 8 cm, then the heel sweeps forward and across the deck to the toe-side pocket of the nose and off it (27 cm, 1.4 times the kickflip's flick) while the toes turn forward and out along the kick (88 to about 66 degrees), toes up and heel down (20 degrees at the peak of the kick) instead of rolling onto the outside edge: heel last (ADR-34). Frontside scoop: the back foot sits a little further back and toward the heel side of the tail (x -0.33, z +0.04 at the preset), square across, and slices the tail forward toward the toe side by the same 10 cm per rev/s as the backside scoop. A kickflip with a frontside scoop (the hardflip until ADR-41, 2026-11-05, which removed the name and preset and kept this motion) and the inward heelflip compose the two; since ADR-35 that front foot is set a little more toward the nose (about 37 degrees) and kicks straight forward off the nose (lean (0.90, 0.30, 0.30), held for harder frontside scoops) instead of the varial flip's lean out to the heel side, while the board comes round frontside under it. Copy in `#scene-description`: "Front foot across the board just behind the front bolts, toes hanging over the toe-side edge for a heelflip" and "back foot on its ball toward the heel side of the tail, to scoop frontside". Step copy (8.5): "Front foot slides up the grip toward the nose, 8 cm." / "Front foot kicks forward and out off the toe-side corner of the nose, heel last, 27 cm." (under 11 cm: "Front foot kicks off the toe-side corner of the nose, but only 6 cm: it barely reaches the rail.") / "Back foot slices the tail forward in front of the toes, 9 cm toward the toe side." The bail is unchanged: both feet step off to the heel side. The stance note names both directions: "Flick rolls the grip toward the heel side for a kickflip, toward the toe side for a heelflip; scoop swings the tail behind the heels for backside, counterclockwise seen from above, and in front of the toes for frontside, clockwise." (regular: clockwise for backside, counterclockwise for frontside).

### 8.4 View panel: Quality control and Show feet

The segmented control from 7.7 with three options and the group name "Quality". Markup, exactly:

```html
<fieldset class="segmented" aria-describedby="quality-hint">
  <legend class="segmented__legend">Quality</legend>
  <div class="segmented__options">
    <label class="segmented__option">
      <input class="segmented__input" type="radio" name="quality" value="high" />
      <span class="segmented__label">High</span>
    </label>
    <label class="segmented__option">
      <input class="segmented__input" type="radio" name="quality" value="medium" checked />
      <span class="segmented__label">Medium</span>
    </label>
    <label class="segmented__option">
      <input class="segmented__input" type="radio" name="quality" value="low" />
      <span class="segmented__label">Low</span>
    </label>
  </div>
  <p class="segmented__hint" id="quality-hint">Picked for this device. High adds shoes, shadows and a finer board. Low is the simple board, fastest on Chromebooks.</p>
</fieldset>
```

The hint's leading "Picked for this device. " appears only while the tier is the automatic pick. If a model fails to load, High and Medium are `disabled` and Low is checked. "Show feet" is a `.toggle` switch (a button with `aria-pressed`, visible label "Feet") in the View panel's `.view-panel__toggles` grid (section 9). Announcements: "Quality high: detailed board, shoes and shadows.", "Quality medium: detailed board, no shadows.", "Quality low: simple board. Fastest.", "Feet shown.", "Feet hidden.".

### 8.5 Foot trails and the Foot motion panel (2026-11-04, ADR-22)

Foot trails are the route each shoe takes through the trick, drawn in the scene. They are hidden by default so a student switches them on when they want them: "Show foot trails" is a `.toggle` switch (visible label "Foot trails") in the View panel's `.view-panel__toggles` grid, after Feet, persisted under `trick-lab.foot-trails` (only a saved "on" shows them). Announcements: "Foot trails shown.", "Foot trails hidden.". The identifiers (`footPathsVisible`, `ART.footPaths`, `FootPaths.tsx`) still say paths; renaming them is a follow-up.

Scene trails (`ART.footPaths`): front foot `#56b4e9`, back foot `#f0e442` (Okabe-Ito sky blue and yellow, distinct under the common colour-vision deficiencies and from the orange deck graphic), the same in both themes and mirrored as `--path-front` and `--path-back` in tokens.css (tested). Tube radius 4.5 mm, 6 sides, traced 4 cm above the sole centre so it leaves from inside the shoe; arrowheads 12 x 32 mm every 0.08 of the airtime from 0.04 wherever the foot moves faster than 0.12 m per unit of progress. Travelled part opaque, the rest at opacity 0.3, the last 0.03 of the airtime behind the foot lifted 45 percent toward white. Unlit and not tone mapped, depth tested, no depth write. With the goofy rider (ADR-24), seen from the heel side the blue front trail is the right-hand one and leaves the nose toward the viewer; the yellow back trail is on the left, on the tail.

DOM: a "Foot motion" panel in the results column after the Outcome section. A legend (`.foot-steps__legend`, `.foot-steps__key`, `.foot-steps__swatch--front` and `--back`) in the panel header, shown as a dot and "Front" or "Back", read as "Front foot, blue trail." and "Back foot, yellow trail."; and an ordered list `.foot-steps` of `.foot-step.foot-step--front|back|both`, each with `.foot-step__who` ("Front foot", "Back foot", "Both feet") and `.foot-step__text` on one line. Since the redesign (section 9) a step is a numbered row with a small dot in its foot's trail colour before the name, never a left bar; the words carry the meaning too. Steps under the playhead get `.foot-step--now`: a filled step number and the surface-2 row tint, plus a visually hidden ", now". Not a live region.

Step copy (from `footSteps` in format.ts, numbers from the feet model): "Back foot snaps the tail down off the ball of the foot: the pop." / "Back foot scoops the tail back behind the heels, 9 cm toward the heel side." (", a light nudge" under 6 cm, ", as hard as it goes" at the cap) / "Front foot drags up the grip on its outside edge toward the nose, 10 cm." / "Front foot flicks forward, out and up off the heel-side corner of the nose, 19 cm." or, under 8 cm, "... but only 4 cm: it barely reaches the rail." / "Both feet lift 8 cm clear while the board turns under them." or, for an ollie, "Both feet stay on the board as it levels out and rises with them." / "Both feet come back over the bolts and land on the grip." or "The board does not come round in time: both feet step off to the heel side, a bail."

The 8.3 stance paragraph is superseded by ADR-20: the numbers are `STANCE` and `MOTION` in `src/sim/feet.ts`, from `docs/RESEARCH-FEET.md` 5.1. The sole heights are no longer fixed (ADR-29, 2026-11-04): each shoe sits 2 mm above whatever part of the board is under it in the board's pose at that moment (the rails and the concave at rest, the tail kick under the back foot, the rail or the wheels of a spinning deck), on either board model, and never below the pad. The hover stays at 12 cm.

### 8.6 Stance control (2026-11-04)

The segmented control from 7.7 with two options and the group name "Stance", in the View panel above Quality. Goofy is the default; the choice is persisted under `trick-lab.stance`, never logged, not cleared by Reset and not in the export. No keyboard shortcut. Markup, exactly:

```html
<fieldset class="segmented" aria-describedby="stance-hint">
  <legend class="segmented__legend">Stance</legend>
  <div class="segmented__options">
    <label class="segmented__option">
      <input class="segmented__input" type="radio" name="stance" value="goofy" checked />
      <span class="segmented__label">Goofy</span>
    </label>
    <label class="segmented__option">
      <input class="segmented__input" type="radio" name="stance" value="regular" />
      <span class="segmented__label">Regular</span>
    </label>
  </div>
  <p class="segmented__hint" id="stance-hint">Goofy: right foot forward, nose on the right. Regular: left foot forward, nose on the left.</p>
</fieldset>
```

It uses the existing `.segmented*` styles, no new CSS. Announcements: "Goofy stance: right foot forward, nose on the right." and "Regular stance: left foot forward, nose on the left.".

What changes in the scene (ADR-25): the camera, lights and pad stay where they are, so the view is still from the rider's heel side. Regular turns the board 180 degrees about Y on the pad (nose on the left of the stage) and mirrors both feet along the board's length: the front foot is the left shoe, on the left, toes still away from the camera; the blue front trail is the left-hand one and still leaves the nose toward the viewer. A kickflip still rolls the grip toward the camera first and a bail still steps toward it; a backside shove-it still swings the tail toward the camera, which is now clockwise seen from above. Switching while a trick is frozen or landed swaps the board and feet in one frame. `#scene-description` names the stance: "Goofy stance, nose to the right, heel side toward the camera. ..." or "Regular stance, nose to the left, heel side toward the camera. Flick rolls the grip toward the heel side; scoop swings the tail toward the heels, clockwise seen from above."

### 8.7 Motion cues (2026-11-04, ADR-26)

Flat arrows on the grip that show how each shoe will move against the deck for the current inputs, before the pop. They lie on the deck (a child of the board group, so they ride with it), 3 mm above whichever grip is higher at that point (the realistic board's kicks and concave, or the primitive's flat deck), and are hidden by the shoes where they pass under them. Shown by default; the View panel's "Show motion cues" switch hides them (`motionCuesVisible`, persisted under `trick-lab.motion-cues`).

| Cue | What it shows | Colour |
| --- | --- | --- |
| Front arrow | The front shoe's ball (6 cm ahead of the sole centre toward the toes) through its slide toward the nose and, for a flick, out off the heel-side corner of the nose; the arrowhead is where the shoe leaves. Since ADR-33 the ball offset follows the shoe's own yaw at each sample, so a kickflip's arrow bends out through the pocket as the toes turn toward the heel side. An ollie or a pop shove-it is a straight slide toward the nose; a kickflip bends out toward the heel side; a varial leans forward, a 360 flip out | front `#56b4e9` |
| Press outline | A rounded outline 14 mm outside the back sole on the tail pocket: where the back foot presses for the pop | back `#f0e442` |
| Scoop arrow | Only with scoop: an arc about the board's centre (the shove axis), 3.5 cm in front of the back shoe, sweeping toward the heel side by the scoop's sideways distance (9 cm for the pop shove-it preset, 18 cm for the 360 flip) | back `#f0e442` |

Numbers (`ART.motionCues`): ribbon 14 mm wide, arrowhead 42 mm long and 44 mm wide, press outline 9 mm wide, 32 points per arrow, opacity 0.95, unlit and not tone mapped (so the colours match the trails and the Foot motion legend), no depth write, polygon offset toward the camera. One draw call for all of it.

Fade: full before the pop; with a trick in the air they fade out over the first 12 percent of the airtime and stay hidden through the landing (the deck has turned by then, so an arrow riding it would point the wrong way). Scrubbing back to the start or Reset brings them back. With the goofy rider seen from the heel side the blue arrow is on the right and its flick bends toward the viewer; for regular (8.6) the cues mirror with the feet, blue on the left, still bending toward the viewer, and the scoop still sweeps toward the viewer.

Mirror tricks (2026-11-04, ADR-30): the cues follow the signed inputs with no new geometry. A heelflip's front arrow bends away from the camera, off the toe-side corner of the nose; a frontside scoop's arc sweeps toward the toe side, still on the nose side of the back shoe so the shoe does not hide it, by the same length as the backside one (9 cm for the frontside shove-it preset). A kickflip with a frontside scoop (the hardflip until ADR-41) shows the kickflip front arrow with the frontside arc.

### 8.8 Legs (2026-11-05, ADR-37)

Written by the implementation agent (opus) for the legs, pending the design agent's own pass; `ART.legs` in artDirection.ts is sourced from here. (8.6 is the Stance control, so the legs take the next free number.)

The rider's lower legs come out of the shoe collars and the thighs dissolve toward the hips: there is no torso, so a leg never ends in a cut. Shown by default with the feet; the View panel's "Show legs" switch (a `.toggle`, visible label "Legs", after Feet) hides them and is not shown while the feet are hidden. Announcements: "Legs shown.", "Legs hidden.".

| Part | Shape | Colour (sRGB) |
| --- | --- | --- |
| Thigh | Tapered capsule, hip radius 0.085 to knee 0.062 (slightly baggy trousers); opaque from the knee to 0.85 of its length, clear from 0.35 toward the hip (vertex alpha, no depth write) | trouser `#3b3e44` |
| Shank | Tapered capsule, knee 0.054 (inside the thigh's knee cap), calf 0.056 at 0.3 of its length, hem 0.054 | trouser `#3b3e44` |
| Sock | From the hem, 4.5 cm above the ankle joint, a step in to 0.036, 0.034 at the ankle, capped inside the shoe (about 3 cm shows above the collar) | sock `#d9d5cb` |

One roughness for both cloths, 0.95; 16 radial segments, 4 per cap. Lengths are the rider's (`LEG` in src/sim/legs.ts: thigh 0.43, shank 0.42). Two draw calls for both legs on every tier; on High the shanks cast shadows like the shoes and the thighs do not. From the rider's view the thighs point toward the camera and stay behind the knees, so the board and the shoes stay readable at the catch; the low side view shows the crouch, the tuck, the reach for the catch and the bent knees at the landing. `#scene-description` adds one sentence after the feet: "Legs crouched, knees bent, ready to pop.", "Knees tucked up in the air.", "Legs reach down to catch the board." (a bail: "Legs reach down beside the board."), "Knees bent, absorbing the landing.".

### 8.9 Camera control (2026-11-05, ADR-38)

Written by the implementation agent (opus), pending the design agent's own pass. The segmented control from 8.6 with two options and the group name "Camera", in the View panel above Stance. Rider is the default; the choice is persisted under `trick-lab.camera-view`, never logged, not cleared by Reset and not in the export. No keyboard shortcut. Same markup as 8.6 with `name="camera"`, values `rider` and `detail`, labels "Rider" and "Detail", and the hint `#camera-hint`: "Rider: looking down from above your heels. Detail: low and to the side, to see the deck, trucks and soles." No new CSS. Announcements: "Rider's view: looking down from above the heels." and "Detail view: low three-quarter view from the heel side.". Choosing an option moves the camera at once (no easing); "Reset view" returns to the checked preset.

## 9. UI redesign (2026-11-04)

Written by the design agent (ADR-28). The owner found the columns bulky, without hierarchy, and full of template tells, such as a Foot motion step drawn as a card with a yellow left border. This pass keeps every control, accessible name, announcement and the token palette, and changes how the columns look and are grouped. The `--scene-bg` values are unchanged.

### 9.1 What was removed

- Left-border accents everywhere: the 4 px preset bar, the 5 px outcome bar, the 3 to 6 px Foot motion bars.
- Uniform cards: every panel was a rounded box with the same padding, border and shadow. Panel shadows, the stage shadow, the dialog's 4 px accent top border and the 2 px title underlines are gone.
- Inset wells around Speed and Timeline, the tinted box around each telemetry value, and the green row tint on done objectives.
- A wall of equal orange ghost buttons in the View panel (six of them in a wrapping row).
- Duplicate results: the telemetry "Outcome" and "Trick" rows repeated the headline.
- The global `:focus-visible` rule set `border-radius`, so focus changed an element's corners; the ring now follows the element.
- The inline `style={{ display: 'contents' }}` in ShortcutsDialog (now `.shortcuts dl > div` in app.css).

### 9.2 Hierarchy

1. The stage. The columns are narrower (272 and 312 px, were 288 and 320) and quieter: one surface each, hairline borders, no shadows.
2. The outcome headline (18 px bold, the largest text in the columns, green or red with a filled tick or cross) and the Pop button (the only filled button in the app, taking the rest of its row).
3. Values: slider readouts and telemetry numbers in mono with tabular figures.
4. Labels (13 px medium) and section titles (12 px bold, muted, sentence case). Titles are quieter than labels on purpose: they mark sections, and the controls carry the content.
5. Hints, notes and the event log (12 px, muted). The log is the lowest: a capped, scrolling mono well with Download in its header.

### 9.3 Layout

Each side column is a `--color-surface` surface with a 1 px `--color-line` border and an 8 px radius. Its panels are sections with 10 px by 14 px padding, each with a 1 px top hairline pulled up 1 px so the column's clip hides the first one. A panel whose header holds actions or a legend wraps its title in `.panel__head` (title left, the rest right). Both columns fit without scrolling at 1600 x 1000 and at 1280 x 800 (setup and results both 782 of 782 px at the smaller size; before, they were 1353 and 1396 px against 976 at the larger). At 960 px and below the columns stack under the stage and each lays its panels out in a grid, `repeat(auto-fill, minmax(280px, 1fr))`, so a 900 px window shows Setup, Inputs and Playback side by side instead of one long column.

### 9.4 Type and numbers

Tokens: `--text-xs` 12 px (titles, hints, keys, units, log), `--text-sm` 13 px (body, labels, controls; the body size), `--text-md` 15 px (telemetry values), `--text-lg` 18 px (the outcome headline and the dialog title). `--text-xl` and `--text-2xl` are removed. `--leading-snug` 1.4 is the body leading. Every number uses `font-variant-numeric: tabular-nums`; slider values, the speed and timeline readouts, telemetry values and the log are mono.

### 9.5 Setup controls

- Presets: a 2 by 2 grid of 32 px chips, label left and key right. Active: accent tint, a 2 px accent border (1 px border plus a 1 px inset), bold, and the key filled with the accent.
- Sliders: label and value on one row, the track right under them. The input box is a 24 px hit area (`--range-hit`) with a 4 px track and a 16 px thumb; focus rings the thumb (a 2 px surface gap, then 3 px of `--color-focus`). The timeline thumb stays square-cornered.
- Playback: Pop (`.btn--primary`, 36 px, grows to fill the row), then Pause (`.btn`, outlined, neutral) and Reset (`.btn.btn--danger`, outlined, red text, red tint on hover). Speed and Timeline follow as plain rows like the sliders.
- View: the header holds Reset view and Shortcuts as `.btn.btn--ghost.btn--sm` in `.view-panel__actions`. Under it is `.view-panel__toggles`, a two-column grid of `.toggle` switches: Feet, Foot trails, Motion cues, Light theme, Perf badge. A switch is a button with `aria-pressed` drawn with a 26 x 16 track (`::before`) and a 10 px knob (`::after`) that moves right when on (position, not colour alone). Its accessible name contains the visible label ("Show feet", "Show foot trails", "Show motion cues"; WCAG 2.5.3). Then come Stance and Quality.
- Segmented (Stance, Quality): the legend floats left (60 px) so legend and options form one 30 px row; the options share the width inside a 1 px outlined track with 2 px padding. Checked: accent tint, a 1 px inset accent border, bold (the dot glyph is gone). Focus: a 2 px `--color-focus` ring inside the label. The hint sits under the row in 12 px muted text.

Show motion cues (added 2026-11-04): wired to `motionCuesVisible` and `toggleMotionCues` in the ui slice (default on, persisted under `trick-lab.motion-cues`, announced as "Motion cues shown." or "Motion cues hidden.", never logged). It is not in the Shortcuts dialog, which lists only keyed actions; the other scene toggles have no key either.

Signed rate sliders (2026-11-04, ADR-30): Flick and Scoop run from -3 to 3 rev/s, centred on 0. The readout is the magnitude in the mono value, then the unit and the direction word in the small muted unit type: "1.9 rev/s kickflip", "1.9 rev/s heelflip", "0.9 rev/s backside", "0.9 rev/s frontside", and "0.0 rev/s" with no word. aria-valuetext is "1.9 revolutions per second, heelflip"; the visually hidden help adds "right for a kickflip, left for a heelflip" (Flick) and "right for backside, left for frontside" (Scoop). A 2 x 12 px tick in `--color-muted` marks the centre of each signed track (`.field__range[min^="-"]`, no new class; the thumb covers it at 0), and Firefox's fill from the minimum is dropped on those two tracks, since a bar from -3 would read as an amount. The presets grid is still two columns, now four rows of chips (keys 1 to 8; since 2026-11-05, ADR-41, seven chips, keys 1 to 7, the 360 flip alone on the last row, and both columns shorter than measured here). Measured 2026-11-04: at 1600 x 1000 both columns still fit (setup about 880 of 982 px, results 982 of 982 with a landed hardflip); at 1280 x 800 they now scroll inside the column (setup about 880, results about 980, of 782 px), so the 9.3 fit at that size no longer holds (ADR-30).

### 9.6 Results

- Outcome (the section was titled "Telemetry"): the headline `.outcome__name` and `.outcome__detail` (copy in section 4), then `.telemetry`, a four-column strip under a hairline: Airtime, Peak, Flip, Shove (labels shortened from "Peak height", "Flip rotation", "Shove rotation"). Before a trick a value reads "not yet" in muted sans (`.telemetry__v--none`). When a trick is not landed, the axis that missed gets `.telemetry__v--bad`: red, bold, a leading "!" and a visually hidden ", off target".
- Foot motion: the legend moves into the header as two dots, "Front" and "Back" (read as "Front foot, blue trail." and "Back foot, yellow trail."). The steps are a plain numbered list (a CSS counter). Each row has the step number, a 9 px dot in the foot's trail colour (for both feet, a hard half-and-half dot), the foot's name in semibold, then the sentence on the same line. The step under the playhead gets a filled number (surface-coloured text on a `--color-text` disc) and the surface-2 row tint. There is no weight change, so rows never reflow while the board is in the air. The bail sentence already names the feet, so its foot name is hidden on screen and only read.
- Objectives: the count is `.panel__count` in the title ("Objectives 1 of 4"). Each row has a 16 px box, filled green with a tick when done, and 3 px of padding. The bonus line is a `.panel__note`.
- Event log: the count is in the title and Download JSON (`.btn--ghost.btn--sm`) is in the header. A fixed-layout table (time 48 px, type 15ch, payload the rest), 12 px mono, capped at 168 px, focusable so it scrolls by keyboard. One line per event: type and payload clip with an ellipsis and carry the full text in the cell's `title`; the download has everything.

### 9.7 Classes

Added (all in the BRIEF.md contract block): `.panel__head`, `.panel__count`, `.panel__note`, `.btn--sm`, `.view-panel__toggles`, `.telemetry__v--none`.
Used again: `.toggle` and `.toggle--on` (the View switches), `.view-panel__actions` (the View header actions).
Removed: `.telemetry__v--good` (no telemetry value is marked good now that the headline says landed) and `.theme-toggle` (never used). `.toggle__state` is still styled and listed in CLAUDE.md, but no component uses it.

Added 2026-11-04 (ADR-30): `.telemetry__dir`, the direction word of a signed total in the results strip, its own line under the number in the field unit's type (12 px sans, normal weight, muted): "365°" over "heelflip", "173°" over "frontside", nothing at 0. The card reads "365 deg heelflip, 173 deg frontside shove, 0.53 s in the air."

### 9.8 Contrast and target sizes

Ratios are WCAG 2.2, light then dark, from the token table in tokens.css. Section titles and hints (muted on surface): 6.01 and 7.09. Switch off: the knob (muted on surface-2) 4.83 and 6.11; the track border (line-strong on surface) 4.06 and 4.21. Switch on: the accent track on surface 6.12 and 6.42; the knob (accent-fg on accent) 6.56 and 7.39. Ghost buttons (accent on surface): 6.12 and 6.42. Outcome name: ok on surface 5.90 and 9.14, bad on surface 6.41 and 7.34. Its glyph: ok-fg on ok 6.32 and 9.41, bad-fg on bad 6.87 and 8.13. The missed value (bad on surface): 6.41 and 7.34. The Foot motion "now" number (surface on text): 15.59 and 13.53. The segmented focus ring on accent-bg: 5.26 and 8.08. The trail dots are decorative (the words carry the foot) and have a line-strong ring so the yellow reads on the light surface. Targets (WCAG 2.2 target size, minimum, 24 px): presets 32 px tall; Pop, Pause and Reset 36 px; switches and header buttons 28 px; segmented options 24 px; slider hit areas 24 px.

## 10. Realistic ground and sky (2026-11-04)

ADR-31. The board used to sit on a 1.6 x 1.2 m grey slab with black edge lines and a centre mark, in a void of the clear colour, lit by a key, an ambient and an indoor room reflection. Now it rests centred in one slab bay of a concrete ground that fades into the background, under a sky. No new dependency, no post-processing, no extra render pass. The ground is one draw call where the pad was three (slab, lines, mark).

### 10.1 Ground asset (`public/models/ground.glb`, numbers in `src/asset/groundSpec.ts`)

| Property | Value |
| --- | --- |
| Plane | one quad on y `0`, `40.0 x 39.6` m (25 x 33 bays, both odd, so a bay centre is under the origin and the plane's edges are on joints), 2 triangles, UVs 0 to 1; each map repeated by its own `KHR_texture_transform` (25 / n by 33 / n for a tile of n x n bays) |
| Bay | `1.6 x 1.2` m, the old pad |
| Tiles (varied bays, 2026-11-05, ADR-40) | normal map one bay; colour map four different bays (2 x 2); roughness map nine (3 x 3). 2 and 3 share no factor, so colour and roughness line up the same way only every 6 x 6 bays (9.6 x 7.2 m). The bay under the board is bay (0, 0) of the colour tile and (0, 1) of the roughness tile (`originBay`) |
| Colour map | `1024 x 1024` over 2 x 2 bays (3.1 x 2.3 mm per texel), one grey channel around `150`, tinted by the base colour factor so the mean lands on `#616466`; seed `20261131` (fine detail) and `20261132` (per-bay marks). The fine detail of the normal map's bay (grain, aggregate, pits, joint), box filtered 2 x 2, is the same in every bay; the rest is per bay |
| Tonal variation | value-noise fBm over the 2 x 2 tile: `0.4` m cells, 3 octaves, +-9 levels; mottle `0.05` m, 2 octaves, +-4; grain `12` mm, +-2.5 (was 3.5 mm, which is per-texel noise at the new texel size); a slab shade per bay, +-5 levels |
| Aggregate | 9,000 specks per bay, radius 0.8 to 2.6 mm, +-14 levels; those over 2 mm stand `0.05` mm proud |
| Pits | 1,400 per bay, radius 0.6 to 1.8 mm, `0.6` mm deep, -18 levels |
| Hairline cracks | per bay of the colour tile 0 to 4 random walks of 0.18 to 0.55 m, -16 levels at `1.2` mm (drawn a texel wide at the same total darkness), stopping at the joint; colour only, since the normal map is shared |
| Stains | per bay of the colour tile 0 to 2 soft dark patches, radius 7 to 22 cm, -4 to -9 levels |
| Expansion joint | along every bay edge of every tile: `12` mm wide, `4` mm deep, `3` mm rounded shoulders, -42 levels, roughness `1.0` (supersampled 4 x 4 on the roughness map, where it is about a texel wide) |
| Painted centre mark | `0.9 x 0.02` m at the centre of the bay under the board only (where the mark mesh was), so one bay in four shows it (it was every bay), +8 levels, worn to a quarter where the wear noise is low, edges ragged by 1.5 mm, roughness `0.8` |
| Wheel marks | in the bay under the board only, under the four wheels of the resting board (x `+-0.208`, z `+-0.078`): ellipses `35 x 22` mm, -7 levels, roughness -0.12 |
| Roughness map | `512 x 512` over 3 x 3 bays (9.4 x 7.0 mm per texel), one grey channel (glTF green is roughness; blue is metalness, times a metallic factor of 0): base `0.93`, worn patches down to `0.78`, a slab offset per bay of +-0.03, `-0.06` around the centre of the bay under the board; seed `20261133`. The 3,000 dust specks (1 to 3 mm) went: they are below this texel |
| Normal map | `1024 x 1024` RGB over one bay, tangent space (glTF convention, as the high grip), from the height field in metres (joint, aggregate, pits; the cracks left it with the per-bay colour), scale `1.0` |
| Budget | 500 KB, 1 draw call, 64 triangles, 3 textures at 1024 px. Measured: 432.7 KB (colour 280.6 KB, normal 121.2 KB, roughness 27.7 KB), 1, 2, 3; about 12 MB of GPU memory with mips (was 434.9 KB: 277.8, 129.6, 24.4; 11 MB) |

Fine per-pixel grain is what PNG cannot compress, so the grain is smooth noise a few texels across, only the larger stones have height, and the roughness map is low frequency. A first cut with grain in the height field had a 775 KB normal map on its own; a first cut of the varied colour tile with the 3.5 mm grain was 372 KB of colour alone.

### 10.2 Scene (`ART` in `src/scene/artDirection.ts`)

| Property | Value |
| --- | --- |
| Ground on Medium and High | `ground.glb` (lazy chunk sharing the GLTF loader, preloaded at once, `dispose={null}`), receives the shadow on High |
| Ground on Low, and the fallback | an untextured `PlaneGeometry` of the same size in `resources.ts`, `#616466`, roughness `0.93`, one draw call. A ground that fails to load falls back to it without marking the board as failed |
| Ground anisotropy (`ART.quality[tier].groundAnisotropy`) | High `16`, Medium `8` (the board's Medium is 4; the ground is seen at grazing angles), Low `1` (unused) |
| Fog | `Fog(clearColor[theme], 5.5, 15)`; the colour equals `--scene-bg` and switches with the theme. Near: the farthest flight-box corner from the farthest camera is 5.3 m. Far: the nearest visible point of the plane edge from the lowest orbit is 16.3 m in the worst case (both tested) |
| Environment scene | sky dome radius `10`, 48 x 32 segments, zenith `#8d9cae`, horizon `#d0d2d1`, gradient exponent `0.55`; concrete below `#6b6a66` at `0.55`, blended over `0.06` of the radius under the horizon; sun disc `#fff1e0` at `40`, angular radius `0.05` rad, in the key light's direction. PMREM blur `0.04`, `environmentIntensity` `0.90` |
| Hemisphere light | sky `#dde2e6`, ground `#6b6a66`, `0.35` |
| Key light | `#fff1e0`, `2.7`, position and target unchanged |
| Foot trails | no fog (a ShaderMaterial's default); they stay within a metre of the board |

Themes: only the clear colour and the fog colour change. The light theme reads as daylight concrete going to haze, the dark theme as a pool of floodlit concrete fading to night.

### 10.3 Measured on screen (dark theme, home view, `readPixels` over 60 x 50 px blocks)

| Target | Value |
| --- | --- |
| Lit ground (target `#7b7a77`) | `#787978` to `#7e7f7e` |
| Grip | `#2b2929` |
| Wheel (shaded side) | `#94948f` |
| High shadow on the ground, mid kickflip | `#40474e` (a first, bluer sky with a stronger key gave `#242b33`, a near-black navy) |
| Trucks | the aluminium reads as metal with a soft sky-grey highlight (`#bbb8b0` on the hanger, mid kickflip, High) |

The Medium and Low footprint ellipse (section 2) reads correctly on the textured ground and was not changed.

Screenshots: `docs/screenshots/13-ground-high-dark.png`, `14-ground-light.png`, `15-ground-low.png`.
