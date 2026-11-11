import { Suspense, lazy, type Ref } from 'react';
import { AssetBoundary } from './Board';
import { Legs, type LegRig } from './Legs';
import type { RiderRig } from './RiderModel';

/** The rider's model, its own lazy chunk (ADR-85): Medium and High only, so Low never fetches it. */
const RiderModel = lazy(() => import('./RiderModel').then((m) => ({ default: m.RiderModel })));

/**
 * The whole rider (ADR-85) where it shows (store riderShown): the GLB, with
 * the fading legs (Legs.tsx) standing in while it streams or if it fails.
 * A rider that fails is scenery, not a board: the tier stays (no report to
 * the store). FlightDriver poses whichever rig is mounted.
 */
export function Rider({ rig, legs, shadows }: { rig: Ref<RiderRig>; legs: Ref<LegRig>; shadows: boolean }) {
  const fallback = <Legs rig={legs} shadows={shadows} />;
  return (
    <AssetBoundary fallback={fallback} reportToStore={false}>
      <Suspense fallback={fallback}>
        <RiderModel rig={rig} shadows={shadows} />
      </Suspense>
    </AssetBoundary>
  );
}
