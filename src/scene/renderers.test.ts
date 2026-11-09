// ADR-50 (2026-11-09): Medium and High draw with three's WebGPURenderer, Low
// with WebGLRenderer. The two GLSL ShaderMaterials have TSL twins; both read
// the same uniform values, which FlightDriver writes, and the scene picks the
// twin for the renderer in use. The renderers themselves need a GPU, so they
// are checked in the browser (docs/PERF-BUDGET.md); here, the wiring.
import { describe, expect, it } from 'vitest';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { ShaderMaterial } from 'three';
import { QUALITY } from './artDirection';
import { footPathNodeMaterial, shadowNodeMaterial } from './nodeRenderer';
import { drawCallsOf, isNodeRenderer } from './rendererKind';
import { mat, setNodeMaterials, shaderMat, uniforms } from './resources';

describe('the renderer per tier', () => {
  it('runs the WebGPURenderer on High and Medium, WebGLRenderer on Low', () => {
    expect(QUALITY.high.renderer).toBe('webgpu');
    expect(QUALITY.medium.renderer).toBe('webgpu');
    expect(QUALITY.low.renderer).toBe('webgl');
  });

  it('tells the renderers apart and reads each one draw calls the right way', () => {
    const webgl = { info: { render: { calls: 12, triangles: 0 }, memory: { geometries: 0, textures: 0 } } };
    const webgpu = { isWebGPURenderer: true, info: { render: { calls: 9000, drawCalls: 15, triangles: 0 }, memory: { geometries: 0, textures: 0 } } };
    expect(isNodeRenderer(webgl)).toBe(false);
    expect(isNodeRenderer(webgpu)).toBe(true);
    expect(isNodeRenderer(null)).toBe(false);
    expect(drawCallsOf(webgl)).toBe(12);
    expect(drawCallsOf(webgpu)).toBe(15);
  });
});

describe('the shader materials and their TSL twins', () => {
  it('has both GLSL materials read the shared uniform values, so one write reaches every renderer', () => {
    const path = mat.footPath as ShaderMaterial;
    const shadow = mat.shadow as ShaderMaterial;
    expect(path.uniforms.uProgress).toBe(uniforms.pathProgress);
    expect(shadow.uniforms.uBoard!.value).toBe(uniforms.board);
    expect(shadow.uniforms.uBoardSize!.value).toBe(uniforms.boardSize);
    expect(shadow.uniforms.uBoardOpacity!.value).toBe(uniforms.boardOpacity);
  });

  it('builds the twins with the GLSL ones blending: transparent, no depth write, no fog; trails not tone mapped', () => {
    const path = footPathNodeMaterial();
    const shadow = shadowNodeMaterial();
    for (const m of [path, shadow]) {
      expect(m).toBeInstanceOf(MeshBasicNodeMaterial);
      expect(m.transparent).toBe(true);
      expect(m.depthWrite).toBe(false);
      expect(m.fog).toBe(false);
      expect(m.colorNode).toBeTruthy();
      expect(m.opacityNode).toBeTruthy();
    }
    expect(path.toneMapped).toBe(false);
    expect(shadow.toneMapped).toBe(true);
  });

  it('picks the GLSL material on WebGLRenderer and the twin on WebGPURenderer, once one is registered', () => {
    // Before a WebGPURenderer has registered its twins, the GLSL one is all there is.
    expect(shaderMat('footPath', false)).toBe(mat.footPath);
    expect(shaderMat('footPath', true)).toBe(mat.footPath);
    const path = footPathNodeMaterial();
    const shadow = shadowNodeMaterial();
    setNodeMaterials({ footPath: path, shadow });
    expect(shaderMat('footPath', true)).toBe(path);
    expect(shaderMat('shadow', true)).toBe(shadow);
    expect(shaderMat('shadow', false)).toBe(mat.shadow);
  });
});
