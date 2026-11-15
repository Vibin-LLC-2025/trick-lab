import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { Mesh } from 'three';
import { SPOT_PARTS } from '../asset/spotSpec';
import { useTrickStore } from '../store';
import { ART } from './artDirection';
import { applyAnisotropy } from './BoardModel';
import { useModel } from './gltf';
import { SPOT_URL } from './modelUrls';

/**
 * The skate spot from spot.glb (step 14, ADR-69): two meshes since ADR-102,
 * the concrete (vertex-colour paint over a concrete map and its normal map)
 * and the steel (the rail and the ledge's angle), one draw call each. Its own lazy chunk, fetched when the game screen first shows on
 * Medium or High, so no first visit downloads it. Same cache rules as
 * GroundModel: `dispose={null}`, nothing disposed here.
 */
export function SpotModel({ receiveShadow }: { receiveShadow: boolean }) {
  const { nodes, materials } = useModel(SPOT_URL);
  const invalidate = useThree((s) => s.invalidate);
  const anisotropy = useTrickStore((s) => ART.quality[s.quality].groundAnisotropy);
  // The demand frameloop needs one frame once the model arrives.
  useEffect(() => {
    applyAnisotropy(materials, anisotropy);
    invalidate();
  }, [invalidate, materials, anisotropy]);
  const meshes = SPOT_PARTS.map(({ node }) => {
    const m = nodes[node] as Mesh | undefined;
    if (!m) throw new Error(`spot.glb has no node "${node}"; run npm run assets`);
    return m;
  });
  return (
    <group dispose={null}>
      {meshes.map((m) => (
        <mesh
          key={m.name}
          name={m.name}
          geometry={m.geometry}
          material={m.material}
          position={m.position}
          quaternion={m.quaternion}
          scale={m.scale}
          receiveShadow={receiveShadow}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
