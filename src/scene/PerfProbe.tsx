import { useFrame } from '@react-three/fiber';
import { perfStats } from './perfStats';

/**
 * Takes over rendering (a positive useFrame priority disables R3F's own
 * render call) so it can time gl.render and read renderer.info for the frame.
 * Costs two performance.now() calls per frame; no allocations.
 */
export function PerfProbe() {
  useFrame(({ gl, scene, camera }) => {
    const t0 = performance.now();
    gl.render(scene, camera);
    perfStats.renderMs = performance.now() - t0;
    perfStats.frames += 1;
    perfStats.drawCalls = gl.info.render.calls;
    perfStats.triangles = gl.info.render.triangles;
    perfStats.geometries = gl.info.memory.geometries;
    perfStats.textures = gl.info.memory.textures;
  }, 1);
  return null;
}
