import { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { Mesh } from 'three';
import { BOARD_GLB, PARTS } from '../asset/spec';
import { useTrickStore } from '../store';

/** Built by `npm run assets` (scripts/build-board.ts) into public/, so Vite serves it as a static file. */
export const BOARD_URL = `${import.meta.env.BASE_URL}${BOARD_GLB}`;

// useGLTF(path, useDraco, useMeshopt). Draco is off: drei would fetch its
// decoder from a CDN, which school networks often block. The meshopt decoder
// ships inside the JS bundle (three-stdlib), so it works offline (ADR-13).
const DRACO = false;
const MESHOPT = true;

/**
 * The realistic board from the GLB: seven meshes, one per material, so seven
 * draw calls. Rendered from the cached asset's nodes (the gltfjsx pattern)
 * with each node's transform, which carries the KHR_mesh_quantization
 * dequantization scale and offset.
 *
 * `dispose={null}`: the geometries, materials and textures belong to the
 * useGLTF cache, not to this component. Switching to Low or remounting the
 * scene must not dispose them, or the next High would render a disposed
 * asset that has to be re-uploaded (and any second user of the cache would
 * lose it). The cache lives as long as the page.
 */
export function BoardModel() {
  const { nodes } = useGLTF(BOARD_URL, DRACO, MESHOPT);
  const invalidate = useThree((s) => s.invalidate);
  // The demand frameloop needs one frame once the model replaces the fallback.
  useEffect(() => invalidate(), [invalidate]);
  return (
    <group dispose={null}>
      {PARTS.map(({ node }) => {
        const m = nodes[node] as Mesh | undefined;
        if (!m) throw new Error(`board.glb has no node "${node}"; run npm run assets`);
        return (
          <mesh
            key={node}
            name={node}
            geometry={m.geometry}
            material={m.material}
            position={m.position}
            quaternion={m.quaternion}
            scale={m.scale}
          />
        );
      })}
    </group>
  );
}

// Start the download as soon as the scene chunk loads, in parallel with the
// first render. Skipped when the student chose Low, so a Chromebook on Low
// never fetches the 250 KB model; switching to High then loads it on demand.
if (useTrickStore.getState().boardDetail === 'high') useGLTF.preload(BOARD_URL, DRACO, MESHOPT);
