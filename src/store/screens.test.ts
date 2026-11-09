import { describe, expect, it } from 'vitest';
import { createTrickStore, previewAnimates, previewCanPlay, screenFromHash, screenHash, SCREENS } from '.';

const makeStore = () => {
  let t = 1000;
  return createTrickStore(
    () => (t += 10),
    () => 0.75,
  );
};
type Store = ReturnType<typeof makeStore>;
const types = (s: Store) => s.getState().events.map((e) => e.type);

describe('screens (ADR-45)', () => {
  it('maps each screen to its hash and back; anything else is home', () => {
    for (const s of SCREENS) expect(screenFromHash(screenHash(s))).toBe(s);
    expect(screenHash('home')).toBe('');
    expect(screenHash('skate')).toBe('#/skate');
    expect(screenHash('lab')).toBe('#/lab');
    expect(screenFromHash('#/somewhere')).toBe('home');
    expect(screenFromHash('#')).toBe('home');
  });

  it('a screen change asks for focus on the new heading and logs nothing', () => {
    const store = makeStore();
    store.getState().setScreen('lab');
    expect(store.getState().screen).toBe('lab');
    expect(store.getState().focusRequest?.kind).toBe('screen-heading');
    expect(types(store)).toEqual([]);
    const nonce = store.getState().focusRequest?.nonce;
    store.getState().setScreen('lab');
    expect(store.getState().focusRequest?.nonce).toBe(nonce);
  });

  it('pausing the preview is persisted and announced, not logged', () => {
    localStorage.clear();
    const store = makeStore();
    expect(store.getState().previewPaused).toBe(false);
    store.getState().togglePreview();
    expect(store.getState().previewPaused).toBe(true);
    expect(localStorage.getItem('trick-lab.preview')).toBe('paused');
    expect(store.getState().announcement.message).toBe('Preview paused.');
    expect(makeStore().getState().previewPaused).toBe(true);
    store.getState().togglePreview();
    expect(store.getState().announcement.message).toBe('Preview playing.');
    expect(types(store)).toEqual([]);
    localStorage.clear();
  });

  it('a scrub still open when the screen changes is committed, so its event is not lost', () => {
    const store = makeStore();
    store.getState().setScreen('lab');
    store.getState().applyPreset('kickflip');
    store.getState().popTrick();
    store.getState().land();
    store.getState().scrub(0.4);
    expect(store.getState().scrubFrom).toBe(1);
    store.getState().setScreen('home');
    expect(store.getState().scrubFrom).toBeNull();
    expect(store.getState().events.at(-1)).toMatchObject({ type: 'playback.scrubbed', payload: { from: 100, to: 40 } });
  });

  it('a trick in the air lands when the screen changes, so no screen inherits a flight it cannot finish', () => {
    const store = makeStore();
    store.getState().setScreen('lab');
    store.getState().applyPreset('kickflip');
    store.getState().popTrick();
    store.getState().togglePause();
    store.getState().setScreen('home');
    expect(store.getState().status).toBe('done');
    expect(store.getState().result?.id).toBe('kickflip');
    expect(types(store)).toContain('trick.resolved');
  });

  it('leaving the game ends a game in play (logged as quit) and closes a finished one', () => {
    const store = makeStore();
    store.getState().setScreen('skate');
    store.getState().startSkate();
    store.getState().setScreen('home');
    expect(store.getState().skate.phase).toBe('off');
    expect(store.getState().events.at(-1)).toMatchObject({ type: 'skate.ended', payload: { reason: 'quit' } });

    store.getState().setScreen('skate');
    store.setState({ skate: { ...store.getState().skate, phase: 'over', winner: 'you' } });
    store.getState().setScreen('lab');
    expect(store.getState().skate.phase).toBe('off');
    expect(types(store).filter((t) => t === 'skate.ended')).toHaveLength(1);
  });

  it('the preview plays only on the welcome screen, with motion, a 3D view, above the Low tier and not paused', () => {
    const base = {
      screen: 'home' as const,
      reducedMotion: false,
      sceneUnavailable: false,
      quality: 'medium' as const,
      boardAssetFailed: false,
      previewPaused: false,
    };
    expect(previewAnimates(base)).toBe(true);
    // Paused by the student (WCAG 2.2.2): still, but it could play, so the Play button stays.
    expect(previewAnimates({ ...base, previewPaused: true })).toBe(false);
    expect(previewCanPlay(base)).toBe(true);
    expect(previewCanPlay({ ...base, reducedMotion: true })).toBe(false);
    expect(previewAnimates({ ...base, screen: 'lab' })).toBe(false);
    expect(previewAnimates({ ...base, reducedMotion: true })).toBe(false);
    expect(previewAnimates({ ...base, sceneUnavailable: true })).toBe(false);
    expect(previewAnimates({ ...base, quality: 'low' })).toBe(false);
    // A failed model drops the scene to Low, so the preview holds still too.
    expect(previewAnimates({ ...base, boardAssetFailed: true })).toBe(false);
  });
});
