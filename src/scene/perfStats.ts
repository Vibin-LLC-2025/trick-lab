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
  renderMs: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
};

/** Frames recorded per trick at most: 15 s at 60 frames a second, enough for the slowest speed's middle. */
export const TRICK_FRAMES_MAX = 900;

/**
 * The frame intervals of the flight playing now, in milliseconds (ADR-59):
 * PerfProbe writes one per frame while a flight plays, into this array made
 * once (no per-frame allocation), starting afresh when the store's flightId
 * changes (a pause and resume keep the record). Read once per landing by
 * flightPace.
 */
export const trickFrames = { intervals: new Float32Array(TRICK_FRAMES_MAX), count: 0, flightId: -1 };
