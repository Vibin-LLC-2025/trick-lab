/// <reference types="node" />
// The whole rider in the scene (ADR-85): the committed rider.glb, read by the
// loader the app uses (three-stdlib's, with the real meshopt decoder), rigged
// by makeRiderRig as RiderModel does and posed by applyBody as FlightDriver
// does. In the bind pose every vertex is where src/asset/rider.ts built it
// (on the deck at rest); posed, each bone carries its own vertices.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Group, MeshBasicMaterial, Vector3, type SkinnedMesh } from 'three';
import { GLTFLoader, MeshoptDecoder } from 'three-stdlib';
import { RIDER_GLB } from '../asset/spec';
import { RIDER_PARTS } from '../asset/riderSpec';
import { buildRider } from '../asset/rider';
import { BONE, newBodyPose, RIDER_BONES, writeBindPose, writeBodyPose } from '../sim/body';
import { newFeetPose, writeFeetPose } from '../sim/feet';
import { computeFlight } from '../sim/flight';
import { newLegsPose, writeLegsPose } from '../sim/legs';
import { presetById } from '../sim/tricks';
import { ART } from './artDirection';
import { applyBody, makeRiderRig, RIDER_MESH_NAME } from './riderPose';

async function loadRider(): Promise<SkinnedMesh> {
  const file = readFileSync(resolve(__dirname, '../../public', RIDER_GLB));
  const bytes = new ArrayBuffer(file.byteLength);
  new Uint8Array(bytes).set(file);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder());
  const gltf = await new Promise<{ scene: Group }>((ok, fail) => loader.parse(bytes, '', ok as never, fail));
  const mesh = gltf.scene.getObjectByName(RIDER_PARTS[0].node) as SkinnedMesh | undefined;
  expect(mesh?.isSkinnedMesh).toBe(true);
  return mesh!;
}

/** The rig in a group like FlightDriver's rider groups, moved and turned, to show the bones carry the mesh. */
async function rigged() {
  const source = await loadRider();
  const r = makeRiderRig(source, new MeshBasicMaterial());
  const group = new Group();
  group.position.set(0.3, -0.2, 1.1);
  group.rotation.y = 0.7;
  group.add(...r.bones, r.mesh);
  return { source, ...r, group };
}

/** Vertex i skinned, in the world. */
const skinned = (mesh: SkinnedMesh, i: number) =>
  mesh.applyBoneTransform(i, new Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'), i)).applyMatrix4(mesh.matrixWorld);

describe('the rider in the scene (ADR-85)', () => {
  it('reads the 17 bones from rider.glb in RIDER_BONES order, and names the mesh the stills capture waits for', async () => {
    const source = await loadRider();
    expect(source.skeleton.bones.map((b) => b.name)).toEqual([...RIDER_BONES]);
    expect(makeRiderRig(source, new MeshBasicMaterial()).mesh.name).toBe(RIDER_MESH_NAME);
    expect(readFileSync(resolve(__dirname, '../../scripts/still/capture.js'), 'utf8')).toContain(`'${RIDER_MESH_NAME}'`);
  });

  it('in the bind pose leaves every vertex where rider.ts built it, standing on the deck at rest', async () => {
    const { mesh, bones, group } = await rigged();
    applyBody(bones, writeBindPose(newBodyPose()));
    group.updateMatrixWorld(true);
    // The file's vertices are reordered and quantized, so compare the bounds, in the rider groups' frame.
    const built = buildRider().geometry;
    built.computeBoundingBox();
    const box = built.boundingBox!;
    const lo = new Vector3(Infinity, Infinity, Infinity);
    const hi = new Vector3(-Infinity, -Infinity, -Infinity);
    const toGroup = group.matrixWorld.clone().invert();
    for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) {
      const p = skinned(mesh, i).applyMatrix4(toGroup);
      lo.min(p);
      hi.max(p);
    }
    const restY = ART.board.restY;
    const pairs = [
      [lo.x, box.min.x],
      [lo.y, box.min.y + restY],
      [lo.z, box.min.z],
      [hi.x, box.max.x],
      [hi.y, box.max.y + restY],
      [hi.z, box.max.z],
    ];
    for (const [got, want] of pairs) expect(Math.abs(got! - want!)).toBeLessThan(0.002);
  });

  it('posed, moves each hand with its own bone: a vertex wholly on the hand keeps its place in the bone frame', async () => {
    const { mesh, bones, group } = await rigged();
    const joints = mesh.geometry.getAttribute('skinIndex');
    const weights = mesh.geometry.getAttribute('skinWeight');
    const hand = BONE.handR;
    let v = -1;
    for (let i = 0; i < joints.count && v < 0; i++) if (joints.getComponent(i, 0) === hand && weights.getComponent(i, 0) > 0.999) v = i;
    expect(v).toBeGreaterThanOrEqual(0);
    const inBone = () => skinned(mesh, v).applyMatrix4(bones[hand]!.matrixWorld.clone().invert());

    applyBody(bones, writeBindPose(newBodyPose()));
    group.updateMatrixWorld(true);
    const atBind = inBone();
    const before = skinned(mesh, v);

    // A kickflip near the top of its pop.
    const inputs = presetById('kickflip').inputs;
    const flight = computeFlight(inputs);
    const u = 0.45;
    const feet = writeFeetPose(newFeetPose(), inputs, flight, u, 'goofy');
    const legs = writeLegsPose(newLegsPose(), feet, flight, u, inputs, 'goofy');
    applyBody(bones, writeBodyPose(newBodyPose(), legs, feet, flight, u, inputs, 'goofy'));
    group.updateMatrixWorld(true);
    expect(inBone().distanceTo(atBind)).toBeLessThan(1e-4);
    // And it did move: the pose is not the bind.
    expect(skinned(mesh, v).distanceTo(before)).toBeGreaterThan(0.05);
  });
});
