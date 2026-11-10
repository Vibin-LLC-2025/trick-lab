// The game's camera and the instant replay (step 17, ADR-72): the saved
// choices, their words, and when a replay moves. Pure; the slices own the
// state and its actions.
import type { TrickState } from './types';

/**
 * The game screen's camera: free (drag to turn it round the board, scroll or
 * pinch to zoom, the default since ADR-81) or one of three fixed angles
 * (ADR-72), chosen by radio buttons.
 */
export type GameView = 'free' | 'film' | 'side' | 'above';
export const GAME_VIEWS: readonly GameView[] = ['free', 'film', 'side', 'above'];
export const GAME_VIEW_LABEL: Record<GameView, string> = { free: 'Free', film: 'Filmer', side: 'Side', above: 'Above' };
export const GAME_VIEW_ANNOUNCEMENT: Record<GameView, string> = {
  free: 'Camera: free. Drag the view to turn it round the board, and scroll or pinch to zoom. Reset view brings it back.',
  film: 'Camera: the filmer, low and to the side of the nose.',
  side: 'Camera: side on, low.',
  above: 'Camera: above and behind the heels.',
};
const isGameView = (v: unknown): v is GameView => typeof v === 'string' && (GAME_VIEWS as readonly string[]).includes(v);

/**
 * Saved under trick-lab.game-view (never logged, not reset, not exported);
 * free by default (ADR-81). A new key: the old one (trick-lab.game-camera)
 * held the filmer for everyone who had played, so free starts for them too.
 */
export const GAME_VIEW_KEY = 'trick-lab.game-view';
export const gameViewFrom = (saved: string | null): GameView => (isGameView(saved) ? saved : 'free');

/** The "Instant replay" switch, saved under trick-lab.instant-replay; on by default. */
export const INSTANT_REPLAY_KEY = 'trick-lab.instant-replay';
export const instantReplayFrom = (saved: string | null) => saved !== 'off';

/**
 * The instant replay: none; due (the student had a go, made or missed, and
 * the replay waits for the board to come to rest, ADR-78); or playing. Not
 * persisted, never logged: scoring, records and the automatic step-down
 * never see it.
 */
export type ReplayState = 'none' | 'due' | 'plays';

/** Whether a replay is on screen, so frames run (rule 4) and the camera, the bend and the Pop button follow it. */
export const replayMoves = (s: Pick<TrickState, 'replay' | 'screen'>) => s.replay === 'plays' && s.screen === 'skate';
