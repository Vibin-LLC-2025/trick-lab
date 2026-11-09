import { describe, expect, it } from 'vitest';
import { isReady, readinessOf } from './rootReadiness';

const all = { stageReady: true, effectsWanted: true, modelsShown: () => true };

describe('rootReadiness', () => {
  it('keeps one record per root scene', () => {
    const a = {};
    const b = {};
    readinessOf(a).revealed = true;
    expect(readinessOf(a).revealed).toBe(true);
    expect(readinessOf(b)).toEqual({ root: 0, revealed: false, effects: false, ready: false });
  });

  it('is ready only once every startup publication is done', () => {
    const r = readinessOf({});
    expect(isReady(r, all)).toBe(false);
    r.revealed = true;
    expect(isReady(r, all)).toBe(false);
    r.effects = true;
    expect(isReady(r, all)).toBe(true);
    expect(isReady(r, { ...all, stageReady: false })).toBe(false);
    expect(isReady(r, { ...all, modelsShown: () => false })).toBe(false);
  });

  it('does not wait for effects on a tier without them', () => {
    const r = readinessOf({});
    r.revealed = true;
    expect(isReady(r, { ...all, effectsWanted: false })).toBe(true);
  });

  it('asks for the models last', () => {
    const r = readinessOf({});
    let asked = 0;
    const models = () => (asked++, true);
    isReady(r, { ...all, modelsShown: models });
    expect(asked).toBe(0);
    r.revealed = true;
    r.effects = true;
    isReady(r, { ...all, modelsShown: models });
    expect(asked).toBe(1);
  });
});
