import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type PerspectiveCamera } from 'three';
import {
  FULL_STAGE,
  liveProgress,
  replayMoves,
  riderShown,
  useTrickStore,
  type CameraView,
  type ClearArea,
  type GameView,
  type TrickState,
} from '../store';
import { ART, type Vec3 } from './artDirection';
import { balancedLook, boxCorners, cameraRise, clearLens, fitDistance, fogDistance, framingPoints, orbitMaxDistance, riderFramingPoints } from './cameraFit';
import { leavesFreeForReplay, newResetTracker, placeCamera, returnsFromReplay, setLens, takeReset } from './cameraPlacement';
import { wind } from './windUp';

const C = ART.camera;
const BOARD_POINTS = framingPoints(C.fit);
const RIDER_POINTS = riderFramingPoints(C.fit, C.rider);
const [BOARD_BOX, SHOES_BOX, ARMS_BOX, HEAD_BOX] = C.rest.boxes;
const REST_POINTS = [BOARD_BOX, SHOES_BOX, ARMS_BOX, HEAD_BOX].flatMap(boxCorners);
/** What the rest framing must never crop: the board, the shoes and the head; the arms' band is framed while it costs little. */
const REST_ESSENTIAL = [BOARD_BOX, SHOES_BOX, HEAD_BOX].flatMap(boxCorners);
/**
 * The height each view looks at in the rest framing (ADR-86): balanced so the
 * frame's top and bottom bind together, for a clear area as tall as the
 * game's at 1440 x 900 (the balance hardly moves with its height).
 */
const REST_LOOK = Object.fromEntries(
  (['free', 'film', 'side'] as const).map((v) => [
    v,
    balancedLook({ from: C.views[v].position, target: C.views[v].target, fov: 28, points: REST_ESSENTIAL, margin: C.rest.margin, low: 0.3, high: 1.5 }),
  ]),
) as Partial<Record<ViewKey, number>>;

/** A camera preset: the lab's two (ADR-38), the welcome screen's preview (ADR-45), the game's free camera's home (ADR-81), its three fixed angles and its replay (ADR-72). */
export type ViewKey = CameraView | 'showcase' | GameView | 'replay';

/**
 * What a view keeps in frame (ADR-86):
 * - `board`: the board's whole flight (ADR-18), where the rider is not filmed;
 * - `flight`: the whole rider over the whole flight (ADR-85), the welcome
 *   screen's preview, and Free, Filmer and Side under reduced motion, where
 *   the camera does not move;
 * - `rest`: the rider at rest with the room the pop takes (`ART.camera.rest`),
 *   Free, Filmer and Side in a game, the camera rising with the flight
 *   (`cameraRise`), so the board is about twice the size.
 */
export type Framing = 'board' | 'flight' | 'rest';

/** A view's field of view: the replay's own, or the camera's. */
export const fovOf = (view: ViewKey) => C.fovs[view] ?? C.fov;

/** The framing of a view, with the whole rider on screen or not (store riderShown) and under reduced motion or not. */
export function framingFor(view: ViewKey, rider: boolean, calm: boolean): Framing {
  if (!rider || !C.filmsRider.includes(view)) return 'board';
  return view === 'showcase' || calm ? 'flight' : 'rest';
}

/**
 * Where a view looks from and at. Where it films the whole rider (ADR-85,
 * ADR-86), its target is lifted to the middle of what it frames and its
 * camera with it, so the direction is the preset's; otherwise the preset as
 * it was, so the lab, Low and a hidden rider keep their framing.
 */
export function lookFor(view: ViewKey, framing: Framing): { position: Vec3; target: Vec3 } {
  const V = C.views[view];
  if (framing === 'board') return V;
  const y = framing === 'rest' ? (REST_LOOK[view] ?? C.riderLook) : C.riderLook;
  const dy = y - V.target[1];
  return { position: [V.position[0], V.position[1] + dy, V.position[2]], target: [V.target[0], y, V.target[2]] };
}

/** What a framing keeps in frame. */
export const framePointsFor = (framing: Framing) => (framing === 'rest' ? REST_POINTS : framing === 'flight' ? RIDER_POINTS : BOARD_POINTS);

/**
 * The fitted distance of a view on a stage of this aspect (ADR-18), inside
 * the clear part of the stage (ADR-86; the whole stage by default). `board`:
 * far enough for the board's whole flight. `flight` (ADR-85): the board's
 * flight and the whole rider, unless that would take any of the rider past
 * the fog's start; then the rider's outer edge (a bail's arms) may crop,
 * never the board. `rest`: the board, the shoes and the head at rest with the
 * room the pop takes, and the arms' band as long as it costs at most
 * `armsSlack` more distance, up to the fog.
 */
