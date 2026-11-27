import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { FULL_STAGE, useTrickStore } from '../store';
import { setLens } from './cameraPlacement';
import { eye, firstPersonFov, writeCalmEye } from './firstPersonEye';

/**
 * First person (ADR-111, reworked 2026-11-27): the camera is the rider's eyes.
 * FlightDriver poses the head and leaves the eye in `eye` before this runs;
 * the camera stands there, level, looking where it says. Reduced motion, or
 * no head this frame, holds the calm eye. Moves only the camera (rule 5).
 */
export default function FirstPersonCamera() {
  const clear = useTrickStore((s) => s.stageClear ?? FULL_STAGE);
  const calm = useTrickStore((s) => s.reducedMotion);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    setLens(camera, firstPersonFov(aspect, clear), clear);
    invalidate();
  }, [camera, aspect, clear, invalidate]);
  useFrame(() => {
    if (calm || !eye.posed) writeCalmEye(useTrickStore.getState().stance);
    camera.up.set(0, 1, 0);
    camera.position.set(eye.x, eye.y, eye.z);
    camera.lookAt(eye.x + eye.dx, eye.y + eye.dy, eye.z + eye.dz);
  });
  return null;
}
