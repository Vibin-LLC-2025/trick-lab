import { newTrickFrames, type TrickFrames } from './flightPace';

// Written by PerfProbe inside the render loop, read by the DOM PerfBadge on a
// timer. A plain mutable object on purpose: putting per-frame numbers in the
// Zustand store would re-render React every frame.
/**
 * What PerfProbe calls to draw a frame (ADR-51): the post-processing
 * pipeline's render while one is set (Effects in TrickScene), the renderer's
 * own render otherwise. Set and cleared by Effects, never per frame.
 */
export const frame: { render: (() => void) | null } = { render: null };

export const perfStats = {
  frames: 0,
  /** The Canvas (R3F root) drawing now, numbered from 1 per mount (rootReadiness.ts). */
  root: 0,
  /** Whether that root has finished starting up (rootReadiness.ts). */
  ready: false,
  renderMs: 0,
  /** When this frame's work began: R3F's before-effect, ahead of every useFrame (PerfProbe). */
  frameStart: 0,
  /** The frame's whole work on the main thread, from that start to the end of its render: FlightDriver and the draw (ADR-62). */
  workMs: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  /** The fisheye bend in force on a tier with effects (effects.ts setBend; -1 with none built), for the browser checks (ADR-100). */
  bend: -1,
};

/** Frames recorded per trick at most: 15 s at 60 frames a second, enough for the slowest speed's middle. */
export const TRICK_FRAMES_MAX = 900;

/**
 * The frame intervals of playing flights, in milliseconds (ADR-59): PerfProbe
 * writes one per frame while a flight plays (recordFrame in flightPace.ts),
 * into this array made once (no per-frame allocation). A pool: short flights
 * add up until it covers enough time to judge, read at a landing by
 * flightPace. Emptied when a Canvas (a tier) mounts.
 */
export const trickFrames: TrickFrames = newTrickFrames(TRICK_FRAMES_MAX);
