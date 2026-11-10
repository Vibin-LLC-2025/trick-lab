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
const bar = () => document.querySelector<HTMLElement>('.skate__bar');
const note = () => bar()!.nextElementSibling!;

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
    expect(group).toHaveAccessibleDescription(/Pop starts a bar, and Pop again in the band releases it/);
    timed.focus();
    await user.keyboard('{ArrowRight}');
    expect(within(group).getByRole('radio', { name: 'Exact' })).toBeChecked();
    expect(group).toHaveAccessibleDescription('No bar: the board does exactly what the sliders say, every time.');
    expect(announcer()).toHaveTextContent('Exact: Pop does exactly what the sliders say.');
    expect(localStorage.getItem('trick-lab.pop-mode')).toBe('exact');
    expect(state().events).toEqual([]);

    // An Exact game has no bar, and Pop is one press.
    within(game()).getByRole('button', { name: 'Start game' }).focus();
    await user.keyboard('{Enter}');
    // Enter on the coin flip's Continue, where focus went (ADR-80).
    await user.keyboard('{Enter}');
    await user.selectOptions(within(game()).getByLabelText('Call your trick'), 'kickflip');
    expect(bar()).toBeNull();
    within(game()).getByRole('button', { name: 'Pop' }).focus();
    await user.keyboard('{Enter}');
    expect(state().status).toBe('playing');
    expect(popped()[0]!.payload).toMatchObject({ how: 'exact' });
  });
});

describe('the timing bar on the game screen (ADR-65)', () => {
  it('by keyboard: Space starts the bar, key repeat does nothing, Space again in the band pops exactly what was set', async () => {
    await kickflipUp();
    // Before the first press: the band is drawn for the level, with no marker, and the note says how it works.
    const band = SKATE_LEVELS.normal.band;
    expect(bar()).toHaveAttribute('aria-hidden', 'true');
    expect(bar()!.style.getPropertyValue('--band-from')).toBe(`${(((BAR.centreMs - band.halfMs) / BAR.sweepMs) * 100).toFixed(2)}%`);
    expect(bar()!.style.getPropertyValue('--band-width')).toBe(`${(((band.halfMs * 2) / BAR.sweepMs) * 100).toFixed(2)}%`);
    expect(document.querySelector('.skate__bar-marker')).toBeNull();
    expect(note()).toHaveTextContent('Pop starts the bar. Press Pop again in the band: early spins less than you set, late spins more.');
    expect(within(game()).getByText(/then press Pop|Land it and the computer has to copy it/)).toBeInTheDocument();

    space();
    expect(state().pendingPop).not.toBeNull();
    expect(popped()).toHaveLength(0);
    expect(document.querySelector('.skate__bar-marker--run')).not.toBeNull();
    expect(note()).toHaveTextContent('Press Pop again when the marker is in the band.');
    expect(announcer()).toHaveTextContent('Bar running, with no sound: press Pop again in the band.');

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
    // The marker rests where the release was, and the note says what it did.
    expect(document.querySelector('.skate__bar-marker--run')).toBeNull();
    expect(document.querySelector('.skate__bar-marker')).not.toBeNull();
    expect(bar()!.style.getPropertyValue('--at')).toBe((BAR.centreMs / BAR.sweepMs).toFixed(4));
    expect(note()).toHaveTextContent('Your release. In the band: exactly what you set.');
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
    fireEvent.click(document.activeElement!);
    expect(document.activeElement).toBe(turnHeading());

    // The computer goes through the same bar: its release rests on it too.
    space();
    expect(state().flightBy).toBe('computer');
    expect(note()).toHaveTextContent('The computer released in the band.');
  });

  it('the Pop button is the same action, one press each; with no second press the bar goes round until there is one (ADR-78)', async () => {
    await kickflipUp();
    const pop = within(game()).getByRole('button', { name: 'Pop' });
    fireEvent.click(pop);
    expect(state().pendingPop).not.toBeNull();
    // Three sweeps and more: the marker keeps going round, and nothing pops on its own.
    act(() => void vi.advanceTimersByTime(BAR.sweepMs * 3 + 100));
    expect(state().pendingPop).not.toBeNull();
    expect(popped()).toHaveLength(0);
    expect(document.querySelector('.skate__bar-marker--run')).not.toBeNull();
    expect(note()).toHaveTextContent('Press Pop again when the marker is in the band.');
    // A press on this lap is read where the marker is on it: early, 100 ms in.
    fireEvent.click(pop);
    expect(state().pendingPop).toBeNull();
    expect(popped()[0]!.payload).toMatchObject({ how: 'timed', releaseMs: 100, offMs: 100 - BAR.centreMs });
    landNow();
    expect(announcer()).toHaveTextContent(/^Early: 60 percent less spin than you set\. .*not landed/);
    // A missed set: no letter.
    expect(state().skate.letters).toEqual({ you: 0, computer: 0 });

    // A second press on the button releases a running bar: early here.
    act(() => state().quitSkate());
    fireEvent.click(within(game()).getByRole('button', { name: 'Start game' }));
    fireEvent.click(document.getElementById('skate-notice-continue')!);
    fireEvent.change(within(game()).getByLabelText('Call your trick'), { target: { value: 'kickflip' } });
    const again = within(game()).getByRole('button', { name: 'Pop' });
    fireEvent.click(again);
    act(() => void vi.advanceTimersByTime(300));
    fireEvent.click(again);
    expect(popped()).toHaveLength(2);
    expect(popped()[1]!.payload).toMatchObject({ releaseMs: 300, offMs: 300 - BAR.centreMs });
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
