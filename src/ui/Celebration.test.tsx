// ADR-57 (2026-11-09): the celebration over the stage on the student's
// landed trick, and the SKATE letters that stamp in. The real app and the
// real store; the scene is stubbed (no WebGL in jsdom), so the landing is the
// store's land(), which the scene's FlightDriver calls at the end of a flight.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTrickStore } from '../store';
import { App } from './App';
import { CELEBRATION_MS } from './Celebration';
import { STAMP_MS } from './Skate';

vi.mock('../scene/TrickScene', () => ({ default: () => <div data-testid="scene-stub" /> }));

const celebration = () => document.querySelector('.celebration');
const letters = (row: number) => [...document.querySelectorAll('.skate__row')[row]!.querySelectorAll('.skate__letter')];

async function setup(name: 'home' | 'lab' | 'skate') {
  useTrickStore.setState({ screen: name });
  // user-event waits between steps; with fake timers on, those waits must move the fake clock.
  const user = userEvent.setup({ advanceTimers: (ms) => (vi.isFakeTimers() ? vi.advanceTimersByTime(ms) : undefined) });
  render(<App />);
  await screen.findByTestId('scene-stub');
  return user;
}

/** Pops the kickflip preset from the lab's own controls and lands it as the scene would. */
async function landKickflip(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('1');
  await user.click(screen.getByRole('button', { name: 'Pop' }));
  act(() => useTrickStore.getState().land());
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

describe('the celebration (ADR-57)', () => {
  it('stamps "Clean!" and the trick over the stage when the student lands clean, then goes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = await setup('lab');
    expect(celebration()).toBeNull();
    await landKickflip(user);
    const c = celebration()!;
    expect(c.closest('.app__stage')).not.toBeNull();
    expect(c).toHaveAttribute('aria-hidden', 'true');
    expect(c).not.toHaveAttribute('data-calm');
    expect(c.querySelector('.celebration__shout')).toHaveTextContent('Clean!');
    expect(c.querySelector('.celebration__trick')).toHaveTextContent('Kickflip');
    act(() => vi.advanceTimersByTime(CELEBRATION_MS));
    expect(celebration()).toBeNull();
  });

  it('says "Landed!" for a sketchy landing (ADR-63)', async () => {
    const user = await setup('lab');
    // Flick 2.0 at pop 0.35 m turns 385 degrees: landed, 25 past, so sketchy.
    act(() => useTrickStore.getState().setInput('flick', 2));
    await user.click(screen.getByRole('button', { name: 'Pop' }));
    act(() => useTrickStore.getState().land());
    expect(useTrickStore.getState().result).toMatchObject({ id: 'kickflip', grade: 'sketchy' });
    expect(celebration()!.querySelector('.celebration__shout')).toHaveTextContent('Landed!');
  });

  it('plays again for the next landing, and not for a bail', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = await setup('lab');
    await landKickflip(user);
    act(() => vi.advanceTimersByTime(CELEBRATION_MS));
    await user.click(screen.getByRole('button', { name: 'Pop' }));
    act(() => useTrickStore.getState().land());
    expect(celebration()).toHaveTextContent('Kickflip');
    act(() => vi.advanceTimersByTime(CELEBRATION_MS));
    act(() => useTrickStore.getState().setInput('pop', 0.15));
    await user.click(screen.getByRole('button', { name: 'Pop' }));
    act(() => useTrickStore.getState().land());
    expect(useTrickStore.getState().result?.landed).toBe(false);
    expect(celebration()).toBeNull();
  });

  it('is calm under reduced motion: the same stickers, marked to hold still', async () => {
    const user = await setup('lab');
    act(() => useTrickStore.setState({ reducedMotion: true }));
    await user.keyboard('1');
    await user.click(screen.getByRole('button', { name: 'Pop' }));
    // Under reduced motion a pop resolves at once (ADR-6).
    expect(useTrickStore.getState().status).toBe('done');
    expect(celebration()).toHaveAttribute('data-calm');
    expect(celebration()).toHaveTextContent('Kickflip');
  });

  it('never shows on the welcome screen, and a screen change does not replay one', async () => {
    await setup('home');
    act(() => useTrickStore.getState().celebrate('Kickflip', true));
    expect(celebration()).toBeNull();
    // Into the lab after that landing: the old one is not replayed.
    act(() => useTrickStore.setState({ screen: 'lab' }));
    expect(celebration()).toBeNull();
    act(() => useTrickStore.getState().celebrate('Heelflip', true));
    expect(celebration()).toHaveTextContent('Heelflip');
  });

  it('stays off when the 3D view has failed', async () => {
    await setup('lab');
    act(() => useTrickStore.getState().setSceneUnavailable());
    act(() => useTrickStore.getState().celebrate('Kickflip', true));
    expect(celebration()).toBeNull();
  });
});

describe('the SKATE letters (ADR-57)', () => {
  it('stamps in only the letter just earned, once; letters already there do not', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useTrickStore.getState().startSkate();
    act(() => useTrickStore.setState((s) => ({ skate: { ...s.skate, letters: { you: 1, computer: 0 } } })));
    await setup('skate');
    const you = () => letters(0);
    expect(you().map((l) => l.className.includes('--got'))).toEqual([true, false, false, false, false]);
    expect(document.querySelectorAll('.skate__letter--new')).toHaveLength(0);
    act(() => useTrickStore.setState((s) => ({ skate: { ...s.skate, letters: { you: 2, computer: 0 } } })));
    expect(you()[1]).toHaveClass('skate__letter--got', 'skate__letter--new');
    expect(document.querySelectorAll('.skate__letter--new')).toHaveLength(1);
    act(() => vi.advanceTimersByTime(STAMP_MS));
    expect(document.querySelectorAll('.skate__letter--new')).toHaveLength(0);
    expect(you()[1]).toHaveClass('skate__letter--got');
    // The letter that ends the game stamps in too: the scoreboard is not remounted at the end (review of Phase D).
    act(() =>
      useTrickStore.setState((s) => ({
        skate: { ...s.skate, phase: 'you-copy', letters: { you: 4, computer: 0 }, secondTry: true, call: { id: 'kickflip', name: 'Kickflip', flips: 1, halfShoves: 0 } },
      })),
    );
    act(() => vi.advanceTimersByTime(STAMP_MS));
    act(() => useTrickStore.getState().setInput('flick', 0));
    act(() => useTrickStore.getState().popTrick());
    act(() => useTrickStore.getState().land());
    expect(useTrickStore.getState().skate.phase).toBe('over');
    expect(you()[4]).toHaveClass('skate__letter--got', 'skate__letter--new');
    // A new game starts clean: no stamp for letters going back to none.
    act(() => useTrickStore.setState((s) => ({ skate: { ...s.skate, letters: { you: 0, computer: 0 } } })));
    expect(document.querySelectorAll('.skate__letter--got, .skate__letter--new')).toHaveLength(0);
  });
});
