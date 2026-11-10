import { Suspense, lazy, useCallback } from 'react';
import type { Group } from 'three';
import { useTrickStore } from '../store';
import { AssetBoundary } from './Board';
import { geo, mat } from './resources';
import { rollScenery } from './roll';
import { groundTextured } from './sceneTier';

/** The spot's model, its own lazy chunk (not part of any first visit). */
const SpotModel = lazy(() => import('./SpotModel').then((m) => ({ default: m.SpotModel })));

/**
 * The skate spot (step 14, ADR-69): a red kerb, a flat rail, a ledge and a
 * wall behind the board, with a soft shadow under each, rolling past with
 * the ground (FlightDriver moves the group, scene/roll.ts wraps it). On the
 * game screen only, on Medium and High (Low gets no new features, ADR-62).
 * Scenery: while it downloads, or if it fails, there is simply no spot, and
 * nothing is announced.
 */
export function Spot({ receiveShadow }: { receiveShadow: boolean }) {
  const shown = useTrickStore((s) => s.screen === 'skate' && groundTextured(s));
  const register = useCallback((g: Group | null) => {
    rollScenery.spot = g;
  }, []);
  if (!shown) return null;
  return (
    <group ref={register}>
      <AssetBoundary fallback={null} reportToStore={false}>
        <Suspense fallback={null}>
          <SpotModel receiveShadow={receiveShadow} />
          {/* Its shadows wait for the model, so a spot that never loads leaves none behind. Neither mesh is culled (120 triangles and a few quads): the draw count stays the ledger's whether the spot is in view or rolled off (ADR-69). */}
          <mesh geometry={geo.spotShadow} material={mat.spotShadow} renderOrder={1} frustumCulled={false} />
        </Suspense>
      </AssetBoundary>
    </group>
  );
}
