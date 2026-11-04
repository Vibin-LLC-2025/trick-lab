import { Component, Suspense, lazy, type ReactNode, type Ref } from 'react';
import type { Group } from 'three';
import { useTrickStore } from '../store';
import { BoardPrimitive } from './BoardPrimitive';

/**
 * The GLB path (drei useGLTF, three-stdlib's GLTFLoader and the inlined
 * meshopt decoder, about 75 KB minified) is its own chunk, so a student on Low
 * downloads neither the loader nor the model. On High the import starts as
 * soon as this module loads, in parallel with the scene, and BoardModel's
 * module preloads the GLB the moment it arrives.
 */
const loadBoardModel = () => import('./BoardModel');
if (useTrickStore.getState().boardDetail === 'high') void loadBoardModel();
const BoardModel = lazy(() => loadBoardModel().then((m) => ({ default: m.BoardModel })));

/**
 * If the GLB cannot load (offline, blocked, corrupt), keep the primitive board
 * and tell the store, which disables the High option and announces it. Never
 * logged: the event contract has no UI events.
 */
class BoardAssetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('trick-lab: board.glb failed to load, using the primitive board.', error);
    useTrickStore.getState().setBoardAssetFailed();
  }

  render() {
    return this.state.failed ? <BoardPrimitive /> : this.props.children;
  }
}

/**
 * The skateboard. The outer group is what FlightDriver poses each frame (its
 * only per-frame writer); Board itself has no per-frame code. Inside it, the
 * detail level picks the model:
 * - High: the GLB (BoardModel), with the primitive board as the Suspense
 *   fallback while the chunk and the model stream, and as the error fallback.
 * - Low: the primitive board only (fewer draw calls and triangles, no GLB
 *   download if Low was chosen before the scene loaded). ADR-15.
 * Group origin is the deck centre; long axis X, nose +X, grip +Y, toe side +Z.
 */
export function Board({ ref }: { ref: Ref<Group> }) {
  const high = useTrickStore((s) => s.boardDetail === 'high' && !s.boardAssetFailed);
  return (
    <group ref={ref}>
      {high ? (
        <BoardAssetBoundary>
          <Suspense fallback={<BoardPrimitive />}>
            <BoardModel />
          </Suspense>
        </BoardAssetBoundary>
      ) : (
        <BoardPrimitive />
      )}
    </group>
  );
}
