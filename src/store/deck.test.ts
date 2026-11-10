import { afterEach, describe, expect, it } from 'vitest';
import { COMPUTER_DECK, DECK_FILES, FILE_DECKS, MODEL_DECK, PLAYER_DECKS } from '../asset/deckSpec';
import { newSkateGame, type SkateGame } from '../sim/skate';
import { boardRider, DECK_KEY, deckFrom, shownDeck } from './deck';
import { createTrickStore } from './index';

function makeStore() {
  let t = 1000;
  return createTrickStore(() => (t += 10));
}

afterEach(() => localStorage.clear());

describe('the decks (step 16, ADR-71)', () => {
  it('offers the student today\'s and the three approved decks, and keeps Circuit for the computer', () => {
    expect(PLAYER_DECKS).toEqual(['classic', 'dusk', 'bolt', 'ripple']);
    expect(PLAYER_DECKS).not.toContain(COMPUTER_DECK);
    expect(MODEL_DECK).toBe('classic');
    // Every deck but today's has a file per board level, each its own.
    expect([...FILE_DECKS].sort()).toEqual(['bolt', 'circuit', 'dusk', 'ripple']);
    expect(new Set(DECK_FILES.map((d) => d.file)).size).toBe(8);
  });

  it("starts on today's deck; a saved choice comes back, anything else is today's", () => {
    expect(makeStore().getState().deck).toBe('classic');
    localStorage.setItem(DECK_KEY, 'ripple');
    expect(makeStore().getState().deck).toBe('ripple');
    expect(deckFrom('circuit')).toBe('classic');
    expect(deckFrom('nonsense')).toBe('classic');
  });

  it('saves and announces a choice, never logs it', () => {
    const store = makeStore();
    store.getState().setDeck('dusk');
    expect(store.getState().deck).toBe('dusk');
    expect(localStorage.getItem(DECK_KEY)).toBe('dusk');
    expect(store.getState().announcement.message).toBe('Dusk deck.');
    expect(store.getState().events).toEqual([]);
  });

  it('goes back to the deck the board kept when a download fails, and says so', () => {
    const store = makeStore();
    store.getState().setDeck('bolt');
    store.getState().setDeck('ripple');
    store.getState().deckFailed('ripple');
    expect(store.getState().deck).toBe('bolt');
    expect(localStorage.getItem(DECK_KEY)).toBe('bolt');
    expect(store.getState().announcement.message).toBe('The Ripple deck could not be downloaded. Keeping the Bolt deck.');
    // A saved deck that fails on the first visit goes back to today's, inside the model.
    localStorage.setItem(DECK_KEY, 'dusk');
    const again = makeStore();
    again.getState().deckFailed('dusk');
    expect(again.getState().deck).toBe('classic');
    expect(again.getState().announcement.message).toBe('The Dusk deck could not be downloaded. Keeping the Trick Lab deck.');
    // The computer's deck, or a deck no longer chosen: nothing to undo, nothing said.
    const nonce = again.getState().announcement.nonce;
    again.getState().deckFailed('circuit');
    again.getState().deckFailed('ripple');
    expect(again.getState().deck).toBe('classic');
    expect(again.getState().announcement.nonce).toBe(nonce);
    expect(again.getState().events).toEqual([]);
  });
});

describe('whose board is on screen (ADR-71)', () => {
  const game = (phase: SkateGame['phase']): SkateGame => ({ ...newSkateGame(), phase });
  const base = { screen: 'skate' as const, skate: game('you-set'), status: 'idle' as const, flight: null, flightBy: 'you' as const, landing: 'none' as const, deck: 'dusk' as const };
  const flight = {} as never;

  it("is the student's everywhere but a game", () => {
    expect(boardRider({ ...base, screen: 'lab', skate: game('computer-set') })).toBe('you');
    expect(boardRider({ ...base, screen: 'home' })).toBe('you');
    expect(boardRider({ ...base, skate: game('off') })).toBe('you');
  });

  it("is whose turn it is between goes, so the board says who is up", () => {
    expect(boardRider(base)).toBe('you');
    expect(boardRider({ ...base, skate: game('computer-set') })).toBe('computer');
    expect(boardRider({ ...base, skate: game('computer-copy') })).toBe('computer');
    expect(boardRider({ ...base, skate: game('you-copy') })).toBe('you');
  });

  it("is the rider of the go in view while it flies and while its landing shows, whoever is up next", () => {
    expect(boardRider({ ...base, skate: game('you-copy'), status: 'playing', flightBy: 'computer' })).toBe('computer');
    expect(boardRider({ ...base, skate: game('you-copy'), status: 'paused', flightBy: 'computer' })).toBe('computer');
    expect(boardRider({ ...base, skate: game('computer-set'), status: 'done', flight, flightBy: 'you', landing: 'plays' })).toBe('you');
    expect(boardRider({ ...base, skate: game('computer-set'), status: 'done', flight, flightBy: 'you', landing: 'over' })).toBe('you');
    // Once the next go starts (the landing cleared), the next rider.
    expect(boardRider({ ...base, skate: game('computer-set'), status: 'done', flight, flightBy: 'you', landing: 'none' })).toBe('computer');
    // A game over: the last go stays, then the student's.
    expect(boardRider({ ...base, skate: game('over'), status: 'done', flight, flightBy: 'computer', landing: 'over' })).toBe('computer');
    expect(boardRider({ ...base, skate: game('over'), status: 'done', flight, flightBy: 'computer', landing: 'none' })).toBe('you');
  });

  it("shows the computer's Circuit on its board and the student's choice on theirs", () => {
    expect(shownDeck(base)).toBe('dusk');
    expect(shownDeck({ ...base, skate: game('computer-set') })).toBe('circuit');
  });
});
