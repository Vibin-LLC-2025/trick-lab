import { useEffect, useRef, type ReactNode } from 'react';
import { useTrickStore } from '../store';
import { useThree } from '@react-three/fiber';
import { PMREMGenerator, type Group, type Texture } from 'three';
import { ART } from './artDirection';
import { outdoorEnvironment } from './outdoorEnvironment';
import { isNodeRenderer } from './rendererKind';
import { rendererFor } from './sceneTier';

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
 * `onReveal` is called once, at step 3 (StageReady, ADR-56).
 */
export function SceneEnvironment({ children, onReveal }: { children?: ReactNode; onReveal?: () => void }) {
  // Read the renderer, scene and camera through get() inside the effect: they
  // are long-lived three objects we mutate, not React state.
  const get = useThree((s) => s.get);
  const content = useRef<Group>(null);
  // The environment is the theme's sky (ADR-52): a theme change prefilters it again.
  const theme = useTrickStore((s) => s.theme);
  // Low is toon shaded and builds no environment (ADR-54): it only warms up and reveals.
  const environment = useTrickStore((s) => rendererFor(s).environment);
  // The warm-up (hidden content, compile, reveal) runs once per Canvas; a theme change only swaps the map.
  const revealed = useRef(false);
  const onRevealRef = useRef(onReveal);
  useEffect(() => {
    onRevealRef.current = onReveal;
  }, [onReveal]);
  // The map in use. A theme change keeps showing it until the next one is ready, then frees it.
  const current = useRef<{ texture: Texture; dispose: () => void } | null>(null);

  // Freed with the Canvas.
  useEffect(
    () => () => {
      const t = current.current;
      if (!t) return;
      const { scene } = get();
      if (scene.environment === t.texture) scene.environment = null;
      t.dispose();
      current.current = null;
    },
    [get],
  );

  useEffect(() => {
    let cancelled = false;
    let target: { texture: Texture; dispose: () => void };

    const reveal = () => {
      if (cancelled) return;
      revealed.current = true;
      if (content.current) content.current.visible = true;
      onRevealRef.current?.();
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
      if (!environment) {
        // Low (ADR-54): no map, and no async warm-up either. With nothing drawn while it
        // waits, the parallel compile reported ready only about 0.5 s later (measured
        // 2026-11-09); Low's few programs compile in its first frame instead.
        if (!revealed.current) reveal();
        return;
      }
      const { gl, scene } = get();
      const E = ART.lights.environment;
      const outdoor = outdoorEnvironment(theme);
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
      const previous = current.current;
      current.current = target;
      scene.environment = target.texture;
      scene.environmentIntensity = E.intensity;
      previous?.dispose();
      if (revealed.current) get().invalidate();
      else timer = setTimeout(precompile, 0);
    };

    // Macrotasks, so neither step is part of the Canvas mount's task or of each other's.
    let timer = setTimeout(prefilter, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [get, theme, environment]);

  // Hidden until warmUp has compiled it; set imperatively, so no React state.
  // Named so scripts/measure can tell when the lit scene first draws (ADR-48).
  return (
    <group ref={content} name="scene-content" visible={false}>
      {children}
    </group>
  );
}
