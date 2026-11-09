import { useFrame } from '@react-three/fiber';
import { perfStats } from './perfStats';
import { drawCallsOf, isNodeRenderer } from './rendererKind';

/**
 * Takes over rendering (a positive useFrame priority disables R3F's own
 * render call) so it can time gl.render and read renderer.info for the frame.
 * Costs two performance.now() calls per frame; no allocations.
 * The WebGPURenderer (ADR-50) resets its frame counts only in its own
 * animation loop, which R3F does not use, so they are reset here before each
 * frame; its draw calls are `info.render.drawCalls` (rendererKind.ts).
 */
export function PerfProbe() {
  useFrame(({ gl, scene, camera }) => {
    if (isNodeRenderer(gl)) gl.info.reset();
    const t0 = performance.now();
    gl.render(scene, camera);
    perfStats.renderMs = performance.now() - t0;
    perfStats.frames += 1;
    perfStats.drawCalls = drawCallsOf(gl);
    perfStats.triangles = gl.info.render.triangles;
    perfStats.geometries = gl.info.memory.geometries;
    perfStats.textures = gl.info.memory.textures;
  }, 1);
  return null;
}
