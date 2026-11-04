// Written by PerfProbe inside the render loop, read by the DOM PerfBadge on a
// timer. A plain mutable object on purpose: putting per-frame numbers in the
// Zustand store would re-render React every frame.
export const perfStats = {
  frames: 0,
  renderMs: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
};
