import { Component, type ReactNode } from 'react';
import { useTrickStore } from '../store';

/** Shown in place of the canvas. Honest about what is lost and what still works. */
export const SCENE_UNAVAILABLE_TEXT =
  'The 3D view could not run on this device or stopped working. Everything else still works: pop, the timeline, the readouts, the objectives and the event log. The scene description has the board pose in words.';

/**
 * Catches a 3D view that cannot render: the lazy scene chunk failing to load,
 * or an error thrown while the Canvas or anything in it renders (R3F rethrows
 * those into this DOM tree). Without it, React would unmount the whole app.
 * It tells the store once (setSceneUnavailable, not logged), which resolves a
 * trick in the air and makes later pops resolve at once, then shows a plain
 * note in the stage. The note is not a live region: the store's one
 * announcement goes through the Announcer.
 */
export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('trick-lab: the 3D view failed; the lab continues without it.', error);
    useTrickStore.getState().setSceneUnavailable();
  }

  render() {
    if (!this.state.failed) return <SceneGone>{this.props.children}</SceneGone>;
    return <SceneUnavailableNote />;
  }
}

function SceneUnavailableNote() {
  return (
    <div className="panel" role="note" aria-label="3D view unavailable">
      <p className="panel__note">{SCENE_UNAVAILABLE_TEXT}</p>
    </div>
  );
}

/**
 * The same note once the store says the view is gone for any other reason: its graphics context or device was lost
 * (scene/contextLoss.ts, the 2026-11-13 review C-04). The dead Canvas is unmounted, so nothing waits on its frames.
 */
function SceneGone({ children }: { children: ReactNode }) {
  const gone = useTrickStore((s) => s.sceneUnavailable);
  return gone ? <SceneUnavailableNote /> : children;
}
