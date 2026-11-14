import { useEffect, useImperativeHandle, useMemo, type Ref } from 'react';
import { useThree } from '@react-three/fiber';
import type { Bone, Material, SkinnedMesh } from 'three';
import { RIDER_PARTS } from '../asset/riderSpec';
import { boardRider, useTrickStore } from '../store';
import { useModel } from './gltf';
import { noteShown } from './modelCache';
import { riderUrlFor } from './modelUrls';
import { mat } from './resources';
import { dressRider, dressRiderHigh, riderHighMaterial } from './riderLook';
import { makeRiderRig } from './riderPose';
import { sceneTier } from './sceneTier';

/** The rider's bones in RIDER_BONES order (src/sim/body.ts), which FlightDriver poses every frame (ADR-85). */
export interface RiderRig {
  bones: Bone[];
}

/**
 * The whole rider from rider.glb (ADR-85): one skinned mesh, one draw call,
 * over 19 bones. The geometry and the bind matrices are the model cache's
 * (never disposed here); the bones, the skeleton and the mesh are made per
 * mount, like the legs (Legs.tsx), so a remount never shares a skeleton.
 * The bones are flat siblings of the mesh, in the rider's groups, so the
 * landing's move carries them: FlightDriver writes each one's place and turn
 * in the board's rest frame. The material is the shared mat.rider (the
 * twill, vertex colours); riderLook.ts paints the colours for whose go it
 * is. No per-frame code.
 */
export function RiderModel({ rig, shadows }: { rig: Ref<RiderRig>; shadows: boolean }) {
  // High has the detailed rider (ADR-94): MakeHuman's body on the same bones, its own textured material.
  const tier = useTrickStore(sceneTier);
  const high = tier === 'high';
  const url = riderUrlFor(tier === 'low' ? 'medium' : tier);
  const { nodes } = useModel(url);
  const source = nodes[RIDER_PARTS[0].node] as SkinnedMesh | undefined;
  if (!source?.isSkinnedMesh) throw new Error(`the rider GLB has no skinned "${RIDER_PARTS[0].node}"; run npm run assets`);
  const invalidate = useThree((s) => s.invalidate);
  // On screen: the loading picture waits for it (ADR-56).
  useEffect(() => noteShown(url), [url]);
  const computer = useTrickStore((s) => boardRider(s) === 'computer');
  const dress = high ? dressRiderHigh : dressRider;
  const built = useMemo(() => {
    // Painted before its first frame, so it never shows white.
    if (!source.geometry.getAttribute('color')) dress(source.geometry, false);
    // The detailed rider's own material (the GLB's, the model cache's): its atlas times the colours by region.
    const material: Material = high ? riderHighMaterial(source) : mat.rider;
    const r = makeRiderRig(source, material);
    return { ...r, rig: { bones: r.bones } satisfies RiderRig };
  }, [source, high, dress]);
  useImperativeHandle(rig, () => built.rig, [built]);
  useEffect(() => () => built.skeleton.dispose(), [built]);
  // Whose go it is (ADR-71): the computer's outfit on its go.
  useEffect(() => {
    dress(source.geometry, computer);
    invalidate();
  }, [source, computer, invalidate, dress]);
  return (
    <>
      {built.bones.map((b) => (
        <primitive key={b.name} object={b} dispose={null} />
      ))}
      <primitive object={built.mesh} castShadow={shadows} dispose={null} />
    </>
  );
}