export function distanceFor(view: ViewKey, aspect: number, framing: Framing, clear: ClearArea = FULL_STAGE): number {
  const V = lookFor(view, framing);
  const lens = clearLens(fovOf(view), aspect, clear);
  const at = { from: V.position, target: V.target, fov: lens.fitFov, aspect: lens.fitAspect, margin: framing === 'rest' ? C.rest.margin : C.fit.margin };
  if (framing === 'board') return Math.max(C.minDistance, fitDistance({ ...at, points: BOARD_POINTS }));
  const points = framePointsFor(framing);
  const whole = fitDistance({ ...at, points });
  const fog = fogDistance({ from: V.position, target: V.target, points, fogNear: ART.fog.near });
  if (framing === 'flight') return Math.max(C.minDistance, fitDistance({ ...at, points: BOARD_POINTS }), Math.min(whole, fog));
  // The rest framing: the board, the shoes and the head always; the arms while they cost little.
  const essential = fitDistance({ ...at, points: REST_ESSENTIAL });
  return Math.max(C.minDistance, essential, Math.min(whole, essential * C.rest.armsSlack, fog));
}

const preset = (key: ViewKey, framing: Framing) => {
  const V = lookFor(key, framing);
  return { target: new Vector3(...V.target), home: new Vector3(...V.position), targetArray: [...V.target] as [number, number, number] };
};
type Preset = ReturnType<typeof preset>;
const KEYS: readonly ViewKey[] = ['rider', 'detail', 'showcase', 'free', 'film', 'side', 'above', 'replay'];
const FRAMINGS: readonly Framing[] = ['board', 'flight', 'rest'];

/** Each preset's target and home position as vectors, built once per framing (ADR-38, ADR-85, ADR-86). */
const PRESETS = Object.fromEntries(FRAMINGS.map((f) => [f, Object.fromEntries(KEYS.map((k) => [k, preset(k, f)]))])) as Record<Framing, Record<ViewKey, Preset>>;

/** The view on screen: the preview's at home, the replay's while it plays, the game's chosen angle, the lab's chosen preset. */
export function viewFor(s: Pick<TrickState, 'screen' | 'cameraView' | 'gameView' | 'replay'>): ViewKey {
  if (s.screen === 'home') return 'showcase';
  if (s.screen === 'skate') return replayMoves(s) ? 'replay' : s.gameView;
  return s.cameraView;
}

/** The clear part of the stage the camera frames in: the page's measurement on the game screen (ADR-86), the whole stage elsewhere. */
export const clearFor = (s: Pick<TrickState, 'screen' | 'stageClear'>): ClearArea => (s.screen === 'skate' && s.stageClear ? s.stageClear : FULL_STAGE);

/** Whether the camera rises with the flight (ADR-86): the rest framing, outside the replay (which keeps its own spot, ADR-72). */
const rises = (view: ViewKey, framing: Framing) => framing === 'rest' && view !== 'replay';

/** How far the rise has moved the camera and its target: one number per mounted camera, taken off before any placement. */
type Applied = MutableRefObject<number>;

/** Takes the rise off the camera and the orbit target, so a placement starts from the preset's height. */
function dropRise(appliedRef: Applied, camera: { position: Vector3 }, target: Vector3 | null) {
  if (appliedRef.current === 0) return;
  camera.position.y -= appliedRef.current;
  if (target) target.y -= appliedRef.current;
  appliedRef.current = 0;
}

/**
 * Places the camera at the fitted distance along its current view direction.
 * Runs on resize, on "Reset view", on a new preset (both first snap to the
 * chosen preset) and when the clear part of the stage changes (ADR-86), which
 * also sets the lens. Only a reset nonce newer than the one seen at mount, or
 * a preset other than the one handled, resets (cameraPlacement.ts), so a
 * resize, a refit or the controls arriving after an earlier reset keep the
 * student's orbit. A new framing height (the rider shown or hidden, reduced
 * motion) moves the target and the camera with it, keeping the orbit's
 * direction. No easing in any mode, so reduced motion needs no special case.
 */
function FitAndReset({ distance, view, framing, clear, appliedRef }: { distance: number; view: ViewKey; framing: Framing; clear: ClearArea; appliedRef: Applied }) {
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
    // From the preset's own height: the rise goes back on with the next frame.
    dropRise(appliedRef, camera, controls?.target ?? null);
    const from = resets.view;
    const resetAsked = resetNonce !== resets.handled;
    const reset = takeReset(resets, resetNonce, view);
    const P = PRESETS[framing][view];
    if (leavesFreeForReplay(from, view)) kept.current = camera.position.clone();
    const back = returnsFromReplay(from, view, resetAsked) && kept.current !== null;
    // The replay's wide lens (ADR-72), the camera's own everywhere else, centred on the clear part of the stage (ADR-86).
    setLens(camera as PerspectiveCamera, fovOf(view), clear);
    if (back) {
      // Back where the student left it: the orbit's direction, at the fitted distance.
      camera.position.copy(kept.current!);
      controls?.target.copy(P.target);
    } else if (controls && !reset && !controls.target.equals(P.target)) {
      // The same view at a new height (the rider shown or hidden, a new framing): the orbit moves up or down with its target.
      camera.position.add(P.target).sub(controls.target);
      controls.target.copy(P.target);
    }
    if (view !== 'replay') kept.current = null;
    placeCamera(camera, controls?.target ?? null, { target: P.target, home: P.home, distance }, reset && !back);
    controls?.update();
    invalidate();
  }, [distance, camera, controls, invalidate, resetNonce, resets, view, framing, clear, appliedRef]);

  return null;
}

