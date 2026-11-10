import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { Mesh, MeshStandardMaterial } from 'three';
import { SHOE_MATERIALS, SHOE_PARTS } from '../asset/shoeSpec';
import { boardRider, useTrickStore } from '../store';
import { ART } from './artDirection';
import { applyAnisotropy } from './BoardModel';
import { useModel } from './gltf';
import { noteShown } from './modelCache';
import { SHOES_URL } from './modelUrls';
import { dressShoe } from './riderLook';

/**
 * One shoe from shoes.glb (a right shoe: sole, upper, laces, three draw
 * calls). The Feet component mounts it twice and mirrors one. Same cache
 * rules as BoardModel: `dispose={null}`, nothing disposed here.
 */
export function ShoesModel({ castShadow }: { castShadow: boolean }) {
  const { nodes, materials } = useModel(SHOES_URL);
  const invalidate = useThree((s) => s.invalidate);
  // On screen: the loading picture waits for it (ADR-56).
  useEffect(() => noteShown(SHOES_URL), []);
  const anisotropy = useTrickStore((s) => ART.quality[s.quality].anisotropy);
  useEffect(() => {
    applyAnisotropy(materials, anisotropy);
    invalidate();
  }, [invalidate, materials, anisotropy]);
  // The computer's shoes on its go (ADR-71): soles and laces in its colour.
  const computer = useTrickStore((s) => boardRider(s) === 'computer');
  useEffect(() => {
    for (const name of [SHOE_MATERIALS.sole.name, SHOE_MATERIALS.laces.name]) {
      const m = materials[name] as MeshStandardMaterial | undefined;
      if (m) dressShoe(m, computer);
    }
    invalidate();
  }, [invalidate, materials, computer]);
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
