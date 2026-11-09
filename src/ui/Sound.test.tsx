// ADR-58 (2026-11-09): the sound switch on every screen, and the hook that
// plays the store's cues. The real app and the real store; the scene is
// stubbed (no WebGL in jsdom), and a fake player records what it is asked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SoundPlayer } from '../audio/player';
import { useSound } from '../hooks/useSound';
import { useTrickStore } from '../store';
import { App } from './App';

vi.mock('../scene/TrickScene', () => ({ default: () => <div data-testid="scene-stub" /> }));

function fakePlayer() {
  const played: [string, number][] = [];
  const player: SoundPlayer & { played: typeof played; unlocks: number } = {
    played,
    unlocks: 0,
    unlock: () => {
      player.unlocks += 1;
    },
    play: (kind, rate) => {
      played.push([kind, rate]);
    },
    dispose: () => {},
  };
  return player;
}

function Listener({ player }: { player: SoundPlayer }) {
  useSound(player);
  return null;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  useTrickStore.setState(useTrickStore.getInitialState(), true);
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the sound switch (ADR-58)', () => {
  it.each(['home', 'lab', 'skate'] as const)('is on the %s screen, off by default, and turns sound on and off, announced', async (name) => {
    useTrickStore.setState({ screen: name });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId('scene-stub');
    const sound = screen.getByRole('button', { name: 'Sound' });
    expect(sound).toHaveAttribute('aria-pressed', 'false');
    await user.click(sound);
    expect(sound).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('trick-lab.sound')).toBe('on');
    expect(useTrickStore.getState().announcement.message).toBe('Sound on.');
    // Keyboard: Space on the focused switch turns it off again.
    sound.focus();
    await user.keyboard(' ');
    expect(sound).toHaveAttribute('aria-pressed', 'false');
    expect(useTrickStore.getState().announcement.message).toBe('Sound off.');
    expect(useTrickStore.getState().events.map((e) => e.type)).toEqual([]);
  });
});

describe('useSound (ADR-58)', () => {
  it('plays nothing while sound is off, though the store still asks', () => {
    const player = fakePlayer();
    render(<Listener player={player} />);
    act(() => useTrickStore.getState().cue('pop'));
    expect(player.played).toEqual([]);
    expect(player.unlocks).toBe(0);
  });

  it('unlocks the audio and plays the pop when sound turns on, then each cue once, at the speed in use', () => {
    const player = fakePlayer();
    render(<Listener player={player} />);
    act(() => useTrickStore.getState().toggleSound());
    expect(player.unlocks).toBe(1);
    expect(player.played).toEqual([['pop', 1]]);
    act(() => useTrickStore.getState().setRate(0.25));
    act(() => useTrickStore.getState().cue('land'));
    act(() => useTrickStore.getState().cue('letter'));
    expect(player.played).toEqual([
      ['pop', 1],
      ['land', 0.25],
      ['letter', 0.25],
    ]);
    // An unrelated store change does not replay the last cue.
    act(() => useTrickStore.getState().toggleFeet());
    expect(player.played).toHaveLength(3);
  });

  it('does not play a cue that came before it mounted', () => {
    useTrickStore.setState({ soundOn: true });
    useTrickStore.getState().cue('bail');
    const player = fakePlayer();
    render(<Listener player={player} />);
    act(() => useTrickStore.getState().toggleFeet());
    expect(player.played).toEqual([]);
  });
});
