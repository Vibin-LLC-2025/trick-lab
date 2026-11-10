// The deck graphics (step 16, ADR-71): which deck the student rides, and
// which deck the board on screen shows. Pure selectors; the ui slice owns the
// choice and its actions.
import { COMPUTER_DECK, DECKS, isPlayerDeck, MODEL_DECK, type DeckId, type PlayerDeck } from '../asset/deckSpec';
import { skateActive, type SkatePlayer } from '../sim/skate';
import type { TrickState } from './types';

/** The saved choice, under trick-lab.deck (never logged, not reset, not exported). */
export const DECK_KEY = 'trick-lab.deck';

/** A saved deck, or today's (the GLB's own) when there is none or it is not one of the student's. */
export const deckFrom = (saved: string | null): PlayerDeck => (isPlayerDeck(saved) ? saved : MODEL_DECK);

/** "Dusk deck." */
export const deckAnnouncement = (deck: PlayerDeck) => `${DECKS[deck].name} deck.`;

/** When a deck's texture cannot be downloaded: the board keeps the deck it shows. */
export const deckFailedAnnouncement = (deck: PlayerDeck, kept: PlayerDeck) =>
  `The ${DECKS[deck].name} deck could not be downloaded. Keeping the ${DECKS[kept].name} deck.`;

type RiderState = Pick<TrickState, 'screen' | 'skate' | 'status' | 'flight' | 'flightBy' | 'landing'>;

/**
 * Whose board is on screen. In a game, the rider of the go in view while its
 * flight plays and its landing shows (so a landing never changes deck under
 * the board); otherwise whose turn it is, so the board says whose go is next.
 * The student's everywhere else, and once a game is over and its last go has
 * come to rest.
 */
export function boardRider(s: RiderState): SkatePlayer {
  if (s.screen !== 'skate' || s.skate.phase === 'off') return 'you';
  const goInView = s.status === 'playing' || s.status === 'paused' || (s.flight !== null && s.landing !== 'none');
  if (goInView) return s.flightBy;
  if (!skateActive(s.skate)) return 'you';
  return s.skate.phase === 'computer-set' || s.skate.phase === 'computer-copy' ? 'computer' : 'you';
}

/** The deck the board shows: the computer's own on its go, the student's choice otherwise. */
export const shownDeck = (s: RiderState & Pick<TrickState, 'deck'>): DeckId => (boardRider(s) === 'computer' ? COMPUTER_DECK : s.deck);
