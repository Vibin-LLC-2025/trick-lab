import { Suspense, lazy, useEffect, type Ref } from 'react';
import { useTrickStore } from '../store';
import { AssetBoundary } from './Board';
import { Legs, type LegRig } from './Legs';
import { noteShown } from './modelCache';
import { riderUrlFor } from './modelUrls';
import type { RiderRig } from './RiderModel';
import { sceneTier } from './sceneTier';

/** The rider's model, its own lazy chunk (ADR-85): Medium and High only, so Low never fetches it. */
const RiderModel = lazy(() => import('./RiderModel').then((m) => ({ default: m.RiderModel })));

/**
 * A rider that failed for good: the legs are final, so the loading picture
 * need not wait for the GLB (the ground's FailedGround does the same, ADR-56).
 * Without this a blocked or failed rider download left the picture over the
 * stage for ever while the fallback scene drew underneath (2026-11-13).
 */
function FailedRider({ legs, shadows }: { legs: Ref<LegRig>; shadows: boolean }) {
  const tier = useTrickStore(sceneTier);
  const url = riderUrlFor(tier === 'low' ? 'medium' : tier);
  useEffect(() => noteShown(url), [url]);
  return <Legs rig={legs} shadows={shadows} />;
}

/**
 * The whole rider (ADR-85) where it shows (store riderShown): the GLB, with
 * the fading legs (Legs.tsx) standing in while it streams or if it fails.
 * A rider that fails is scenery, not a board: the tier stays (no report to
 * the store). FlightDriver poses whichever rig is mounted.
 */
export function Rider({ rig, legs, shadows }: { rig: Ref<RiderRig>; legs: Ref<LegRig>; shadows: boolean }) {
  const fallback = <Legs rig={legs} shadows={shadows} />;
  return (
    <AssetBoundary fallback={<FailedRider legs={legs} shadows={shadows} />} reportToStore={false}>
      <Suspense fallback={fallback}>
        <RiderModel rig={rig} shadows={shadows} />
      </Suspense>
    </AssetBoundary>
  );
}
