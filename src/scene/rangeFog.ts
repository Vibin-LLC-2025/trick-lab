// ADR-55 (2026-11-09, review of Phase C): the fog fades by the distance from
// the camera (range fog), not by view depth. three's Fog is
// smoothstep(near, far, view depth) on both renderers; depth is measured
// along the camera's axis, so on a wide stage a ray toward the frame's side
// meets the ground plane's edge (20 m out) only 10 m deep, part fogged,
// and the edge shows against the sky (a 2560 x 400 window, 5.5:1). By
// distance the edge is never nearer than 19 m from any allowed camera, at
// any stage shape (artDirection.test.ts, sky.test.ts), past `ART.fog.far`.
//
// WebGLRenderer (Low, and the fallback): three's four fog chunks, used by
// every built-in material, the GLBs' included, pass the view position on and
// take its length per fragment. Not per vertex: a distance is not linear
// across a triangle, and the ground is two triangles whose corners are 28 m
// away, so a per-vertex distance fogged the whole ground (seen in the
// browser). WebGPURenderer (Medium, High): its own fog node, built in
// nodeRenderer.ts (TSL lives in that chunk) and registered here, which
// TrickScene puts on the scene before the first frame; it reads the view
// position per fragment too. Both read the scene's Fog, so its colour, near
// and far stay the one source (ART.fog, per theme).
import { ShaderChunk, type Scene } from 'three';

/**
 * The edits to three's fog chunks (r187): each `from` is replaced by `to`.
 * The vertex side hands on the view position instead of the depth; the
 * fragment side declares `vFogDepth` itself, as that position's length, so
 * three's own fog factor (linear or exponential) and mix run unchanged.
 */
export const RANGE_FOG_CHUNKS = {
  fog_pars_vertex: { from: 'varying float vFogDepth;', to: 'varying vec3 vFogPosition;' },
  fog_vertex: { from: 'vFogDepth = - mvPosition.z;', to: 'vFogPosition = mvPosition.xyz;' },
  fog_pars_fragment: { from: 'varying float vFogDepth;', to: 'varying vec3 vFogPosition;' },
  fog_fragment: { from: '#ifdef USE_FOG', to: '#ifdef USE_FOG\n\n\tfloat vFogDepth = length( vFogPosition );' },
} as const;

type FogChunk = keyof typeof RANGE_FOG_CHUNKS;
let onWebGL = false;

/**
 * Range fog on WebGLRenderer: edits three's fog chunks, once, before any
 * program compiles (TrickScene calls it at module load); programs are built
 * from the chunks when first compiled, so every one has it. Returns false
 * and leaves three's depth fog if a chunk is not the shape it expects (a
 * three upgrade; rangeFog.test.ts fails then), rather than break the scene.
 */
export function rangeFogOnWebGL(): boolean {
  if (onWebGL) return true;
  const names = Object.keys(RANGE_FOG_CHUNKS) as FogChunk[];
  const stale = names.filter((n) => !ShaderChunk[n].includes(RANGE_FOG_CHUNKS[n].from));
  if (stale.length) {
    console.warn(`trick-lab: three's ${stale.join(', ')} changed; the fog stays by depth (ADR-55).`);
    return false;
  }
  for (const n of names) ShaderChunk[n] = ShaderChunk[n].replace(RANGE_FOG_CHUNKS[n].from, RANGE_FOG_CHUNKS[n].to);
  onWebGL = true;
  return true;
}

/** The WebGPURenderer's range fog node, registered when that renderer starts (nodeRenderer.ts). */
let nodeFog: Scene['fogNode'] = null;

export function setNodeFog(node: Scene['fogNode']) {
  nodeFog = node;
}

/**
 * Puts the range fog node on the scene on a WebGPURenderer (three reads
 * `scene.fogNode` before `scene.fog`); on WebGLRenderer the chunk does it,
 * and the scene keeps no node.
 */
export function applyRangeFog(scene: Scene, nodeRenderer: boolean) {
  scene.fogNode = nodeRenderer ? nodeFog : null;
}
