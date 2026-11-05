import { useEffect, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useTrickStore } from '../store';
import { ART } from './artDirection';
import { fitDistance, framingPoints } from './cameraFit';
import { newResetTracker, placeCamera, takeReset } from './cameraPlacement';

const C = ART.camera;
const TARGET = new Vector3(...C.target);
const HOME = new Vector3(...C.position);
const FRAME_POINTS = framingPoints(C.fit);

/** Distance at which the board's whole flight fits a stage of this aspect (ADR-18). */
function useFitDistance() {
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const d = fitDistance({
    from: C.position,
    target: C.target,
    fov: C.fov,
    aspect,
    points: FRAME_POINTS,
    margin: C.fit.margin,
  });
  return Math.max(C.minDistance, d);
}

/**
 * Places the camera at the fitted distance along its current view direction.
 * Runs on resize and on "Reset view" (which first snaps back home). Only a
 * reset nonce newer than the one seen at mount resets (cameraPlacement.ts),
 * so a resize, a refit or the controls arriving after an earlier reset keep
 * the student's orbit. No easing in any mode, so reduced motion needs no
 * special case.
 */
function FitAndReset({ distance }: { distance: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: Vector3; update: () => void } | null;
  const invalidate = useThree((s) => s.invalidate);
  const resetNonce = useTrickStore((s) => s.viewResetNonce);
  // One tracker per mount, starting at the nonce already handled before it.
  const [resets] = useState(() => newResetTracker(resetNonce));

  useEffect(() => {
    const reset = takeReset(resets, resetNonce);
    placeCamera(camera, controls?.target ?? null, { target: TARGET, home: HOME, distance }, reset);
    controls?.update();
    invalidate();
  }, [distance, camera, controls, invalidate, resetNonce, resets]);

  return null;
}

/**
 * Orbit around the board. Damping stays off: it needs a continuous loop, and
 * with it off nobody gets camera easing. drei's OrbitControls invalidates on
 * change, so the demand loop still renders while orbiting. maxDistance grows
 * with the fit so a narrow stage can still zoom out a little past the fit.
 */
export function SceneCamera() {
  const distance = useFitDistance();
  return (
    <>
      <OrbitControls
        makeDefault
        target={[...C.target]}
        enablePan={false}
        enableDamping={false}
        enableZoom
        minDistance={C.minDistance}
        maxDistance={Math.max(C.maxDistance, distance * 1.25)}
        minPolarAngle={C.minPolarAngle}
        maxPolarAngle={C.maxPolarAngle}
      />
      <FitAndReset distance={distance} />
    </>
  );
}
