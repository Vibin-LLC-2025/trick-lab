// ADR-56 (2026-11-09): the loading picture over the stage until the scene
// first shows the tier's real scene. The real app and the real store; the
// scene itself is stubbed (no WebGL in jsdom), so the store's stageReady is
// set here the way the scene's StageReady sets it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTrickStore } from '../store';
import { App } from './App';

vi.mock('../scene/TrickScene', () => ({ default: () => <div data-testid="scene-stub" /> }));

const still = () => document.querySelector<HTMLImageElement>('.app__still');
const types = () => useTrickStore.getState().events.map((e) => e.type);

async function setup(screenName: 'home' | 'lab' = 'home') {
  useTrickStore.setState({ screen: screenName });
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTestId('scene-stub');
  return user;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  useTrickStore.setState(useTrickStore.getInitialState(), true);
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the loading picture (ADR-56)', () => {
  it("covers the stage from the first paint with the theme's still, decorative and out of the way", async () => {
    await setup();
    const img = still()!;
    expect(img).toBeInTheDocument();
    expect(img.closest('.app__stage')).not.toBeNull();
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(img).not.toHaveAttribute('data-lifted');
    expect(img.getAttribute('src')).toMatch(/stills\/welcome-(light|dark)\.webp$/);
    act(() => useTrickStore.setState({ theme: 'dark' }));
    expect(still()!.getAttribute('src')).toMatch(/stills\/welcome-dark\.webp$/);
    act(() => useTrickStore.setState({ theme: 'light' }));
    expect(still()!.getAttribute('src')).toMatch(/stills\/welcome-light\.webp$/);
  });

  it('lifts when the scene is ready, fades, and leaves the DOM; nothing is logged or announced', async () => {
    await setup();
    const before = useTrickStore.getState().announcement;
    act(() => useTrickStore.getState().setStageReady());
    expect(still()).toHaveAttribute('data-lifted');
    fireEvent.transitionEnd(still()!);
    expect(still()).toBeNull();
    expect(types()).toEqual([]);
    expect(useTrickStore.getState().announcement).toBe(before);
  });

  it('leaves the DOM even if the fade never ends (a tab in the background)', async () => {
    await setup();
    vi.useFakeTimers();
    act(() => useTrickStore.getState().setStageReady());
    expect(still()).toHaveAttribute('data-lifted');
    act(() => vi.advanceTimersByTime(1000));
    expect(still()).toBeNull();
  });

  it('goes at once, with no fade, under reduced motion', async () => {
    await setup();
    act(() => useTrickStore.setState({ reducedMotion: true }));
    expect(still()).toBeInTheDocument();
    act(() => useTrickStore.getState().setStageReady());
    expect(still()).toBeNull();
  });

  it('lifts for good when a trick plays first, so the student sees it, even after a reset', async () => {
    const user = await setup('lab');
    await user.click(screen.getByRole('button', { name: 'Pop' }));
    expect(still()).toHaveAttribute('data-lifted');
    act(() => useTrickStore.getState().resetSession());
    expect(useTrickStore.getState().status).toBe('idle');
    expect(useTrickStore.getState().stageReady).toBe(false);
    expect(still()).toHaveAttribute('data-lifted');
  });

  it('lifts when the 3D view fails, for the stage note', async () => {
    await setup();
    act(() => useTrickStore.getState().setSceneUnavailable());
    expect(still()).toHaveAttribute('data-lifted');
  });

  it('goes if its file cannot load, leaving the stage as it was', async () => {
    await setup();
    fireEvent.error(still()!);
    expect(still()).toBeNull();
  });
});

describe('stageReady in the store (ADR-56)', () => {
  it('starts false, is set once and never undone, and is not saved', () => {
    const s = useTrickStore.getState();
    expect(s.stageReady).toBe(false);
    s.setStageReady();
    s.setStageReady();
    expect(useTrickStore.getState().stageReady).toBe(true);
    useTrickStore.getState().resetSession();
    expect(useTrickStore.getState().stageReady).toBe(true);
    expect(Object.keys(localStorage).filter((k) => k.includes('stage'))).toEqual([]);
  });
});
