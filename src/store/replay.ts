// The game's camera and the instant replay (step 17, ADR-72): the saved
// choices, their words, and when a replay moves. Pure; the slices own the
// state and its actions.
import type { TrickState } from './types';

/**
 * The game screen's camera (ADR-100, 2026-11-13): Free, the default (drag to
 * turn it round the board, scroll or pinch to zoom, ADR-81); Free fisheye,
 * the same orbit with the replay's wide lens and bend (ADR-93); or Filmer,
 * the one fixed angle (ADR-72). Chosen by radio buttons.
 */
export type GameView = 'free' | 'freeFisheye' | 'film';
export const GAME_VIEWS: readonly GameView[] = ['free', 'freeFisheye', 'film'];
export const GAME_VIEW_LABEL: Record<GameView, string> = {
  free: 'Free',
  freeFisheye: 'Free fisheye',
  film: 'Filmer',
};
/** The views the student turns and zooms (ADR-81, ADR-93): Free, and Free fisheye. */
export const orbitsFree = (view: string) => view === 'free' || view === 'freeFisheye';
/** The view with the replay's wide lens and bend while playing (ADR-93, ADR-100): Free fisheye. */
export const isFisheye = (view: string) => view === 'freeFisheye';
export const GAME_VIEW_ANNOUNCEMENT: Record<GameView, string> = {
  free: 'Camera: free. Drag the view to turn it round the board, and scroll or pinch to zoom. Reset view brings it back.',
  freeFisheye: 'Camera: free fisheye. Drag the view to turn it round the board, and scroll or pinch to zoom. Reset view brings it back.',
  film: 'Camera: the filmer, low and to the side of the nose.',
};
const isGameView = (v: unknown): v is GameView => typeof v === 'string' && (GAME_VIEWS as readonly string[]).includes(v);

/**
 * Saved under trick-lab.game-view (never logged, not reset, not exported);
 * free by default (ADR-81). A new key: the old one (trick-lab.game-camera)
 * held the filmer for everyone who had played, so free starts for them too.
 */
export const GAME_VIEW_KEY = 'trick-lab.game-view';
/**
 * The one place a saved camera is read (ADR-100): the fixed Fisheye became
 * Free fisheye (the wide lens the player chose), Side and Above became Free,
 * and anything else unknown is Free. Storage is not rewritten on read.
 */
export const gameViewFrom = (saved: string | null): GameView => {
  if (saved === 'fisheye') return 'freeFisheye';
  return isGameView(saved) ? saved : 'free';
};

/** The "Instant replay" switch, saved under trick-lab.instant-replay; on by default. */
export const INSTANT_REPLAY_KEY = 'trick-lab.instant-replay';
export const instantReplayFrom = (saved: string | null) => saved !== 'off';

/**
 * The instant replay: none; due (the student landed a go, and the replay
 * waits for the board to come to rest, ADR-78; since ADR-105 a miss is
 * replayed only when its notice's Watch replay is pressed); or playing. Not
 * persisted, never logged: scoring, records and the automatic step-down
 * never see it.
 */
export type ReplayState = 'none' | 'due' | 'plays';

/** Whether a replay is on screen, so frames run (rule 4) and the camera, the bend and the Pop button follow it. */
export const replayMoves = (s: Pick<TrickState, 'replay' | 'screen'>) => s.replay === 'plays' && s.screen === 'skate';

/** Whether the fisheye bend is on (ADR-72, ADR-93, ADR-100): while the replay plays, and on the game screen in Free fisheye. */
export const bendShown = (s: Pick<TrickState, 'replay' | 'screen' | 'gameView'>) => replayMoves(s) || (s.screen === 'skate' && isFisheye(s.gameView));
