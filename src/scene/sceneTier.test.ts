import { describe, expect, it } from 'vitest';
import { createTrickStore, effectiveQuality } from '../store';
import { ART } from './artDirection';
import { groundTextured, rendererFor, sceneTier, shoesFromModel } from './sceneTier';

describe('scene tier (ADR-15, ADR-16)', () => {
  it('a failed board or shoe model runs the real Low renderer, with the disc, and keeps the saved High', () => {
    const store = createTrickStore(() => 0);
    store.getState().setQuality('high');
    let s = store.getState();
    expect(sceneTier(s)).toBe('high');
    expect(rendererFor(s).shadows).toBe(true);
    expect(shoesFromModel(s)).toBe(true);
    expect(groundTextured(s)).toBe(true);

    store.getState().setBoardAssetFailed();
    s = store.getState();
    // The Canvas key changes, so the context is rebuilt with Low's options.
    expect(sceneTier(s)).toBe('low');
    expect(rendererFor(s)).toBe(ART.quality.low);
    // No real shadows on Low: FlightDriver shows the shadow disc instead.
    expect(rendererFor(s).shadows).toBe(false);
    expect(rendererFor(s).dpr).toEqual(ART.quality.low.dpr);
    expect(rendererFor(s).antialias).toBe(ART.quality.low.antialias);
    expect(shoesFromModel(s)).toBe(false);
    expect(groundTextured(s)).toBe(false);
    // The View panel reads the same tier; the saved preference is untouched.
    expect(effectiveQuality(s)).toBe(sceneTier(s));
    expect(s.quality).toBe('high');
  });

  it('Medium: the board and ground models, primitive shoes, no real shadows', () => {
    const store = createTrickStore(() => 0);
    store.getState().setQuality('medium');
    const s = store.getState();
    expect(rendererFor(s)).toBe(ART.quality.medium);
    expect(rendererFor(s).shadows).toBe(false);
    expect(shoesFromModel(s)).toBe(false);
    expect(groundTextured(s)).toBe(true);
  });

  it('Low chosen: everything primitive, nothing to fail', () => {
    const store = createTrickStore(() => 0);
    store.getState().setQuality('low');
    const s = store.getState();
    expect(sceneTier(s)).toBe('low');
    expect(rendererFor(s)).toBe(ART.quality.low);
    expect(groundTextured(s)).toBe(false);
  });
});
