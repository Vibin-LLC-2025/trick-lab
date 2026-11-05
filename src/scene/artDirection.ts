// Scene art direction, pasted from docs/DESIGN.md section 2 (2026-11-04).
// Nothing else in src/scene hard-codes a color, light intensity or camera
// value, so a design change is an edit to this file only.
// Units are metres. The pad top surface is y = 0; the board's long axis is X.

import { BAY, CONCRETE, PLANE, ROUGHNESS } from '../asset/groundSpec';
import { OUTLINE, REST_Y, TRUCK, WHEEL } from '../asset/spec';
import { FOOT } from '../sim/feet';
import type { Quality, Theme } from '../store';

export type Vec3 = readonly [number, number, number];

const v = (x: number, y: number, z: number): Vec3 => [x, y, z];

/**
 * Scene clear color per theme. Each must equal `--scene-bg` for that theme in
 * src/styles/tokens.css, which paints `.app__stage` behind the canvas so resize
 * gaps do not flash. src/scene/artDirection.test.ts keeps them in step.
 */
export const SCENE_BG: Record<Theme, string> = { dark: '#1e2124', light: '#d7d3cb' };

/**
 * Renderer settings per quality tier (ADR-16, 2026-11-04). The Canvas is
 * keyed on the tier because antialias and powerPreference are constructor
 * options. Low is the original Chromebook setup, unchanged.
 */
export const QUALITY: Record<
  Quality,
  {
    antialias: boolean;
    dpr: readonly [number, number];
    shadows: boolean;
    anisotropy: number;
    /**
     * The ground's maps (ground pass, 2026-11-04, ADR-31). The ground is seen
     * at grazing angles over most of the frame in a low orbit, where the
     * board's 4x on Medium leaves the slabs past a few metres a blur, so
     * Medium gets 8x. Low draws an untextured plane, so its 1 is unused.
     */
    groundAnisotropy: number;
    powerPreference: 'high-performance' | 'low-power';
  }
> = {
  high: { antialias: true, dpr: [1, 2], shadows: true, anisotropy: 16, groundAnisotropy: 16, powerPreference: 'high-performance' },
  medium: { antialias: true, dpr: [1, 1.5], shadows: false, anisotropy: 4, groundAnisotropy: 8, powerPreference: 'low-power' },
  low: { antialias: false, dpr: [1, 1.5], shadows: false, anisotropy: 1, groundAnisotropy: 1, powerPreference: 'low-power' },
};

