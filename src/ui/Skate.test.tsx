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
  useTrickStore.setState({ screen: 'skate' });
  localStorage.clear();
  // 0.25 wins the coin flip for the student, makes the computer hit its aim (skate.test.ts) and pick the heelflip first on Normal.
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
    expect(within(panel()).getByText(/goes for every trick, doubles included/)).toBeInTheDocument();

    within(panel()).getByRole('button', { name: 'Start game' }).focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Game of SKATE', level: 2 }));
    expect(announcer()).toHaveTextContent('Game of SKATE started, hard level. Coin flip: you set first.');
    expect(within(panel()).getByRole('button', { name: 'Quit game' })).toBeInTheDocument();
    expect(within(panel()).queryByRole('radio')).toBeNull();
    // Both players start clean; the letters read as text.
    expect(within(panel()).getAllByText('no letters')).toHaveLength(2);
    // The game screen has no presets (they would give the answer away), and keys 1 to 7 do nothing there.
    expect(screen.queryByRole('group', { name: 'Trick presets' })).toBeNull();
    await user.keyboard('1');
    expect(useTrickStore.getState().events.map((e) => e.type)).not.toContain('preset.applied');
  });

  it("runs the computer's go on Space, then the student's copy on the Pop button", async () => {
    // The computer wins the coin flip; every later draw is 0.25.
    vi.mocked(Math.random).mockReturnValueOnce(0.75);
    const user = await setup();
    within(panel()).getByRole('button', { name: 'Start game' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: "Computer's go" })).toBeInTheDocument();
    // Its call is up before it pops.
    expect(within(panel()).getByText("Computer's turn: it's going for a heelflip.")).toBeInTheDocument();

    // Focus is on the heading, so Space is the global pop: the computer goes.
    await user.keyboard(' ');
    expect(useTrickStore.getState().flightBy).toBe('computer');
    landNow();
    expect(screen.getByText('Computer: Heelflip landed')).toBeInTheDocument();
    expect(within(panel()).getByText("Your turn: copy the computer's heelflip. Set the sliders, then press Pop.")).toBeInTheDocument();
    expect(within(panel()).getByText('How to heelflip')).toBeInTheDocument();
    expect(within(panel()).getByText('Toward heelflip (slider to the left), for one full flip.')).toBeInTheDocument();
    expect(announcer()).toHaveTextContent("The computer landed a heelflip. Your turn: copy the computer's heelflip");

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

  it('the student calls their trick from the picker before setting it; a trick already set is not offered', async () => {
    const user = await setup();
    within(panel()).getByRole('button', { name: 'Start game' }).focus();
    await user.keyboard('{Enter}');
    expect(within(panel()).getByText('Your turn to set: call a trick, then land it. The computer has to copy it.')).toBeInTheDocument();
    const picker = within(panel()).getByRole('combobox', { name: 'Call your trick' });

    // Pop without a call: refused, and said why.
    const popButton = screen.getByRole('button', { name: 'Pop' });
    popButton.focus();
    await user.keyboard('{Enter}');
    expect(useTrickStore.getState().flight).toBeNull();
    expect(announcer()).toHaveTextContent('Call your trick first: pick the trick you are going for, then pop.');

    await user.selectOptions(picker, 'kickflip');
    expect(announcer()).toHaveTextContent('You called a kickflip. Land it and the computer has to copy it.');
    expect(within(panel()).getByText('How to kickflip')).toBeInTheDocument();
    act(() => useTrickStore.getState().setInput('flick', 1.9));
    popButton.focus();
    await user.keyboard('{Enter}');
    landNow();
    expect(within(panel()).getByText('You landed your kickflip!')).toBeInTheDocument();

    // The computer copies it (it hits its aim), so the student sets again: the kickflip is spent.
    await user.click(screen.getByRole('button', { name: "Computer's go" }));
    landNow();
    const again = within(panel()).getByRole('combobox', { name: 'Call your trick' });
    expect(within(again).getByRole('option', { name: 'Kickflip (already set)' })).toBeDisabled();
    expect(within(again).getByRole('option', { name: 'Heelflip' })).toBeEnabled();
    expect(within(again).queryByRole('option', { name: /^Ollie/ })).toBeNull();
  });

  it('quits a game back to the start of the game screen and keeps focus in the panel', async () => {
    const user = await setup();
    within(panel()).getByRole('button', { name: 'Start game' }).focus();
    await user.keyboard('{Enter}');
    within(panel()).getByRole('button', { name: 'Quit game' }).focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Game of SKATE', level: 2 }));
    expect(within(panel()).getByRole('button', { name: 'Start game' })).toBeInTheDocument();
    expect(announcer()).toHaveTextContent('Game of SKATE ended.');
    expect(useTrickStore.getState().events.at(-1)).toMatchObject({ type: 'skate.ended', payload: { reason: 'quit' } });
  });
});
