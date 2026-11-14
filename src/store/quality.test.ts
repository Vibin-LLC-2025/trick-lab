import { describe, expect, it } from 'vitest';
import { createTrickStore } from '.';
import { detectQuality, effectiveQuality, isQuality, pickQuality, probeRenderer } from './quality';

describe('pickQuality (ADR-16)', () => {
  it('gives a desktop GPU High', () => {
    expect(pickQuality({ renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)', memoryGb: 8, cores: 12 })).toBe('high');
    expect(pickQuality({ renderer: 'AMD Radeon RX 6700 XT', cores: 8 })).toBe('high');
    expect(pickQuality({ renderer: 'Apple M2' })).toBe('high');
    expect(pickQuality({ renderer: 'Intel(R) Arc(TM) A770 Graphics' })).toBe('high');
  });

  it('gives a big machine with an unknown GPU High, a plain one Medium', () => {
    expect(pickQuality({ memoryGb: 8, cores: 8 })).toBe('high');
    expect(pickQuality({ memoryGb: 8, cores: 4, renderer: 'Intel(R) Iris(R) Xe Graphics' })).toBe('medium');
    expect(pickQuality({})).toBe('medium');
  });

  it('gives built-in graphics Medium however big the machine (2026-11-13)', () => {
    for (const renderer of ['ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11)', 'Intel(R) Iris(R) Xe Graphics', 'AMD Radeon(TM) Graphics', 'AMD Radeon(TM) Vega 8 Graphics']) {
      expect(pickQuality({ renderer, memoryGb: 8, cores: 12 }), renderer).toBe('medium');
    }
  });

  it('gives Chromebooks, software renderers and small machines Low', () => {
    expect(pickQuality({ userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/120', memoryGb: 8, cores: 8 })).toBe('low');
    expect(pickQuality({ renderer: 'Google SwiftShader', memoryGb: 16, cores: 16 })).toBe('low');
    expect(pickQuality({ renderer: 'NVIDIA GeForce RTX 3060', memoryGb: 4 })).toBe('low');
    expect(pickQuality({ cores: 2 })).toBe('low');
  });

  it('gives phones and tablets Medium, never High', () => {
    expect(pickQuality({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', renderer: 'Apple GPU', memoryGb: 8, cores: 8 })).toBe('medium');
    expect(pickQuality({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', renderer: 'Adreno (TM) 740', memoryGb: 8, cores: 8 })).toBe('medium');
  });

  it('validates stored values', () => {
    expect(isQuality('high')).toBe(true);
    expect(isQuality('medium')).toBe(true);
    expect(isQuality('low')).toBe(true);
    expect(isQuality('nonsense')).toBe(false);
    expect(isQuality(null)).toBe(false);
  });

  it('probes nothing where WebGL is missing (jsdom) and falls back to Medium', () => {
    expect(probeRenderer()).toBe('');
    expect(detectQuality()).toBe('medium');
  });
});

describe('effectiveQuality (ADR-15)', () => {
  it('is the chosen tier until a model fails, then Low', () => {
    expect(effectiveQuality({ quality: 'high', boardAssetFailed: false })).toBe('high');
    expect(effectiveQuality({ quality: 'medium', boardAssetFailed: false })).toBe('medium');
    for (const quality of ['high', 'medium', 'low'] as const) expect(effectiveQuality({ quality, boardAssetFailed: true })).toBe('low');
  });

  it('a failed model leaves the saved choice alone, so it returns on the next load', () => {
    localStorage.clear();
    const store = createTrickStore();
    store.getState().setQuality('high');
    store.getState().setBoardAssetFailed();
    expect(effectiveQuality(store.getState())).toBe('low');
    expect(store.getState().quality).toBe('high');
    expect(localStorage.getItem('trick-lab.quality')).toBe('high');
    expect(effectiveQuality(createTrickStore().getState())).toBe('high');
    localStorage.clear();
  });
});
