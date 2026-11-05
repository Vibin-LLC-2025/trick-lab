import { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { Mesh } from 'three';
import { GROUND_PARTS } from '../asset/groundSpec';
import { useTrickStore } from '../store';
import { ART } from './artDirection';
import { applyAnisotropy, DRACO, MESHOPT } from './BoardModel';
import { GROUND_URL } from './modelUrls';

/**
 * The concrete ground from ground.glb (ADR-31): one plane, one material
 * (colour, normal and roughness maps of one slab bay, repeated), one draw
 * call. Same cache rules as BoardModel: `dispose={null}`, nothing disposed
 * here. Anisotropy is the tier's ground number (ART.quality), set once on
 * the cached textures.
 */
export function GroundModel({ receiveShadow }: { receiveShadow: boolean }) {
  const { nodes, materials } = useGLTF(GROUND_URL, DRACO, MESHOPT);
  const invalidate = useThree((s) => s.invalidate);
  const anisotropy = useTrickStore((s) => ART.quality[s.quality].groundAnisotropy);
  // The demand frameloop needs one frame once the model replaces the fallback.
  useEffect(() => {
    applyAnisotropy(materials, anisotropy);
    invalidate();
  }, [invalidate, materials, anisotropy]);
  const node = GROUND_PARTS[0].node;
  const m = nodes[node] as Mesh | undefined;
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

// Start the download as soon as this chunk loads (Pad.tsx imports it at once
// on Medium and High). Skipped on Low, which never fetches the ground.
if (useTrickStore.getState().quality !== 'low') useGLTF.preload(GROUND_URL, DRACO, MESHOPT);
