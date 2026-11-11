import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import tokens from '../styles/tokens.css?raw';
import { BAR } from '../sim/bar';
import { SKATE_LEVELS } from '../sim/skate';
import { useTrickStore } from '../store';
import { App } from './App';

// WebGL does not exist in jsdom. Everything else below is the real app and the real store.
vi.mock('../scene/TrickScene', () => ({ default: () => <div data-testid="scene-stub" /> }));

const announcer = () => document.getElementById('announcer')!;
const game = () => screen.getByRole('main', { name: 'Game' });
const turnHeading = () => within(game()).getByRole('heading', { level: 2, name: /turn$/ });
const state = () => useTrickStore.getState();
const popped = () => state().events.filter((e) => e.type === 'trick.popped');
/** Stands in for FlightDriver, which is inside the stubbed canvas: the board reached progress 1. */
const landNow = () => act(() => state().land());
const space = (init: KeyboardEventInit = {}) => fireEvent.keyDown(document.activeElement ?? document.body, { key: ' ', ...init });
/** The timing bar over the stage (ADR-83): its panel, its track, and the words on it. */
const timing = () => document.querySelector<HTMLElement>('.timing');
const bar = () => timing()?.querySelector<HTMLElement>('.skate__bar') ?? null;
const verdict = () => timing()!.querySelector('.timing__verdict')!;
const who = () => timing()!.querySelector('.timing__who');
/** The one button, by its name: "Get ready" before the bar, "Pop!" while it runs (ADR-83). */
const button = (name: string) => within(game()).getByRole('button', { name });

/**
 * The game screen in a game on Normal, the player up with a kickflip called
 * and its clean setup on the sliders, focus on the turn heading (so Space is
 * the game's Pop), and the clock faked from here on: the store's bar reads
 * performance.now and ends on a timeout, and both now move only when a test
 * advances them. fireEvent from here, since user-event waits on real timers.
 */
async function kickflipUp() {
  render(<App />);
  await screen.findByTestId('scene-stub');
  vi.useFakeTimers();
  fireEvent.click(within(game()).getByRole('button', { name: 'Start game' }));
  // Past the coin flip (ADR-80).
  fireEvent.click(document.getElementById('skate-notice-continue')!);
  fireEvent.change(within(game()).getByLabelText('Call your trick'), { target: { value: 'kickflip' } });
  act(() => state().setInput('flick', 1.9));
  act(() => turnHeading().focus());
}

