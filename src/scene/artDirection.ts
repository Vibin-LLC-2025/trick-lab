// Scene art direction, pasted from docs/DESIGN.md section 2 (2026-11-04).
// Nothing else in src/scene hard-codes a color, light intensity or camera
// value, so a design change is an edit to this file only.
// Units are metres. The pad top surface is y = 0; the board's long axis is X.

import { OUTLINE, REST_Y } from '../asset/spec';
import type { Theme } from '../store';

export type Vec3 = readonly [number, number, number];

const v = (x: number, y: number, z: number): Vec3 => [x, y, z];

/**
 * Scene clear color per theme. Each must equal `--scene-bg` for that theme in
 * src/styles/tokens.css, which paints `.app__stage` behind the canvas so resize
 * gaps do not flash. src/scene/artDirection.test.ts keeps them in step.
 */
export const SCENE_BG: Record<Theme, string> = { dark: '#1e2124', light: '#d7d3cb' };

export const ART = {
  clearColor: SCENE_BG,
  renderer: { exposure: 1.0 },
  /**
   * Retuned for the realistic board (design pass, 2026-11-04): a one-time
   * RoomEnvironment PMREM (`environment.intensity`, applied as
   * scene.environmentIntensity, never as scene.background) now carries most of
   * the fill, so the ambient light drops and the key light is less warm. The
   * old warm key over a warm pad grey is what made the pad read brown.
   */
  lights: {
    /**
     * RoomEnvironment through PMREMGenerator.fromScene(room, blur), DESIGN.md 7.6.
     * Intensity 0.40, not the design's 0.55 (realistic board pass, 2026-11-04):
     * measured in the browser, the pad renders #a2a4a4 at 0.55 and #959696 at
     * 0.40 against the design's intended #7b7a77. 0.40 is the bottom of the
     * design's allowed range (0.40 to 0.70), so the pad color was not touched.
     */
    environment: { intensity: 0.4, blur: 0.04 },
    ambient: { color: '#dde2e8', intensity: 0.3 },
    directional: { color: '#fff1e0', intensity: 2.2, position: v(2.5, 5.0, 3.0), target: v(0, 0.3, 0) },
  },
  camera: {
    position: v(1.3, 1.5, 1.9),
    target: v(0, 0.3, 0),
    fov: 36,
    near: 0.05,
    far: 30,
    minPolarAngle: 0.25,
    maxPolarAngle: 1.25,
    minDistance: 1.6,
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
     */
    fit: { margin: 0.05, reach: OUTLINE.noseTip + 0.01, top: REST_Y + 0.6 + 0.13 },
  },
  pad: {
    // DESIGN.md had 3.6 x 2.8; at that size the pad cannot be framed whole on
    // a 1024 x 768 screen without the board shrinking to a few pixels, so the
    // integration pass cut it to 1.6 x 1.2 (two deck lengths across, and wider
    // than the 0.84 m circle the deck sweeps in a shove).
    size: v(1.6, 0.04, 1.2),
    center: v(0, -0.02, 0),
    // Neutral, a touch cool, so the warm key light lands it on grey concrete
    // instead of brown (design pass, 2026-11-04; was #6f6a63 / #46423d / #5e5952).
    color: '#616466',
    roughness: 0.95,
    edge: '#3e4143',
    mark: { size: v(0.9, 0.002, 0.02), y: 0.001, color: '#525557' },
  },
  /**
   * Rotation direction (ADR-10, integration pass 2026-11-04). The rider is
   * regular stance: nose at +X, toe side at +Z (facing the default camera),
   * heel side at -Z. Positive flick rolls the grip toward the heel side
   * (toe edge up and over, kickflip direction), which is a negative rotation
   * about +X. Positive scoop swings the tail (-X) toward the heels (behind the
   * rider), the backside direction: clockwise seen from above, a negative
   * rotation about +Y (corrected by the lead on 2026-11-04 after the
   * integration pass questioned the original counterclockwise spec).
   */
  stance: { rollSign: -1, yawSign: -1 },
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
      size: v(0.06, 0.03, 0.17),
      x: 0.26,
      y: -0.025,
      color: '#a9adb3',
      roughness: 0.35,
      metalness: 0.7,
    },
    wheels: { radius: 0.027, width: 0.032, x: 0.26, z: 0.105, y: -0.058, color: '#efe9dc', roughness: 0.5 },
  },
  shadow: {
    // Unchanged by the realistic board: its footprint (0.8065 x 0.2032) is
    // within 4 mm of the primitive's, and the disc follows height, not size.
    radius: 0.36,
    segments: 24,
    y: 0.002,
    color: '#0e0f10',
    opacity: { ground: 0.35, top: 0.16 },
    scale: { ground: 1.0, top: 0.72 },
    /** Height at which the "top" values apply (the highest pop). */
    topHeight: 0.6,
  },
} as const;