export const ART = {
  clearColor: SCENE_BG,
  renderer: { exposure: 1.0 },
  quality: QUALITY,
  /**
   * Linear fog to the clear colour (ground pass, 2026-11-04, ADR-31), so the
   * ground fades into the background instead of ending at an edge. three's
   * Fog is smoothstep(near, far, view depth). `near` 5.5 m: the farthest
   * point of the flight box (a deck corner at the top of a 0.6 m pop) from
   * the farthest allowed camera (maxDistance 4.5 m; 1.25 times the fit is
   * less, even on the narrowest stage) is 5.3 m, so the board, the feet and
   * the trails are never fogged. `far` 15 m: from the lowest orbit
   * (maxPolarAngle 1.25 rad, whose frame reaches the horizon) the nearest
   * visible point of the plane's edge is 16.3 m deep in the worst case (a
   * 2.2:1 stage at minDistance), so the edge is never seen. Both are tested
   * in artDirection.test.ts. Colour per theme is the clear colour, nothing else.
   */
  fog: { color: SCENE_BG, near: 5.5, far: 15 },
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
   * Real shadows on High (ADR-19): the key light casts, the board and shoes
   * cast, the pad receives. The orthographic shadow camera is a box around the
   * flight volume (the pad corners do not need shadows). Off, the flat disc
   * below stands in as before.
   */
  shadowMap: { size: 2048, bounds: 1.0, near: 1.0, far: 12.0, bias: -0.0004, normalBias: 0.015 },
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
      sky: { zenith: '#8d9cae', horizon: '#d0d2d1', exponent: 0.55, scale: 1.0 },
      ground: { color: '#6b6a66', scale: 0.55 },
      horizonBlend: 0.06,
      sun: { color: '#fff1e0', scale: 40, angularRadius: 0.05 },
    },
    /**
     * Sky colour from above, concrete from below (replaces the old ambient
     * #dde2e8 at 0.3). Near neutral, so the shadowed side of the deck and the
     * High shadow are not tinted blue on top of the sky's own fill.
     */
    hemisphere: { sky: '#dde2e6', ground: '#6b6a66', intensity: 0.35 },
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
    directional: { color: '#fff1e0', intensity: 2.7, position: v(0.9, 6.0, -1.2), target: v(0, 0.3, 0) },
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
    minDistance: 1.0,
    maxDistance: 4.5,
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
     * The primitive board (Suspense fallback and Low detail) below keeps its
     * DESIGN.md section 2 numbers, whose wheel bottoms sit at -0.085. It is
     * lifted by the difference so its wheels touch the pad at the new rest height.
     */
    primitiveLift: 0.085 - REST_Y,
    deck: {
      // DESIGN.md gives the deck 0.81 m overall. The flat middle here is
      // 0.81 - 2 * 0.13 so that the two kick wedges bring it to 0.81 m.
      flatLength: 0.55,
      thickness: 0.012,
      width: 0.205,
      kick: { length: 0.13, angle: 0.33 },
      /** Grip and graphic are thin skins on the top and bottom faces. */
      skin: { thickness: 0.002, inset: 0.005 },
    },
    grip: { color: '#141416', roughness: 1.0 },
    graphic: { color: '#ea5a30', roughness: 0.45 },
    wood: { color: '#cdb68c', roughness: 0.7 },
    trucks: {
      // DESIGN.md lists 0.15 x 0.03 x 0.06; the hanger is laid across the
      // board (along Z) here so it reaches the wheels.
      // Tail-pivot pass (2026-11-04, ADR-27): the trucks and wheels moved from
      // x 0.26 and z 0.105 to the realistic board's axles (TRUCK.centerX,
      // WHEEL.centerZ), so the primitive pivots on the same rear wheels in the
      // pop and does not dip 3 cm into the pad. The hanger reaches the inner
      // wheel faces: 2 * (0.078 - 0.016) = 0.124.
      size: v(0.06, 0.03, 2 * (WHEEL.centerZ - 0.016)),
      x: TRUCK.centerX,
      y: -0.025,
      color: '#a9adb3',
      roughness: 0.35,
      metalness: 0.7,
    },
    wheels: { radius: 0.027, width: 0.032, x: WHEEL.centerX, z: WHEEL.centerZ, y: -0.058, color: '#efe9dc', roughness: 0.5 },
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
    sole: { color: '#e9e5db', roughness: 0.85, height: FOOT.soleHeight, length: FOOT.length, width: FOOT.width },
    upper: { color: '#23262c', roughness: 0.9, height: 0.07, lengthInset: 0.02, widthInset: 0.012 },
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
   */
  legs: {
    trouser: '#3b3e44',
    sock: '#d9d5cb',
    roughness: 0.95,
    thigh: { hip: 0.085, knee: 0.062 },
    shank: { knee: 0.054, calf: 0.056, calfAt: 0.3, hem: 0.054, sock: 0.036, ankle: 0.034 },
    hemAbove: 0.045,
    fade: { from: 0.35, to: 0.85 },
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
   */
  shadow: {
    halfLength: 0.42,
    halfWidth: 0.13,
    segments: 40,
    core: 0.55,
    y: 0.002,
    color: '#0e0f10',
    opacity: { ground: 0.5, top: 0.2 },
    scale: { ground: 1.0, top: 0.8 },
    /** Width kept by a board on its edge (roll 90): deck to wheel bottom over the deck width, about. */
    edgeWidth: 0.5,
    /** Height at which the "top" values apply (the highest pop). */
    topHeight: 0.6,
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
} as const;
