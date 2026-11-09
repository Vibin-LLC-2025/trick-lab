import { useEffect, useRef, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { PMREMGenerator, type Group, type Texture } from 'three';
import { ART } from './artDirection';
import { outdoorEnvironment } from './outdoorEnvironment';
import { isNodeRenderer } from './rendererKind';

/**
 * Reflections and image-based fill (DESIGN.md 7.6 and 10). Without an
 * environment a metalness 0.85 to 1.0 material has nothing to reflect and
 * renders near black. Since the ground pass (2026-11-04, ADR-31) the
 * environment is a small procedural outdoor scene (outdoorEnvironment.ts:
 * sky gradient, sun disc in the key light's direction, concrete below)
 * instead of three's indoor RoomEnvironment, so nothing is downloaded (no HDR
 * file). It is prefiltered once per Canvas mount into a PMREM render target
 * and assigned to scene.environment only: the background stays the theme's
 * clear color. The generator and the outdoor scene are freed straight away;
 * the PMREM texture is freed on unmount.
 *
 * Startup cost (docs/PERF-BUDGET.md, "Startup main thread", 2026-11-04). Shader
 * compilation is the expensive part of the first frame, and three blocks the
 * main thread on it the first time a program is used. So the children (the
 * pad and the board) stay hidden while the scene warms up in three steps,
 * each its own task instead of one long one inside the Canvas mount:
 * 1. after mount, a macrotask prefilters the PMREM (it compiles the outdoor
 *    scene's and the blur's shaders);
 * 2. with scene.environment set, `compileAsync` compiles the children's
 *    programs (hidden objects are compiled too) and waits through
 *    KHR_parallel_shader_compile without blocking;
 * 3. the children are shown and one frame is requested (the single
 *    invalidate for the environment, rule 4).
 * Compiling only after the environment exists matters: an envMap changes the
 * program, so a frame drawn before it would compile every material twice.
 */
export function SceneEnvironment({ children }: { children?: ReactNode }) {
  // Read the renderer, scene and camera through get() inside the effect: they
  // are long-lived three objects we mutate, not React state.
  const get = useThree((s) => s.get);
  const content = useRef<Group>(null);

  useEffect(() => {
    let cancelled = false;
    let target: { texture: Texture; dispose: () => void } | null = null;

    const reveal = () => {
      if (cancelled) return;
      if (content.current) content.current.visible = true;
      // frameloop is "demand": ask for the frame that shows the lit scene.
      get().invalidate();
    };

    const precompile = () => {
      if (cancelled) return;
      const { gl, scene, camera } = get();
      // Shown even if precompiling fails: a stalled first frame beats no scene.
      gl.compileAsync(scene, camera).then(reveal, reveal);
    };

    const prefilter = async () => {
      if (cancelled) return;
      const { gl, scene } = get();
      const E = ART.lights.environment;
      const outdoor = outdoorEnvironment();
      if (isNodeRenderer(gl)) {
        // The WebGPURenderer has its own PMREMGenerator (ADR-50); its chunk is already loaded.
        const { prefilterEnvironment } = await import('./nodeRenderer');
        if (cancelled) {
          outdoor.dispose();
          return;
        }
        target = prefilterEnvironment(gl, outdoor.scene, E.blur);
      } else {
        const pmrem = new PMREMGenerator(gl);
        target = pmrem.fromScene(outdoor.scene, E.blur);
        pmrem.dispose();
      }
      outdoor.dispose();
      scene.environment = target.texture;
      scene.environmentIntensity = E.intensity;
      timer = setTimeout(precompile, 0);
    };

    // Macrotasks, so neither step is part of the Canvas mount's task or of each other's.
    let timer = setTimeout(prefilter, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      const { scene } = get();
      if (target) {
        if (scene.environment === target.texture) scene.environment = null;
        target.dispose();
      }
    };
  }, [get]);

  // Hidden until warmUp has compiled it; set imperatively, so no React state.
  // Named so scripts/measure can tell when the lit scene first draws (ADR-48).
  return (
    <group ref={content} name="scene-content" visible={false}>
      {children}
    </group>
  );
}
