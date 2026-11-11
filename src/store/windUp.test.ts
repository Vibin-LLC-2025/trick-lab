// The rider's wind-up (ADR-86): what the store says the whole rider does with
// no flight on the game screen, through the real store and its actions.
import { beforeEach, describe, expect, it } from 'vitest';
import { computerWaiting, createTrickStore, windUp } from '.';
import { BAR } from '../sim/bar';
import type { PopMode } from './types';

const YOU_FIRST = 0.25;
const COMPUTER_FIRST = 0.75;

/** A store on the game screen with the coin flip scripted (below 0.5 is the player), not a first game. */
function makeStore(popMode: PopMode, first = YOU_FIRST) {
  let t = 1000;
  const queue = [first];
  const store = createTrickStore(
    () => t,
    () => queue.shift() ?? 0.25,
    () => '2026-11-11',
  );
  store.setState({ skateTaught: true, screen: 'skate' });
  store.getState().setPopMode(popMode);
  return Object.assign(store, {
    advance: (ms: number) => {
      t += ms;
    },
  });
}
const wind = (s: ReturnType<typeof makeStore>) => windUp(s.getState());

beforeEach(() => localStorage.clear());

describe('the wind-up (ADR-86)', () => {
  it("rides before the player's go with the timing bar, crouches from Get ready, and leaves from the crouch", () => {
    const s = makeStore('timed');
    // Before a game: riding along.
    expect(wind(s)).toBe('ride');
    s.getState().startSkate();
    s.getState().continueSkate();
    // The player's turn, before the call and after it: riding.
    expect(wind(s)).toBe('ride');
    s.getState().callSkateTrick('kickflip');
    expect(wind(s)).toBe('ride');
    // Get ready: the bar runs and the rider sinks into the crouch.
    s.getState().pressPop();
    expect(s.getState().pendingPop).not.toBeNull();
    expect(wind(s)).toBe('crouch');
    // Dropping the bar lets the rider ride again.
    s.getState().cancelPop();
    expect(wind(s)).toBe('ride');
    s.getState().pressPop();
    s.advance(BAR.centreMs);
    s.getState().pressPop();
    // In the air and after the landing the flight drives the pose: the crouch is what it left from.
    expect(s.getState().status).toBe('playing');
    expect(wind(s)).toBe('crouch');
    s.getState().land();
    expect(wind(s)).toBe('crouch');
  });

  it('stays crouched where one press pops: Exact, and the computer with auto off', () => {
    const exact = makeStore('exact');
    exact.getState().startSkate();
    exact.getState().continueSkate();
    exact.getState().callSkateTrick('kickflip');
    expect(wind(exact)).toBe('crouch');

    const cpu = makeStore('timed', COMPUTER_FIRST);
    cpu.setState({ skateAuto: false });
    cpu.getState().startSkate();
    cpu.getState().continueSkate();
    expect(computerWaiting(cpu.getState())).toBe(false);
    expect(wind(cpu)).toBe('crouch');
  });

  it("rides through the computer's own wait (the scene sinks it before the pop), and is the crouch on every other screen", () => {
    const s = makeStore('timed', COMPUTER_FIRST);
    s.setState({ skateAuto: true });
    s.getState().startSkate();
    // The coin flip's notice holds the wait.
    expect(computerWaiting(s.getState())).toBe(false);
    s.getState().continueSkate();
    expect(computerWaiting(s.getState())).toBe(true);
    expect(wind(s)).toBe('wait');
    // A dialog holds the wait: the rider waits crouched for nothing, so it is the crouch until the wait runs again.
    s.getState().setShortcutsOpen(true);
    expect(wind(s)).toBe('crouch');
    s.getState().setShortcutsOpen(false);
    expect(wind(s)).toBe('wait');
    for (const screen of ['lab', 'home'] as const) {
      s.setState({ screen });
      expect(wind(s)).toBe('crouch');
    }
  });
});
