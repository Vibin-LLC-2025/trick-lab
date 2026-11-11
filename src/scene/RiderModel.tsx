import { useEffect, useImperativeHandle, useMemo, type Ref } from 'react';
import { useThree } from '@react-three/fiber';
import type { Bone, SkinnedMesh } from 'three';
import { RIDER_PARTS } from '../asset/riderSpec';
import { boardRider, useTrickStore } from '../store';
import { useModel } from './gltf';
import { noteShown } from './modelCache';
import { RIDER_URL } from './modelUrls';
import { mat } from './resources';
import { dressRider } from './riderLook';
import { makeRiderRig } from './riderPose';

/** The rider's bones in RIDER_BONES order (src/sim/body.ts), which FlightDriver poses every frame (ADR-85). */
export interface RiderRig {
  bones: Bone[];
}

/**
 * The whole rider from rider.glb (ADR-85): one skinned mesh, one draw call,
 * over 17 bones. The geometry and the bind matrices are the model cache's
 * (never disposed here); the bones, the skeleton and the mesh are made per
 * mount, like the legs (Legs.tsx), so a remount never shares a skeleton.
 * The bones are flat siblings of the mesh, in the rider's groups, so the
 * landing's move carries them: FlightDriver writes each one's place and turn
 * in the board's rest frame. The material is the shared mat.rider (the
 * twill, vertex colours); riderLook.ts paints the colours for whose go it
 * is. No per-frame code.
 */
export function RiderModel({ rig, shadows }: { rig: Ref<RiderRig>; shadows: boolean }) {
  const { nodes } = useModel(RIDER_URL);
  const source = nodes[RIDER_PARTS[0].node] as SkinnedMesh | undefined;
  if (!source?.isSkinnedMesh) throw new Error(`rider.glb has no skinned "${RIDER_PARTS[0].node}"; run npm run assets`);
  const invalidate = useThree((s) => s.invalidate);
  // On screen: the loading picture waits for it (ADR-56).
  useEffect(() => noteShown(RIDER_URL), []);
  const computer = useTrickStore((s) => boardRider(s) === 'computer');
  const built = useMemo(() => {
    // Painted before its first frame, so it never shows white.
    if (!source.geometry.getAttribute('color')) dressRider(source.geometry, false);
    const r = makeRiderRig(source, mat.rider);
    return { ...r, rig: { bones: r.bones } satisfies RiderRig };
  }, [source]);
  useImperativeHandle(rig, () => built.rig, [built]);
  useEffect(() => () => built.skeleton.dispose(), [built]);
  // Whose go it is (ADR-71): the computer's outfit on its go.
  useEffect(() => {
    dressRider(source.geometry, computer);
    invalidate();
  }, [source, computer, invalidate]);
  return (
    <>
      {built.bones.map((b) => (
        <primitive key={b.name} object={b} dispose={null} />
      ))}
      <primitive object={built.mesh} castShadow={shadows} dispose={null} />
    </>
  );
}
