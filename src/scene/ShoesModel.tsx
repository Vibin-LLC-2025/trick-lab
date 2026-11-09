import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { Mesh } from 'three';
import { SHOE_PARTS } from '../asset/shoeSpec';
import { useTrickStore } from '../store';
import { ART } from './artDirection';
import { applyAnisotropy } from './BoardModel';
import { useModel } from './gltf';
import { SHOES_URL } from './modelUrls';

/**
 * One shoe from shoes.glb (a right shoe: sole, upper, laces, three draw
 * calls). The Feet component mounts it twice and mirrors one. Same cache
 * rules as BoardModel: `dispose={null}`, nothing disposed here.
 */
export function ShoesModel({ castShadow }: { castShadow: boolean }) {
  const { nodes, materials } = useModel(SHOES_URL);
  const invalidate = useThree((s) => s.invalidate);
  const anisotropy = useTrickStore((s) => ART.quality[s.quality].anisotropy);
  useEffect(() => {
    applyAnisotropy(materials, anisotropy);
    invalidate();
  }, [invalidate, materials, anisotropy]);
  return (
    <group dispose={null}>
      {SHOE_PARTS.map(({ node }) => {
        const m = nodes[node] as Mesh | undefined;
        if (!m) throw new Error(`shoes.glb has no node "${node}"; run npm run assets`);
        return (
          <mesh
            key={node}
            name={node}
            geometry={m.geometry}
            material={m.material}
            position={m.position}
            quaternion={m.quaternion}
            scale={m.scale}
            castShadow={castShadow}
          />
        );
      })}
    </group>
  );
}
