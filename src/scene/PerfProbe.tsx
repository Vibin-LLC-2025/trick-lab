import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTrickStore } from '../store';
import { flightPace } from './flightPace';
import { frame, perfStats, TRICK_FRAMES_MAX, trickFrames } from './perfStats';
import { drawCallsOf, isNodeRenderer } from './rendererKind';

/**
 * Takes over rendering (a positive useFrame priority disables R3F's own
 * render call) so it can time gl.render and read renderer.info for the frame.
 * Costs two performance.now() calls per frame; no allocations.
 * The WebGPURenderer (ADR-50) resets its frame counts only in its own
 * animation loop, which R3F does not use, so they are reset here before each
 * frame; its draw calls are `info.render.drawCalls` (rendererKind.ts).
 *
 * While a flight plays it also records each frame's interval into
 * `trickFrames` (one array write, ADR-59), afresh for each new flight; the
 * store reads that flight's pace when it lands (flightPace, registered here)
 * and decides whether to step down.
 */
export function PerfProbe() {
  useEffect(() => {
    const { setPaceSource } = useTrickStore.getState();
    setPaceSource((flightId) => flightPace(trickFrames, flightId));
    return () => setPaceSource(null);
  }, []);
  useFrame(({ gl, scene, camera }, delta) => {
    const s = useTrickStore.getState();
    if (s.status === 'playing') {
      if (trickFrames.flightId !== s.flightId) {
        trickFrames.flightId = s.flightId;
        trickFrames.count = 0;
      }
      if (trickFrames.count < TRICK_FRAMES_MAX) trickFrames.intervals[trickFrames.count++] = delta * 1000;
    }
    if (isNodeRenderer(gl)) gl.info.reset();
    const t0 = performance.now();
    // Through the effects where the tier has them (ADR-51), straight otherwise.
    if (frame.render) frame.render();
    else gl.render(scene, camera);
    perfStats.renderMs = performance.now() - t0;
    perfStats.frames += 1;
    perfStats.drawCalls = drawCallsOf(gl);
    perfStats.triangles = gl.info.render.triangles;
    perfStats.geometries = gl.info.memory.geometries;
    perfStats.textures = gl.info.memory.textures;
  }, 1);
  return null;
}
