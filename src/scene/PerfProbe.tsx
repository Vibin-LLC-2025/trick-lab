import { useEffect, useRef } from 'react';
import { addAfterEffect, addEffect, useFrame, useThree } from '@react-three/fiber';
import { replayMoves, riderShown, useTrickStore } from '../store';
import { PACE } from '../store/pace';
import { noteAdaptiveSample, resetAdaptive, stepAdaptive } from './adaptiveResolution';
import { ART } from './artDirection';
import { flightPace, noteFramesStoreChange, recordFrame } from './flightPace';
import { allShown } from './modelCache';
import { modelsFor } from './modelUrls';
import { frame, perfStats, trickFrames } from './perfStats';
import { drawCallsOf, isNodeRenderer, readGpuMs, timesGpu } from './rendererKind';
import { adaptive, scaleChanged } from './renderScale';
import { isReady, readinessOf } from './rootReadiness';
import { effectsFor, sceneTier } from './sceneTier';

/**
 * Takes over rendering (a positive useFrame priority disables R3F's own
 * render call) so it can time gl.render and read renderer.info for the frame.
 * Costs three performance.now() calls per frame; no allocations. One is
 * R3F's before-effect, which marks where the frame's work starts, so
 * `workMs` is everything the app does in a frame (FlightDriver's pose and
 * the draw), the number ADR-62's target is about.
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
 *
 * It also steps the adaptive resolution (ADR-109, adaptiveResolution.ts), on
 * frames it draws anyway: every `ART.adaptive.sampleEvery` frames it asks the
 * renderer for the last frame's GPU time (every frame under ?debug, for
 * scripts/measure, which reads `gpuMs` and `gpuReads`; only every few count
 * for the controller, so it judges the same way with or without ?debug), and
 * where the renderer cannot time the GPU it takes the interval of frames
 * drawn back to back instead. The read is three's async resolve, which
 * allocates inside three on the frames that ask; nothing here does. A change
 * of scale reaches TrickScene's pixel ratio through renderScale.ts, and the
 * pixel ratio's change asks for one frame, so a resized canvas is never left
 * blank.
 */
const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

export function PerfProbe() {
  const get = useThree((s) => s.get);
  const dpr = useThree((s) => s.viewport.dpr);
  const invalidate = useThree((s) => s.invalidate);
  // A resized canvas is cleared: the new pixel ratio is drawn once, even on demand (rule 4).
  useEffect(() => invalidate(), [dpr, invalidate]);
  // The GPU read in flight, and whether its result counts for the controller.
  const gpu = useRef({ timed: false, pending: false, feed: false, wantFeed: false, drawn: 0, lastWasLoop: false });
  const onGpu = useRef((ms: number | undefined) => {
    const g = gpu.current;
    g.pending = false;
    if (typeof ms !== 'number' || !(ms > 0)) return;
    perfStats.gpuMs = ms;
    perfStats.gpuReads += 1;
    if (g.feed) noteAdaptiveSample(adaptive, ms);
  });
  const onGpuFailed = useRef(() => {
    gpu.current.pending = false;
  });
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
        modelsShown: () => allShown(modelsFor(sceneTier(s), s.feetVisible, riderShown(s))),
      };
      if (isReady(r, startup)) {
        r.ready = true;
        perfStats.ready = true;
      }
    });
    return stop;
  }, [get]);
  useEffect(
    () =>
      addEffect(() => {
        perfStats.frameStart = performance.now();
      }),
    [],
  );
  useEffect(() => {
    // A new Canvas is a new tier: its evidence starts empty.
    trickFrames.count = 0;
    trickFrames.flightId = -1;
    trickFrames.wasPlaying = false;
    // And the adaptive resolution starts at the full cap, judging by the GPU where this renderer can time it.
    const g = gpu.current;
    g.timed = timesGpu(get().gl);
    g.pending = false;
    g.wantFeed = false;
    g.drawn = 0;
    g.lastWasLoop = false;
    perfStats.gpuTimed = g.timed;
    const was = adaptive.scale;
    resetAdaptive(adaptive, sceneTier(useTrickStore.getState()), g.timed ? 'gpu' : 'interval');
    perfStats.scale = 1;
    if (was !== 1) scaleChanged();
    const { setPaceSource } = useTrickStore.getState();
    setPaceSource((flightId) => flightPace(trickFrames, flightId));
    const stopWatching = useTrickStore.subscribe((s, prev) => noteFramesStoreChange(trickFrames, s, prev));
    // A hidden tab draws nothing; the frame after it spans the gap, so it is left out.
    const onVisibility = () => {
      trickFrames.wasPlaying = false;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      // A Canvas that is going (a tier change) leaves no scale behind for the next.
      resetAdaptive(adaptive, null, 'gpu');
      setPaceSource(null);
      stopWatching();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [get]);
  useFrame(({ gl, scene, camera, frameloop }, delta) => {
    const s = useTrickStore.getState();
    recordFrame(trickFrames, s.status, s.flightId, delta);
    if (isNodeRenderer(gl)) gl.info.reset();
    const t0 = performance.now();
    // Through the effects where the tier has them (ADR-51), straight otherwise.
    if (frame.render) frame.render();
    else gl.render(scene, camera);
    const t1 = performance.now();
    perfStats.renderMs = t1 - t0;
    perfStats.workMs = t1 - perfStats.frameStart;
    perfStats.frames += 1;
    perfStats.drawCalls = drawCallsOf(gl);
    perfStats.triangles = gl.info.render.triangles;
    perfStats.geometries = gl.info.memory.geometries;
    perfStats.textures = gl.info.memory.textures;
    drew.current = true;
    // The adaptive resolution (ADR-109): its sample, then its step, on this frame that is drawn anyway.
    const g = gpu.current;
    g.drawn += 1;
    const A = ART.adaptive;
    if (g.timed) {
      // Every `sampleEvery` frames a read is due for the controller; one still in flight puts it off a frame.
      if (g.drawn % A.sampleEvery === 0) g.wantFeed = true;
      if (!g.pending && (g.wantFeed || DEBUG)) {
        g.pending = true;
        g.feed = g.wantFeed;
        g.wantFeed = false;
        readGpuMs(gl).then(onGpu.current, onGpuFailed.current);
      }
    } else {
      // Without GPU timing, the interval of two frames drawn back to back by a running loop.
      if (g.lastWasLoop && frameloop === 'always' && delta * 1000 <= PACE.ignoreOverMs) noteAdaptiveSample(adaptive, delta * 1000);
      g.lastWasLoop = frameloop === 'always';
    }
    const tier = sceneTier(s);
    // A change only while the loop runs anyway (the roll, the landing), so the resized canvas's frame is one of
    // them and a scene at rest never draws for it (rule 4); never mid-flight or in the replay, where it would show.
    const quiet = frameloop === 'always' && s.status !== 'playing' && !replayMoves(s);
    if (stepAdaptive(adaptive, A, t1, s.screen, tier, quiet, PACE.choppyMs)) {
      perfStats.scale = adaptive.scale;
      scaleChanged();
    }
  }, 1);
  return null;
}
