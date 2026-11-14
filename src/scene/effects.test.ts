// ADR-51 (2026-11-09): post-processing on the WebGPURenderer. The pipeline
// needs a GPU, so the picture is checked in the browser (PERF-BUDGET.md);
// here, which tier runs what, when motion blur runs, and that the effects
// build and free themselves for each tier that has them.
import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { MeshBasicNodeMaterial, QuadMesh, RTTNode } from 'three/webgpu';
import DenoiseNode from 'three/examples/jsm/tsl/display/DenoiseNode.js';
import { createTrickStore } from '../store';
import { ART } from './artDirection';
import { blurTaps, createEffects, NDC_TO_UV } from './effects';
import { effectsFor, motionBlurOn } from './sceneTier';

describe('the effects per tier', () => {
  it('runs half-resolution occlusion on High and Medium, the glow and motion blur on High, nothing on Low', () => {
    expect(ART.post.tiers.high).toEqual({ ao: 0.5, motionBlur: true, glow: true });
    expect(ART.post.tiers.medium).toEqual({ ao: 0.5, motionBlur: false, glow: false });
    expect(ART.post.tiers.low).toBeNull();
  });

  it('follows the tier in use, so a failed model drops them with the renderer', () => {
    const store = createTrickStore(() => 0);
    store.getState().setQuality('high');
    expect(effectsFor(store.getState())).toBe(ART.post.tiers.high);
    store.getState().setBoardAssetFailed();
    expect(effectsFor(store.getState())).toBeNull();
  });

  it("frees the occlusion's denoise and its render target with the rest, once each (2026-11-13 review, C-08)", () => {
    const denoiseFreed = vi.spyOn(DenoiseNode.prototype, 'dispose');
    const targetFreed = vi.spyOn(RTTNode.prototype, 'dispose');
    try {
      for (const tier of [ART.post.tiers.high!, ART.post.tiers.medium!]) {
        denoiseFreed.mockClear();
        targetFreed.mockClear();
        createEffects({} as never, new Scene(), new PerspectiveCamera(), tier).dispose();
        expect(denoiseFreed).toHaveBeenCalledTimes(1);
        expect(targetFreed).toHaveBeenCalledTimes(1);
      }
    } finally {
      denoiseFreed.mockRestore();
      targetFreed.mockRestore();
    }
  });

  it('builds and frees the effects for each tier that has them, without a GPU', () => {
    for (const tier of [ART.post.tiers.high!, ART.post.tiers.medium!]) {
      const effects = createEffects({} as never, new Scene(), new PerspectiveCamera(), tier);
      expect(typeof effects.render).toBe('function');
      effects.setMotionBlur(true);
      effects.setMotionBlur(false);
      expect(() => effects.dispose()).not.toThrow();
    }
  });
});

// Review of Phase B (2026-11-09): the blur followed the mirrored diagonal and brightened still pixels.
describe('the motion blur itself', () => {
  it('keeps a still picture as bright as it was: equal weights summing to 1', () => {
    for (const n of [1, 2, 12, 16]) {
      const taps = blurTaps(n);
      expect(taps).toHaveLength(n);
      expect(taps.reduce((sum, t) => sum + t.weight, 0)).toBeCloseTo(1, 12);
    }
    // At zero velocity every tap reads the pixel itself: the result is that pixel, unchanged.
    const still = 0.42;
    expect(blurTaps(ART.post.motionBlur.samples).reduce((sum, t) => sum + still * t.weight, 0)).toBeCloseTo(still, 12);
  });

  it('spreads the taps evenly along the motion, centred on the pixel, from half a frame behind to half ahead', () => {
    const taps = blurTaps(ART.post.motionBlur.samples).map((t) => t.at);
    expect(taps[0]).toBe(-0.5);
    expect(taps.at(-1)).toBe(0.5);
    expect(taps.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 12);
    for (let i = 0; i < taps.length; i++) expect(taps[i]).toBeCloseTo(-taps[taps.length - 1 - i]!, 12);
    expect(blurTaps(1)).toEqual([{ at: 0, weight: 1 }]);
  });

  it("maps NDC motion onto three's full-screen UVs, which run down the screen", () => {
    // three's quad: each vertex's UV from its NDC position. A diagonal up and to the
    // right on screen is +x +y in NDC and +x -y in these UVs, so the blur must flip y.
    const quad = new QuadMesh(new MeshBasicNodeMaterial());
    const pos = quad.geometry.getAttribute('position');
    const uvs = quad.geometry.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      expect(uvs.getX(i)).toBeCloseTo(pos.getX(i) * NDC_TO_UV[0] + 0.5, 12);
      expect(uvs.getY(i)).toBeCloseTo(pos.getY(i) * NDC_TO_UV[1] + 0.5, 12);
    }
    const upRight = [0.2, 0.2];
    expect([upRight[0]! * NDC_TO_UV[0], upRight[1]! * NDC_TO_UV[1]]).toEqual([0.1, -0.1]);
  });
});

describe('when motion blur runs', () => {
  const playing = (patch: Record<string, unknown> = {}) => {
    const store = createTrickStore(() => 0);
    store.getState().setQuality('high');
    return { ...store.getState(), status: 'playing' as const, rate: 1, reducedMotion: false, ...patch };
  };

  it('runs while a trick plays at normal speed on High with the switch on', () => {
    expect(motionBlurOn(playing())).toBe(true);
  });

  it.each([
    ['in slow motion', { rate: 0.5 }],
    ['while paused', { status: 'paused' }],
    ['before a pop or after the landing', { status: 'idle' }],
    ['under reduced motion', { reducedMotion: true }],
    ['with the switch off', { motionBlur: false }],
    ['on Medium', { quality: 'medium' }],
    ['on Low', { quality: 'low' }],
  ])('stops %s', (_name, patch) => {
    expect(motionBlurOn(playing(patch))).toBe(false);
  });
});
