import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTrickStore } from '../store';
import { App } from './App';

// WebGL does not exist in jsdom. Everything else below is the real app and the real store.
vi.mock('../scene/TrickScene', () => ({ default: () => <div data-testid="scene-stub" /> }));

const announcer = () => document.getElementById('announcer')!;
const panel = () => screen.getByRole('region', { name: /^Game of SKATE/ });
/** Stands in for FlightDriver, which is inside the stubbed canvas: the board reached progress 1. */
const landNow = () => act(() => useTrickStore.getState().land());

async function setup() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTestId('scene-stub');
  return user;
}

beforeEach(() => {
  useTrickStore.setState(useTrickStore.getInitialState(), true);
  localStorage.clear();
  // 0.25 makes the computer hit its aim (skate.test.ts) and pick the heelflip first on Normal.
  vi.spyOn(Math, 'random').mockReturnValue(0.25);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('game of SKATE panel', () => {
  it('explains the game, picks a level and starts by keyboard, with focus on the game', async () => {
    const user = await setup();
    expect(within(panel()).getByText(/Spell S K A T E and you lose\./)).toBeInTheDocument();
    const normal = within(panel()).getByRole('radio', { name: 'Normal' });
    expect(normal).toBeChecked();
    normal.focus();
    await user.keyboard('{ArrowRight}');
    expect(within(panel()).getByRole('radio', { name: 'Hard' })).toBeChecked();
    expect(within(panel()).getByText(/calls every named trick/)).toBeInTheDocument();

    within(panel()).getByRole('button', { name: 'Start game' }).focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Game of SKATE' }));
    expect(announcer()).toHaveTextContent('Game of SKATE started, hard level.');
    expect(within(panel()).getByRole('button', { name: 'Quit game' })).toBeInTheDocument();
    expect(within(panel()).queryByRole('radio')).toBeNull();
    // Both players start clean; the letters read as text.
    expect(within(panel()).getAllByText('no letters')).toHaveLength(2);
    // Presets stay focusable but are off, and say why.
    const kickflip = screen.getByRole('button', { name: /^Kickflip/ });
    expect(kickflip).toHaveAttribute('aria-disabled', 'true');
    expect(kickflip).toHaveAccessibleDescription('Presets are off during a game of SKATE.');
  });

  it("runs the computer's go on Space, then the student's copy on the Pop button", async () => {
    const user = await setup();
    within(panel()).getByRole('button', { name: 'Start game' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: "Computer's go" })).toBeInTheDocument();

    // Focus is on the heading, so Space is the global pop: the computer goes.
    await user.keyboard(' ');
    expect(useTrickStore.getState().flightBy).toBe('computer');
    expect(within(panel()).getByText('The computer is going for a heelflip.')).toBeInTheDocument();
    landNow();
    expect(screen.getByText('Computer: Heelflip landed')).toBeInTheDocument();
    expect(within(panel()).getByText("Copy the computer's heelflip: set the sliders, then press Pop.")).toBeInTheDocument();
    expect(announcer()).toHaveTextContent("The computer landed a heelflip. Copy the computer's heelflip");

    // The student pops a plain ollie: the wrong trick, so the first letter.
    const popButton = screen.getByRole('button', { name: 'Pop' });
    popButton.focus();
    await user.keyboard('{Enter}');
    landNow();
    // The tiles are decorative; the hidden text reads the letters.
    expect(within(panel()).getByText('S', { selector: '.visually-hidden' })).toBeInTheDocument();
    expect(within(panel()).getByText('You landed an ollie, but the trick to copy was a heelflip. You got S.')).toBeInTheDocument();
    expect(within(panel()).getAllByText('no letters')).toHaveLength(1);
    expect(screen.getByRole('button', { name: "Computer's go" })).toBeInTheDocument();
  });

  it('quits back to practice and keeps focus in the panel', async () => {
    const user = await setup();
    within(panel()).getByRole('button', { name: 'Start game' }).focus();
    await user.keyboard('{Enter}');
    within(panel()).getByRole('button', { name: 'Quit game' }).focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Game of SKATE' }));
    expect(within(panel()).getByRole('button', { name: 'Start game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Kickflip/ })).not.toHaveAttribute('aria-disabled');
    expect(announcer()).toHaveTextContent('Game of SKATE ended. Back to practice: presets are on again.');
  });
});
