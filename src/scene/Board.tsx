import { Component, Suspense, lazy, type ReactNode, type Ref } from 'react';
import type { Group } from 'three';
import { useTrickStore } from '../store';
import { BoardPrimitive } from './BoardPrimitive';
import { sceneTier } from './sceneTier';
import { boardUrlFor } from './modelUrls';

/**
 * The GLB path (drei useGLTF, three-stdlib's GLTFLoader and the inlined
 * meshopt decoder, about 75 KB minified) is its own chunk, so a student on Low
 * downloads neither the loader nor a model. On High and Medium the import
 * starts as soon as this module loads, in parallel with the scene, and
 * BoardModel's module preloads the tier's GLB the moment it arrives.
 */
const loadBoardModel = () => import('./BoardModel');
// The early start is only a prefetch: a rejection here (offline, blocked
// chunk) is ignored, so it is never an unhandled rejection. The lazy import
// below asks again and its failure still reaches AssetBoundary.
if (useTrickStore.getState().quality !== 'low') loadBoardModel().catch(() => {});
const BoardModel = lazy(() => loadBoardModel().then((m) => ({ default: m.BoardModel })));

/**
 * If a GLB cannot load (offline, blocked, corrupt), keep the primitive board
 * and tell the store, which disables the High and Medium options and
 * announces it. Never logged: the event contract has no UI events.
 * `reportToStore={false}` (the ground, ADR-31) only swaps in the fallback:
 * a ground that fails is not a board that fails.
 */
export class AssetBoundary extends Component<
  { fallback: ReactNode; children: ReactNode; reportToStore?: boolean },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('trick-lab: a model failed to load, using the primitive fallback.', error);
    if (this.props.reportToStore !== false) useTrickStore.getState().setBoardAssetFailed();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The skateboard. The outer group is what FlightDriver poses each frame (its
 * only per-frame writer); Board itself has no per-frame code. Inside it, the
 * quality tier picks the model (ADR-15, ADR-16):
 * - High: the high-detail GLB (board-high.glb), casting a shadow.
 * - Medium: the original GLB (board.glb).
 * - Low: the primitive board only (fewer draw calls and triangles, no GLB
 *   download if Low was chosen before the scene loaded).
 * The primitive board is also the Suspense fallback while a GLB streams and
 * the error fallback if it fails.
 * Group origin is the deck centre; long axis X, nose +X, grip +Y.
 * `children` ride with the deck in that frame (the motion cues, ADR-26).
 */
export function Board({ ref, shadows, children }: { ref: Ref<Group>; shadows: boolean; children?: ReactNode }) {
  const quality = useTrickStore(sceneTier);
  return (
    <group ref={ref}>
      {children}
      {quality === 'low' ? (
        <BoardPrimitive />
      ) : (
        <AssetBoundary fallback={<BoardPrimitive />}>
          <Suspense fallback={<BoardPrimitive />}>
            <BoardModel url={boardUrlFor(quality)} castShadow={shadows} />
          </Suspense>
        </AssetBoundary>
      )}
    </group>
  );
}
