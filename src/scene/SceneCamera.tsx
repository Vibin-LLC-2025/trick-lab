import { useEffect, useRef, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { replayMoves, riderShown, useTrickStore, type CameraView, type GameView, type TrickState } from '../store';
import { ART, type Vec3 } from './artDirection';
import { fitDistance, fogDistance, framingPoints, orbitMaxDistance, riderFramingPoints } from './cameraFit';
import { leavesFreeForReplay, newResetTracker, placeCamera, returnsFromReplay, setFov, takeReset } from './cameraPlacement';

const C = ART.camera;
const BOARD_POINTS = framingPoints(C.fit);
const RIDER_POINTS = riderFramingPoints(C.fit, C.rider);

/** A camera preset: the lab's two (ADR-38), the welcome screen's preview (ADR-45), the game's free camera's home (ADR-81), its three fixed angles and its replay (ADR-72). */
export type ViewKey = CameraView | 'showcase' | GameView | 'replay';

/** A view's field of view: the replay's own, or the camera's. */
export const fovOf = (view: ViewKey) => C.fovs[view] ?? C.fov;

/** Whether this view, with the whole rider on screen (store riderShown), films the rider (ADR-85): Free, Filmer, Side and the welcome screen. */
const films = (view: ViewKey, rider: boolean) => rider && C.filmsRider.includes(view);

/**
 * Where a view looks from and at. Where it films the whole rider (ADR-85),
 * its target is lifted to the rider's middle (`ART.camera.riderLook`) and its
 * camera with it, so the direction is the preset's; otherwise the preset as
 * it was, so the lab, Low and a hidden rider keep their framing.
 */
export function lookFor(view: ViewKey, rider: boolean): { position: Vec3; target: Vec3 } {
  const V = C.views[view];
  if (!films(view, rider)) return V;
  const dy = C.riderLook - V.target[1];
  return { position: [V.position[0], V.position[1] + dy, V.position[2]], target: [V.target[0], C.riderLook, V.target[2]] };
}

/** What a view keeps in frame: the whole rider where it films the rider (ADR-85), the board's flight otherwise. */
export const framePointsFor = (view: ViewKey, rider: boolean) => (films(view, rider) ? RIDER_POINTS : BOARD_POINTS);

/**
 * The fitted distance of a view on a stage of this aspect (ADR-18): far
 * enough for the board's whole flight, and where the view films the rider
 * (ADR-85) for the whole rider too, unless that would take any of it past
 * the fog's start; then the rider's outer edge (a bail's arms out wide) may
 * crop, never the board. Every stage the layout makes (1.1:1 to 1.6:1,
 * measured 2026-11-11) shows the whole rider; only narrower ones crop.
 */
export function distanceFor(view: ViewKey, aspect: number, rider: boolean): number {
  const V = lookFor(view, rider);
  const at = { from: V.position, target: V.target, fov: fovOf(view), aspect, margin: C.fit.margin };
  const board = fitDistance({ ...at, points: BOARD_POINTS });
  if (!films(view, rider)) return Math.max(C.minDistance, board);
  const whole = fitDistance({ ...at, points: RIDER_POINTS });
  const fog = fogDistance({ from: V.position, target: V.target, points: RIDER_POINTS, fogNear: ART.fog.near });
  return Math.max(C.minDistance, board, Math.min(whole, fog));
}

const preset = (key: ViewKey, rider: boolean) => {
  const V = lookFor(key, rider);
  return { target: new Vector3(...V.target), home: new Vector3(...V.position), targetArray: [...V.target] as [number, number, number] };
};
type Preset = ReturnType<typeof preset>;
const KEYS: readonly ViewKey[] = ['rider', 'detail', 'showcase', 'free', 'film', 'side', 'above', 'replay'];

/** Each preset's target and home position as vectors, built once (ADR-38), as it is and lifted for the whole rider (ADR-85). */
const PRESETS = Object.fromEntries(KEYS.map((k) => [k, preset(k, false)])) as Record<ViewKey, Preset>;
const RIDER_PRESETS = Object.fromEntries(KEYS.map((k) => [k, preset(k, true)])) as Record<ViewKey, Preset>;
const presetFor = (view: ViewKey, rider: boolean) => (rider ? RIDER_PRESETS : PRESETS)[view];

/** The view on screen: the preview's at home, the replay's while it plays, the game's chosen angle, the lab's chosen preset. */
export function viewFor(s: Pick<TrickState, 'screen' | 'cameraView' | 'gameView' | 'replay'>): ViewKey {
  if (s.screen === 'home') return 'showcase';
  if (s.screen === 'skate') return replayMoves(s) ? 'replay' : s.gameView;
  return s.cameraView;
}

/** Distance at which the board's whole flight (and the rider, where it is filmed) fits the stage from this preset (ADR-18, ADR-85). */
function useFitDistance(view: ViewKey, rider: boolean) {
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  return distanceFor(view, aspect, rider);
}

/**
 * Places the camera at the fitted distance along its current view direction.
 * Runs on resize, on "Reset view" and on a new preset (both first snap to
 * the chosen preset). Only a reset nonce newer than the one seen at mount, or
 * a preset other than the one handled, resets (cameraPlacement.ts), so a
 * resize, a refit or the controls arriving after an earlier reset keep the
 * student's orbit. The rider coming or going (ADR-85) moves the target to
 * its new height and the camera with it, keeping the orbit's direction. No
 * easing in any mode, so reduced motion needs no special case.
 */
function FitAndReset({ distance, view, rider }: { distance: number; view: ViewKey; rider: boolean }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: Vector3; update: () => void } | null;
  const invalidate = useThree((s) => s.invalidate);
  const resetNonce = useTrickStore((s) => s.viewResetNonce);
  // One tracker per mount, starting at the nonce already handled before it
  // and at the rider's view, where the Canvas puts its camera.
  const [resets] = useState(() => newResetTracker(resetNonce));
  // The free camera's orbit, kept while the instant replay has the camera (ADR-81).
  const kept = useRef<Vector3 | null>(null);

  useEffect(() => {
    const from = resets.view;
    const resetAsked = resetNonce !== resets.handled;
    const reset = takeReset(resets, resetNonce, view);
    const P = presetFor(view, rider);
    if (leavesFreeForReplay(from, view)) kept.current = camera.position.clone();
    const back = returnsFromReplay(from, view, resetAsked) && kept.current !== null;
    // The replay's wide lens (ADR-72), the camera's own everywhere else.
    setFov(camera, fovOf(view));
    if (back) {
      // Back where the student left it: the orbit's direction, at the fitted distance.
      camera.position.copy(kept.current!);
      controls?.target.copy(P.target);
    } else if (controls && !reset && !controls.target.equals(P.target)) {
      // The same view at a new height (the rider shown or hidden): the orbit moves up or down with its target.
      camera.position.add(P.target).sub(controls.target);
      controls.target.copy(P.target);
    }
    if (view !== 'replay') kept.current = null;
    placeCamera(camera, controls?.target ?? null, { target: P.target, home: P.home, distance }, reset && !back);
    controls?.update();
    invalidate();
  }, [distance, camera, controls, invalidate, resetNonce, resets, view, rider]);

  return null;
}

