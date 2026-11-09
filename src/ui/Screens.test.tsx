import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTrickStore } from '../store';
import { App, PREVIEW_DESCRIPTION } from './App';

// WebGL does not exist in jsdom. Everything else below is the real app and the real store.
vi.mock('../scene/TrickScene', () => ({ default: () => <div data-testid="scene-stub" /> }));

const description = () => document.getElementById('scene-description')!;
const types = () => useTrickStore.getState().events.map((e) => e.type);

async function setup() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTestId('scene-stub');
  return user;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  useTrickStore.setState(useTrickStore.getInitialState(), true);
  useTrickStore.setState({ screen: 'home' });
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('welcome screen (ADR-45)', () => {
  it('shows the title, what the app is and the two ways in, beside the preview', async () => {
    await setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Trick Lab' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Trick Lab' })).toHaveTextContent(/watch real physics turn it/);
    const play = screen.getByRole('button', { name: 'Play a game of SKATE' });
    expect(play).toHaveAccessibleDescription('Take turns with the computer. Land its tricks or take a letter. Spell SKATE and you lose.');
    const lab = screen.getByRole('button', { name: 'Practice in the lab' });
    expect(lab).toHaveAccessibleDescription('Try any trick at your own pace, in slow motion, and see what each foot does.');
    // The preview is the stage, described in words; none of the lab or game controls are here yet.
    expect(screen.getByRole('region', { name: 'Preview' })).toHaveAttribute('aria-describedby', 'scene-description');
    expect(description()).toHaveTextContent(PREVIEW_DESCRIPTION);
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pop' })).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('goes into the game by keyboard, with focus on its title and the URL following', async () => {
    const user = await setup();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Play a game of SKATE' }));
    await user.keyboard('{Enter}');
    expect(useTrickStore.getState().screen).toBe('skate');
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Game of SKATE' }));
    expect(window.location.hash).toBe('#/skate');
    expect(screen.getByRole('button', { name: 'Start game' })).toBeInTheDocument();
    // The lab's own panels are not on the game screen.
    expect(screen.queryByRole('region', { name: /^Event log/ })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Trick presets' })).toBeNull();
    // Nothing about moving between screens is logged.
    expect(types()).toEqual([]);
  });

  it('goes into the lab, across to the game and back home from the top bar', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Practice in the lab' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Practice lab' }));
    expect(window.location.hash).toBe('#/lab');
    expect(screen.getByRole('group', { name: 'Trick presets' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '3D skateboard view' })).toBeInTheDocument();

    const bar = screen.getByRole('banner');
    await user.click(within(bar).getByRole('button', { name: 'Game of SKATE' }));
    expect(useTrickStore.getState().screen).toBe('skate');

    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Home' }));
    expect(useTrickStore.getState().screen).toBe('home');
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Trick Lab' }));
    expect(window.location.hash).toBe('');
  });

  it('pauses and plays the preview from a button on the stage', async () => {
    const user = await setup();
    const pause = screen.getByRole('button', { name: 'Pause preview' });
    await user.click(pause);
    expect(useTrickStore.getState().previewPaused).toBe(true);
    expect(screen.getByRole('button', { name: 'Play preview' })).toBe(pause);
    expect(document.getElementById('announcer')).toHaveTextContent('Preview paused.');
    await user.click(pause);
    expect(useTrickStore.getState().previewPaused).toBe(false);
    // Gone where it could not play anyway, and off the other screens.
    act(() => useTrickStore.getState().setReducedMotion(true));
    expect(screen.queryByRole('button', { name: /preview$/ })).toBeNull();
    act(() => useTrickStore.getState().setReducedMotion(false));
    await user.click(screen.getByRole('button', { name: 'Practice in the lab' }));
    expect(screen.queryByRole('button', { name: /preview$/ })).toBeNull();
    localStorage.clear();
  });

  it('has the shortcuts and the theme on every screen, as buttons as well as keys', async () => {
    const user = await setup();
    for (const go of [null, 'Play a game of SKATE', 'Practice lab'] as const) {
      if (go) await user.click(screen.getByRole('button', { name: go }));
      expect(screen.getAllByRole('button', { name: 'Light theme' })).toHaveLength(1);
      const open = screen.getByRole('button', { name: /^(Keyboard shortcuts|Shortcuts)$/ });
      await user.click(open);
      expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    }
    // Each screen has exactly one main landmark and one h1.
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('tidies an unknown hash in place, without an extra Back step', async () => {
    window.history.replaceState(null, '', '/#/nowhere');
    const before = window.history.length;
    await setup();
    expect(window.location.hash).toBe('');
    expect(window.history.length).toBe(before);
  });

  it('follows the back button and an edited hash', async () => {
    await setup();
    act(() => {
      window.history.pushState(null, '', '#/lab');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(useTrickStore.getState().screen).toBe('lab');
    act(() => {
      window.history.pushState(null, '', '#/nowhere');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(useTrickStore.getState().screen).toBe('home');
    expect(window.location.hash).toBe('');
    // Already home, an edited unknown hash is tidied too.
    act(() => {
      window.history.pushState(null, '', '#/elsewhere');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(useTrickStore.getState().screen).toBe('home');
    expect(window.location.hash).toBe('');
  });

  it('answers only its own keys: no pop, preset or reset on the welcome screen', async () => {
    const user = await setup();
    await user.keyboard(' 1rp');
    expect(types()).toEqual([]);
    expect(useTrickStore.getState().perfVisible).toBe(false);
    expect(useTrickStore.getState().flight).toBeNull();
    await user.keyboard('?');
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).queryByText('1–7')).toBeNull();
    expect(within(dialog).queryByText('Space')).toBeNull();
    expect(within(dialog).getByText('Light or dark theme')).toBeInTheDocument();
  });

  it('in the game, r does not reset (it would end the game) and the presets keys do nothing', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Play a game of SKATE' }));
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    screen.getByRole('heading', { level: 2, name: 'Game of SKATE' }).focus();
    await user.keyboard('r1');
    expect(useTrickStore.getState().skate.phase).not.toBe('off');
    expect(types()).not.toContain('session.reset');
    expect(types()).not.toContain('preset.applied');
  });

  it('leaving a game in play ends it, logged as quit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.75); // the computer wins the coin flip
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Play a game of SKATE' }));
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    await user.click(screen.getByRole('button', { name: "Computer's go" }));
    expect(useTrickStore.getState().status).toBe('playing');

    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Practice lab' }));
    const s = useTrickStore.getState();
    expect(s.screen).toBe('lab');
    expect(s.skate.phase).toBe('off');
    // The trick in the air landed, after the game had ended, so it scored nothing.
    expect(s.status).toBe('done');
    expect(types().slice(-2)).toEqual(['skate.ended', 'trick.resolved']);
    expect(s.events.find((e) => e.type === 'skate.ended')?.payload.reason).toBe('quit');
    expect(types()).not.toContain('skate.set');
  });
});