beforeEach(() => {
  useTrickStore.setState(useTrickStore.getInitialState(), true);
  // Not a first game: the walk-through (ADR-66) has its own tests in Lesson.test.tsx.
  useTrickStore.setState({ screen: 'skate', skateAuto: false, skateTaught: true });
  localStorage.clear();
  // 0.25 wins the coin flip for the player, and makes the computer release on the band's centre.
  vi.spyOn(Math, 'random').mockReturnValue(0.25);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('how you pop, at the game\'s start (ADR-65)', () => {
  it('is the timing bar by default; Exact is one choice away by keyboard, remembered, announced and never logged', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId('scene-stub');
    const group = within(game()).getByRole('group', { name: 'How you pop' });
    const timed = within(group).getByRole('radio', { name: 'Timing bar' });
    expect(timed).toBeChecked();
    expect(group).toHaveAccessibleDescription(/^Press Get ready, then Pop! when the marker is in the green band\. Early spins less, late spins more\./);
    timed.focus();
    await user.keyboard('{ArrowRight}');
    expect(within(group).getByRole('radio', { name: 'Exact' })).toBeChecked();
    expect(group).toHaveAccessibleDescription('No bar: you set the sliders yourself, and the board does exactly what they say, every time.');
    expect(announcer()).toHaveTextContent('Exact: Pop does exactly what the sliders say.');
    expect(localStorage.getItem('trick-lab.pop-mode')).toBe('exact');
    expect(state().events).toEqual([]);

    // An Exact game has no bar, and Pop is one press.
    within(game()).getByRole('button', { name: 'Start game' }).focus();
    await user.keyboard('{Enter}');
    // Enter on the coin flip's Continue, where focus went (ADR-80).
    await user.keyboard('{Enter}');
    await user.selectOptions(within(game()).getByLabelText('Call your trick'), 'kickflip');
    expect(timing()).toBeNull();
    // Exact keeps the one name, and never sets the sliders (ADR-83).
    expect(state().flick).toBe(0);
    act(() => state().setInput('flick', 1.9));
    within(game()).getByRole('button', { name: 'Pop' }).focus();
    await user.keyboard('{Enter}');
    expect(state().status).toBe('playing');
    expect(popped()[0]!.payload).toMatchObject({ how: 'exact' });
    expect(timing()).toBeNull();
  });
});

describe('the timing bar on the game screen (ADR-65, ADR-83)', () => {
  it('by keyboard: Space starts the bar, key repeat does nothing, Space again in the band pops exactly what was set', async () => {
    await kickflipUp();
    // Before the first press: the bar's slim strip waits in the tray with no marker (ADR-86), and the button says what the press does.
    expect(timing()).toHaveClass('timing--idle');
    expect(timing()!.closest('.hud__tray')).not.toBeNull();
    expect(document.querySelector('.skate__bar-marker')).toBeNull();
    expect(verdict()).toHaveTextContent('Pop! in the green band');
    expect(button('Get ready')).toHaveAttribute('aria-keyshortcuts', 'Space');
    expect(within(game()).queryByRole('button', { name: 'Pop' })).toBeNull();
    // The turn card's one line says both presses, after the first game.
    expect(within(game()).getByText('Land it and the computer has to copy it: press Get ready, then Pop! in the green band.')).toBeInTheDocument();
    // One bar.
    expect(document.querySelectorAll('.skate__bar')).toHaveLength(1);

    space();
    expect(state().pendingPop).not.toBeNull();
    expect(popped()).toHaveLength(0);
    // Running: the strip along the bottom of the stage, the level's band, a marker going round, and what to do.
    const band = SKATE_LEVELS.normal.band;
    expect(timing()).toHaveAttribute('aria-hidden', 'true');
    expect(timing()).toHaveClass('timing--run');
    expect(timing()).toHaveAttribute('data-covers', 'bottom');
    expect(bar()!.style.getPropertyValue('--band-from')).toBe(`${(((BAR.centreMs - band.halfMs) / BAR.sweepMs) * 100).toFixed(2)}%`);
    expect(bar()!.style.getPropertyValue('--band-width')).toBe(`${(((band.halfMs * 2) / BAR.sweepMs) * 100).toFixed(2)}%`);
    expect(document.querySelector('.skate__bar-marker--run')).not.toBeNull();
    expect(verdict()).toHaveTextContent('Pop! in the green band');
    expect(who()).toBeNull();
    // The second press has its own name, and the same key.
    expect(button('Pop!')).toHaveAttribute('aria-keyshortcuts', 'Space');
    expect(announcer()).toHaveTextContent('Bar running, with no sound: press Pop! when the marker is in the green band.');

    // Holding the key down repeats it: still one bar, no release.
    act(() => void vi.advanceTimersByTime(300));
    space({ repeat: true });
    expect(state().pendingPop).not.toBeNull();

    act(() => void vi.advanceTimersByTime(BAR.centreMs - 300));
    space();
    expect(state().pendingPop).toBeNull();
    expect(state().status).toBe('playing');
    expect(popped()).toHaveLength(1);
    expect(popped()[0]!.payload).toMatchObject({ by: 'you', how: 'timed', flick: 1.9, releaseMs: BAR.centreMs, offMs: 0, call: 'kickflip' });
    // The marker rests where the release was, and the verdict says what it did in a few words.
    expect(document.querySelector('.skate__bar-marker--run')).toBeNull();
    expect(document.querySelector('.skate__bar-marker')).not.toBeNull();
    expect(bar()!.style.getPropertyValue('--at')).toBe((BAR.centreMs / BAR.sweepMs).toFixed(4));
    expect(timing()).toHaveClass('timing--in');
    expect(who()).toHaveTextContent('Your release');
    expect(verdict()).toHaveTextContent('In the band');
    // Nothing new was announced at the pop: the start, then the result.
    expect(announcer()).toHaveTextContent(/^Bar running/);
    landNow();
    expect(announcer()).toHaveTextContent(/^In the band: exactly what you set\. Kickflip landed clean\./);
    expect(within(game()).getByText('You landed your kickflip!')).toBeInTheDocument();
    // Focus never moved.
    expect(document.activeElement).toBe(turnHeading());

    // At rest the go's notice takes focus (ADR-80); Space before then waits for the board, and pops nothing.
    space();
    expect(state().flightBy).toBe('you');
    expect(announcer()).toHaveTextContent('One moment: the board is still coming to rest.');
    act(() => {
      state().rollRested();
      state().endReplay();
    });
    expect(document.activeElement).toBe(document.getElementById('skate-notice-continue'));
    // The release stays up until Continue clears the stage.
    expect(timing()).not.toBeNull();
    fireEvent.click(document.activeElement!);
    expect(document.activeElement).toBe(turnHeading());
    expect(timing()).toHaveClass('timing--idle');
    expect(document.querySelector('.skate__bar-marker')).toBeNull();

    // The computer goes through the same bar: its release rests on it too, and the button keeps its name.
    expect(button("Computer's go")).toBeInTheDocument();
    space();
    expect(state().flightBy).toBe('computer');
    expect(who()).toHaveTextContent("Computer's release");
    expect(verdict()).toHaveTextContent('In the band');
  });

  it('the Pop button is the same action, one press each; with no second press the bar goes round until there is one (ADR-78)', async () => {
    await kickflipUp();
    const pop = button('Get ready');
    fireEvent.click(pop);
    expect(state().pendingPop).not.toBeNull();
    // The same element, renamed, so focus and the pointer stay on it.
    expect(button('Pop!')).toBe(pop);
    // Three sweeps and more: the marker keeps going round, and nothing pops on its own.
    act(() => void vi.advanceTimersByTime(BAR.sweepMs * 3 + 100));
    expect(state().pendingPop).not.toBeNull();
    expect(popped()).toHaveLength(0);
    expect(document.querySelector('.skate__bar-marker--run')).not.toBeNull();
    expect(verdict()).toHaveTextContent('Pop! in the green band');
    expect(who()).toBeNull();
    // A press on this lap is read where the marker is on it: early, 100 ms in.
    fireEvent.click(pop);
    expect(state().pendingPop).toBeNull();
    expect(popped()[0]!.payload).toMatchObject({ how: 'timed', releaseMs: 100, offMs: 100 - BAR.centreMs });
    expect(timing()).toHaveClass('timing--off');
    expect(who()).toHaveTextContent('Your release');
    expect(verdict()).toHaveTextContent('Early');
    // In the air the dimmed button says so (ADR-86), still the same element.
    expect(button('In the air')).toBe(pop);
    expect(pop).toHaveAttribute('aria-disabled', 'true');
    landNow();
    expect(announcer()).toHaveTextContent(/^Early: 60 percent less spin than you set\. .*not landed/);
    // A missed set: no letter.
    expect(state().skate.letters).toEqual({ you: 0, computer: 0 });

    // A second press on the button releases a running bar: early here.
    act(() => state().quitSkate());
    fireEvent.click(within(game()).getByRole('button', { name: 'Start game' }));
    fireEvent.click(document.getElementById('skate-notice-continue')!);
    fireEvent.change(within(game()).getByLabelText('Call your trick'), { target: { value: 'kickflip' } });
    const again = button('Get ready');
    fireEvent.click(again);
    act(() => void vi.advanceTimersByTime(700));
    fireEvent.click(again);
    expect(popped()).toHaveLength(2);
    expect(popped()[1]!.payload).toMatchObject({ releaseMs: 700, offMs: 700 - BAR.centreMs });
    // 700 ms is 100 ms before the centre, and Normal's band is 100 either side: on its edge, so in the band.
    expect(who()).toHaveTextContent('Your release');
    expect(verdict()).toHaveTextContent('In the band');
    // A little late: 20 ms past Normal's band, which ends 100 ms after the centre.
    landNow();
    act(() => state().quitSkate());
    fireEvent.click(within(game()).getByRole('button', { name: 'Start game' }));
    fireEvent.click(document.getElementById('skate-notice-continue')!);
    fireEvent.change(within(game()).getByLabelText('Call your trick'), { target: { value: 'kickflip' } });
    fireEvent.click(button('Get ready'));
    act(() => void vi.advanceTimersByTime(BAR.centreMs + 120));
    fireEvent.click(button('Pop!'));
    expect(who()).toHaveTextContent('Your release');
    expect(verdict()).toHaveTextContent('A little late');
  });

  it('a dialog opening, or the tab being hidden, drops a running bar with no attempt, and says so', async () => {
    await kickflipUp();
    space();
    fireEvent.keyDown(document.body, { key: '?' });
    expect(state().shortcutsOpen).toBe(true);
    expect(state().pendingPop).toBeNull();
    expect(announcer()).toHaveTextContent('Pop cancelled.');
    act(() => state().setShortcutsOpen(false));

    space();
    expect(state().pendingPop).not.toBeNull();
    fireEvent.click(within(game()).getByRole('button', { name: 'Quit game' }));
    expect(state().skateLeave).toBe('setup');
    expect(state().pendingPop).toBeNull();
    act(() => state().cancelLeave());

    space();
    expect(state().pendingPop).not.toBeNull();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    expect(state().pendingPop).toBeNull();
    expect(announcer()).toHaveTextContent('Pop cancelled.');
    visibility.mockRestore();

    // None of the three bars ever popped, even once their ends have passed.
    act(() => void vi.advanceTimersByTime(BAR.sweepMs * 3));
    expect(popped()).toHaveLength(0);
    expect(state().skate.letters).toEqual({ you: 0, computer: 0 });
  });

  it('the sweep is timed by the same number in the stylesheet as in the rules (tokens.css)', () => {
    const m = /--skate-bar-sweep:\s*(\d+)ms/.exec(tokens);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(BAR.sweepMs);
  });
});