/**
 * Orbit around the board. Damping stays off: it needs a continuous loop, and
 * with it off nobody gets camera easing. drei's OrbitControls invalidates on
 * change, so the demand loop still renders while orbiting. maxDistance grows
 * with the fit so a narrow stage can still zoom out a little past the fit,
 * but stops before the flight would reach the fog (orbitMaxDistance, ADR-55).
 * The orbit target is the chosen preset's (pan is off, so it never moves).
 * On the welcome screen (ADR-45) the camera holds the preview's own preset
 * and the orbit is off. The game's default is its free camera (ADR-81): the
 * orbit is on, kept to the heel side and between the game's own heights
 * (`ART.camera.free`); its three fixed angles (ADR-72) and the replay keep
 * the orbit off. The lab keeps its free camera.
 */
export function SceneCamera() {
  const home = useTrickStore((s) => s.screen === 'home');
  const lab = useTrickStore((s) => s.screen === 'lab');
  const view = useTrickStore(viewFor);
  const rider = useTrickStore(riderShown);
  const free = view === 'free';
  const distance = useFitDistance(view, rider);
  const P = presetFor(view, rider);
  return (
    <>
      <OrbitControls
        makeDefault
        enabled={lab || free}
        target={P.targetArray}
        enablePan={false}
        enableDamping={false}
        enableZoom
        minDistance={C.minDistance}
        maxDistance={orbitMaxDistance({
          fit: distance,
          target: P.targetArray,
          points: framePointsFor(view, rider),
          maxDistance: C.maxDistance,
          zoomOut: C.zoomOut,
          fogNear: ART.fog.near,
        })}
        minPolarAngle={free ? C.free.minPolarAngle : C.minPolarAngle}
        // The welcome preview sits lower than a student may orbit, to show the sky (ADR-52); it never orbits.
        maxPolarAngle={home ? C.showcaseMaxPolarAngle : free ? C.free.maxPolarAngle : C.maxPolarAngle}
        // The game's free camera stays on the heel side (ADR-81); the lab turns all the way round.
        minAzimuthAngle={free ? -C.free.azimuth : -Infinity}
        maxAzimuthAngle={free ? C.free.azimuth : Infinity}
      />
      <FitAndReset distance={distance} view={view} rider={rider} />
    </>
  );
}
