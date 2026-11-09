import { Suspense, lazy, useEffect } from 'react';
import { useTrickStore } from '../store';
import { AssetBoundary } from './Board';
import { noteShown } from './modelCache';
import { GROUND_URL } from './modelUrls';
import { geo, mat } from './resources';
import { groundTextured, sceneTier } from './sceneTier';

/**
 * The textured ground is its own lazy chunk (it shares the GLTF loader with
 * BoardModel), started at once on Medium and High so the GLB downloads in
 * parallel with the scene. A student on Low never fetches it.
 */
const loadGroundModel = () => import('./GroundModel');
// Only a prefetch: its rejection is ignored (never unhandled); the lazy
// import below asks again and a failure there reaches AssetBoundary.
if (useTrickStore.getState().quality !== 'low') loadGroundModel().catch(() => {});
const GroundModel = lazy(() => loadGroundModel().then((m) => ({ default: m.GroundModel })));

/**
 * The plain ground, the GLB's size, one draw call: on Low toon shaded with its
 * slab joints (ADR-54), on Medium and High (while the GLB streams or if it
 * fails) the concrete's mean colour.
 */
function GroundPlane({ receiveShadow }: { receiveShadow: boolean }) {
  const low = useTrickStore(sceneTier) === 'low';
  return <mesh geometry={geo.ground} material={low ? mat.toonGround : mat.ground} receiveShadow={receiveShadow} />;
}

/**
 * The pad: since the ground pass (2026-11-04, ADR-31) a concrete ground of
 * 1.6 x 1.2 m slab bays running off into the fog, with the board resting
 * centred in one bay. Replaces the slab, its edge lines and the centre mark
 * (three draw calls, now one): the bay's joints and its worn centre mark are
 * in the texture. The surface is y = 0 (src/sim/feet.ts PAD_Y assumes it).
 * - Medium and High: ground.glb, receiving the key light's shadow on High.
 * - Low, and the fallback while the GLB streams or if it fails: a plain plane
 *   of the same size. A failed ground does not count as a failed board: the
 *   board keeps its tier and nothing is announced.
 */
/** A ground that failed for good: its plane is final, so the loading picture need not wait for the GLB (ADR-56). */
function FailedGround({ receiveShadow }: { receiveShadow: boolean }) {
  useEffect(() => noteShown(GROUND_URL), []);
  return <GroundPlane receiveShadow={receiveShadow} />;
}

export function Pad({ shadows }: { shadows: boolean }) {
  const textured = useTrickStore(groundTextured);
  if (!textured) return <GroundPlane receiveShadow={shadows} />;
  return (
    <AssetBoundary fallback={<FailedGround receiveShadow={shadows} />} reportToStore={false}>
      <Suspense fallback={<GroundPlane receiveShadow={shadows} />}>
        <GroundModel receiveShadow={shadows} />
      </Suspense>
    </AssetBoundary>
  );
}
