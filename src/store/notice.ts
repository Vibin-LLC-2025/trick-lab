// The game's waiting notices (ADR-80): the coin flip at a game's start, and
// after each go what it did and whose turn comes next, over the stage until
// the player presses Continue. Pure; the skate slice owns the state and its
// actions.
import type { SkatePlayer } from '../sim/skate';
import type { TrickState } from './types';

/**
 * A notice waiting to be read: the coin flip (who sets first), or a go's
 * result (what it did, the letter it gave and to whom, if any). What comes
 * next is read from the game itself, so it is never out of date. Not
 * persisted, never logged.
 */
export type SkateNotice =
  | { id: number; kind: 'coin'; first: SkatePlayer }
  | {
      id: number;
      kind: 'go';
      by: SkatePlayer;
      made: boolean;
      news: string;
      letterTo: SkatePlayer | null;
      /** A missed go of the player's: why it missed and what to change, in a line (ADR-105, sim/format.ts `missWhy`); null otherwise. */
      why: string | null;
    };

/**
 * Whether the notice is on screen: there is one, and the go before it has
 * come to rest (nothing in the air, the landing played out, the board
 * stopped, the instant replay played or skipped, ADR-72, ADR-78). Under
 * reduced motion or with no 3D view a go is at rest as soon as it resolves.
 */
export const noticeUp = (s: Pick<TrickState, 'skateNotice' | 'status' | 'landing' | 'roll' | 'replay' | 'screen'>) =>
  s.skateNotice !== null &&
  s.screen === 'skate' &&
  s.status !== 'playing' &&
  s.status !== 'paused' &&
  s.landing !== 'plays' &&
  s.roll === 'still' &&
  s.replay === 'none';

/**
 * Whether a go has been scored but is still playing out: its landing, the
 * board slowing, the instant replay, before its notice comes up. The game has
 * already moved on to the next turn, so the turn card holds the go it shows
 * and the Pop button says the board is coming to rest (2026-11-13: the card
 * named the next trick over the replay of the last, and the button offered
 * "Get ready" or "Computer's go" while a press could only be refused).
 */
export const goSettling = (s: Pick<TrickState, 'skateNotice' | 'status' | 'landing' | 'roll' | 'replay' | 'screen'>) =>
  s.skateNotice?.kind === 'go' && s.screen === 'skate' && !noticeUp(s);

/**
 * Whether the notice offers "Watch replay" (ADR-105): it is up, it is the
 * player's missed go, the go is still on the stage, the Instant replay switch
 * is on and the view may move. A landed go has already been replayed.
 */
export const replayOffered = (
  s: Pick<TrickState, 'skateNotice' | 'status' | 'landing' | 'roll' | 'replay' | 'screen' | 'instantReplay' | 'reducedMotion' | 'sceneUnavailable' | 'flight'>,
) =>
  noticeUp(s) &&
  s.skateNotice?.kind === 'go' &&
  s.skateNotice.by === 'you' &&
  !s.skateNotice.made &&
  s.instantReplay &&
  !s.reducedMotion &&
  !s.sceneUnavailable &&
  s.flight !== null;
