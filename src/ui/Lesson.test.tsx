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
  it('on Normal: says so before the game, the call sets the sliders, and the walk-through is the two presses, by keyboard', async () => {
    const user = await setup();
    expect(within(game()).getByText('Your first game walks you through your first trick.')).toBeInTheDocument();
    within(game()).getByRole('button', { name: 'Start game' }).focus();
    await user.keyboard('{Enter}');
    // The coin flip waits first (ADR-80); Enter on its Continue, where focus went.
    await user.keyboard('{Enter}');

    expect(within(game()).getByText('First game: your first trick, in 2 steps')).toBeInTheDocument();
    expect(steps()).toHaveLength(2);
    expect(now()).toHaveTextContent('Call your trick.');
    expect(announcer()).toHaveTextContent(/First game, so here is your first trick in 2 steps\. Step 1 of 2: Call your trick\.$/);

    await user.selectOptions(within(game()).getByLabelText('Call your trick'), 'kickflip');
    // The game sets the sliders for the trick (ADR-83), and says so with the call.
    expect(state()).toMatchObject({ pop: 0.35, flick: 1.9, scoop: 0 });
    expect(announcer()).toHaveTextContent('You called a kickflip. Land it and the computer has to copy it. Sliders set for a kickflip. Step 1 of 2: Press Get ready.');
    expect(steps().map((li) => li.textContent)).toEqual(['Press Get ready.', 'Press Pop! when the marker is in the green band.']);
    // No word guide and no slider numbers on Normal: the game set them.
    expect(within(game()).queryByText('How to kickflip')).toBeNull();
    expect(within(game()).queryByText(/Flick 1\.9/)).toBeNull();

    within(game()).getByRole('button', { name: 'Get ready' }).focus();
    await user.keyboard('{Enter}');
    expect(now()).toHaveTextContent('Press Pop! when the marker is in the green band.');
    expect(steps()[0]).toHaveClass('lesson__step--done');
    expect(steps()[0]).toHaveTextContent(/Done\.$/);
    // The release ends the walk-through; after it the card is the trick and one line.
    await user.keyboard('{Enter}');
    expect(state().status).toBe('playing');
    expect(within(game()).queryByText(/First game: your first trick/)).toBeNull();
    expect(within(game()).queryByText('How to kickflip')).toBeNull();
    expect(localStorage.getItem('trick-lab.skate-taught')).toBe('yes');
  });

  it('on Hard: the walk-through gives the sliders, a slider reaching them moves it on, and the word guide follows it', async () => {
    useTrickStore.setState({ skate: { ...state().skate, level: 'hard' } });
    const user = await setup();
    await user.click(within(game()).getByRole('button', { name: 'Start game' }));
    await user.click(document.getElementById('skate-notice-continue')!);
    expect(steps()).toHaveLength(3);
    await user.selectOptions(within(game()).getByLabelText('Call your trick'), 'kickflip');
    // Hard never sets the sliders (ADR-83).
    expect(state().flick).toBe(0);
    expect(now()).toHaveTextContent('Set the sliders for the kickflip: Pop 0.35 m, Flick 1.9 toward kickflip, Scoop 0.0.');
    // The Flick slider to 1.9 (jsdom does not move a range input by its arrow keys; the browser pass does).
    fireEvent.change(within(game()).getByRole('slider', { name: /^Flick/ }), { target: { value: '1.9' } });
    expect(now()).toHaveTextContent('Press Get ready, or Space, to start the bar.');
    expect(announcer()).toHaveTextContent('Step 2 of 3: Press Get ready, or Space, to start the bar.');
    within(game()).getByRole('button', { name: 'Get ready' }).focus();
    await user.keyboard('{Enter}');
    expect(now()).toHaveTextContent('Press Pop! when the marker is in the green band.');
    await user.keyboard('{Enter}');
    expect(within(game()).queryByText(/First game: your first trick/)).toBeNull();
    expect(within(game()).getByText('How to kickflip')).toBeInTheDocument();
  });

  it('can be skipped by its button, and the next game has none', async () => {
    const user = await setup();
    await user.click(within(game()).getByRole('button', { name: 'Start game' }));
    await user.click(document.getElementById('skate-notice-continue')!);
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
    await user.click(document.getElementById('skate-notice-continue')!);
    expect(screen.getByRole('heading', { level: 2, name: 'Your turn' }).closest('section')).toHaveClass('hud__turn');
    const letters = screen.getByRole('region', { name: 'Letters' });
    expect(letters).toHaveClass('hud__score');
    expect(within(letters).getByRole('button', { name: 'Slow motion' })).toBeInTheDocument();
    expect(within(letters).getByRole('button', { name: 'Computer goes on its own' })).toBeInTheDocument();
    const tray = document.querySelector('.hud__tray')!;
    expect(within(tray as HTMLElement).getAllByRole('slider')).toHaveLength(3);
    expect(within(tray as HTMLElement).getByRole('button', { name: 'Get ready' })).toBeInTheDocument();
    // The timing bar's slim strip is part of the tray, waiting for the first press (ADR-86); the sliders and Pop say which side of the stage they cover.
    expect(tray.querySelectorAll('.skate__bar')).toHaveLength(1);
    expect(tray.querySelector('.timing')).toHaveClass('timing--idle');
    expect(tray.querySelector('.hud__inputs')).toHaveAttribute('data-covers', 'left');
    expect(tray.querySelector('.hud__pop')).toHaveAttribute('data-covers', 'right');
  });
});