/** Scratch for the look while the controls have not arrived (no allocation per frame). */
const lookAt = new Vector3();

/**
 * The rise (ADR-86): while a flight is on screen, the camera and its target
 * go up with the rider by `cameraRise(flight, progress)` and come back down
 * by the landing, the student's orbit and zoom kept (both move by the same
 * amount). A useFrame of the camera's own (rule 5 as ADR-79 loosened it): it
 * moves only the camera and the orbit target, reads the store's live
 * playhead, which FlightDriver advances, and allocates nothing. No frame of
 * its own: it moves on the frames the flight already draws, and a pause or a
 * scrub holds it where the board is. Before the go it also stands
 * `rideLift` higher while the rider rides tall (the wind-up, ADR-86), and
 * comes down with the rider as it sinks into the crouch: the readiness
 * FlightDriver left this frame (its useFrame runs first).
 */
function Rise({ active, base, appliedRef }: { active: boolean; base: Vector3; appliedRef: Applied }) {
  useFrame((state) => {
    const camera = state.camera;
    const controls = state.controls as { target: Vector3 } | null;
    const s = useTrickStore.getState();
    // The flight's rise, plus the riding lift while the rider stands tall before its wind-up (FlightDriver stepped it this frame).
    const r = active ? cameraRise(s.flight, liveProgress(useTrickStore.playhead, s), C.rest.riseEase, C.rest.bailEase) + (1 - wind.ready) * C.rest.rideLift : 0;
    const d = r - appliedRef.current;
    if (d === 0) return;
    appliedRef.current = r;
    camera.position.y += d;
    if (controls) {
      controls.target.y += d;
      camera.lookAt(controls.target);
    } else camera.lookAt(lookAt.copy(base).setY(base.y + r));
  });
  return null;
}

/**
 * Orbit around the board. Damping stays off: it needs a continuous loop, and
 * with it off nobody gets camera easing. drei's OrbitControls invalidates on
 * change, so the demand loop still renders while orbiting. maxDistance grows
 * with the fit so a narrow stage can still zoom out a little past the fit,
 * but stops before the flight would reach the fog (orbitMaxDistance, ADR-55).
 * The orbit target is the chosen preset's (pan is off, so it never moves but
 * for the rise, ADR-86). On the welcome screen (ADR-45) the camera holds the
 * preview's own preset and the orbit is off. The game's default is its free
 * camera (ADR-81): the orbit is on, kept to the heel side and between the
 * game's own heights (`ART.camera.free`); its three fixed angles (ADR-72) and
 * the replay keep the orbit off. The lab keeps its free camera. On the game
 * screen every view frames inside the clear part of the stage (ADR-86).
 */
export function SceneCamera() {
  const home = useTrickStore((s) => s.screen === 'home');
  const lab = useTrickStore((s) => s.screen === 'lab');
  const game = useTrickStore((s) => s.screen === 'skate');
  const view = useTrickStore(viewFor);
  const rider = useTrickStore(riderShown);
  const calm = useTrickStore((s) => s.reducedMotion);
  const clear = useTrickStore(clearFor);
  const appliedRef = useRef(0);
  const framing = framingFor(view, rider, calm);
  const free = view === 'free';
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const distance = distanceFor(view, aspect, framing, clear);
  const P = PRESETS[framing][view];
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
          points: framePointsFor(framing),
          maxDistance: C.maxDistance,
          zoomOut: C.zoomOut,
          fogNear: ART.fog.near,
        })}
        // The game's fixed angles and the replay have the orbit off, but OrbitControls clamps the polar angle even then:
        // no limit there, or Filmer, Side and the replay were all pushed up to the lab's 18 degrees (fixed with ADR-86).
        minPolarAngle={free ? C.free.minPolarAngle : game ? 0 : C.minPolarAngle}
        // The welcome preview sits lower than a student may orbit, to show the sky (ADR-52); it never orbits.
        maxPolarAngle={home ? C.showcaseMaxPolarAngle : free ? C.free.maxPolarAngle : game ? Math.PI : C.maxPolarAngle}
        // The game's free camera stays on the heel side (ADR-81); the lab turns all the way round.
        minAzimuthAngle={free ? -C.free.azimuth : -Infinity}
        maxAzimuthAngle={free ? C.free.azimuth : Infinity}
      />
      <FitAndReset distance={distance} view={view} framing={framing} clear={clear} appliedRef={appliedRef} />
      <Rise active={rises(view, framing)} base={P.target} appliedRef={appliedRef} />
    </>
  );
}
