// ADR-55 (2026-11-09, review of Phase C): fog by the distance from the
// camera, so the plane's edge stays fogged on any stage shape (the geometry
// is checked in artDirection.test.ts and sky.test.ts). The renderers need a
// GPU, so the picture is checked in the browser (docs/PERF-BUDGET.md); here,
// the shaders' text and the wiring.
import { afterEach, describe, expect, it } from 'vitest';
import { Scene, ShaderChunk, ShaderLib } from 'three';
import { rangeFogNode } from './nodeRenderer';
import { applyRangeFog, RANGE_FOG_CHUNKS, rangeFogOnWebGL, setNodeFog } from './rangeFog';

/** A built-in material's shader with its #include lines expanded from ShaderChunk, as WebGLRenderer does. */
const resolve = (src: string): string =>
  src.replace(/^[ \t]*#include +<([\w\d.]+)>/gm, (_, name: string) => resolve(ShaderChunk[name as keyof typeof ShaderChunk]));

describe('range fog on WebGLRenderer', () => {
  // three's own chunks, before the edit (this file never loads TrickScene, which makes it).
  const original = Object.fromEntries(Object.keys(RANGE_FOG_CHUNKS).map((n) => [n, ShaderChunk[n as keyof typeof ShaderChunk]]));

  it("edits three's four fog chunks, from the shape this three has, once", () => {
    for (const [n, { from }] of Object.entries(RANGE_FOG_CHUNKS)) expect(original[n]).toContain(from);
    expect(rangeFogOnWebGL()).toBe(true);
    const once = Object.keys(RANGE_FOG_CHUNKS).map((n) => ShaderChunk[n as keyof typeof ShaderChunk]);
    expect(rangeFogOnWebGL()).toBe(true);
    expect(Object.keys(RANGE_FOG_CHUNKS).map((n) => ShaderChunk[n as keyof typeof ShaderChunk])).toEqual(once);
  });

  it('hands on the view position per vertex and takes its length per fragment, never a per-vertex distance', () => {
    rangeFogOnWebGL();
    expect(ShaderChunk.fog_vertex).toContain('vFogPosition = mvPosition.xyz;');
    expect(ShaderChunk.fog_vertex).not.toContain('vFogDepth');
    for (const chunk of [ShaderChunk.fog_pars_vertex, ShaderChunk.fog_pars_fragment]) {
      expect(chunk).toContain('varying vec3 vFogPosition;');
      expect(chunk).not.toContain('vFogDepth');
    }
    // The fragment declares the distance before three's own fog factor reads it.
    const f = ShaderChunk.fog_fragment;
    expect(f.indexOf('float vFogDepth = length( vFogPosition );')).toBeGreaterThan(-1);
    expect(f.indexOf('float vFogDepth = length( vFogPosition );')).toBeLessThan(f.indexOf('smoothstep( fogNear, fogFar, vFogDepth )'));
    expect(f.replace('\n\n\tfloat vFogDepth = length( vFogPosition );', '')).toBe(original.fog_fragment);
  });

  it('reaches every built-in material with fog, after its view position is known, and reads it in the fragment', () => {
    rangeFogOnWebGL();
    const fogged = Object.entries(ShaderLib).filter(([, s]) => s.vertexShader.includes('#include <fog_vertex>'));
    expect(fogged.map(([k]) => k)).toEqual(expect.arrayContaining(['standard', 'physical', 'toon', 'basic', 'lambert', 'phong']));
    for (const [, s] of fogged) {
      const vertex = resolve(s.vertexShader);
      const fragment = resolve(s.fragmentShader);
      const at = vertex.indexOf('vFogPosition = mvPosition.xyz;');
      expect(at).toBeGreaterThan(vertex.indexOf('mvPosition = modelViewMatrix'));
      expect(vertex).toContain('varying vec3 vFogPosition;');
      expect(fragment).toContain('varying vec3 vFogPosition;');
      expect(fragment).toContain('float vFogDepth = length( vFogPosition );');
      expect(fragment).not.toContain('varying float vFogDepth');
    }
  });
});

describe('range fog on WebGPURenderer', () => {
  afterEach(() => setNodeFog(null));

  it('builds a fog node, and puts the registered one on the scene of a node renderer only', () => {
    const node = rangeFogNode();
    expect(node.isNode).toBe(true);
    setNodeFog(node);
    const scene = new Scene();
    applyRangeFog(scene, true);
    expect(scene.fogNode).toBe(node);
    applyRangeFog(scene, false);
    expect(scene.fogNode).toBeNull();
  });
});
