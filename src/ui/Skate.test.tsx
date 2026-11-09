import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import tokens from '../styles/tokens.css?raw';
import { useTrickStore } from '../store';
import { App } from './App';
import { COMPUTER_DELAY_MS } from './Skate';

// WebGL does not exist in jsdom. Everything else below is the real app and the real store.
vi.mock('../scene/TrickScene', () => ({ default: () => <div data-testid="scene-stub" /> }));

const announcer = () => document.getElementById('announcer')!;
const game = () => screen.getByRole('main', { name: 'Game' });
const turnHeading = () => screen.getByRole('heading', { level: 2, name: /turn$/ });
/** Stands in for FlightDriver, which is inside the stubbed canvas: the board reached progress 1. */
const landNow = () => act(() => useTrickStore.getState().land());
const types = () => useTrickStore.getState().events.map((e) => e.type);

async function setup(opts: Parameters<typeof userEvent.setup>[0] = {}) {
  const user = userEvent.setup(opts);
  render(<App />);
  await screen.findByTestId('scene-stub');
  return user;
}

async function start(user: ReturnType<typeof userEvent.setup>) {
  within(game()).getByRole('button', { name: 'Start game' }).focus();
  await user.keyboard('{Enter}');
}

beforeEach(() => {
  useTrickStore.setState(useTrickStore.getInitialState(), true);
  // The game screen; the computer waits for its button unless a test turns auto on.
  useTrickStore.setState({ screen: 'skate', skateAuto: false });
  localStorage.clear();
  // 0.25 wins the coin flip for the student, makes the computer hit its aim (skate.test.ts) and pick the heelflip first on Normal.
  vi.spyOn(Math, 'random').mockReturnValue(0.25);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('game screen (ADR-46)', () => {
  it('explains how to play, picks a level and starts by keyboard, with focus on whose turn it is', async () => {
    const user = await setup();
    expect(screen.getByRole('heading', { level: 2, name: 'How to play' })).toBeInTheDocument();
    expect(within(game()).getAllByRole('listitem')).toHaveLength(6);
    expect(within(game()).getByText('On your last letter you get a second try.')).toBeInTheDocument();
    const normal = within(game()).getByRole('radio', { name: 'Normal' });
    expect(normal).toBeChecked();
    normal.focus();
    await user.keyboard('{ArrowRight}');
    expect(within(game()).getByRole('radio', { name: 'Hard' })).toBeChecked();
    expect(within(game()).getByText(/goes for every trick, doubles included/)).toBeInTheDocument();

    await start(user);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Your turn' }));
    expect(announcer()).toHaveTextContent('Game of SKATE started, hard level. Coin flip: you set first.');
    // The coin flip is the first news; the trick is the student's to call.
    expect(within(game()).getByText('Coin flip: you set first.')).toBeInTheDocument();
    expect(within(game()).getByText('Your set')).toBeInTheDocument();
    expect(within(game()).getByText('Call a trick')).toBeInTheDocument();
    expect(within(game()).getByRole('button', { name: 'Quit game' })).toBeInTheDocument();
    expect(within(game()).queryByRole('radio')).toBeNull();
    // Both players start clean; the letters read as text, and the player up is said.
    expect(within(game()).getAllByText('no letters')).toHaveLength(2);
    expect(within(game()).getByText(', up now')).toBeInTheDocument();
    // Only what the game needs: no presets, stats, foot steps or log.
    expect(screen.queryByRole('group', { name: 'Trick presets' })).toBeNull();
    expect(screen.queryByText('Foot motion')).toBeNull();
    expect(screen.queryByText(/^Event log/)).toBeNull();
    expect(screen.queryByText('Airtime')).toBeNull();
  });

  it("shows the computer's call before it goes, then the student's copy with the guide", async () => {
    // The computer wins the coin flip; every later draw is 0.25.
    vi.mocked(Math.random).mockReturnValueOnce(0.75);
    const user = await setup();
    await start(user);
    expect(turnHeading()).toHaveTextContent("Computer's turn");
    expect(within(game()).getByText('Going for')).toBeInTheDocument();
    expect(within(game()).getByText('Heelflip', { selector: '.turn__trick' })).toBeInTheDocument();
    expect(within(game()).getByText("Press Computer's go or Space when you're ready.")).toBeInTheDocument();
    // The stage says it large too (decorative; the card is the text).
    const chip = document.querySelector('.turn-chip')!;
    expect(chip).toHaveAttribute('aria-hidden', 'true');
    expect(chip).toHaveTextContent("Computer's turnHeelflip");

    // Focus is on the turn heading, so Space is the global pop: the computer goes.
    await user.keyboard(' ');
    expect(useTrickStore.getState().flightBy).toBe('computer');
    expect(within(game()).getByText('In the air.')).toBeInTheDocument();
    landNow();
    expect(turnHeading()).toHaveTextContent('Your turn');
    expect(within(game()).getByText("Copy the computer's")).toBeInTheDocument();
    expect(within(game()).getByText('The computer landed a heelflip.')).toBeInTheDocument();
    expect(within(game()).getByText('How to heelflip')).toBeInTheDocument();
    expect(within(game()).getByText('Toward heelflip (slider to the left), for one full flip.')).toBeInTheDocument();
    expect(within(game()).getByText('Computer: Heelflip landed')).toBeInTheDocument();
    expect(announcer()).toHaveTextContent("The computer landed a heelflip. Your turn: copy the computer's heelflip");
    // Focus never moved during the turns.
    expect(document.activeElement).toBe(turnHeading());

    // The student pops a plain ollie: the wrong trick, so the first letter.
    const pop = within(game()).getByRole('button', { name: 'Pop' });
    pop.focus();
    await user.keyboard('{Enter}');
    landNow();
    expect(within(game()).getByText('S', { selector: '.visually-hidden' })).toBeInTheDocument();
    expect(within(game()).getByText('You landed an ollie, but the trick to copy was a heelflip. You got S.')).toBeInTheDocument();
    expect(within(game()).getByText('You: Ollie landed')).toBeInTheDocument();
    // The setter keeps setting: the computer is up again, with its next call, on the same button.
    expect(turnHeading()).toHaveTextContent("Computer's turn");
    expect(within(game()).getByRole('button', { name: "Computer's go" })).toBe(pop);
  });

  it('the computer goes on its own after a short wait, and waits while a dialog is open or auto is off', async () => {
    vi.mocked(Math.random).mockReturnValueOnce(0.75);
    useTrickStore.setState({ skateAuto: true });
    await setup();
    // Fake timers once the page (and its lazy scene) is up. From here the test uses fireEvent, which is
    // synchronous: user-event's async wrapper waits on a real setTimeout that faked timers never fire.
    vi.useFakeTimers();
    fireEvent.click(within(game()).getByRole('button', { name: 'Start game' }));
    expect(within(game()).getByText('Goes in a moment.')).toBeInTheDocument();
    expect(document.querySelector('.turn__timer')).toHaveAttribute('aria-hidden', 'true');

    act(() => vi.advanceTimersByTime(COMPUTER_DELAY_MS - 1));
    expect(useTrickStore.getState().flight).toBeNull();
    // The shortcuts dialog holds the computer; closing it starts the wait over.
    act(() => useTrickStore.getState().setShortcutsOpen(true));
    expect(document.querySelector('.turn__timer')).toBeNull();
    act(() => vi.advanceTimersByTime(COMPUTER_DELAY_MS * 2));
    expect(useTrickStore.getState().flight).toBeNull();
    act(() => useTrickStore.getState().setShortcutsOpen(false));
    // A new wait, and a new bar with it.
    expect(document.querySelector('.turn__timer')).not.toBeNull();
    act(() => vi.advanceTimersByTime(COMPUTER_DELAY_MS));
    expect(useTrickStore.getState().flightBy).toBe('computer');
    expect(useTrickStore.getState().status).toBe('playing');
    landNow();

    // The student copies; the computer is up again. Switched off, it waits for its button.
    act(() => useTrickStore.getState().setInput('flick', -1.9));
    fireEvent.click(within(game()).getByRole('button', { name: 'Pop' }));
    landNow();
    expect(turnHeading()).toHaveTextContent("Computer's turn");
    fireEvent.click(within(game()).getByRole('button', { name: 'Computer goes on its own' }));
    expect(useTrickStore.getState().skateAuto).toBe(false);
    expect(announcer()).toHaveTextContent("The computer waits for you: press Computer's go or Space.");
    const popped = types().filter((t) => t === 'trick.popped').length;
    act(() => vi.advanceTimersByTime(COMPUTER_DELAY_MS * 3));
    expect(types().filter((t) => t === 'trick.popped')).toHaveLength(popped);
    expect(localStorage.getItem('trick-lab.skate-auto')).toBe('off');
  });

  it('the student calls their trick from the picker before setting it; a trick already set is not offered', async () => {
    const user = await setup();
    await start(user);
    const picker = within(game()).getByRole('combobox', { name: 'Call your trick' });

    // Pop without a call: refused, and said why.
    const pop = within(game()).getByRole('button', { name: 'Pop' });
    pop.focus();
    await user.keyboard('{Enter}');
    expect(useTrickStore.getState().flight).toBeNull();
    expect(announcer()).toHaveTextContent('Call your trick first: pick the trick you are going for, then pop.');

    await user.selectOptions(picker, 'kickflip');
    expect(announcer()).toHaveTextContent('You called a kickflip. Land it and the computer has to copy it.');
    expect(within(game()).getByText('Kickflip', { selector: '.turn__trick' })).toBeInTheDocument();
    expect(within(game()).getByText('How to kickflip')).toBeInTheDocument();
    act(() => useTrickStore.getState().setInput('flick', 1.9));
    pop.focus();
    await user.keyboard('{Enter}');
    landNow();
    expect(within(game()).getByText('You landed your kickflip!')).toBeInTheDocument();
    expect(within(game()).getByText('Copying your')).toBeInTheDocument();

    // The computer copies it (it hits its aim), so the student sets again: the kickflip is spent.
    await user.click(within(game()).getByRole('button', { name: "Computer's go" }));
    landNow();
    const again = within(game()).getByRole('combobox', { name: 'Call your trick' });
    expect(within(again).getByRole('option', { name: 'Kickflip (already set)' })).toBeDisabled();
    expect(within(again).getByRole('option', { name: 'Heelflip' })).toBeEnabled();
    expect(within(again).queryByRole('option', { name: /^Ollie/ })).toBeNull();
  });

  it('Slow motion is a switch on the game screen as well as the s key', async () => {
    const user = await setup();
    await start(user);
    const slow = within(game()).getByRole('button', { name: 'Slow motion' });
    expect(slow).toHaveAttribute('aria-pressed', 'false');
    await user.click(slow);
    expect(useTrickStore.getState().rate).toBeLessThan(1);
    expect(slow).toHaveAttribute('aria-pressed', 'true');
    turnHeading().focus();
    await user.keyboard('s');
    expect(useTrickStore.getState().rate).toBe(1);
  });

  it('asks before quitting a game in play; Keep playing is the default, Quit goes back to how to play', async () => {
    const user = await setup();
    await start(user);
    const quit = within(game()).getByRole('button', { name: 'Quit game' });
    await user.click(quit);
    const dialog = screen.getByRole('dialog', { name: 'Quit this game?' });
    expect(dialog).toHaveAccessibleDescription("The game ends here and both players' letters are cleared.");
    // The dialog owns the keyboard: Space does not pop behind it.
    await user.keyboard(' ');
    expect(useTrickStore.getState().flight).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Keep playing' }));
    expect(useTrickStore.getState().skate.phase).toBe('you-set');
    expect(types()).not.toContain('skate.ended');

    await user.click(quit);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Quit game' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'How to play' }));
    expect(announcer()).toHaveTextContent('Game of SKATE ended.');
    expect(useTrickStore.getState().events.at(-1)).toMatchObject({ type: 'skate.ended', payload: { reason: 'quit' } });
  });

  it('asks before leaving a game in play from the top bar', async () => {
    const user = await setup();
    await start(user);
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Home' }));
    const dialog = screen.getByRole('dialog', { name: 'Leave this game?' });
    await user.click(within(dialog).getByRole('button', { name: 'Leave game' }));
    expect(useTrickStore.getState().screen).toBe('home');
    expect(useTrickStore.getState().skate.phase).toBe('off');
    expect(types().at(-1)).toBe('skate.ended');
    // Between games the top bar just goes.
    await user.click(screen.getByRole('button', { name: 'Play a game of SKATE' }));
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Practice lab' }));
    expect(useTrickStore.getState().screen).toBe('lab');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the end: who won with focus on it, the record, and Play again or Change level', async () => {
    const user = await setup();
    await start(user);
    // Straight to the student's last letter, second try, copying a heelflip.
    const s = useTrickStore.getState();
    act(() =>
      useTrickStore.setState({
        skate: {
          ...s.skate,
          phase: 'you-copy',
          letters: { you: 4, computer: 2 },
          secondTry: true,
          call: { id: 'heelflip', name: 'Heelflip', flips: -1, halfShoves: 0 },
        },
      }),
    );
    expect(within(game()).getByText('Last letter: second try')).toBeInTheDocument();
    await user.click(within(game()).getByRole('button', { name: 'Pop' })); // an ollie
    landNow();
    const heading = screen.getByRole('heading', { level: 2, name: 'The computer wins' });
    expect(document.activeElement).toBe(heading);
    expect(within(game()).getByText(/It spelled SKATE on you this time, on normal\. This session: you 0, computer 1\./)).toBeInTheDocument();
    expect(document.querySelector('.turn-chip')).toBeNull();
    expect(within(game()).queryByRole('button', { name: 'Pop' })).toBeNull();

    await user.click(within(game()).getByRole('button', { name: 'Change level' }));
    expect(screen.getByRole('heading', { level: 2, name: 'How to play' })).toBeInTheDocument();
    expect(within(game()).getByText('This session: you won 0 of 1.')).toBeInTheDocument();
  });

  it('a game that ends behind the quit dialog closes it and puts focus on the result', async () => {
    const user = await setup();
    await start(user);
    const s = useTrickStore.getState();
    act(() =>
      useTrickStore.setState({
        skate: {
          ...s.skate,
          phase: 'you-copy',
          letters: { you: 4, computer: 0 },
          secondTry: true,
          call: { id: 'heelflip', name: 'Heelflip', flips: -1, halfShoves: 0 },
        },
      }),
    );
    await user.click(within(game()).getByRole('button', { name: 'Pop' })); // an ollie, in the air
    await user.click(within(game()).getByRole('button', { name: 'Quit game' }));
    expect(screen.getByRole('dialog', { name: 'Quit this game?' })).toBeInTheDocument();
    landNow(); // the second miss lands behind the dialog
    expect(useTrickStore.getState().skate.phase).toBe('over');
    expect(useTrickStore.getState().skateLeave).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'The computer wins' }));
  });

  it("Space and s do nothing on the game screen when its Pop and Slow motion are not there (before and after a game)", async () => {
    const user = await setup();
    screen.getByRole('heading', { level: 2, name: 'How to play' }).focus();
    await user.keyboard(' s');
    expect(types()).toEqual([]);
    expect(useTrickStore.getState().rate).toBe(1);

    await start(user);
    act(() => useTrickStore.setState({ skate: { ...useTrickStore.getState().skate, phase: 'over', winner: 'you' } }));
    screen.getByRole('heading', { level: 2, name: 'You win!' }).focus();
    await user.keyboard(' s');
    expect(types()).not.toContain('trick.popped');
    expect(useTrickStore.getState().rate).toBe(1);
  });

  it('the countdown bar is timed by the same delay as the computer (tokens.css)', () => {
    const m = /--skate-turn-delay:\s*(\d+)ms/.exec(tokens);
    expect(Number(m?.[1])).toBe(COMPUTER_DELAY_MS);
  });
});
