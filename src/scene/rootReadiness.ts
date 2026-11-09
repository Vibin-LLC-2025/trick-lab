// Whether a Canvas (an R3F root) has finished starting up (PLAN-PLAY-POLISH-REACH
// step 1). The store's `stageReady` is sticky across tier changes, so it cannot
// say that a new root is ready; this can. Each root gets a number when its
// PerfProbe mounts (`__trickLabPerf.root` under ?debug) and a `ready` flag, set
// in PerfProbe's single after-effect after a frame's render, once every startup
// publication of that root is finished:
// - the scene is revealed (SceneEnvironment's `reveal`, after the environment
//   map and the parallel compile where the tier has them);
// - the effects are created, where the tier has them (or gave up: the tier then
//   draws without them for good);
// - every model of the tier is on screen (modelCache's `allShown`);
// - `stageReady` is published (StageReady sets it on the animation frame after
//   its after-effect, and that write asks for one more frame; on later roots it
//   is already true).
// Because ready is decided after a render, the frame that stageReady's write
// asks for is drawn before ready is set, never after it. A later change that
// adds a deferred startup write or invalidate adds it to this list.
//
// No React and no three: the flags live in a WeakMap keyed by the root's scene,
// which every component in a Canvas can reach (useThree), and which dies with it.

export interface Readiness {
  /** The root's number, from 1; 0 until its PerfProbe mounts. */
  root: number;
  revealed: boolean;
  /** The effects were created, or failed to start (ADR-51). Ignored on a tier without them. */
  effects: boolean;
  ready: boolean;
}

const roots = new WeakMap<object, Readiness>();

/** The readiness of the root that owns `scene`, made on first ask. */
export function readinessOf(scene: object): Readiness {
  let r = roots.get(scene);
  if (!r) {
    r = { root: 0, revealed: false, effects: false, ready: false };
    roots.set(scene, r);
  }
  return r;
}

export interface StartupState {
  /** The store's sticky flag (ADR-56). */
  stageReady: boolean;
  /** The tier draws through the effects (a tier with them, on the WebGPURenderer). */
  effectsWanted: boolean;
  /** Every model of the tier is on screen. */
  modelsShown: () => boolean;
}

/**
 * Whether the root is ready now, judged after a render. The models are asked
 * last, since that check builds the tier's list.
 */
export const isReady = (r: Readiness, s: StartupState): boolean =>
  r.revealed && (r.effects || !s.effectsWanted) && s.stageReady && s.modelsShown();
