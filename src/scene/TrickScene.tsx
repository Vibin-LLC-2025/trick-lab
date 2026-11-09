import { useEffect, useState } from 'react';
import { Canvas, useThree, type RootState } from '@react-three/fiber';
import { PCFShadowMap, type DirectionalLight } from 'three';
import { previewAnimates, useTrickStore } from '../store';
import { ART } from './artDirection';
import { shadowFrustum } from './cameraFit';
import { FlightDriver } from './FlightDriver';
import { noteRenderer, prefetchModels, RELEASE_AFTER_MS, releaseModels } from './modelCache';
import { modelsFor, modelsUnusedBy } from './modelUrls';
import { Pad } from './Pad';
import { PerfProbe } from './PerfProbe';
import { rendererFor, sceneTier } from './sceneTier';
import { SceneEnvironment } from './SceneEnvironment';
import { SceneCamera } from './SceneCamera';
import { disposeSharedResources } from './resources';

// The tier's models start downloading as soon as the 3D code has arrived,
// before the model chunk does (ADR-48). Not earlier: a download beside the 3D
// code delays the first frame by sharing the bandwidth (measured 2026-11-09).
const start = useTrickStore.getState();
prefetchModels(modelsFor(start.quality, start.feetVisible));

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

function Lights({ shadows }: { shadows: boolean }) {
  const L = ART.lights;
  const S = ART.shadowMap;
  const F = SHADOW_CAMERA;
  const [sun, setSun] = useState<DirectionalLight | null>(null);
  return (
    <>
      {/* Sky from above, concrete from below (ADR-31; was an ambient light). */}
      <hemisphereLight color={L.hemisphere.sky} groundColor={L.hemisphere.ground} intensity={L.hemisphere.intensity} />
      <directionalLight
        ref={setSun}
        color={L.directional.color}
        intensity={L.directional.intensity}
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

/**
 * `?debug` in the URL exposes the R3F state as `window.__trickLab` for
 * measuring renderer.info from a browser script (docs/PERF-BUDGET.md); without
 * it nothing is attached.
 */
function onCreated(state: RootState) {
  noteRenderer(state.gl);
  if (new URLSearchParams(window.location.search).has('debug')) {
    (window as unknown as { __trickLab?: RootState }).__trickLab = state;
  }
}

/**
 * The 3D view. Decorative for assistive tech: aria-hidden, every action has a
 * DOM control, and #scene-description carries the board state as text.
 * frameloop is "always" only while a trick is playing or the welcome screen's
 * preview plays (ADR-45), "demand" otherwise.
 *
 * The Canvas is keyed on the tier in use (ADR-16): antialias and
 * powerPreference are WebGL context options, so a tier change remounts it.
 * The GLB caches survive the remount; the shared resources are disposed and
 * re-uploaded on first use.
 */
export default function TrickScene() {
  useEffect(() => () => disposeSharedResources(), []);
  const playing = useTrickStore((s) => s.status === 'playing' || previewAnimates(s));
  const theme = useTrickStore((s) => s.theme);
  // The tier in use (sceneTier.ts): Low once a board or shoe model failed, whatever was saved.
  const quality = useTrickStore(sceneTier);
  // A move down a tier frees the models the new tier never shows (ADR-48),
  // once the old tier's Canvas is gone. A quick move back up cancels it.
  useEffect(() => {
    const id = setTimeout(() => releaseModels(modelsUnusedBy(quality)), RELEASE_AFTER_MS);
    return () => clearTimeout(id);
  }, [quality]);
  const Q = useTrickStore(rendererFor);
  const C = ART.camera;

  return (
    <Canvas
      key={quality}
      aria-hidden="true"
      dpr={[...Q.dpr]}
      frameloop={playing ? 'always' : 'demand'}
      // PCF, not the deprecated PCFSoft (ADR-38); softness is ART.shadowMap.radius.
      shadows={Q.shadows ? { type: PCFShadowMap } : false}
      // R3F 9 passes the renderer options to the constructor and then applies
      // them as properties, so toneMappingExposure takes effect (checked in the
      // browser by the integration pass, 2026-11-04).
      gl={{ powerPreference: Q.powerPreference, antialias: Q.antialias, toneMappingExposure: ART.renderer.exposure }}
      onCreated={onCreated}
      camera={{ position: [...C.position], fov: C.fov, near: C.near, far: C.far }}
    >
      {/* R3F defaults already give ACES filmic tone mapping and sRGB output (DESIGN.md). */}
      <color attach="background" args={[ART.clearColor[theme]]} />
      {/* Fog to the same colour, so the ground fades into the background (ADR-31). */}
      <fog attach="fog" args={[ART.fog.color[theme], ART.fog.near, ART.fog.far]} />
      <Lights shadows={Q.shadows} />
      {/* The pad and board stay hidden until their shaders are compiled with the environment. */}
      <SceneEnvironment>
        <Pad shadows={Q.shadows} />
        <FlightDriver shadows={Q.shadows} />
      </SceneEnvironment>
      <SceneCamera />
      <InvalidateOnStoreChange />
      <PerfProbe />
    </Canvas>
  );
}
