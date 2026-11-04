import { useEffect, useState } from 'react';
import { Canvas, useThree, type RootState } from '@react-three/fiber';
import type { DirectionalLight } from 'three';
import { useTrickStore } from '../store';
import { ART } from './artDirection';
import { FlightDriver } from './FlightDriver';
import { Pad } from './Pad';
import { PerfProbe } from './PerfProbe';
import { SceneEnvironment } from './SceneEnvironment';
import { SceneCamera } from './SceneCamera';
import { disposeSharedResources } from './resources';

/**
 * Store changes that can change the picture (inputs do not move the board, but
 * a pop, a scrub, a reset or a theme change do) request one frame. Progress
 * commits while playing also land here; the loop is running then anyway.
 */
function InvalidateOnStoreChange() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => useTrickStore.subscribe(() => invalidate()), [invalidate]);
  return null;
}

function Lights() {
  const L = ART.lights;
  const [sun, setSun] = useState<DirectionalLight | null>(null);
  return (
    <>
      <ambientLight color={L.ambient.color} intensity={L.ambient.intensity} />
      <directionalLight ref={setSun} color={L.directional.color} intensity={L.directional.intensity} position={[...L.directional.position]} />
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
  if (new URLSearchParams(window.location.search).has('debug')) {
    (window as unknown as { __trickLab?: RootState }).__trickLab = state;
  }
}

/**
 * The 3D view. Decorative for assistive tech: aria-hidden, every action has a
 * DOM control, and #scene-description carries the board state as text.
 * frameloop is "always" only while a trick is playing, "demand" otherwise.
 */
export default function TrickScene() {
  useEffect(() => () => disposeSharedResources(), []);
  const playing = useTrickStore((s) => s.status === 'playing');
  const theme = useTrickStore((s) => s.theme);
  const C = ART.camera;

  return (
    <Canvas
      aria-hidden="true"
      dpr={[1, 1.5]}
      frameloop={playing ? 'always' : 'demand'}
      // R3F 9 passes the renderer options to the constructor and then applies
      // them as properties, so toneMappingExposure takes effect (checked in the
      // browser by the integration pass, 2026-11-04).
      gl={{ powerPreference: 'low-power', antialias: false, toneMappingExposure: ART.renderer.exposure }}
      onCreated={onCreated}
      camera={{ position: [...C.position], fov: C.fov, near: C.near, far: C.far }}
    >
      {/* R3F defaults already give ACES filmic tone mapping and sRGB output (DESIGN.md). */}
      <color attach="background" args={[ART.clearColor[theme]]} />
      <Lights />
      {/* The pad and board stay hidden until their shaders are compiled with the environment. */}
      <SceneEnvironment>
        <Pad />
        <FlightDriver />
      </SceneEnvironment>
      <SceneCamera />
      <InvalidateOnStoreChange />
      <PerfProbe />
    </Canvas>
  );
}
