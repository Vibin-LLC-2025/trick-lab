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
  const rolls: string[] = [];
  const catches: (number | null)[] = [];
  const player: SoundPlayer & { played: typeof played; unlocks: number; stops: number; bars: number; barStops: number; rolls: string[]; catches: (number | null)[] } = {
    played,
    rolls,
    catches,
    roll: (state) => {
      rolls.push(state);
    },
    catchIn: (seconds) => {
      catches.push(seconds);
    },
    audition: () => {},
    takes: () => 0,
    unlocks: 0,
    stops: 0,
    bars: 0,
    barStops: 0,
    bar: () => {
      player.bars += 1;
    },
    stopBar: () => {
      player.barStops += 1;
    },
    unlock: () => {
      player.unlocks += 1;
    },
    play: (kind, rate) => {
      played.push([kind, rate]);
    },
    stop: () => {
      player.stops += 1;
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

  it('silences what is still queued when sound turns off (review of Phase D)', () => {
    const player = fakePlayer();
    render(<Listener player={player} />);
    act(() => useTrickStore.getState().toggleSound());
    act(() => useTrickStore.getState().cue('letter'));
    act(() => useTrickStore.getState().cue('lose'));
    expect(player.stops).toBe(0);
    act(() => useTrickStore.getState().toggleSound());
    expect(player.stops).toBe(1);
    act(() => useTrickStore.getState().cue('pop'));
    expect(player.played.map(([k]) => k)).toEqual(['pop', 'letter', 'lose']);
  });

  it("with sound saved on, unlocks the audio on the page's first click or key, before any timer can ask for a sound", () => {
    useTrickStore.setState({ soundOn: true });
    const player = fakePlayer();
    render(<Listener player={player} />);
    expect(player.unlocks).toBe(0);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(player.unlocks).toBe(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    expect(player.unlocks).toBe(1);
  });

  it('plays the timing bar by ear when one starts with sound on, and cuts it when it is released or dropped (ADR-65)', () => {
    // 0.25 wins the coin flip for the player.
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const player = fakePlayer();
    render(<Listener player={player} />);
    const s = () => useTrickStore.getState();
    act(() => {
      s().startSkate();
      s().callSkateTrick('kickflip');
    });
    // Sound off: the bar runs in silence, and dropping it has nothing to cut but is harmless.
    act(() => s().pressPop());
    expect(player.bars).toBe(0);
    act(() => s().cancelPop());
    expect(player.barStops).toBe(1);

    act(() => s().toggleSound());
    act(() => s().pressPop());
    expect(player.bars).toBe(1);
    // The release cuts the tone, and the pop is heard.
    act(() => s().pressPop());
    expect(player.barStops).toBe(2);
    expect(player.played.at(-1)).toEqual(['pop', 1]);
    expect(player.bars).toBe(1);
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

describe('useSound follows the catch and the roll (step 18, ADR-73)', () => {
  it('schedules the catch when a landing flight starts, cancels it on a pause, and rolls the wheels only on the ground', () => {
    const player = fakePlayer();
    render(<Listener player={player} />);
    const s = () => useTrickStore.getState();
    act(() => {
      useTrickStore.setState({ skateTaught: true });
      s().setPopMode('exact');
      s().setScreen('skate');
      s().toggleSound();
      s().startSkate();
      for (let i = 0; i < 50 && s().skate.first !== 'you'; i++) s().startSkate();
      s().callSkateTrick('kickflip');
      s().setInput('flick', 1.9);
    });
    player.catches.length = 0;
    player.rolls.length = 0;
    act(() => s().popTrick());
    // In the air: the catch is ahead, and the wheels are silent.
    expect(player.catches.at(-1)).toBeGreaterThan(0);
    expect(player.rolls.at(-1) ?? 'off').toBe('off');
    act(() => s().togglePause());
    expect(player.catches.at(-1)).toBeNull();
    act(() => s().togglePause());
    expect(player.catches.at(-1)).toBeGreaterThan(0);
    act(() => s().land());
    // Back on the ground, slowing to a stop; the landing's sound is the store's cue.
    expect(player.rolls.at(-1)).toBe('slow');
    expect(player.played.at(-1)?.[0]).toBe('land');
    act(() => s().rollRested());
    expect(player.rolls.at(-1)).toBe('off');
  });
});
