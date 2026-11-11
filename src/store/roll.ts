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
 * The landing's own motion in a game (step 13, ADR-68): 'plays' from the
 * landing until FlightDriver says it has played out, 'over' after (the end
 * pose: a bailed board lies where it slid), 'none' when there is none (the
 * lab, a new go). A clean landing has none of its own: it is 'over' at once.
 */
export type LandingState = 'none' | 'plays' | 'over';

/**
 * Whether the computer's wait is running (ADR-46): it is up on the game
 * screen, nothing is in the air, the last go has come to rest, auto is on and
 * no dialog is open. The game screen's timer and countdown bar read it, and
 * the store pushes the board off once it has stopped while this holds, so the
 * computer rolls in before it pops.
 */
export const computerWaiting = (s: TrickState) =>
  s.screen === 'skate' &&
  computerTurn(s.skate) &&
  s.skateAuto &&
  s.status !== 'playing' &&
  s.status !== 'paused' &&
  // The student's go comes to rest first: its landing has played out and the board has stopped (ADR-78).
  // The wait used to start at touchdown, so at the game's slower speed the computer would pop mid-landing.
  s.landing !== 'plays' &&
  s.roll !== 'slow' &&
  !s.shortcutsOpen &&
  s.skateLeave === null &&
  // The student's instant replay plays first (ADR-72), and the go's notice is read and continued (ADR-80).
  s.replay === 'none' &&
  s.skateNotice === null;

/**
 * How long the computer waits before it pops on its own (ADR-46), from the
 * start of its wait. Here so the scene's wind-up can sink the rider in time
 * for the pop (ADR-86); the game screen's timer runs it.
 */
export const COMPUTER_DELAY_MS = 2200;

/**
 * The rider's wind-up (ADR-86): what the whole rider does with no flight on
 * the game screen. 'ride': the riding stance, before the go (the player's
 * turn with the timing bar before Get ready, or no game in play). 'crouch':
 * the crouch the pop leaves from (the bar running, a flight on screen, a pop
 * that comes on one press: Exact, or the computer's go with auto off, and
 * every other screen). 'wait': the computer's own wait (ADR-46), riding
 * until it sinks into the crouch just before its pop, which FlightDriver
 * times from COMPUTER_DELAY_MS. FlightDriver eases between them while frames
 * run and switches at once otherwise; the store keeps no readiness.
 */
export type WindUp = 'ride' | 'crouch' | 'wait';
export const windUp = (s: TrickState): WindUp => {
  if (s.screen !== 'skate' || s.flight || s.pendingPop) return 'crouch';
  if (!skateActive(s.skate)) return 'ride';
  if (computerTurn(s.skate)) return computerWaiting(s) ? 'wait' : 'crouch';
  return s.popMode === 'timed' ? 'ride' : 'crouch';
};

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

/** Whether the landing's motion moves this frame (rule 4), held like the roll by a pause or a dialog. */
export const landingMoves = (s: Pick<TrickState, 'landing' | 'screen' | 'status' | 'shortcutsOpen' | 'skateLeave'>) =>
  s.landing === 'plays' && s.screen === 'skate' && s.status !== 'paused' && !s.shortcutsOpen && s.skateLeave === null;
