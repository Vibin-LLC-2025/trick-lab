// Camera placement for SceneCamera (ADR-18, ADR-23; audit fix 2026-11-04).
// Kept out of the component so it can be tested with a real three camera and
// no WebGL. No React.

import type { Vector3 } from 'three';

/**
 * Which "Reset view" request this camera has handled. Starts at the store's
 * nonce when the camera mounts, so a reset asked for before (in an earlier
 * Canvas, or before a resize) is never replayed.
 */
export interface ResetTracker {
  handled: number;
}

export const newResetTracker = (nonce: number): ResetTracker => ({ handled: nonce });

/** True once per new reset nonce; false for a resize, a refit or the controls arriving. */
export function takeReset(t: ResetTracker, nonce: number): boolean {
  if (nonce === t.handled) return false;
  t.handled = nonce;
  return true;
}

export interface Placement {
  /** The orbit target (pan is off, so it never moves). */
  target: Vector3;
  /** The home camera position: its direction from the target is the rider's view. */
  home: Vector3;
  /** Fitted distance from the target. */
  distance: number;
}

/**
 * Puts the camera at the fitted distance from the target. A reset first
 * snaps it (and the controls' target, if the controls exist yet) back home;
 * otherwise the student's orbit direction is kept and only the distance
 * changes, so a resize never undoes an orbit.
 */
export function placeCamera(
  camera: { position: Vector3 },
  controlsTarget: Vector3 | null,
  { target, home, distance }: Placement,
  reset: boolean,
) {
  if (reset) {
    camera.position.copy(home);
    controlsTarget?.copy(target);
  }
  camera.position.sub(target).setLength(distance).add(target);
}
