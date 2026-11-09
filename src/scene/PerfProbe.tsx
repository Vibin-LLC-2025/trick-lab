import { useEffect, useRef } from 'react';
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber';
import { useTrickStore } from '../store';
import { flightPace, noteFramesStoreChange, recordFrame } from './flightPace';
import { allShown } from './modelCache';
import { modelsFor } from './modelUrls';
import { frame, perfStats, trickFrames } from './perfStats';
import { drawCallsOf, isNodeRenderer } from './rendererKind';
import { isReady, readinessOf } from './rootReadiness';
import { effectsFor, sceneTier } from './sceneTier';

/**
 * Takes over rendering (a positive useFrame priority disables R3F's own
 * render call) so it can time gl.render and read renderer.info for the frame.
 * Costs two performance.now() calls per frame; no allocations.
 * The WebGPURenderer (ADR-50) resets its frame counts only in its own
 * animation loop, which R3F does not use, so they are reset here before each
 * frame; its draw calls are `info.render.drawCalls` (rendererKind.ts).
 *
 * While a flight plays it also records each frame's interval into
 * `trickFrames` (one array write, ADR-59), a pool that short flights add to;
 * the store reads the pace at a landing (flightPace, registered here) and
 * decides whether to step down. A playback change in the store or a hidden
 * tab ends the run of frames, so the frame that spans it is not recorded.
 *
 * Its one after-effect (R3F's addAfterEffect, after the frame's render, not a
 * useFrame) decides when this Canvas has finished starting up
 * (rootReadiness.ts): it numbers the root on mount and sets `ready` after the
 * first frame it drew with every startup publication done.
 */
export function PerfProbe() {
  const get = useThree((s) => s.get);
  // Whether this root drew since its after-effect last ran (the loop runs it for every root's frame).
  const drew = useRef(false);
  useEffect(() => {
    const { scene, gl } = get();
    const r = readinessOf(scene);
    perfStats.root += 1;
    r.root = perfStats.root;
    perfStats.ready = false;
    const stop = addAfterEffect(() => {
      if (!drew.current) return;
      drew.current = false;
      if (r.ready || r.root !== perfStats.root) return;
      const s = useTrickStore.getState();
      const startup = {
        stageReady: s.stageReady,
        effectsWanted: effectsFor(s) !== null && isNodeRenderer(gl),
        modelsShown: () => allShown(modelsFor(sceneTier(s), s.feetVisible)),
      };
      if (isReady(r, startup)) {
        r.ready = true;
        perfStats.ready = true;
      }
    });
    return stop;
  }, [get]);
  useEffect(() => {
    // A new Canvas is a new tier: its evidence starts empty.
    trickFrames.count = 0;
    trickFrames.flightId = -1;
    trickFrames.wasPlaying = false;
    const { setPaceSource } = useTrickStore.getState();
    setPaceSource((flightId) => flightPace(trickFrames, flightId));
    const stopWatching = useTrickStore.subscribe((s, prev) => noteFramesStoreChange(trickFrames, s, prev));
    // A hidden tab draws nothing; the frame after it spans the gap, so it is left out.
    const onVisibility = () => {
      trickFrames.wasPlaying = false;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      setPaceSource(null);
      stopWatching();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  useFrame(({ gl, scene, camera }, delta) => {
    const s = useTrickStore.getState();
    recordFrame(trickFrames, s.status, s.flightId, delta);
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
    drew.current = true;
  }, 1);
  return null;
}
