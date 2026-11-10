// Camera placement for SceneCamera (ADR-18, ADR-23; audit fix 2026-11-04).
// Kept out of the component so it can be tested with a real three camera and
// no WebGL. No React.

import type { Vector3 } from 'three';

/**
 * Which "Reset view" request and which camera preset (ADR-38) this camera
 * has handled. Starts at the store's nonce when the camera mounts, so a
 * reset asked for before (in an earlier Canvas, or before a resize) is
 * never replayed, and at the rider's view, which is where the Canvas builds
 * its camera: a mount with the detail preset saved snaps to it once.
 */
export interface ResetTracker {
  handled: number;
  view: string;
}

export const newResetTracker = (nonce: number, view = 'rider'): ResetTracker => ({ handled: nonce, view });

/**
 * True once per new reset nonce or new preset; false for a resize, a refit
 * or the controls arriving. `view` defaults to the one already handled.
 */
export function takeReset(t: ResetTracker, nonce: number, view: string = t.view): boolean {
  if (nonce === t.handled && view === t.view) return false;
  t.handled = nonce;
  t.view = view;
  return true;
}

export interface Placement {
  /** The orbit target (pan is off, so it never moves). */
  target: Vector3;
  /** The preset's camera position: its direction from the target is the view (the rider's, or the detail preset's). */
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

/** Gives a perspective camera a field of view (the replay's wide lens, ADR-72), and its projection with it; no change, no work. */
export function setFov(camera: { fov?: number; updateProjectionMatrix?: () => void }, fov: number) {
  if (camera.fov === undefined || camera.fov === fov) return;
  camera.fov = fov;
  camera.updateProjectionMatrix?.();
}
