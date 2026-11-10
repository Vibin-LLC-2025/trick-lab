// ADR-50 (2026-11-09): Medium and High draw with three's WebGPURenderer, Low
// with WebGLRenderer. The two GLSL ShaderMaterials have TSL twins; both read
// the same uniform values, which FlightDriver writes, and the scene picks the
// twin for the renderer in use. The renderers themselves need a GPU, so they
// are checked in the browser (docs/PERF-BUDGET.md); here, the wiring.
import { describe, expect, it } from 'vitest';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { ShaderMaterial } from 'three';
import { QUALITY } from './artDirection';
import { dustNodeMaterial, footPathNodeMaterial, legsNodeMaterial, shadowNodeMaterial } from './nodeRenderer';
import { drawCallsOf, isNodeRenderer } from './rendererKind';
import { disposeSharedResources, mat, setNodeMaterials, shaderMat, uniforms } from './resources';

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

  it('builds the legs twin opaque, with the dither as its alpha test and a shadow mask (ADR-60)', () => {
    const legs = legsNodeMaterial();
    expect(legs).toBeInstanceOf(MeshStandardNodeMaterial);
    expect(legs.transparent).toBe(false);
    expect(legs.depthWrite).toBe(true);
    expect(legs.vertexColors).toBe(true);
    expect(legs.roughness).toBe(mat.legs.roughness);
    expect(legs.alphaTestNode).toBeTruthy();
    expect(legs.maskShadowNode).toBeTruthy();
  });

  it('picks the GLSL material on WebGLRenderer and the twin on WebGPURenderer, once one is registered', () => {
    // Before a WebGPURenderer has registered its twins, the GLSL one is all there is.
    expect(shaderMat('footPath', false)).toBe(mat.footPath);
    expect(shaderMat('footPath', true)).toBe(mat.footPath);
    const path = footPathNodeMaterial();
    const shadow = shadowNodeMaterial();
    const legs = legsNodeMaterial();
    const dust = dustNodeMaterial();
    setNodeMaterials({ footPath: path, shadow, legs, dust }, {});
    expect(shaderMat('footPath', true)).toBe(path);
    expect(shaderMat('shadow', true)).toBe(shadow);
    expect(shaderMat('shadow', false)).toBe(mat.shadow);
    expect(shaderMat('legs', true)).toBe(legs);
    expect(shaderMat('legs', false)).toBe(mat.legs);
    expect(shaderMat('dust', true)).toBe(dust);
    expect(shaderMat('dust', false)).toBe(mat.dust);
  });

  it('gives the dust the same plain material on both renderers, and keeps its twin out of the occlusion (ADR-74)', () => {
    const dust = dustNodeMaterial();
    expect(dust.transparent).toBe(true);
    expect(dust.depthWrite).toBe(false);
    expect(dust.vertexColors).toBe(true);
    expect(dust.side).toBe(mat.dust.side);
    expect(dust.color.getHex()).toBe(mat.dust.color.getHex());
    // Its own normal output for the effects' scene pass: none (no alpha), so the ground's stays.
    expect(dust.mrtNode).toBeTruthy();
  });

  it('frees the shared resources with each Canvas, and the twins only with the renderer that registered them', () => {
    const older = {};
    const newer = {};
    const twins = () => ({ footPath: footPathNodeMaterial(), shadow: shadowNodeMaterial(), legs: legsNodeMaterial(), dust: dustNodeMaterial() });
    const disposed = (m: { addEventListener: (t: 'dispose', f: () => void) => void }) => {
      let n = 0;
      m.addEventListener('dispose', () => n++);
      return () => n;
    };
    // A tier change: the next Canvas's renderer registers its twins before the old Canvas has unmounted.
    setNodeMaterials(twins(), older);
    const set = twins();
    setNodeMaterials(set, newer);
    const sky = disposed(mat.sky);
    const legs = disposed(set.legs);
    disposeSharedResources(older);
    // The shared materials go with every Canvas (a renderer's dispose listeners on them hold its programs).
    expect(sky()).toBe(1);
    // The newer renderer's twins stay.
    expect(legs()).toBe(0);
    expect(shaderMat('legs', true)).toBe(set.legs);
    disposeSharedResources(newer);
    expect(legs()).toBe(1);
    expect(shaderMat('legs', true)).toBe(mat.legs);
  });
});
