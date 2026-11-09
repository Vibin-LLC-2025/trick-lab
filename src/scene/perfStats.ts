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
