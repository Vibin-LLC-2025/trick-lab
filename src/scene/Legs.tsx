import { useEffect, useImperativeHandle, useMemo, type Ref } from 'react';
import { useThree } from '@react-three/fiber';
import { Bone, Matrix4, Skeleton, SkinnedMesh } from 'three';
import { isNodeRenderer } from './rendererKind';
import { geo, LEG_BONES, mat, shaderMat } from './resources';

/**
 * The four segment groups FlightDriver poses every frame (ADR-37): each a
 * bone whose origin is the segment's proximal joint and whose +Y points down
 * the segment, the frame the shared leg geometry is built in.
 */
export interface LegRig {
  frontThigh: Bone;
  frontShank: Bone;
  backThigh: Bone;
  backShank: Bone;
}

/**
 * Both legs as one rigidly skinned mesh over one four-bone skeleton (ADR-60),
 * so the four moving segments cost one draw call: the shanks opaque, the
 * thighs fading toward the hips by a screen-door dither in the same opaque
 * material (resources.ts mat.legs, its TSL twin on the WebGPURenderer). Two
 * draws before ADR-60 (a transparent material for the thighs). The bone
 * inverses and the bind matrix are identity: the geometry is already in each
 * bone's own frame, so a vertex lands at its bone's world transform. Built
 * once per mount (a tier change remounts the Canvas); the geometry and
 * materials are the shared ones in resources.ts and are never disposed here,
 * only the skeleton's bone texture is. No per-frame code: FlightDriver writes
 * the bones.
 */
export function Legs({ rig, shadows }: { rig: Ref<LegRig>; shadows: boolean }) {
  const nodeRenderer = useThree((s) => isNodeRenderer(s.gl));
  const built = useMemo(() => {
    const bones = Array.from({ length: 4 }, () => new Bone());
    const skeleton = new Skeleton(
      bones,
      bones.map(() => new Matrix4()),
    );
    const mesh = new SkinnedMesh(geo.legs, shaderMat('legs', nodeRenderer));
    mesh.bind(skeleton, new Matrix4());
    // The skinned bounds would be computed once from the first pose; the legs move, so never cull them.
    mesh.frustumCulled = false;
    // High on WebGLRenderer: the shadow is the shanks only (the TSL twin masks its own).
    if (!nodeRenderer) mesh.customDepthMaterial = mat.legsDepth;
    return {
      bones,
      skeleton,
      mesh,
      rig: {
        frontThigh: bones[LEG_BONES.frontThigh]!,
        frontShank: bones[LEG_BONES.frontShank]!,
        backThigh: bones[LEG_BONES.backThigh]!,
        backShank: bones[LEG_BONES.backShank]!,
      } satisfies LegRig,
    };
  }, [nodeRenderer]);
  useImperativeHandle(rig, () => built.rig, [built]);
  useEffect(() => () => built.skeleton.dispose(), [built]);
  return (
    <>
      {built.bones.map((b, i) => (
        <primitive key={i} object={b} dispose={null} />
      ))}
      {/* The shanks cast on High like the shoes; the fading thighs do not (their shadow would be the whole thigh). */}
      <primitive object={built.mesh} castShadow={shadows} dispose={null} />
    </>
  );
}
