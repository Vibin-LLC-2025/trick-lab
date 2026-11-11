// Scene art direction, pasted from docs/DESIGN.md section 2 (2026-11-04).
// Nothing else in src/scene hard-codes a color, light intensity or camera
// value, so a design change is an edit to this file only.
// Units are metres. The pad top surface is y = 0; the board's long axis is X.

import { BAY, CONCRETE, PLANE, ROUGHNESS } from '../asset/groundSpec';
import { OUTLINE, REST_Y, WHEEL } from '../asset/spec';
import { SPOT } from '../asset/spotSpec';
import { FOOT } from '../sim/feet';
import { NeutralToneMapping, type ToneMapping } from 'three';
import type { Quality, Theme } from '../store';

export type Vec3 = readonly [number, number, number];

const v = (x: number, y: number, z: number): Vec3 => [x, y, z];
/**
 * A camera preset from its angles (step 17, ADR-72): `elevation` degrees up
 * from the horizon, `azimuth` degrees round from the heel side (+Z) toward +X,
 * looking at a point `targetY` up over the board. Only the direction matters
 * (the fit sets the distance), so the position is 2 m out.
 */
const look = (elevation: number, azimuth: number, targetY: number) => {
  const e = (elevation * Math.PI) / 180;
  const a = (azimuth * Math.PI) / 180;
  return { position: v(2 * Math.cos(e) * Math.sin(a), targetY + 2 * Math.sin(e), 2 * Math.cos(e) * Math.cos(a)), target: v(0, targetY, 0) };
};

/**
 * Scene clear color per theme. Each must equal `--scene-bg` for that theme in
 * src/styles/tokens.css, which paints `.app__stage` behind the canvas so resize
 * gaps do not flash. src/scene/artDirection.test.ts keeps them in step.
 * Since the sky (ADR-52, 2026-11-09) it is each theme's horizon colour
 * (`ART.sky.colors`), which the fog fades the far ground into and the dome
 * starts from: a midday haze on light, a golden-hour haze on dark.
 */
export const SCENE_BG: Record<Theme, string> = { dark: '#e8c6a2', light: '#dde4ea' };

/**
 * Renderer settings per quality tier (ADR-16, 2026-11-04). The Canvas is
 * keyed on the tier because antialias and powerPreference are constructor
 * options. Low was the original Chromebook setup until ADR-54 (2026-11-09):
 * MSAA at DPR 1 instead of none at DPR 1.5, so its edges are smooth.
 * `renderer` (ADR-50, 2026-11-09): Medium and High draw with three's
 * WebGPURenderer (WebGPU, or its own WebGL2 backend where WebGPU is missing),
 * the home of the effects; Low keeps WebGLRenderer, which starts faster on a
 * Chromebook and is proven there.
 */
export const QUALITY: Record<
  Quality,
  {
    renderer: 'webgpu' | 'webgl';
    antialias: boolean;
    /**
     * The prefiltered environment map (ADR-54): High and Medium. Low is toon
     * shaded, which a map would not light, and skips building it.
     */
    environment: boolean;
    dpr: readonly [number, number];
    shadows: boolean;
    anisotropy: number;
    /**
     * The ground's maps (ground pass, 2026-11-04, ADR-31). The ground is seen
     * at grazing angles over most of the frame in a low orbit, where the
     * board's 4x on Medium leaves the slabs past a few metres a blur, so
     * Medium gets 8x. Low's is its slab joint texture's (ADR-54): 4x, as
     * designed; it was 1 and unused while Low's ground had no texture.
     */
    groundAnisotropy: number;
    powerPreference: 'high-performance' | 'low-power';
  }
> = {
  high: { renderer: 'webgpu', antialias: true, dpr: [1, 2], shadows: true, environment: true, anisotropy: 16, groundAnisotropy: 16, powerPreference: 'high-performance' },
  medium: { renderer: 'webgpu', antialias: true, dpr: [1, 1.5], shadows: false, environment: true, anisotropy: 4, groundAnisotropy: 8, powerPreference: 'low-power' },
  low: { renderer: 'webgl', antialias: true, dpr: [1, 1], shadows: false, environment: false, anisotropy: 1, groundAnisotropy: 4, powerPreference: 'low-power' },
};

