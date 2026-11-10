import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addAfterEffect, Canvas, useThree, type RootState } from '@react-three/fiber';
import { PCFShadowMap, WebGLRenderer, type DirectionalLight } from 'three';
import { landingMoves, previewAnimates, rollMoves, useTrickStore, type Theme } from '../store';
import { ART } from './artDirection';
import { shadowFrustum } from './cameraFit';
import { FlightDriver } from './FlightDriver';
import { allShown, noteRenderer, onShown, prefetchModels, RELEASE_AFTER_MS, releaseModels, setUnwanted } from './modelCache';
import { modelsFor, modelsUnusedBy } from './modelUrls';
import { Pad } from './Pad';
import { PerfProbe } from './PerfProbe';
import { frame, perfStats } from './perfStats';
import { applyRangeFog, rangeFogOnWebGL } from './rangeFog';
import { isNodeRenderer } from './rendererKind';
import { readinessOf } from './rootReadiness';
import { effectsFor, motionBlurOn, rendererFor, sceneTier } from './sceneTier';
import { SceneEnvironment } from './SceneEnvironment';
import { SceneCamera } from './SceneCamera';
import { disposeSharedResources, mat } from './resources';
import { rollMotion } from './roll';
import { skyDomeGeometry } from './skyDome';

// The tier's models start downloading as soon as the 3D code has arrived,
// before the model chunk does (ADR-48). Not earlier: a download beside the 3D
// code delays the first frame by sharing the bandwidth (measured 2026-11-09).
const start = useTrickStore.getState();
prefetchModels(modelsFor(start.quality, start.feetVisible));
// Fog by distance on WebGLRenderer (ADR-55), before any program compiles.
rangeFogOnWebGL();

/**
 * Store changes that can change the picture (inputs move the feet, and a
 * pop, a scrub, a reset or a theme change move the rest) request one frame.
 * Progress commits while playing also land here; the loop is running then anyway.
 */
function InvalidateOnStoreChange() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => useTrickStore.subscribe(() => invalidate()), [invalidate]);
  return null;
}

/**
 * The key light's shadow camera, fitted once to every caster and its shadow
 * on the pad as the light sees them (ADR-38, cameraFit.ts). The light never
 * moves, so this is a constant.
 */
const SHADOW_CAMERA = shadowFrustum(ART.lights.directional.position, ART.lights.directional.target, ART.shadowMap.casters, ART.shadowMap.pad);

/**
 * The sky dome (ADR-52): one draw call, drawn first (renderOrder), never
 * culled (it surrounds the camera). Its geometry is the theme's, rebuilt on a
 * theme change and freed when replaced.
 */
