import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { Mesh, MeshStandardMaterial } from 'three';
import { PARTS } from '../asset/spec';
import { useTrickStore } from '../store';
import { ART } from './artDirection';
import { preloadModel, useModel } from './gltf';
import { noteShown } from './modelCache';
import { boardUrlFor, SHOES_URL } from './modelUrls';

/**
 * Sets anisotropic filtering on every texture of a cached GLB's materials,
 * once. The textures belong to the useGLTF cache, so this sticks for the
 * page's lifetime; the tier's number comes from artDirection.
 */
export function applyAnisotropy(materials: Record<string, unknown>, anisotropy: number) {
  for (const m of Object.values(materials) as MeshStandardMaterial[]) {
    for (const map of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap]) {
      if (map && map.anisotropy !== anisotropy) {
        map.anisotropy = anisotropy;
        map.needsUpdate = true;
      }
    }
  }
}

/**
 * A board from a GLB: seven meshes, one per material, so seven draw calls.
 * Rendered from the cached asset's nodes (the gltfjsx pattern) with each
 * node's transform, which carries the KHR_mesh_quantization dequantization
 * scale and offset. `url` is the tier's file (modelUrls.ts).
 *
 * `dispose={null}`: the geometries, materials and textures belong to the
 * useGLTF cache, not to this component. Switching tiers or remounting the
 * scene must not dispose them, or the next use would render a disposed
 * asset that has to be re-uploaded (and any second user of the cache would
 * lose it). The cache lives as long as the page.
 */
export function BoardModel({ url, castShadow }: { url: string; castShadow: boolean }) {
  const { nodes, materials } = useModel(url);
  const invalidate = useThree((s) => s.invalidate);
  // On screen: the loading picture waits for it (ADR-56).
  useEffect(() => noteShown(url), [url]);
  const anisotropy = useTrickStore((s) => ART.quality[s.quality].anisotropy);
  // The demand frameloop needs one frame once the model replaces the fallback.
  useEffect(() => {
    applyAnisotropy(materials, anisotropy);
    invalidate();
  }, [invalidate, materials, anisotropy]);
  return (
    <group dispose={null}>
      {PARTS.map(({ node }) => {
        const m = nodes[node] as Mesh | undefined;
        if (!m) throw new Error(`${url} has no node "${node}"; run npm run assets`);
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

// Start parsing as soon as the scene chunk loads, in parallel with the first
// render, from the downloads TrickScene started when the 3D code arrived (ADR-48).
// Skipped when the student is on Low, so a Chromebook never fetches a model;
// switching tiers later loads on demand.
const q = useTrickStore.getState().quality;
if (q !== 'low') preloadModel(boardUrlFor(q));
if (q === 'high' && useTrickStore.getState().feetVisible) preloadModel(SHOES_URL);
