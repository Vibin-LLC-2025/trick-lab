import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { Mesh, MeshStandardMaterial } from 'three';
import { GROUND_PARTS, PLANE } from '../asset/groundSpec';
import { useTrickStore } from '../store';
import { ART } from './artDirection';
import { applyAnisotropy } from './BoardModel';
import { preloadModel, useModel } from './gltf';
import { noteShown } from './modelCache';
import { GROUND_URL } from './modelUrls';
import { groundPerMetre, slideTexture } from './roll';

/**
 * The concrete ground from ground.glb (ADR-31): one plane, one material
 * (colour, normal and roughness maps, tiles of 4, 1 and 9 slab bays each
 * repeated by its own texture transform, ADR-40), one draw call. Same cache rules as BoardModel: `dispose={null}`, nothing disposed
 * here. Anisotropy is the tier's ground number (ART.quality), set once on
 * the cached textures.
 */
export function GroundModel({ receiveShadow }: { receiveShadow: boolean }) {
  const { nodes, materials } = useModel(GROUND_URL);
  // On screen: the loading picture waits for it (ADR-56).
  useEffect(() => noteShown(GROUND_URL), []);
  const invalidate = useThree((s) => s.invalidate);
  const anisotropy = useTrickStore((s) => ART.quality[s.quality].groundAnisotropy);
  // The demand frameloop needs one frame once the model replaces the fallback.
  useEffect(() => {
    applyAnisotropy(materials, anisotropy);
    invalidate();
  }, [invalidate, materials, anisotropy]);
  const node = GROUND_PARTS[0].node;
  const m = nodes[node] as Mesh | undefined;
  // The concrete's three maps slide with the roll (ADR-67), each by its own repeat.
  const material = m?.material as MeshStandardMaterial | undefined;
  useEffect(() => {
    if (!material) return;
    const stops = [material.map, material.normalMap, material.roughnessMap].flatMap((t) => (t ? [slideTexture(t, groundPerMetre(t.repeat.x, PLANE.x))] : []));
    return () => stops.forEach((stop) => stop());
  }, [material]);
  if (!m) throw new Error(`ground.glb has no node "${node}"; run npm run assets`);
  return (
    <group dispose={null}>
      <mesh
        name={node}
        geometry={m.geometry}
        material={m.material}
        position={m.position}
        quaternion={m.quaternion}
        scale={m.scale}
        receiveShadow={receiveShadow}
      />
    </group>
  );
}

// Start parsing as soon as this chunk loads (Pad.tsx imports it at once on
// Medium and High), from the download TrickScene started (ADR-48). Skipped on
// Low, which never fetches the ground.
if (useTrickStore.getState().quality !== 'low') preloadModel(GROUND_URL);