function Sky({ theme }: { theme: Theme }) {
  const geometry = useMemo(() => skyDomeGeometry(theme), [theme]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={mat.sky} renderOrder={-1} frustumCulled={false} />;
}

function Lights({ shadows, theme }: { shadows: boolean; theme: Theme }) {
  const L = ART.lights;
  const S = ART.shadowMap;
  const F = SHADOW_CAMERA;
  const [sun, setSun] = useState<DirectionalLight | null>(null);
  return (
    <>
      {/* Sky from above, concrete from below (ADR-31; was an ambient light). */}
      <hemisphereLight color={L.hemisphere.sky[theme]} groundColor={L.hemisphere.ground} intensity={L.hemisphere.intensity} />
      <directionalLight
        ref={setSun}
        color={L.directional.color[theme]}
        intensity={L.directional.intensity[theme]}
        position={[...L.directional.position]}
        castShadow={shadows}
        shadow-mapSize={[S.size, S.size]}
        shadow-bias={S.bias}
        shadow-normalBias={S.normalBias}
        shadow-radius={S.radius}
        shadow-camera-left={F.left}
        shadow-camera-right={F.right}
        shadow-camera-top={F.top}
        shadow-camera-bottom={F.bottom}
        shadow-camera-near={F.near}
        shadow-camera-far={F.far}
      />
      {/* The light's target must be in the scene graph for its matrix to update. */}
      {sun && <primitive object={sun.target} position={[...L.directional.target]} />}
    </>
  );
}

const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

/**
 * `?debug` in the URL exposes the R3F state as `window.__trickLab`,
 * PerfProbe's numbers as `window.__trickLabPerf` and the roll's motion as
 * `window.__trickLabRoll` (ADR-67), for measuring from a
 * browser script (docs/PERF-BUDGET.md, scripts/measure); without it nothing
 * is attached.
 */
function onCreated(state: RootState) {
  noteRenderer(state.gl);
  // R3F gives ACES; the tone mapping is ART's (ADR-52), on every renderer.
  state.gl.toneMapping = ART.renderer.toneMapping;
  // Fog by distance (ADR-55): the WebGPURenderer's node, before the first frame compiles.
  applyRangeFog(state.scene, isNodeRenderer(state.gl));
  if (DEBUG) {
    const w = window as unknown as { __trickLab?: RootState; __trickLabPerf?: typeof perfStats; __trickLabRoll?: typeof rollMotion };
    w.__trickLab = state;
    w.__trickLabPerf = perfStats;
    w.__trickLabRoll = rollMotion;
  }
}

/** The WebGPURenderer path (ADR-50) is its own chunk: Low never downloads it. */
const loadNodeRenderer = () => import('./nodeRenderer');

type Effects = Awaited<ReturnType<typeof loadNodeRenderer>>['createEffects'] extends (...a: never[]) => infer E ? E : never;

/**
 * The post-processing (ADR-51) on a tier that has it, on the WebGPURenderer
 * (on WebGLRenderer, Low or the fallback, there is none). Built once per
 * Canvas from the node renderer's chunk, which is already loaded, handed to
 * PerfProbe through `frame.render`, freed on unmount. Motion blur follows the
 * store (motionBlurOn), one uniform set when that changes, never per frame.
 */
function PostEffects() {
  const get = useThree((s) => s.get);
  const tier = useTrickStore(effectsFor);
  const blurOn = useTrickStore(motionBlurOn);
  const made = useRef<Effects | null>(null);

  useEffect(() => {
    const { gl, scene, camera } = get();
    if (!tier || !isNodeRenderer(gl)) return;
    let cancelled = false;
    let effects: Effects | null = null;
    loadNodeRenderer().then(
      (m) => {
        if (cancelled) return;
        effects = m.createEffects(gl as never, scene, camera, tier);
        effects.setMotionBlur(motionBlurOn(useTrickStore.getState()));
        made.current = effects;
        frame.render = effects.render;
        // A startup publication of this root (rootReadiness.ts), as is giving up below.
        readinessOf(scene).effects = true;
        get().invalidate();
      },
      (error: unknown) => {
        readinessOf(scene).effects = true;
        console.warn('trick-lab: the effects did not start; drawing without them.', error);
      },
    );
    return () => {
      cancelled = true;
      if (effects) {
        if (frame.render === effects.render) frame.render = null;
        effects.dispose();
      }
      made.current = null;
    };
  }, [get, tier]);

  useEffect(() => {
    made.current?.setMotionBlur(blurOn);
  }, [blurOn]);
  return null;
}

/**
 * Tells the store when the stage first shows the tier's real scene (ADR-56),
 * so the loading picture lifts off it: the scene revealed (SceneEnvironment's
 * warm-up done), every model of the tier on screen (modelCache's noteShown,
 * or a ground that failed for good), and the frame that draws them rendered
 * (it compiles the models' programs, which can block for a moment), then the
 * next animation frame, so the picture fades off a scene on screen. One
 * after-render callback, then none: no per-frame code. A frame is asked for
 * from the effect, never from inside that callback: on a demand loop the loop
 * has already decided to stop by then, and the request would be lost. A model
 * that fails moves the scene to Low (sceneTier), whose Canvas has no models
 * to wait for. Once per page: after that, a tier change shows its own
 * fallbacks as before.
 */
function StageReady({ revealed }: { revealed: boolean }) {
  const get = useThree((s) => s.get);
  const ready = useTrickStore((s) => s.stageReady);
  const tier = useTrickStore(sceneTier);
  const feet = useTrickStore((s) => s.feetVisible);
  const urls = useMemo(() => modelsFor(tier, feet), [tier, feet]);

  useEffect(() => {
    if (ready || !revealed) return;
    let cancelled = false;
    let raf = 0;
    let stopFrames: (() => void) | null = null;
    const check = () => {
      if (stopFrames || !allShown(urls)) return;
      stopFrames = addAfterEffect(() => {
        stopFrames?.();
        raf = requestAnimationFrame(() => {
          if (!cancelled) useTrickStore.getState().setStageReady();
        });
      });
      get().invalidate();
    };
    const stopShown = onShown(check);
    check();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopShown();
      stopFrames?.();
    };
  }, [ready, revealed, urls, get]);
  return null;
}

/**
 * Frees the shared geometries and materials (resources.ts) when this Canvas
 * unmounts, a tier change included (rule 7). Each renderer that draws a shared
 * material adds a dispose listener to it, and the listener holds the
 * renderer's programs, so without this every remount kept the last
 * renderer's programs alive (about 40 KB a WebGLRenderer, found by the soak
 * test, 2026-11-09). The TSL twins are freed only if this Canvas's renderer
 * registered them.
 */
function SharedResources() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const gl = get().gl;
    return () => disposeSharedResources(gl);
  }, [get]);
  return null;
}

