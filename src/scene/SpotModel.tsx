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
 * The skate spot from spot.glb (step 14, ADR-69): one mesh, one material
 * (vertex-colour paint over a concrete map and its normal map), one draw
 * call. Its own lazy chunk, fetched when the game screen first shows on
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
  const node = SPOT_PARTS[0].node;
  const m = nodes[node] as Mesh | undefined;
  if (!m) throw new Error(`spot.glb has no node "${node}"; run npm run assets`);
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
        frustumCulled={false}
      />
    </group>
  );
}
