// The whole rider's bones (ADR-85): the rig round rider.glb's mesh, made
// once per mount, and the pose (src/sim/body.ts) written into it, which
// FlightDriver calls every frame the rider moves, with no allocation.
import { Bone, Skeleton, SkinnedMesh, type Material } from 'three';
import { RIDER_BONES, type BodyPose } from '../sim/body';
import { ART } from './artDirection';

const REST_Y = ART.board.restY;

/** The rider's mesh in the scene graph (the GLB's node is `Body`). */
export const RIDER_MESH_NAME = 'Rider_Body';

/**
 * Each bone, in RIDER_BONES order, at its frame: the pose is in the board's
 * rest frame (y up from the deck at rest) and the bones are siblings in the
 * rider's groups, so the deck's rest height is added here, as the legs' is.
 */
export function applyBody(bones: readonly Bone[], body: BodyPose) {
  for (let i = 0; i < bones.length; i++) {
    const f = body.bones[i]!;
    const b = bones[i]!;
    b.position.set(f.o.x, REST_Y + f.o.y, f.o.z);
    b.quaternion.set(f.q.x, f.q.y, f.q.z, f.q.w);
  }
}

/**
 * A rider's own bones, skeleton and skinned mesh round rider.glb's mesh. The
 * geometry and the bind matrices are the model cache's (shared, never
 * disposed here); the bones and the skeleton are made per mount, so a remount
 * never shares a skeleton. The bones are named and ordered as RIDER_BONES,
 * the file's own order (assets:check). Attached binding with the file's bind
 * matrix: the skinning is each bone's world matrix times the file's inverse
 * bind, so the bones may sit anywhere in the scene beside the mesh.
 */
export function makeRiderRig(source: SkinnedMesh, material: Material) {
  if (source.skeleton.bones.length !== RIDER_BONES.length) throw new Error('rider.glb has the wrong number of bones; run npm run assets');
  const bones = RIDER_BONES.map((name) => {
    const b = new Bone();
    b.name = name;
    return b;
  });
  const skeleton = new Skeleton(
    bones,
    source.skeleton.boneInverses.map((m) => m.clone()),
  );
  const mesh = new SkinnedMesh(source.geometry, material);
  // Named so a browser script can tell the rider is in (scripts/still/capture.js).
  mesh.name = RIDER_MESH_NAME;
  mesh.bind(skeleton, source.bindMatrix.clone());
  // The skinned bounds would be the bind pose's; the rider moves, so never cull it.
  mesh.frustumCulled = false;
  return { bones, skeleton, mesh };
}