/** The lit content and its readiness (ADR-56), both per Canvas: a remount starts unrevealed. */
function Stage({ shadows }: { shadows: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const onReveal = useCallback(() => setRevealed(true), []);
  return (
    <>
      {/* The pad and board stay hidden until their shaders are compiled with the environment. */}
      <SceneEnvironment onReveal={onReveal}>
        <Pad shadows={shadows} />
        <FlightDriver shadows={shadows} />
      </SceneEnvironment>
      <StageReady revealed={revealed} />
    </>
  );
}

type Tier = ReturnType<typeof rendererFor>;
type GlDefaults = { canvas: unknown };

/** Today's renderer: Low, and wherever the WebGPURenderer cannot start. */
function webglRenderer(canvas: GlDefaults['canvas'], Q: Tier) {
  const gl = new WebGLRenderer({ canvas: canvas as HTMLCanvasElement, powerPreference: Q.powerPreference, antialias: Q.antialias });
  gl.toneMappingExposure = ART.renderer.exposure;
  return gl;
}

/**
 * The renderer factory for a tier (ADR-50). Medium and High: a
 * WebGPURenderer, awaited until initialised, as R3F requires. If its chunk
 * cannot load or it cannot start, the tier still draws, with WebGLRenderer
 * and the GLSL materials. R3F applies tone mapping and colour space to
 * whatever comes back.
 */
function rendererFactory(Q: Tier) {
  return async ({ canvas }: GlDefaults) => {
    if (Q.renderer === 'webgpu') {
      try {
        const m = await loadNodeRenderer();
        return await m.createNodeRenderer(canvas as HTMLCanvasElement, Q, DEBUG);
      } catch (error) {
        console.warn('trick-lab: the WebGPU renderer did not start; using WebGLRenderer.', error);
      }
    }
    return webglRenderer(canvas, Q);
  };
}

/**
 * The 3D view. Decorative for assistive tech: aria-hidden, every action has a
 * DOM control, and #scene-description carries the board state as text.
 * frameloop is "always" only while a trick is playing, the welcome screen's
 * preview plays (ADR-45), the board rolls in the game (ADR-67) or a game's
 * landing plays out (ADR-68), "demand"
 * otherwise.
 *
 * The Canvas is keyed on the tier in use (ADR-16): antialias and
 * powerPreference are WebGL context options, so a tier change remounts it.
 * The GLB caches survive the remount; the shared resources are disposed with
 * each Canvas (SharedResources) and re-uploaded on first use.
 */
export default function TrickScene() {
  // A rolling board in the game moves the ground, so it runs frames too (ADR-67).
  // So does a game's landing while it plays out (ADR-68).
  const playing = useTrickStore((s) => s.status === 'playing' || previewAnimates(s) || rollMoves(s) || landingMoves(s));
  const theme = useTrickStore((s) => s.theme);
  // The tier in use (sceneTier.ts): Low once a board or shoe model failed, whatever was saved.
  const quality = useTrickStore(sceneTier);
  // A move down a tier frees the models the new tier never shows (ADR-48),
  // once the old tier's Canvas is gone; one still loading is freed when it
  // finishes (gltf.ts). A quick move back up cancels both.
  useEffect(() => {
    const unused = modelsUnusedBy(quality);
    setUnwanted(unused);
    const id = setTimeout(() => releaseModels(unused), RELEASE_AFTER_MS);
    return () => clearTimeout(id);
  }, [quality]);
  const Q = useTrickStore(rendererFor);
  const C = ART.camera;
  // Medium and High: one factory per tier, which R3F calls once per Canvas (keyed on the tier).
  // Low: today's WebGLRenderer from props, as before ADR-50 (a factory delays its first frame).
  const factory = useCallback((defaults: GlDefaults) => rendererFactory(Q)(defaults), [Q]);
  const gl = Q.renderer === 'webgpu' ? factory : { powerPreference: Q.powerPreference, antialias: Q.antialias, toneMappingExposure: ART.renderer.exposure };

  return (
    <Canvas
      key={quality}
      aria-hidden="true"
      dpr={[...Q.dpr]}
      frameloop={playing ? 'always' : 'demand'}
      // PCF, not the deprecated PCFSoft (ADR-38); softness is ART.shadowMap.radius. Always an
      // object: R3F turns `false` into a PCFSoft type, which the WebGPURenderer warns about.
      shadows={{ enabled: Q.shadows, type: PCFShadowMap }}
      // WebGPURenderer on Medium and High, WebGLRenderer on Low and as the fallback (ADR-50).
      // R3F 9 passes props to the WebGLRenderer constructor and then applies them as
      // properties, so toneMappingExposure takes effect (checked 2026-11-04).
      gl={gl}
      onCreated={onCreated}
      camera={{ position: [...C.position], fov: C.fov, near: C.near, far: C.far }}
    >
      {/* sRGB output from R3F; the tone mapping is ART.renderer.toneMapping, set in onCreated (ADR-52). */}
      <color attach="background" args={[ART.clearColor[theme]]} />
      {/* Fog to the same colour, so the ground fades into the background (ADR-31), by distance (ADR-55). */}
      <fog attach="fog" args={[ART.fog.color[theme], ART.fog.near, ART.fog.far]} />
      <Sky theme={theme} />
      <Lights shadows={Q.shadows} theme={theme} />
      <Stage shadows={Q.shadows} />
      <SceneCamera />
      <InvalidateOnStoreChange />
      <SharedResources />
      <PostEffects />
      <PerfProbe />
    </Canvas>
  );
}
