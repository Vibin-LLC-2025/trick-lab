// Rolling (step 12, ADR-67). The store says whether the board is rolling and
// which way its speed is heading; FlightDriver turns that into speed and
// distance every frame (scene/roll.ts) and tells the store when a board that
// is slowing has stopped. No timer here: the stop is the picture's.
//
// - 'push': speeding up to the cruise, or cruising. From the start of a go:
//   the player's timing bar or exact pop, the computer's wait once the board
//   has stopped, or any pop in a game.
// - 'slow': slowing to a stop. After a landing, or a bar dropped with no pop.
// - 'still': stopped, so frames may stop (rule 4).
//
// Only in a game on the game screen, and only when the flight animates
// (ADR-6): under reduced motion or with no 3D view the board pops on the spot.
// The lab never rolls (the plan's decision 19).
import { computerTurn, skateActive } from '../sim/skate';
import type { TrickState } from './types';

export type RollState = 'still' | 'push' | 'slow';

/**
 * Whether the computer's wait is running (ADR-46): it is up on the game
 * screen, nothing is in the air, auto is on and no dialog is open. The game
 * screen's timer and countdown bar read it, and the store pushes the board
 * off once it has stopped while this holds, so the computer rolls in before
 * it pops.
 */
export const computerWaiting = (s: TrickState) =>
  s.screen === 'skate' &&
  computerTurn(s.skate) &&
  s.skateAuto &&
  s.status !== 'playing' &&
  s.status !== 'paused' &&
  !s.shortcutsOpen &&
  s.skateLeave === null;

/** Whether a go may roll at all: a game in play, on its screen, with the flight animating. */
export const rollAllowed = (s: Pick<TrickState, 'screen' | 'skate' | 'reducedMotion' | 'sceneUnavailable'>) =>
  s.screen === 'skate' && skateActive(s.skate) && !s.reducedMotion && !s.sceneUnavailable;

/**
 * Whether the roll moves this frame (rule 4: frames run while it does). Not
 * while the flight is paused or a dialog is open: the board holds its speed
 * there and goes on when the dialog closes. A hidden tab draws nothing anyway.
 */
export const rollMoves = (s: Pick<TrickState, 'roll' | 'screen' | 'status' | 'shortcutsOpen' | 'skateLeave'>) =>
  s.roll !== 'still' && s.screen === 'skate' && s.status !== 'paused' && !s.shortcutsOpen && s.skateLeave === null;
