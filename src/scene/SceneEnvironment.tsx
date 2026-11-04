import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ART } from './artDirection';

/**
 * Reflections for the metal trucks (DESIGN.md 7.6). Without an environment a
 * metalness 0.85 to 1.0 material has nothing to reflect and renders near black.
 * three's RoomEnvironment is a small procedural room, so nothing is
 * downloaded (no HDR file). It is prefiltered once per Canvas mount into a
 * PMREM render target and assigned to scene.environment only: the background
 * stays the theme's clear color. The generator and the room's geometry are
 * freed straight away; the PMREM texture is freed on unmount.
 */
export function SceneEnvironment() {
  // Read the renderer and scene through get() inside the effect: they are
  // long-lived three objects we mutate, not React state.
  const get = useThree((s) => s.get);

  useEffect(() => {
    const { gl, scene, invalidate } = get();
    const E = ART.lights.environment;
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, E.blur);
    room.dispose();
    pmrem.dispose();
    scene.environment = target.texture;
    scene.environmentIntensity = E.intensity;
    // frameloop is "demand": ask for the frame that shows the new lighting.
    invalidate();
    return () => {
      if (scene.environment === target.texture) scene.environment = null;
      target.dispose();
    };
  }, [get]);

  return null;
}
