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
  | { id: number; kind: 'go'; by: SkatePlayer; made: boolean; news: string; letterTo: SkatePlayer | null };

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
