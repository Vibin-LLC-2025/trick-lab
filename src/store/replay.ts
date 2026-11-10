// The game's camera and the instant replay (step 17, ADR-72): the saved
// choices, their words, and when a replay moves. Pure; the slices own the
// state and its actions.
import type { TrickState } from './types';

/** A fixed angle on the game screen, chosen by buttons (the lab keeps its free camera). */
export type GameView = 'film' | 'side' | 'above';
export const GAME_VIEWS: readonly GameView[] = ['film', 'side', 'above'];
export const GAME_VIEW_LABEL: Record<GameView, string> = { film: 'Filmer', side: 'Side', above: 'Above' };
export const GAME_VIEW_ANNOUNCEMENT: Record<GameView, string> = {
  film: 'Camera: the filmer, low and to the side of the nose.',
  side: 'Camera: side on, low.',
  above: 'Camera: above and behind the heels.',
};
const isGameView = (v: unknown): v is GameView => typeof v === 'string' && (GAME_VIEWS as readonly string[]).includes(v);

/** Saved under trick-lab.game-camera (never logged, not reset, not exported); the filmer by default. */
export const GAME_VIEW_KEY = 'trick-lab.game-camera';
export const gameViewFrom = (saved: string | null): GameView => (isGameView(saved) ? saved : 'film');

/** The "Instant replay" switch, saved under trick-lab.instant-replay; on by default. */
export const INSTANT_REPLAY_KEY = 'trick-lab.instant-replay';
export const instantReplayFrom = (saved: string | null) => saved !== 'off';

/**
 * The instant replay: none; due (the student's set or copy was made, and
 * the replay waits for the board to come to rest); or playing. Not
 * persisted, never logged: scoring, records and the automatic step-down
 * never see it.
 */
export type ReplayState = 'none' | 'due' | 'plays';

/** Whether a replay is on screen, so frames run (rule 4) and the camera, the bend and the Pop button follow it. */
export const replayMoves = (s: Pick<TrickState, 'replay' | 'screen'>) => s.replay === 'plays' && s.screen === 'skate';
