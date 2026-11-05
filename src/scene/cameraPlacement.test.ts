import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { createTrickStore } from '../store';
import { ART } from './artDirection';
import { newResetTracker, placeCamera, takeReset } from './cameraPlacement';

const C = ART.camera;
const TARGET = new Vector3(...C.target);
const HOME = new Vector3(...C.position);
const direction = (camera: PerspectiveCamera) => camera.position.clone().sub(TARGET).normalize();

/**
 * What SceneCamera's effect does, run against a real three camera and the
 * real store's viewResetNonce: the tracker starts at the nonce seen at
 * mount, and every run (resize, refit, controls arriving, a reset) places
 * the camera once.
 */
function mount(store = createTrickStore(() => 0)) {
  const camera = new PerspectiveCamera(C.fov, 1.5, C.near, C.far);
  camera.position.copy(HOME);
  const controlsTarget = TARGET.clone();
  const resets = newResetTracker(store.getState().viewResetNonce);
  const run = (distance: number, controls: Vector3 | null = controlsTarget) =>
    placeCamera(camera, controls, { target: TARGET, home: HOME, distance }, takeReset(resets, store.getState().viewResetNonce));
  return { store, camera, controlsTarget, run };
}

/** The student orbits: the camera swings round the target. */
const orbit = (camera: PerspectiveCamera) => {
  camera.position.set(TARGET.x + 1.2, TARGET.y + 0.4, TARGET.z - 0.9);
};

describe('camera placement (ADR-18, ADR-23)', () => {
  it('fits the distance along the home view at mount', () => {
    const { camera, run } = mount();
    run(2.5);
    expect(camera.position.distanceTo(TARGET)).toBeCloseTo(2.5, 9);
    expect(direction(camera).angleTo(HOME.clone().sub(TARGET).normalize())).toBeCloseTo(0, 9);
  });

  it('reset, orbit, then resize keeps the orbit; only a new reset goes home', () => {
    const { store, camera, controlsTarget, run } = mount();
    run(2.5);
    store.getState().resetView();
    run(2.5);
    const home = direction(camera);
    expect(home.angleTo(HOME.clone().sub(TARGET).normalize())).toBeCloseTo(0, 9);

    orbit(camera);
    const orbited = direction(camera);
    expect(orbited.angleTo(home)).toBeGreaterThan(0.5);
    // A resize refits: new distance, same direction. The old reset is not replayed.
    run(3.1);
    expect(camera.position.distanceTo(TARGET)).toBeCloseTo(3.1, 9);
    expect(direction(camera).angleTo(orbited)).toBeCloseTo(0, 9);
    // The controls going away and coming back is another run, still no reset.
    run(3.1, null);
    run(3.1);
    expect(direction(camera).angleTo(orbited)).toBeCloseTo(0, 9);

    // An explicit new reset goes home and resets the controls' target.
    controlsTarget.set(9, 9, 9);
    store.getState().resetView();
    run(3.1);
    expect(direction(camera).angleTo(home)).toBeCloseTo(0, 9);
    expect(camera.position.distanceTo(TARGET)).toBeCloseTo(3.1, 9);
    expect(controlsTarget.equals(TARGET)).toBe(true);
  });

  it('a camera mounted after earlier resets does not replay them', () => {
    const store = createTrickStore(() => 0);
    store.getState().resetView();
    store.getState().resetView();
    const { camera, run } = mount(store);
    orbit(camera);
    const orbited = direction(camera);
    run(2.8);
    expect(direction(camera).angleTo(orbited)).toBeCloseTo(0, 9);
  });

  it('takeReset reports each new nonce once', () => {
    const t = newResetTracker(4);
    expect(takeReset(t, 4)).toBe(false);
    expect(takeReset(t, 5)).toBe(true);
    expect(takeReset(t, 5)).toBe(false);
  });
});
