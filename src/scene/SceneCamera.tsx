import { useEffect, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useTrickStore, type CameraView } from '../store';
import { ART } from './artDirection';
import { fitDistance, framingPoints } from './cameraFit';
import { newResetTracker, placeCamera, takeReset } from './cameraPlacement';

const C = ART.camera;
const FRAME_POINTS = framingPoints(C.fit);

/** Each preset's target and home position as vectors, built once (ADR-38). */
const PRESETS: Record<CameraView, { target: Vector3; home: Vector3; targetArray: [number, number, number] }> = {
  rider: { target: new Vector3(...C.views.rider.target), home: new Vector3(...C.views.rider.position), targetArray: [...C.views.rider.target] },
  detail: { target: new Vector3(...C.views.detail.target), home: new Vector3(...C.views.detail.position), targetArray: [...C.views.detail.target] },
};

/** Distance at which the board's whole flight fits a stage of this aspect from this preset (ADR-18). */
function useFitDistance(view: CameraView) {
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const V = C.views[view];
  const d = fitDistance({
    from: V.position,
    target: V.target,
    fov: C.fov,
    aspect,
    points: FRAME_POINTS,
    margin: C.fit.margin,
  });
  return Math.max(C.minDistance, d);
}

/**
 * Places the camera at the fitted distance along its current view direction.
 * Runs on resize, on "Reset view" and on a new preset (both first snap to
 * the chosen preset). Only a reset nonce newer than the one seen at mount, or
 * a preset other than the one handled, resets (cameraPlacement.ts), so a
 * resize, a refit or the controls arriving after an earlier reset keep the
 * student's orbit. No easing in any mode, so reduced motion needs no special
 * case.
 */
function FitAndReset({ distance, view }: { distance: number; view: CameraView }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: Vector3; update: () => void } | null;
  const invalidate = useThree((s) => s.invalidate);
  const resetNonce = useTrickStore((s) => s.viewResetNonce);
  // One tracker per mount, starting at the nonce already handled before it
  // and at the rider's view, where the Canvas puts its camera.
  const [resets] = useState(() => newResetTracker(resetNonce));

  useEffect(() => {
    const reset = takeReset(resets, resetNonce, view);
    const P = PRESETS[view];
    placeCamera(camera, controls?.target ?? null, { target: P.target, home: P.home, distance }, reset);
    controls?.update();
    invalidate();
  }, [distance, camera, controls, invalidate, resetNonce, resets, view]);

  return null;
}

/**
 * Orbit around the board. Damping stays off: it needs a continuous loop, and
 * with it off nobody gets camera easing. drei's OrbitControls invalidates on
 * change, so the demand loop still renders while orbiting. maxDistance grows
 * with the fit so a narrow stage can still zoom out a little past the fit.
 * The orbit target is the chosen preset's (pan is off, so it never moves).
 */
export function SceneCamera() {
  const view = useTrickStore((s) => s.cameraView);
  const distance = useFitDistance(view);
  return (
    <>
      <OrbitControls
        makeDefault
        target={PRESETS[view].targetArray}
        enablePan={false}
        enableDamping={false}
        enableZoom
        minDistance={C.minDistance}
        maxDistance={Math.max(C.maxDistance, distance * 1.25)}
        minPolarAngle={C.minPolarAngle}
        maxPolarAngle={C.maxPolarAngle}
      />
      <FitAndReset distance={distance} view={view} />
    </>
  );
}