export const ART = {
  clearColor: SCENE_BG,
  /**
   * `toneMapping` (ADR-52): compared side by side with the grade (ACES,
   * AgX, Khronos Neutral) in the six poses and on the welcome screen, both
   * themes; set on every renderer when the Canvas is created.
   */
  renderer: { exposure: 1.3, toneMapping: NeutralToneMapping as ToneMapping },
  /**
   * The sky (ADR-52, 2026-11-09): a dome of vertex colours (skyDome.ts), one
   * draw call on every tier, drawn first and behind everything, not fogged.
   * Each theme has its own: light is midday (pale haze, a soft blue zenith),
   * dark is late afternoon (a golden haze under a deeper blue). `horizon` is
   * also the fog and the clear colour (SCENE_BG); `band` is reached at
   * `bandAt` of the way up, the `zenith` beyond it, shaped by `exponent`.
   * The same colours light the environment map (outdoorEnvironment.ts), so
   * reflections match the sky. `skyline`: a faint city round the horizon,
   * blocks `width` degrees wide and `height` degrees tall (ranges), some
   * with a lower `setback`, leaning from the sky toward `city` by
   * `strength`. `dome`: its radius (inside the camera's far plane, past the
   * fog), how far it reaches below the horizon, and its rings.
   */
  sky: {
    colors: {
      light: { horizon: SCENE_BG.light, band: '#a3c1e2', zenith: '#5f93d2', city: '#8e9cad' },
      dark: { horizon: SCENE_BG.dark, band: '#c4b8c2', zenith: '#6a84b4', city: '#9a8890' },
    } as Record<Theme, { horizon: string; band: string; zenith: string; city: string }>,
    bandAt: 0.13,
    exponent: 1.0,
    skyline: {
      seed: 17,
      width: [1.2, 5.5] as readonly [number, number],
      height: [0.5, 2.6] as readonly [number, number],
      setbackChance: 0.4,
      setback: [0.45, 0.8] as readonly [number, number],
      strength: 0.32,
      /** The city's quads sit at this fraction of the dome's radius, just inside the sky. */
      radius: 0.99,
    },
    dome: { radius: 25, below: 8, rings: [-8, 0, 1.5, 4, 8, 14, 22, 32, 45, 60, 75, 90] as readonly number[], azimuthSegments: 72 },
  },
  /**
   * Post-processing (ADR-51, 2026-11-09), on the WebGPURenderer only: one
   * scene pass writing colour, normals and (High) velocity at once (MRT, so
   * the scene is drawn once), ambient occlusion from that pass's depth and
   * normals, and one composite pass that blurs by velocity, darkens by the
   * occlusion, adds a glow round the brightest highlights, tone maps and
   * grades. Low has none. Every pass counts against the draw-call gates
   * (40, 20, 20): High 28 for the scene and its shadow map plus the occlusion
   * pass and the composite; three's BloomNode alone would add twelve passes,
   * so the glow is a few taps inside the composite instead.
   * - `tiers`: what each tier runs. `ao` is the occlusion's resolution
   *   (1 full, 0.5 half), null for none. Half on High too: at full
   *   resolution High's frame took 7.3 ms of GPU at 2560 x 1440, at half
   *   2.8 ms, with the same contact shading in side-by-side crops.
   * - `ao`: GTAONode's settings, metres where they are lengths: a radius the
   *   size of a truck, a thickness that stops thin parts (the deck) shading
   *   what is far behind them; `strength` mixes it in (1 is all of it).
   * - `motionBlur`: `shutter` scales the frame's motion (0.5 is a 180 degree
   *   shutter), `samples` taps along it. Only while a trick plays at normal
   *   speed (sceneTier.ts motionBlurOn).
   * - `glow`: linear radiance above `threshold` spreads over two rings of
   *   `taps`, `radius` as a fraction of the stage's height, times `strength`.
   * - `grade`: after tone mapping, in display space. `contrast` and
   *   `saturation` round 1; the shadows lean `shadowTint`, the highlights
   *   `highlightTint` (multipliers); `vignette` darkens by up to `strength`
   *   from `start` to `end` of the distance to a corner.
   */
  post: {
    tiers: {
      high: { ao: 0.5, motionBlur: true, glow: true },
      medium: { ao: 0.5, motionBlur: false, glow: false },
      low: null,
    } as Record<Quality, { ao: number | null; motionBlur: boolean; glow: boolean } | null>,
    ao: { radius: 0.12, thickness: 0.25, distanceExponent: 1.5, scale: 1, samples: 16, strength: 0.75 },
    motionBlur: { shutter: 0.5, samples: 12 },
    glow: { threshold: 1.1, strength: 0.18, radius: [0.004, 0.011] as readonly [number, number], taps: 8 },
    grade: {
      contrast: 1.05,
      saturation: 1.06,
      shadowTint: v(0.98, 1.0, 1.03),
      highlightTint: v(1.03, 1.0, 0.97),
      vignette: { strength: 0.16, start: 0.55, end: 1.15 },
    },
  },
  quality: QUALITY,
  /**
   * Linear fog to the clear colour (ground pass, 2026-11-04, ADR-31), so the
   * ground fades into the background instead of ending at an edge:
   * smoothstep(near, far, distance from the camera). By distance, not
   * three's view depth (ADR-55, 2026-11-09, rangeFog.ts): a desktop stage
   * has no widest shape, and by depth a 5.5:1 stage saw the edge 10 m deep.
   * `near` 5.5 m: the farthest point of the flight box (a deck corner at the
   * top of a 0.6 m pop) from the farthest allowed camera is 5.3 m on most
   * stages, and the orbit's zoom-out stops where it would pass 5.5 m (the
   * detail view on the narrowest stage, `orbitMaxDistance`), so the board,
   * the feet and the trails are never fogged. 6.0 since the whole rider
   * (ADR-85, 2026-11-11): framing the body at the top of a 0.6 m pop puts
   * Free and Filmer's farthest point (a hand out wide on the toe side) 5.6
   * m from the camera on every stage the layout makes, so the rider is
   * never fogged either; on a narrower stage the fit stops at the fog
   * (`distanceFor` in SceneCamera.tsx) and the arms may crop. `far` 15 m: from the
   * lowest orbit (maxPolarAngle 1.25 rad, whose frame reaches the horizon)
   * and from the welcome camera, the nearest visible point of the plane's
   * edge is at least 19 m away on any stage from 0.5:1 to 50:1, so the edge
   * is never seen. Tested in artDirection.test.ts and sky.test.ts. Colour
   * per theme is the clear colour, nothing else.
   */
  fog: { color: SCENE_BG, near: 6.5, far: 15 },
  /**
   * The ground (ground pass, 2026-11-04, ADR-31). The GLB (Medium and High)
   * and the untextured plane (Low, and the fallback while it streams or if
   * it fails) are the same size, from src/asset/groundSpec.ts so the asset
   * and the scene agree. `bay` is one slab, the old pad, under the board.
   * The plain plane takes the concrete's mean colour and base roughness.
   */
  ground: {
    size: [PLANE.x, PLANE.z] as readonly [number, number],
    bay: [BAY.x, BAY.z] as readonly [number, number],
    color: CONCRETE.color,
    roughness: ROUGHNESS.base,
  },
  /**
   * Real shadows on High (ADR-19): the key light casts, the board, the shoes
   * and the shanks cast, the pad receives. Off, the projected footprints
   * below stand in.
   * Shadow pass (2026-11-05, ADR-38): `PCFShadowMap` (PCFSoft is deprecated
   * since r182 and r187 substituted PCF with a warning anyway), filtered with
   * `radius` texels of three's 5-tap Vogel disc. The orthographic camera is no
   * longer a fixed +-1.0 m box with near 1 and far 12: TrickScene fits it to
   * `casters` seen from the key light (shadowFrustum in cameraFit.ts), the
   * boxes that hold every caster at every preset at pops up to 0.6 m in both
   * stances (tested in cameraFit.test.ts against the sim: the board's spin
   * circle and top, the soles up to 0.595 m from the centre, the shanks'
   * knees up to 1.343 m), plus where those casters' shadows land on the pad,
   * plus `pad`. The fitted frustum is 1.54 x 1.68 m and 1.76 m deep (near
   * 4.70, far 6.46; texels of 0.82 mm), where the old one was 2 x 2 m and
   * 11 m deep (texels of 0.98 mm, and 11 times the depth per bias unit).
   * `normalBias` was 0.015 m, thicker than the 11.5 mm deck. Trialled in the
   * browser (2026-11-05, High, kickflip, telephoto crops of the rear wheels
   * and the front sole at rest, the deck edge-on at 25 percent from above
   * and from low on the heel side, the catch at 73 percent and the landing;
   * normal bias 0.015, 0.003, 0.002, 0.001 and 0, depth bias scaled with it):
   * only the pad receives shadows here (the board, shoes and shanks cast,
   * nothing else receives), and the pad faces the near-vertical key, so no
   * value from 0 to 0.003 showed acne. 0.015 did not visibly detach the
   * wheels either (in flight the casters are far above the pad, and at rest
   * the wheel hides its own contact), but it eroded the silhouettes near
   * contact: the shoe's shadow on the pad at rest is a few pixels smaller
   * at a 14 degree field of view. 0.002 is the middle of the range asked
   * for, two texels plus the 3-texel PCF kernel's slope on the pad (about
   * 0.7 mm), with a depth `bias` of -0.0002 (0.35 mm over the fitted depth).
   * `radius` 3 at 0.82 mm texels gives a penumbra of about 2.5 mm, a little
   * softer than the old one (r187 had substituted PCF at radius 1 for the
   * PCFSoft request, about 1 mm).
   */
  shadowMap: {
    size: 2048,
    radius: 4,
    bias: -0.0002,
    normalBias: 0.002,
    /**
     * Every shadow caster's extent, metres, as boxes (min and max corners).
     * Below 1 m: the board's spin circle (|z| to 0.42) and the soles, which
     * reach |x| 0.595 at the highest pops. Above: only the knees, |x| to
     * 0.354 and z from -0.388 to -0.075 (the rider faces -Z), up to 1.343 m.
     * The fit wherever the legs show (the lab, Low).
     */
    casters: [
      { min: v(-0.6, 0, -0.43), max: v(0.6, 1.0, 0.43) },
      { min: v(-0.37, 1.0, -0.4), max: v(0.37, 1.36, 0) },
    ],
    /**
     * The fit wherever the whole rider shows (ADR-85, 2026-11-11, store
     * riderShown): the board and soles as above, and the body, swept in
     * cameraFit.test.ts over every preset at three pops and the timing bar's
     * corners (4.2 rev/s) in both stances, each bone a capsule as thick as the
     * mesh. Below REST_Y + 0.9 m: |x| to 0.80 (the hands), z from -0.72;
     * above: |x| to 0.93 (a bail's arms out wide at a 0.6 m pop), z from
     * -0.77 to 0.40, the beanie up to 2.20 m above the deck. The frustum is
     * larger than the legs' (1.74 x 3.05 m and 4.28 m deep, a texel of
     * 1.49 mm where the legs' is 0.87), still one 2048
     * map: measured in PERF-BUDGET.md.
     */
    riderCasters: [
      { min: v(-0.8, 0, -0.72), max: v(0.8, REST_Y + 0.9, 0.43) },
      { min: v(-0.94, REST_Y + 0.9, -0.77), max: v(0.94, REST_Y + 2.21, 0.4) },
    ],
    /** Margin around the fitted frustum on each side, metres (covers the PCF kernel). */
    pad: 0.03,
  },
  /**
   * Retuned for the realistic board (design pass, 2026-11-04): a one-time
   * environment PMREM (`environment.intensity`, applied as
   * scene.environmentIntensity, never as scene.background) carries most of
   * the fill and the key light is less warm. The old warm key over a warm pad
   * grey is what made the pad read brown.
   * Ground pass (2026-11-04, ADR-31): the environment is outdoors (sky, sun,
   * concrete) instead of three's RoomEnvironment, and a hemisphere light
   * (sky above, concrete below) replaces the ambient light, so the underside
   * of a flipped deck picks up the ground's colour and the top the sky's.
   */
  lights: {
    /**
     * A small procedural outdoor scene (SceneEnvironment.tsx builds it from
     * these numbers) through PMREMGenerator.fromScene(scene, blur), once. In
     * linear radiance units before `intensity`: a sky dome whose colour runs
     * from `horizon` to `zenith` (`exponent` shapes the gradient), a concrete
     * lower hemisphere blended in over `horizonBlend` below the horizon, and
     * a sun disc of `sun.angularRadius` in the key light's direction, bright
     * enough to give the trucks a highlight where the key light is.
     * Colours are sRGB hex, scaled after conversion to linear.
     * Tuned in the browser (2026-11-04, dark theme, home view, readPixels over
     * 60 x 50 px blocks): with these numbers, the hemisphere at 0.35 and the
     * key at 2.7, the lit ground lands on #787978 to #7e7f7e (target
     * #7b7a77), the grip #2b2929, the High shadow #40474e. The first, bluer
     * sky (#6d8fb8 zenith) at 0.5 with a 3.3 key left the High shadow a
     * near-black navy (#242b33); the greyer sky and more fill fixed that.
     */
    environment: {
      intensity: 0.9,
      blur: 0.04,
      radius: 10,
      segments: { width: 48, height: 32 },
      // The sky's own colours (ART.sky, per theme) since ADR-52, times `skyScale`,
      // at `skySaturation` of their colour (the rest grey of the same
      // luminance): at full colour the midday blue tinted the concrete blue
      // (#6d747e lit, against the neutral #787978 it had), at 0.45 it stays grey.
      skyScale: 0.7,
      skySaturation: 0.45,
      ground: { color: '#6b6a66', scale: 0.55 },
      horizonBlend: 0.06,
      sun: { color: { light: '#fff1e0', dark: '#ffd2a0' } as Record<Theme, string>, scale: 40, angularRadius: 0.05 },
    },
    /**
     * Sky colour from above, concrete from below (replaces the old ambient
     * #dde2e8 at 0.3). Near neutral, so the shadowed side of the deck and the
     * High shadow are not tinted blue on top of the sky's own fill.
     */
    hemisphere: { sky: { light: '#e4e5e7', dark: '#e6dad2' } as Record<Theme, string>, ground: '#6b6a66', intensity: 0.35 },
    /**
     * Art pass (2026-11-04): moved from (2.5, 5.0, 3.0), which after the
     * rider's-view camera (ADR-23) sat behind and right of the camera and threw
     * the High shadow up and left, under the far rail and off the board. Now
     * high and a little behind the board (-Z) and to the right: the shadow
     * falls just below the board and slightly toward the viewer, so the height
     * of a pop reads as the gap between board and shadow. Whichever deck face
     * is up is still lit; the target is unchanged.
     * Ground pass (2026-11-04): intensity 2.2 to 2.7, direction unchanged.
     * The outdoor environment gives less fill on the ground than the room
     * did, and the key now stands in for a sun or a floodlight.
     */
    /**
     * Sky pass (2026-11-09, ADR-52): lower and warmer. From 76 degrees up to
     * 52, so shadows reach 0.78 of the height instead of 0.25 and a pop reads
     * further from its shadow; and round from behind the board to its +X
     * side, so the longer shadows fall to the left of the board in the
     * rider's view and the welcome preview instead of running out of the
     * bottom of the frame. The colour per theme (dark's golden hour warmer,
     * a touch dimmer).
     */
    directional: {
      color: { light: '#fff0dc', dark: '#ffd9ad' } as Record<Theme, string>,
      intensity: { light: 3.0, dark: 2.8 } as Record<Theme, number>,
      position: v(3.45, 4.95, -1.09),
      target: v(0, 0.3, 0),
    },
  },
  camera: {
    /**
     * Home view is the rider's own view (ADR-23, 2026-11-04): the rider is
     * goofy with the heels on +Z, so the eyes are above the +Z side. The
     * camera sits there, centred on X, 60 degrees above the horizon (polar
     * angle 30 degrees, 0.524 rad), looking down toward -Z: the deck runs
     * left to right with the nose (+X) on the right and the near rail's
     * wheels showing under it. Only the direction matters here; the length
     * (2.6 m) is replaced by the fitted distance (cameraFit.ts, ADR-18).
     * Was (1.3, 1.5, 1.9), a 3/4 view from the toe side.
     */
    position: v(0, 0.3 + 2.6 * Math.sin(Math.PI / 3), 2.6 * Math.cos(Math.PI / 3)),
    target: v(0, 0.3, 0),
    fov: 36,
    near: 0.05,
    far: 30,
    minPolarAngle: 0.25,
    maxPolarAngle: 1.25,
    /**
     * The welcome preview's own limit (ADR-52): its preset is 8 degrees above
     * the horizon (polar 82 degrees), lower than a student may orbit, so the
     * sky shows. The orbit is off there, so no student reaches it; the fog
     * test checks the plane's edge stays hidden from it too.
     */
    showcaseMaxPolarAngle: 1.45,
    minDistance: 1.0,
    maxDistance: 4.5,
    /**
     * On a narrow stage, where the fit is already far, the orbit may zoom out
     * to this many times the fit past maxDistance (ADR-18), up to where the
     * flight would reach the fog (orbitMaxDistance in cameraFit.ts, ADR-55).
     */
    zoomOut: 1.25,
    /**
     * Framing (integration pass, 2026-11-04): the camera backs off along its
     * view direction until the whole pad and the highest flight fit the stage
     * (see cameraFit.ts). `reach` is the deck's spin radius plus a little,
     * `top` the highest point of the board at a 0.6 m pop. Zoom-out is
     * allowed past maxDistance when the fit needs it.
     * Realistic board pass (2026-11-04): reach is the nose tip (0.4095 m from
     * the centre, the longer end) plus 1 cm; top is the GLB rest height plus
     * the pop plus 0.13 m, the farthest the board reaches from its long axis
     * (the outer wheel edge, hypot(0.094, 0.08425) = 0.126 m), so a flip
     * caught at any roll angle at the peak stays in frame.
     * Quality pass (2026-11-04, ADR-18): the fit frames the flight volume
     * only, from the pad surface under the board (`bottom`, so the shadow
     * stays in) to `top`; the pad may run off the edges. The board is about
     * twice as large on screen as when the whole pad had to fit (ADR-11).
     */
    fit: { margin: 0.06, reach: OUTLINE.noseTip + 0.01, bottom: 0, top: REST_Y + 0.6 + 0.13 },
    /**
     * The whole rider's outline (ADR-85, 2026-11-11), for the views that film
     * the rider (`filmsRider`): the head's column up to the beanie at the top
     * of a 0.6 m pop, the highest the sliders and the timing bar allow (2.08
     * m above the deck centre at rest, swept over every input in
     * body.test.ts), plus `headroom`; the arms' band out to the hands at their
     * widest (0.94 m along the board) and highest (1.68 m). Above and the
     * replay's low close shot keep the board's own box and may crop the body.
     */
    rider: {
      head: { reach: 0.16, top: REST_Y + 2.08 + 0.14, front: -0.42, back: 0.12 },
      arms: { reach: 0.95, top: REST_Y + 1.74, front: -0.78, back: 0.2 },
    },
    filmsRider: ['free', 'film', 'side', 'showcase'] as readonly string[],
    /**
     * Where the views that film the whole rider look (ADR-85): 1.0 m up, the
     * rider's middle at the top of an average pop, each view's target and
     * camera lifted together so its direction is unchanged. From the deck's
     * 0.32 m the fit had to stand so far back to reach the head that the
     * body passed the fog's start; the welcome view's 0.45 m did too.
     */
    riderLook: 1.0,
    /**
     * The game's framing of the rider at rest (ADR-86, 2026-11-11), for Free,
     * Filmer and Side while the whole rider shows and motion is allowed: the
     * board on the pad and the rider over it, with the room the body takes
     * as the pop extends it, measured against the camera's rise (`cameraRise`
     * in cameraFit.ts: the board's height, eased in and out over the first
     * and last `riseEase` of the flight). Four boxes, world metres, swept in
     * gameCamera.test.ts over every preset at 0.15, 0.35 and 0.6 m and the
     * timing bar's corners, both stances, with the rise taken off:
     * - `board`: its outline never more than 15 cm below the pad (the tail
     *   hanging under the deck's centre as the pop pitches it nose up, while
     *   the eased rise catches up) nor more than 0.35 m over its rest height
     *   (a flipped board's edge, ahead of the rise), 0.16 m either side.
     * - `shoes`: 0.37 m over the deck's centre (tucked in the air, ahead of
     *   the eased rise) plus their height, down to 15 cm under the pad (the
     *   pop's tail strike),
     *   0.68 m along the board, 0.63 m toward the toe side and 0.46 m toward
     *   the heel side (a bail's step).
     * - `arms`: the hands, 0.88 m out (a bail's) and 1.09 m up, plus the
     *   mitten; framed only while it costs little (`armsSlack`).
     * - `head`: the beanie's crown, at most 1.53 m over the deck's centre
     *   (the pop's extension, ahead of the rise), 0.2 to 0.47 m toward the toe
     *   side as it gets there, plus 4 cm of headroom.
     * The board is the frame's bottom, the crown its top, with `margin` of
     * the clear area kept free at each edge (the clear area is already clear
     * of the cards). Framing the whole flight (ADR-85) stays for reduced
     * motion, where the camera does not move. Each view looks at the height
     * that fills the clear area's height best (`balancedLook` in
     * cameraFit.ts), so neither the top nor the bottom of the frame is empty.
     */
    rest: {
      boxes: [
        { min: v(-0.44, -0.16, -0.16), max: v(0.44, REST_Y + 0.36, 0.16) },
        { min: v(-0.7, -0.15, -0.64), max: v(0.7, REST_Y + 0.5, 0.47) },
        { min: v(-0.94, REST_Y + 0.4, -0.76), max: v(0.94, REST_Y + 1.14, 0.2) },
        { min: v(-0.25, REST_Y + 1.0, -0.5), max: v(0.25, REST_Y + 1.53 + 0.04, -0.17) },
      ],
      riseEase: 0.2,
      bailEase: 0.15,
      margin: 0.02,
      /**
       * The arms may push the camera back by at most this much past what the
       * board, the shoes and the head need; past it a hand flung out (a
       * sketchy landing, a bail) may go under a card, never the rest.
       */
      armsSlack: 1.1,
    },
    /**
     * Fixed camera presets (ADR-38, 2026-11-05), chosen in the View panel and
     * persisted (`cameraView` in the ui slice). Only each `position`'s
     * direction from its `target` matters: the ADR-18 fit sets the distance,
     * and "Reset view" returns to the chosen preset.
     * - `rider`, the default: the teaching home view above (ADR-23).
     * - `detail`: a low three-quarter view from the heel side for judging
     *   the deck's thickness, the trucks and the soles' separation from the
     *   grip. 35 degrees above the horizon (polar 55 degrees, inside the
     *   orbit limits) and 25 degrees round from the heel side toward +X, the
     *   goofy nose (the camera never moves with the stance, ADR-25). The
     *   audit's low side view, (0.25, 0.32, 1.55) to (0, 0.25, 0), was the
     *   starting point; at its 2.5 degrees the board was a thin line and the
     *   shadow invisible, so the elevation came up to the 30 to 40 asked for.
     *   The target is 5 cm lower than the rider view's, nearer the deck at
     *   rest; the fit still frames the board's whole flight (cameraFit.test.ts).
     */
    views: {
      rider: { position: v(0, 0.3 + 2.6 * Math.sin(Math.PI / 3), 2.6 * Math.cos(Math.PI / 3)), target: v(0, 0.3, 0) },
      detail: {
        position: v(
          2 * Math.cos((35 * Math.PI) / 180) * Math.sin((25 * Math.PI) / 180),
          0.25 + 2 * Math.sin((35 * Math.PI) / 180),
          2 * Math.cos((35 * Math.PI) / 180) * Math.cos((25 * Math.PI) / 180),
        ),
        target: v(0, 0.25, 0),
      },
      /**
       * The welcome screen's preview (ADR-45, 2026-11-08), not a student
       * choice: a three-quarter view from the heel side, 35 degrees round
       * toward the goofy nose, so the flip, the shove and both shoes read at
       * once. The orbit is off on the welcome screen. Sky pass (2026-11-09,
       * ADR-52): 8 degrees above the horizon (was 28) with the target 0.45 m
       * up (was 0.28), so the horizon, the sky and its city sit in the top
       * quarter of the frame and the street reads as a place. With the
       * whole rider (ADR-85) it looks at `riderLook` instead, the 8 degrees
       * keeping the horizon where it is.
       */
      showcase: {
        position: v(
          2 * Math.cos((8 * Math.PI) / 180) * Math.sin((35 * Math.PI) / 180),
          0.45 + 2 * Math.sin((8 * Math.PI) / 180),
          2 * Math.cos((8 * Math.PI) / 180) * Math.cos((35 * Math.PI) / 180),
        ),
        target: v(0, 0.45, 0),
      },
      /**
       * The game's fixed angles (step 17, ADR-72, 2026-11-10), like a friend
       * filming: lower and closer than the lab's, all on the heel side (+Z),
       * so the skate spot (ADR-69) stays behind the board and the legs stand
       * above it on screen. `look(elevation, azimuth, targetY)`: degrees up
       * from the horizon and round from the heel side toward +X (the goofy
       * nose; the camera never moves with the stance, ADR-25). The fit sets
       * the distance, as for the lab's presets.
       * - `film`, the default: low three-quarter toward the nose, 12 up, 30 round.
       * - `side`: side on and low, 7 up, the board in profile against the spot.
       * - `above`: 34 up, 20 round toward the tail: the deck and the feet from above the heels.
       * - `replay`: the instant replay's spot, 4 up and 40 round, low and wide
       *   (its own field of view, `fov` below), close to the board.
       * With the whole rider on screen (ADR-85, 2026-11-11), `free`, `film`
       * and `side` look at `riderLook`, not the deck at 0.32 m, and fit the
       * rider's outline (`rider` above): the whole body at the top of a 0.6 m
       * pop with headroom, the board low in the frame. `above` and `replay`
       * keep the board's box and may crop the body.
       */
      /**
       * `free` (ADR-81, 2026-11-10), the game's default: where the free
       * camera starts and where "Reset view" brings it back, a little higher
       * than the filmer's so the board and both shoes read at once. The
       * student turns it from there, inside `free` below.
       */
      free: look(18, 30, 0.32),
      film: look(12, 30, 0.32),
      side: look(7, 0, 0.32),
      above: look(34, -20, 0.28),
      replay: look(4, 40, 0.36),
    },
    /**
     * The game's free camera (ADR-81): how far it turns. Round the board
     * from the heel side (+Z) up to `azimuth` radians either way, so it never
     * reaches the toe side, where the skate spot would be in front of the
     * board and the plane's edge out of the fog (ADR-72); from 72 degrees
     * above the horizon (`minPolarAngle`) down to 9 (`maxPolarAngle`), lower
     * than the lab's 18 to match the game's low angles. Tested in
     * gameCamera.test.ts at every corner.
     */
    free: { azimuth: (75 * Math.PI) / 180, minPolarAngle: (18 * Math.PI) / 180, maxPolarAngle: (81 * Math.PI) / 180 },
    /** Fields of view other than `fov`, per view: the replay's is wide, for its fisheye (ADR-72). */
    fovs: { replay: 60 } as Partial<Record<string, number>>,
  },
  /**
   * Rotation direction (ADR-10, made goofy by ADR-24 on 2026-11-04). The
   * rider is goofy: nose at +X on the rider's right, facing -Z, so the toe
   * side is -Z and the heel side +Z (the rider's view is from the heel side).
   * Positive flick rolls the grip toward the heel side, +Z (toe edge up and
   * over, kickflip direction), a positive rotation about +X. Positive scoop
   * swings the tail (-X) toward the heels, +Z (behind the rider), the
   * backside direction: counterclockwise seen from above, a positive rotation
   * about +Y.
   *
   * Regular (ADR-25, 2026-11-04) keeps the camera on the heel side and turns
   * the board 180 degrees on the pad, so the nose is at -X, on the rider's
   * left. Both signs flip because the board's own long axis now points at -X:
   * a roll of -r about it is +r about world +X (grip still rolls toward +Z),
   * and a yaw of -y swings the tail (now at +X) toward +Z, clockwise seen
   * from above. The feet mirror along X (src/sim/feet.ts).
   */
  stance: {
    goofy: { rollSign: 1, yawSign: 1, baseYaw: 0 },
    regular: { rollSign: -1, yawSign: -1, baseYaw: 180 },
  },
  board: {
    /**
     * Group origin is the deck centre; at rest the wheel bottoms touch y = 0.
     * 0.08425 for the GLB board (wheel centre -0.05775 minus radius 0.0265,
     * DESIGN.md 7.1), from src/asset/spec.ts so the asset and the scene agree.
     */
    restY: REST_Y,
    /**
     * The primitive board (the Suspense and error fallback, and Low; ADR-54,
     * 2026-11-09): the real deck mesh (src/asset/deck.ts, the Medium GLB's)
     * and the trucks and wheels as the GLB's own envelopes (baseplate, axle
     * housing, wheels from spec.ts), so it sits on the pad at the same rest
     * height with no lift. Coloured per vertex, two draw calls (was five
     * boxes and cylinders from DESIGN.md section 2). `roughness` and
     * `metalness` are its one standard material's (the fallback); Low draws
     * it toon shaded (ART.low).
     */
    grip: { color: '#141416' },
    graphic: { color: '#ea5a30' },
    wood: { color: '#cdb68c' },
    trucks: { color: '#a9adb3' },
    wheels: { color: '#efe9dc', segments: 16 },
    /**
     * The primitive board's one standard material (the Medium and High
     * fallback), and its yoke's width across the board as a multiple of the
     * axle housing's diameter (ADR-54).
     */
    primitive: { roughness: 0.6, metalness: 0.15, yokeWidth: 1.4 },
  },
  /**
   * Low, designed (ADR-54, 2026-11-09): flat, toon-like shading in clean
   * colours instead of a cut-down High. Every Low material is a toon one
   * (MeshToonMaterial) over `gradient`'s steps of light, so a surface is lit,
   * half lit or in shade; colours are the board's and the shoes' own. The
   * ground is `ground.color` with dark slab joints (`joint`: colour and width
   * as a fraction of a bay, about 2 cm), a 256 px texture repeated once per
   * bay, so the board still rests centred in a bay, filtered at Low's
   * `groundAnisotropy`. No environment map on Low (about 80
   * ms of startup on a throttled Chromebook, measured 2026-11-04).
   */
  low: {
    gradient: [0.42, 0.72, 1] as readonly number[],
    ground: { color: '#888d94', joint: { color: '#6a6f76', width: 0.012 }, texture: 256 },
  },
  /**
   * The primitive shoes (Low and Medium, and the Suspense fallback on High):
   * a sole slab and an upper box per shoe, sized from the feet model. Colours
   * match the shoe GLB's materials (DESIGN.md 8.3).
   */
  /**
   * Foot paths (2026-11-04, DESIGN.md 8.5): the route of each shoe through the
   * trick. Okabe-Ito sky blue and yellow, which stay distinct under every
   * common colour-vision deficiency and against the orange deck graphic; the
   * front foot is also the one at the nose, so position tells them apart
   * too. The part already travelled is opaque, the rest `ghost`, and a short
   * stretch at the foot is lifted toward white.
   */
  footPaths: {
    color: { front: '#56b4e9', back: '#f0e442' },
    ghost: 0.3,
    head: { width: 0.03, lighten: 0.45 },
    /** Path point: sole centre plus this much, so the path leaves from inside the shoe. */
    lift: 0.04,
    samples: 96,
    tube: { radius: 0.0045, radialSegments: 6 },
    /** Arrowheads every `every` of the airtime from `first`, only where the foot moves faster than `minSpeed` metres per unit of progress. */
    arrows: { first: 0.04, every: 0.08, minSpeed: 0.12, radius: 0.012, length: 0.032, radialSegments: 8 },
  },
  feet: {
    /**
     * The primitive sole (ADR-39): the shoe's own footprint outline (src/asset
     * shoe.ts, centred across so it spans the 0.105 width either way the shoe
     * is mirrored) extruded to the sole height, with a `bevel` round its
     * bottom edge and the foxing set back by `step.inset` above `step.at`.
     */
    sole: {
      color: '#e9e5db',
      roughness: 0.85,
      height: FOOT.soleHeight,
      length: FOOT.length,
      width: FOOT.width,
      intervals: 8,
      bevel: 0.0015,
      step: { at: 0.006, inset: 0.0012 },
    },
    /**
     * The primitive upper's envelope (clearance.test.ts reads it): the
     * silhouette below stays inside a box `height` tall over the sole, set
     * `lengthInset` back from the toe (twice that short of the tip) and
     * `widthInset` in from each side, plus the whole footprint up to the GLB
     * toe cap height (0.034 above the sole).
     */
    upper: { color: '#23262c', roughness: 0.9, height: 0.07, lengthInset: 0.02, widthInset: 0.012 },
    /**
     * The primitive upper's silhouette (ADR-39, Low and Medium): a coarse loft
     * of superellipse arches over the footprint, `inset` in from the sole's
     * top edge and tucked `tuck` into it. `height` is the arch above the sole
     * top along the shoe (t 0 heel, 1 toe): a heel counter at the back, a
     * collar notch over the ankle, the instep, the toe. `valley` sinks the
     * top over the ankle opening and the tongue, `valleyWidth` its half angle.
     */
    silhouette: {
      stations: 22,
      sectionPoints: 14,
      inset: 0.002,
      tuck: 0.002,
      height: [
        [0, 0.044],
        [0.05, 0.052],
        [0.11, 0.05],
        [0.24, 0.04],
        [0.36, 0.046],
        [0.46, 0.049],
        [0.66, 0.041],
        [0.8, 0.032],
        [0.92, 0.021],
        [1, 0.004],
      ] as readonly (readonly [number, number])[],
      exponent: [
        [0, 3.0],
        [0.15, 3.0],
        [0.5, 2.3],
        [1, 2.7],
      ] as readonly (readonly [number, number])[],
      valley: [
        [0, 0],
        [0.07, 0],
        [0.13, 0.024],
        [0.3, 0.022],
        [0.42, 0.012],
        [0.62, 0.004],
        [0.68, 0],
        [1, 0],
      ] as readonly (readonly [number, number])[],
      valleyWidth: 0.75,
    },
  },
  /**
   * The rider's legs (ADR-37, 2026-11-05, DESIGN.md 8.8): art direction by
   * the implementation agent (opus), pending the design agent's own entry in
   * DESIGN.md. Tapered capsules along each segment, lengths from LEG in
   * src/sim/legs.ts. Dark grey trousers, slightly baggy (radii in metres, a
   * thigh about 0.55 m round plus ease, a knee 0.38 m), and a light sock
   * between the trouser hem and the shoe collar (the collar is about 1.4 cm
   * above the ankle joint, the hem `hemAbove` above it, so about 3 cm of sock
   * shows). The shank's knee end is narrower than the thigh's, so the thigh's
   * knee cap covers it (equal radii z-fought in the browser, 2026-11-05). One
   * roughness for both, vertex colours for the two cloths.
   * `fade`: the thighs dissolve toward the hips (vertex alpha, baked), from
   * opaque at `to` of the thigh's length from the hip to clear at `from`, so
   * the legs never end in a severed cap where the torso would be. Tuned in
   * the browser (2026-11-05): from 0.12 to 0.75 the rider view, which looks
   * down the thigh from behind the hips, showed the faded tube flaring
   * toward the camera as streaks beside each knee; from 0.35 to 0.85 only
   * the knee end reads there, and the side view keeps the lower thigh.
   *
   * Better trousers (step 15, ADR-70, 2026-11-10): the sock is gone under a
   * turned-up `cuff` `height` tall that ends `drop` below the ankle joint,
   * so it sits over the shoe collar (about 1.4 cm above the joint) even at
   * the back of a shank leaning forward (at the joint it left 2 to 3 cm of
   * ankle showing there), `radius` round, its fold line in the darker
   * `fold` colour. Above it the trouser bunches in `bunch.count` soft rolls
   * of `bunch.depth` over `bunch.height`. Inside it a dark `sock` ankle.
   * The thighs' fade starts at 0.55 of the thigh (0.35 before): the dither's
   * dotted band is shorter now the legs are on by default.
   * `cloth`: a twill normal map, `ribs` diagonal ribs per `tile` metres of
   * cloth, `around` tiles round a leg, at `strength`.
   */
  legs: {
    trouser: '#3b3e44',
    fold: '#2b2d32',
    sock: '#2f3035',
    roughness: 0.95,
    thigh: { hip: 0.085, knee: 0.062 },
    shank: { knee: 0.054, calf: 0.056, calfAt: 0.3, hem: 0.057, ankle: 0.034 },
    cuff: { height: 0.032, drop: 0.025, radius: 0.0605, edge: 0.003 },
    bunch: { count: 2, height: 0.05, depth: 0.0025 },
    cloth: { tile: 0.016, ribs: 4, around: 22, size: 64, strength: 0.55 },
    fade: { from: 0.55, to: 0.88 },
    radialSegments: 16,
    capSegments: 4,
  },
  /**
   * Medium and Low ground shadow (DESIGN.md 2, art pass 2026-11-04). Was a
   * 0.36 m disc, which from the rider's view 60 degrees up read as a big dark
   * circle. Now an elliptical footprint the size of the board (half extents
   * along and across it), soft: full strength inside `core` of the radius,
   * fading to nothing at the rim. FlightDriver turns it with the board's yaw,
   * shortens it as the nose comes up, narrows it as the board rolls onto its
   * edge, and scales and fades it with height. The rim is transparent, so the
   * opacity numbers are a little above the old disc's to keep the core as dark.
   * Shadow pass (2026-11-05, ADR-38): the footprints are projected along the
   * key light's ray instead of sitting at x z 0, the same direction High's
   * shadow map uses (groundShadow.ts: a point (x, y, z) lands on the pad at
   * (x - y dx/dy, 0, z - y dz/dy) for the light-to-scene direction d). One
   * instanced mesh, one draw call, one unit soft disc (alpha 1 inside `core`
   * of the radius, 0 at the rim), four instances: the board's soft shadow,
   * its contact shadow, and one footprint per shoe (the last two only while
   * the feet are shown). Each instance carries its own opacity.
   * - board: an ellipse the board's size that turns with its yaw, shortens
   *   as the nose comes up and narrows on edge (as before), and with height
   *   fades and broadens by `spread` (it used to shrink to 0.8, which is not
   *   how a penumbra grows).
   * - contact: a darker, tighter copy that is gone by `contact.height` of lift.
   * - feet: a footprint per sole, FOOT-sized times `foot.scale`, turned by
   *   the shoe's yaw, fading and broadening with the sole's height above the
   *   pad, darker near the pad (a bail).
   * Union: where a foot's footprint overlaps the board's, the board already
   * shades the pad there, and two transparent layers would stack into a dark
   * island. The fragment shader (resources.ts) evaluates the board's two
   * components at each pixel of a foot and draws only what the foot adds
   * over them, so the result is max(board, foot): one shadow, in one call.
   * Tuned in the browser (2026-11-05, Low, dark theme, rider view, kickflip,
   * darkest shadow pixel against the lit pad in the stage screenshots): the
   * old disc measured 0.32 at 40 percent of the flight (0.34 m up). A first
   * try, soft 0.34 to 0.16 over contact 0.26, matched the old core at rest
   * but measured 0.235 in the air, lighter than before as well as broader.
   * Now soft 0.40 to 0.20 over contact 0.20: 0.52 at rest by the numbers
   * (the old core was 0.50), and measured 0.28 at 40 percent and 0.30 at 70
   * (the old disc 0.32 and 0.35), over a larger, softer footprint.
   */
  shadow: {
    halfLength: 0.42,
    halfWidth: 0.13,
    segments: 40,
    core: 0.55,
    y: 0.002,
    color: '#0e0f10',
    opacity: { ground: 0.4, top: 0.2 },
    /** Metres added to both half extents at `topHeight`, linear in height. */
    spread: 0.07,
    contact: { opacity: 0.2, scale: 0.88, height: 0.05 },
    foot: {
      scale: 1.05,
      opacity: { ground: 0.3, top: 0.14 },
      /** Extra opacity with the sole on the pad, gone by `contact.height`. */
      contact: 0.12,
      spread: 0.05,
    },
    /** Width kept by a board on its edge (roll 90): deck to wheel bottom over the deck width, about. */
    edgeWidth: 0.5,
    /** Height at which the "top" values apply (the highest pop). */
    topHeight: 0.6,
  },
  /**
   * The welcome screen's preview (ADR-45, 2026-11-08): preset tricks on a
   * loop, in slow motion. Each holds `holdBefore` seconds on the pad, plays
   * its airtime at `rate` (0.5 is half speed), then holds `holdAfter` seconds
   * at its landing. One frame advances at most `maxStep` seconds, so a
   * background tab never skips a trick. Reduced motion, the Low tier and a
   * failed 3D view show `still`: trick `trick` of the list caught at
   * `progress` of its flight.
   */
  showcase: {
    tricks: ['kickflip', '360-flip', 'heelflip', 'varial-flip', 'frontside-pop-shove-it', 'varial-heelflip'],
    rate: 0.5,
    holdBefore: 0.7,
    holdAfter: 1.1,
    maxStep: 0.1,
    still: { trick: 0, progress: 0.45 },
  },
  /**
   * Motion cues (DESIGN.md 8.7, ADR-26): flat arrows on the grip that show
   * how each shoe will move against the deck for the current inputs. Same
   * colours as the foot trails, so the Foot motion legend matches both.
   * Sizes in metres. `lift` is the gap above the grip (no z-fighting); the
   * ribbon follows the deck's kicks and concave.
   */
  motionCues: {
    color: { front: '#56b4e9', back: '#f0e442' },
    opacity: 0.95,
    lift: 0.003,
    /** Ribbon width and arrowhead. */
    width: 0.014,
    head: { length: 0.042, width: 0.044 },
    /** Points per arrow, and per quarter turn of the press mark's corners. */
    samples: 32,
    cornerSegments: 6,
    /**
     * Press mark: an outline around the back sole, `margin` outside it,
     * `width` wide, its corner radius `corner` of its half width (small enough
     * that each corner still clears the sole's: margin >= r (1 - cos 45)).
     */
    press: { margin: 0.014, width: 0.009, corner: 0.7 },
    /** Fade out over this fraction of the airtime once a trick is in the air. */
    fadeBy: 0.12,
  },
  /**
   * Rolling in the game (step 12, ADR-67). The board stays where it is and
   * the ground's textures and the wheels' print slide (scene/roll.ts), nose
   * first (+X). The owner's list of changes at the end of the plan reads
   * these; nothing else needs to change with them.
   * - `cruise`: m/s, an easy flat-ground roll (a jog is about 2.5). The
   *   ground's 1.6 m joints pass about one and a half a second.
   * - `pushS`: seconds from stopped to the cruise, a steady push. Shorter
   *   than the timing bar's 0.8 s to its band, so a timed pop is at speed.
   * - `slowS`: seconds from the cruise to a stop after a landing. With
   *   `pushS` it fits inside the computer's 2.2 s wait (COMPUTER_DELAY_MS),
   *   so the computer stops, pushes off and is at speed when it pops.
   * - `wheelRadius`: the wheel the print turns on (spec.ts WHEEL.radius).
   */
  roll: { cruise: 2.4, pushS: 0.7, slowS: 1.3, wheelRadius: WHEEL.radius },
  /**
   * The skate spot (step 14, ADR-69): spot.glb, on Medium and High, on the
   * game screen. `loop`: it wraps over this many metres as the ground rolls
   * (spotSpec.ts says why 50). `shadow`: the soft shadow under each piece,
   * cast along the key light (a piece h tall throws it h times the light's
   * slope), `opacity` at its core, fading to nothing over `soft` metres
   * round it, `lift` above the ground so it never fights it.
   */
  /**
   * The computer in a game of SKATE (step 16, ADR-71): it rides its own deck
   * (COMPUTER_DECK, Circuit, in deckSpec.ts), and its shoes' soles and laces
   * take Circuit's teal, `shoe`, so whose go it is shows on the board and the
   * feet. High's shoe model and Medium's primitive; Low stays as it is.
   */
  computer: { shoe: '#5fd0c5' },
  /**
   * The rider (ADR-85, DESIGN.md 8.8): the whole body's colours, one per
   * region of the mesh (src/asset/riderSpec.ts RIDER_REGIONS, in that order:
   * hoodie, its ribbed cuffs and hem, the pocket's seam, the drawstrings, the
   * trousers, the cuff's fold, the sock, the mittens, the skin, the beanie and
   * its rolled brim, the hair under it), sRGB. Two outfits on one mesh, so whose go it is reads
   * at a glance from any camera: the player in the deck's burnt orange with
   * the charcoal twill trousers the legs have worn since ADR-70; the computer
   * in its deck's teal (Circuit, ADR-71) with sand trousers and a mustard
   * beanie, and a different skin tone, a different person. `roughness` and
   * `cloth` (the twill's strength, as ADR-70's) are the material's.
   */
  rider: {
    player: ['#c8562a', '#a8461f', '#7f3315', '#efe9df', '#3b3e44', '#2b2d32', '#2f3035', '#2a2c31', '#c99a7a', '#2d3138', '#24272d', '#3a2a20'],
    computer: ['#2b8a83', '#226f6a', '#18534f', '#efe9df', '#6b6252', '#524b3f', '#2f3035', '#2a2c31', '#8a5d43', '#d9a63a', '#b88a2a', '#1b1716'],
    roughness: 0.9,
    cloth: 0.55,
  },
  /**
   * The instant replay (step 17, ADR-72): after the student's made set or
   * copy, the flight once more at `rate` of its own speed from the replay
   * view, with a fisheye `bend` on High and Medium (the effects' composite:
   * a barrel distortion, 0 for none, scaled so the corners stay inside the
   * picture).
   */
  replay: { rate: 0.3, bend: 0.28 },
  /**
   * Dust (step 19, ADR-74): soft discs facing the camera, on Medium and High,
   * in a game. Metres and seconds (the roll's, so slow motion slows it).
   * - `color`, `opacity`: pale concrete dust; the opacity is a puff's centre
   *   at its thickest, and its edge fades to nothing.
   * - `segments`: the rim's vertices. `fadeIn`: the part of its life a puff
   *   takes to appear. `sit`: how much of its radius its centre is above the
   *   ground, so it rests on the ground and not half inside it.
   * - `touchdown`: `perWheel` puffs at each wheel, living about `life`,
   *   swelling from `radius[0]` to `radius[1]`, lifting `rise` and drifting
   *   out sideways at up to about `spread` m/s. A sketchy landing's are
   *   `sketchy` times the size and a bail's `bail` times.
   * - `slide`: under a bailed board while it slides (ADR-68): `puffs` of
   *   them, born one after another over the first `until` of the slide,
   *   between `behind[0]` and `behind[1]` behind the deck centre the way it
   *   slides (its trailing end) and within `across` to either side.
   */
  dust: {
    color: '#d6d0c4',
    opacity: 0.3,
    segments: 10,
    fadeIn: 0.12,
    sit: 0.55,
    touchdown: { perWheel: 3, life: 0.55, radius: [0.025, 0.1] as readonly [number, number], rise: 0.05, spread: 0.22, sketchy: 1.3, bail: 1.2 },
    slide: { puffs: 12, until: 0.55, life: 0.45, radius: [0.02, 0.085] as readonly [number, number], rise: 0.03, spread: 0.12, behind: [0.28, 0.42] as readonly [number, number], across: 0.13 },
  },
  spot: { loop: SPOT.loop, shadow: { color: '#000000', opacity: 0.42, soft: 0.22, lift: 0.002 } },
} as const;
