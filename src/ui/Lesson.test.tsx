import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTrickStore } from '../store';
import { App } from './App';

// WebGL does not exist in jsdom. Everything else below is the real app and the real store.
vi.mock('../scene/TrickScene', () => ({ default: () => <div data-testid="scene-stub" /> }));

const announcer = () => document.getElementById('announcer')!;
const game = () => screen.getByRole('main', { name: 'Game' });
const state = () => useTrickStore.getState();
const steps = () => within(game()).getAllByRole('listitem');
const now = () => steps().find((li) => li.getAttribute('aria-current') === 'step');

async function setup() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTestId('scene-stub');
  return user;
}

beforeEach(() => {
  useTrickStore.setState(useTrickStore.getInitialState(), true);
  // A device that has never played, on the game screen. The computer waits for its button.
  useTrickStore.setState({ screen: 'skate', skateAuto: false, skateTaught: false });
  localStorage.clear();
  // 0.25 wins the coin flip for the player.
  vi.spyOn(Math, 'random').mockReturnValue(0.25);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the first game's walk-through on the game screen (ADR-66)", () => {
  it('says so before the game, then walks the first go by keyboard: call, set the slider, and the prompt moves on', async () => {
    const user = await setup();
    expect(within(game()).getByText('Your first game walks you through your first trick.')).toBeInTheDocument();
    within(game()).getByRole('button', { name: 'Start game' }).focus();
    await user.keyboard('{Enter}');

    expect(within(game()).getByText('First game: your first trick, in 3 steps')).toBeInTheDocument();
    expect(steps()).toHaveLength(3);
    expect(now()).toHaveTextContent('Call the kickflip, then set the sliders for the kickflip: Pop 0.35 m, Flick 1.9 toward kickflip, Scoop 0.0.');
    expect(now()).toHaveClass('lesson__step--now');
    expect(announcer()).toHaveTextContent(/First game, so here is your first trick in 3 steps\. Step 1 of 3: Call the kickflip/);

    await user.selectOptions(within(game()).getByLabelText('Call your trick'), 'kickflip');
    expect(now()).toHaveTextContent('Set the sliders for the kickflip: Pop 0.35 m, Flick 1.9 toward kickflip, Scoop 0.0.');
    // In place of the trick guide until the first pop.
    expect(within(game()).queryByText('How to kickflip')).toBeNull();

    // The Flick slider to 1.9 (jsdom does not move a range input by its arrow keys; the browser pass does).
    fireEvent.change(within(game()).getByRole('slider', { name: /^Flick/ }), { target: { value: '1.9' } });
    expect(state().flick).toBe(1.9);
    expect(now()).toHaveTextContent('Press Pop, or Space, to start the bar.');
    expect(steps()[0]).toHaveClass('lesson__step--done');
    expect(steps()[0]).toHaveTextContent(/Done\.$/);
    expect(announcer()).toHaveTextContent('Step 2 of 3: Press Pop, or Space, to start the bar.');

    // Pop starts the bar: the third prompt.
    within(game()).getByRole('button', { name: 'Pop' }).focus();
    await user.keyboard('{Enter}');
    expect(now()).toHaveTextContent('Press Pop again when the marker is in the band.');
    // The release ends the walk-through, and the guide takes its place.
    await user.keyboard('{Enter}');
    expect(state().status).toBe('playing');
    expect(within(game()).queryByText(/First game: your first trick/)).toBeNull();
    expect(within(game()).getByText('How to kickflip')).toBeInTheDocument();
    expect(localStorage.getItem('trick-lab.skate-taught')).toBe('yes');
  });

  it('can be skipped by its button, and the next game has none', async () => {
    const user = await setup();
    await user.click(within(game()).getByRole('button', { name: 'Start game' }));
    await user.click(within(game()).getByRole('button', { name: 'Skip the walk-through' }));
    expect(within(game()).queryByText(/First game: your first trick/)).toBeNull();
    expect(announcer()).toHaveTextContent('Walk-through skipped.');
    expect(state().skateTaught).toBe(true);
    expect(state().events.map((e) => e.type)).toEqual(['skate.started']);
  });
});

describe('the game over the stage (ADR-66)', () => {
  it('is a heads-up display: the turn card, the letters with the game\'s switches, the tray with the sliders and Pop, and the last trick', async () => {
    useTrickStore.setState({ skateTaught: true });
    const user = await setup();
    // Between games, how to play sits where the turn card will be.
    expect(screen.getByRole('heading', { level: 2, name: 'How to play' }).closest('section')).toHaveClass('hud__turn');
    await user.click(within(game()).getByRole('button', { name: 'Start game' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Your turn' }).closest('section')).toHaveClass('hud__turn');
    const letters = screen.getByRole('region', { name: 'Letters' });
    expect(letters).toHaveClass('hud__score');
    expect(within(letters).getByRole('button', { name: 'Slow motion' })).toBeInTheDocument();
    expect(within(letters).getByRole('button', { name: 'Computer goes on its own' })).toBeInTheDocument();
    const tray = document.querySelector('.hud__tray')!;
    expect(within(tray as HTMLElement).getAllByRole('slider')).toHaveLength(3);
    expect(within(tray as HTMLElement).getByRole('button', { name: 'Pop' })).toBeInTheDocument();
    expect(tray.querySelector('.skate__bar')).not.toBeNull();
  });
});
