// A lost graphics context (the 2026-11-13 review, C-04): the GPU reset, the driver crashed, the browser took the
// context back. Until now nothing listened, so the view froze on its last frame while the game waited on frames that
// never came. Now the loss reaches the store's fallback (setSceneUnavailable): the go in the air resolves, later pops
// resolve at once, and the stage shows its note, as when the view cannot start. A loss is permanent for the session.
//
// - WebGLRenderer (Low, and the fallback): the canvas's `webglcontextlost`.
// - WebGPURenderer (Medium and High), on either backend: three calls `renderer.onDeviceLost` for a native WebGPU
//   device lost (not for its own `destroy()`) and for its WebGL2 backend's `webglcontextlost`; ours is chained after
//   three's own handler.
// Detached on unmount, with an alive flag, so an ordinary tier change, which tears a renderer down, never reaches it.

/** What the watcher needs of a renderer: its canvas, and on the WebGPURenderer its loss handler. */
export interface LossSource {
  domElement: EventTarget;
  isWebGPURenderer?: boolean;
  onDeviceLost?: (info: unknown) => void;
}

/** Calls `lost` once if the renderer's context or device is lost; returns the detach. */
export function watchContextLoss(gl: LossSource, lost: () => void): () => void {
  let alive = true;
  const once = () => {
    if (alive) lost();
    alive = false;
  };
  const own = gl.isWebGPURenderer ? gl.onDeviceLost : undefined;
  if (own) {
    const chained = function (this: unknown, info: unknown) {
      own.call(this, info);
      once();
    };
    gl.onDeviceLost = chained;
    return () => {
      alive = false;
      if (gl.onDeviceLost === chained) gl.onDeviceLost = own;
    };
  }
  gl.domElement.addEventListener('webglcontextlost', once);
  return () => {
    alive = false;
    gl.domElement.removeEventListener('webglcontextlost', once);
  };
}
