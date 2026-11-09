// ADR-51 (2026-11-09): post-processing on the WebGPURenderer. The pipeline
// needs a GPU, so the picture is checked in the browser (PERF-BUDGET.md);
// here, which tier runs what, when motion blur runs, and that the effects
// build and free themselves for each tier that has them.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { createTrickStore } from '../store';
import { ART } from './artDirection';
import { createEffects } from './effects';
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
