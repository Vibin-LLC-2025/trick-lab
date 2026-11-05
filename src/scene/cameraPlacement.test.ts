import { beforeEach, describe, expect, it } from 'vitest';
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

  it('takeReset also reports each new preset once, and a mount starts at the rider view (ADR-38)', () => {
    const t = newResetTracker(4);
    expect(takeReset(t, 4, 'rider')).toBe(false);
    expect(takeReset(t, 4, 'detail')).toBe(true);
    expect(takeReset(t, 4, 'detail')).toBe(false);
    expect(takeReset(t, 4)).toBe(false);
    expect(takeReset(t, 5)).toBe(true);
  });
});

describe('camera presets (ADR-38)', () => {
  // The preset is persisted; each test starts from a fresh store and storage.
  beforeEach(() => localStorage.clear());
  const PRESET = {
    rider: { target: TARGET, home: HOME },
    detail: { target: new Vector3(...C.views.detail.target), home: new Vector3(...C.views.detail.position) },
  };
  const dir = (p: { target: Vector3; home: Vector3 }) => p.home.clone().sub(p.target).normalize();

  /** SceneCamera's effect with the preset from the real store, as FitAndReset runs it. */
  function mountWithView(store = createTrickStore(() => 0)) {
    const camera = new PerspectiveCamera(C.fov, 1.5, C.near, C.far);
    // The Canvas builds its camera at the rider's view whatever the preset.
    camera.position.copy(HOME);
    const controlsTarget = TARGET.clone();
    const resets = newResetTracker(store.getState().viewResetNonce);
    const run = (distance: number) => {
      const view = store.getState().cameraView;
      const P = PRESET[view];
      placeCamera(camera, controlsTarget, { ...P, distance }, takeReset(resets, store.getState().viewResetNonce, view));
    };
    const along = (p: { target: Vector3; home: Vector3 }) => camera.position.clone().sub(p.target).normalize().angleTo(dir(p));
    return { store, camera, controlsTarget, run, along };
  }

  it('choosing the detail preset snaps to it, with its target; a resize then keeps an orbit', () => {
    const { store, camera, controlsTarget, run, along } = mountWithView();
    run(2.5);
    expect(along(PRESET.rider)).toBeCloseTo(0, 9);
    store.getState().setCameraView('detail');
    run(2.9);
    expect(along(PRESET.detail)).toBeCloseTo(0, 9);
    expect(camera.position.distanceTo(PRESET.detail.target)).toBeCloseTo(2.9, 9);
    expect(controlsTarget.equals(PRESET.detail.target)).toBe(true);
    orbit(camera);
    const orbited = camera.position.clone().sub(PRESET.detail.target).normalize();
    run(3.2);
    expect(camera.position.clone().sub(PRESET.detail.target).normalize().angleTo(orbited)).toBeCloseTo(0, 9);
  });

  it('Reset view returns to the chosen preset, not to the rider view', () => {
    const { store, camera, run, along } = mountWithView();
    store.getState().setCameraView('detail');
    run(2.9);
    orbit(camera);
    expect(along(PRESET.detail)).toBeGreaterThan(0.3);
    store.getState().resetView();
    run(2.9);
    expect(along(PRESET.detail)).toBeCloseTo(0, 9);
    // And back to the rider preset by choosing it.
    store.getState().setCameraView('rider');
    run(2.4);
    expect(along(PRESET.rider)).toBeCloseTo(0, 9);
  });

  it('a camera mounted with the detail preset saved snaps to it once, then keeps an orbit', () => {
    const store = createTrickStore(() => 0);
    store.getState().setCameraView('detail');
    const { camera, run, along } = mountWithView(store);
    run(2.9);
    expect(along(PRESET.detail)).toBeCloseTo(0, 9);
    orbit(camera);
    const orbited = camera.position.clone().sub(PRESET.detail.target).normalize();
    run(2.9);
    expect(camera.position.clone().sub(PRESET.detail.target).normalize().angleTo(orbited)).toBeCloseTo(0, 9);
  });
});
