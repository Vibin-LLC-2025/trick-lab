// What the sound follows besides the cues (step 18, ADR-73): the rolling
// sound, from the store's roll, and the catch, from the flight's own timing.
// Pure functions of the state; useSound subscribes and hands the answers to
// the player whenever they change, never per frame.
import { CATCH } from '../sim/flight';
import { liveProgress, type Playhead } from './playhead';
import { rollMoves } from './roll';
import type { TrickState } from './types';

export type RollSound = 'off' | 'push' | 'slow';

/**
 * The wheels on the concrete: pushing off or slowing while the board rolls in
 * a game (ADR-67), silent in the air (a flight playing), while anything holds
 * the roll (a pause, a dialog) and once it has stopped.
 */
export function rollSound(s: TrickState): RollSound {
  if (s.roll === 'still' || !rollMoves(s) || s.status === 'playing') return 'off';
  return s.roll;
}

/**
 * Seconds from now until the front foot catches the board (CATCH in
 * sim/flight.ts), at the speed in use: while a flight plays, it lands (a bail
 * has no catch: the feet step off), and the catch is still ahead. Otherwise
 * null.
 */
export function catchIn(s: TrickState, head: Playhead): number | null {
  if (s.status !== 'playing' || !s.flight || !s.flight.landed) return null;
  const left = CATCH.front - liveProgress(head, s);
  if (left <= 0) return null;
  return (left * s.flight.airtime) / s.rate;
}
