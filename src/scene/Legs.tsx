import { useEffect, useImperativeHandle, useMemo, type Ref } from 'react';
import { Bone, Matrix4, Skeleton, SkinnedMesh } from 'three';
import { geo, LEG_BONES, mat } from './resources';

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
 * Both legs as two rigidly skinned meshes over one four-bone skeleton, so the
 * four moving segments cost two draw calls (shanks opaque, thighs fading
 * toward the hips) instead of four or eight. The bone inverses and the bind
 * matrix are identity: the geometry is already in each bone's own frame, so a
 * vertex lands at its bone's world transform. Built once per mount (a tier
 * change remounts the Canvas); the geometry and materials are the shared ones
 * in resources.ts and are never disposed here, only the skeleton's bone
 * texture is. No per-frame code: FlightDriver writes the bones.
 */
export function Legs({ rig, shadows }: { rig: Ref<LegRig>; shadows: boolean }) {
  const built = useMemo(() => {
    const bones = Array.from({ length: 4 }, () => new Bone());
    const skeleton = new Skeleton(
      bones,
      bones.map(() => new Matrix4()),
    );
    const mesh = (geometry: typeof geo.legsSolid, material: typeof mat.legsSolid) => {
      const m = new SkinnedMesh(geometry, material);
      m.bind(skeleton, new Matrix4());
      // The skinned bounds would be computed once from the first pose; the legs move, so never cull them.
      m.frustumCulled = false;
      return m;
    };
    return {
      bones,
      skeleton,
      solid: mesh(geo.legsSolid, mat.legsSolid),
      fade: mesh(geo.legsFade, mat.legsFade),
      rig: {
        frontThigh: bones[LEG_BONES.frontThigh]!,
        frontShank: bones[LEG_BONES.frontShank]!,
        backThigh: bones[LEG_BONES.backThigh]!,
        backShank: bones[LEG_BONES.backShank]!,
      } satisfies LegRig,
    };
  }, []);
  useImperativeHandle(rig, () => built.rig, [built]);
  useEffect(() => () => built.skeleton.dispose(), [built]);
  return (
    <>
      {built.bones.map((b, i) => (
        <primitive key={i} object={b} dispose={null} />
      ))}
      {/* Shanks cast on High like the shoes; the faded thighs do not (their shadow would be the whole thigh). */}
      <primitive object={built.solid} castShadow={shadows} dispose={null} />
      <primitive object={built.fade} dispose={null} />
    </>
  );
}
