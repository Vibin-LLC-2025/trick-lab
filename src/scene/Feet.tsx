import { Suspense, lazy, useEffect, type Ref } from 'react';
import { useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { boardRider, useTrickStore } from '../store';
import { AssetBoundary } from './Board';
import { geo, mat } from './resources';
import { dressShoe } from './riderLook';
import { sceneTier, shoesFromModel } from './sceneTier';

const ShoesModel = lazy(() => import('./ShoesModel').then((m) => ({ default: m.ShoesModel })));

/**
 * The primitive shoe: the footprint sole and the silhouette upper (Low,
 * Medium, and the fallback on High; ADR-39). Two draw calls. Toon shaded on
 * Low (ADR-54).
 */
export function ShoePrimitive() {
  const low = useTrickStore(sceneTier) === 'low';
  // The computer's sole on its go (ADR-71), above Low (frozen, ADR-62). A shared material: both shoes take it at once.
  const computer = useTrickStore((s) => boardRider(s) === 'computer');
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (low) return;
    dressShoe(mat.shoeSole, computer);
    invalidate();
  }, [low, computer, invalidate]);
  return (
    <group>
      <mesh geometry={geo.shoeSole} material={low ? mat.toonSole : mat.shoeSole} />
      <mesh geometry={geo.shoeUpper} material={low ? mat.toonUpper : mat.shoeUpper} />
    </group>
  );
}

/**
 * One shoe: the GLB on High (with the primitive as the streaming and error
 * fallback), the primitive otherwise. `mirror` turns the right shoe into the
 * left one by flipping its width axis; three renders a negative-determinant
 * transform with the winding reversed, so the faces stay outward.
 */
function Shoe({ ref, mirror, shadows }: { ref: Ref<Group>; mirror: boolean; shadows: boolean }) {
  const high = useTrickStore(shoesFromModel);
  return (
    <group ref={ref}>
      <group scale={[1, 1, mirror ? -1 : 1]}>
        {high ? (
          <AssetBoundary fallback={<ShoePrimitive />}>
            <Suspense fallback={<ShoePrimitive />}>
              <ShoesModel castShadow={shadows} />
            </Suspense>
          </AssetBoundary>
        ) : (
          <ShoePrimitive />
        )}
      </group>
    </group>
  );
}

/**
 * The rider's feet (ADR-17). Two outer groups that FlightDriver poses every
 * frame from the feet model (src/sim/feet.ts). Goofy (ADR-24, the default):
 * the front foot is the right shoe (unmirrored), the back foot the left
 * (mirrored). Regular (ADR-25): the front foot is the left shoe, the back
 * the right. No per-frame code here.
 */
export function Feet({ front, back, shadows }: { front: Ref<Group>; back: Ref<Group>; shadows: boolean }) {
  const regular = useTrickStore((s) => s.stance === 'regular');
  return (
    <>
      <Shoe ref={front} mirror={regular} shadows={shadows} />
      <Shoe ref={back} mirror={!regular} shadows={shadows} />
    </>
  );
}
