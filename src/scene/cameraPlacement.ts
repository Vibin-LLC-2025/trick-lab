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

/**
 * The game's free camera across the instant replay (ADR-81): the replay has
 * its own spot, and coming back from it would snap the camera to the free
 * view's home, losing the student's orbit after every go. So the orbit is
 * kept as the replay starts and given back as it ends, unless "Reset view"
 * was asked for in between.
 */
/** True when this change of view is the replay taking over from the free camera: keep the orbit. */
export const leavesFreeForReplay = (from: string, to: string) => (from === 'free' || from === 'freeFisheye') && to === 'replay';
/** True when this change of view is the free camera coming back from the replay with no reset asked for: give the orbit back. */
export const returnsFromReplay = (from: string, to: string, resetAsked: boolean) => from === 'replay' && (to === 'free' || to === 'freeFisheye') && !resetAsked;

/** The clear part of the stage (store/stage.ts), as fractions from its top left. */
interface ClearRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Gives a perspective camera its field of view and moves its principal point
 * to the centre of the clear part of the stage (ADR-86) with a view offset.
 * three's setViewOffset also sets the aspect to fullWidth / fullHeight, so
 * the full image is the stage at the camera's own aspect, by 1: the offset is
 * then in units of the stage's height, and the projection only reads its
 * ratios to the full size, so the aspect R3F sets on a resize keeps it right.
 * The whole stage clears the offset. One projection update, only on a change.
 */
export function setLens(
  camera: {
    fov?: number;
    aspect?: number;
    view?: { enabled: boolean; offsetX: number; offsetY: number; fullWidth: number } | null;
    setViewOffset?: (fw: number, fh: number, x: number, y: number, w: number, h: number) => void;
    clearViewOffset?: () => void;
    updateProjectionMatrix?: () => void;
  },
  fov: number,
  clear: ClearRect,
) {
  if (camera.fov === undefined) return;
  const x = 0.5 - (clear.left + clear.right) / 2;
  const y = 0.5 - (clear.top + clear.bottom) / 2;
  const full = clear.left === 0 && clear.top === 0 && clear.right === 1 && clear.bottom === 1;
  const view = camera.view;
  const same = full ? !view?.enabled : !!view?.enabled && view.offsetX / view.fullWidth === x && view.offsetY === y;
  if (same && camera.fov === fov) return;
  camera.fov = fov;
  const a = camera.aspect ?? 1;
  if (full) camera.clearViewOffset?.();
  else camera.setViewOffset?.(a, 1, x * a, y, a, 1);
  camera.updateProjectionMatrix?.();
}
