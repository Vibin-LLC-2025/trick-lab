// ADR-55 (2026-11-09, review of Phase C): fog by the distance from the
// camera, so the plane's edge stays fogged on any stage shape (the geometry
// is checked in artDirection.test.ts and sky.test.ts). The renderers need a
// GPU, so the picture is checked in the browser (docs/PERF-BUDGET.md); here,
// the shaders' text and the wiring.
import { afterEach, describe, expect, it } from 'vitest';
import { Color, Fog, Scene, ShaderChunk, ShaderLib } from 'three';
import { NodeUpdateType, type Node } from 'three/webgpu';
import { positionView } from 'three/tsl';
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

/** Every node reachable from `root`, each once. */
function graph(root: Node): Node[] {
  const seen = new Map<string, Node>();
  const visit = (n: Node) => {
    if (seen.has(n.uuid)) return;
    seen.set(n.uuid, n);
    for (const c of n.getChildren()) visit(c);
  };
  visit(root);
  return [...seen.values()];
}

type MathLike = Node & { isMathNode?: boolean; method?: string; aNode?: Node; bNode?: Node; cNode?: Node };
type UniformLike = Node & { isUniformNode?: boolean; value: unknown; update?: (frame: unknown) => void };

describe('range fog on WebGPURenderer', () => {
  afterEach(() => setNodeFog(null));

  it("fades by the length of the fragment's view position, from the scene Fog's near to its far", () => {
    const nodes = graph(rangeFogNode()) as MathLike[];
    const lengths = nodes.filter((n) => n.isMathNode && n.method === 'length');
    expect(lengths).toHaveLength(1);
    expect(lengths[0]!.aNode!.uuid).toBe(positionView.uuid);
    const step = nodes.find((n) => n.isMathNode && n.method === 'smoothstep');
    expect(step?.cNode?.uuid).toBe(lengths[0]!.uuid);
    // Never three's view depth: no negated view z anywhere in the fog.
    expect(nodes.some((n) => n.isMathNode && n.method === 'negate')).toBe(false);
  });

  it("copies the rendered scene's Fog into its uniforms once per render, and keeps them when a scene has none", () => {
    const nodes = graph(rangeFogNode()) as UniformLike[];
    const uniforms = nodes.filter((n) => n.isUniformNode);
    const step = (nodes as MathLike[]).find((n) => n.isMathNode && n.method === 'smoothstep')!;
    const near = uniforms.find((u) => u.uuid === step.aNode!.uuid)!;
    const far = uniforms.find((u) => u.uuid === step.bNode!.uuid)!;
    const color = uniforms.find((u) => u.value instanceof Color)!;
    const updaters = uniforms.filter((u) => u.updateType === NodeUpdateType.RENDER);
    expect(updaters).toHaveLength(1);
    const scene = new Scene();
    scene.fog = new Fog('#123456', 2, 9);
    updaters[0]!.update!({ scene });
    expect((color.value as Color).getHexString()).toBe('123456');
    expect([near.value, far.value]).toEqual([2, 9]);
    scene.fog = null;
    updaters[0]!.update!({ scene });
    expect([near.value, far.value]).toEqual([2, 9]);
  });

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
