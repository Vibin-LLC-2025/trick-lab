import type { Stance } from '../sim/feet';
import type { Flight, TrickInputs } from '../sim/flight';
import type { SkateGame, SkateLevel, SkatePlayer } from '../sim/skate';
import type { InputKey, PresetId, TrickId, TrickResult } from '../sim/tricks';

/** Goofy (right foot forward, the default) or regular (ADR-25). Defined in the sim so the feet model stays store-free. */
export type { Stance };

export type EventType =
  | 'input.changed'
  | 'preset.applied'
  | 'trick.popped'
  | 'trick.resolved'
  | 'playback.scrubbed'
  | 'objective.completed'
  | 'session.reset'
  | 'skate.started'
  | 'skate.set'
  | 'skate.letter'
  | 'skate.ended';

export interface TrickEvent {
  id: string;
  /** ms since session start, rounded */
  t: number;
  type: EventType;
  payload: Record<string, string | number | boolean | null>;
}

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'done';
/** One of SPEEDS in store/speed.ts. */
export type PlaybackRate = number;
export type FocusTarget = { kind: 'setup-heading' } | { kind: 'skate-heading' } | { kind: 'screen-heading' };
/**
 * Which screen is showing (ADR-45): the welcome screen with the two choices,
 * the game of SKATE, or the practice lab. Mirrored in the URL hash, so the
 * browser's back button and a bookmark work.
 */
export type Screen = 'home' | 'skate' | 'lab';
export type Theme = 'dark' | 'light';
/**
 * Quality tier (ADR-16). High: the detailed board, shoes and shadows for a
 * desktop GPU. Medium: the original GLB board, no shadows. Low: the primitive
 * board, the Chromebook fallback.
 */
export type Quality = 'high' | 'medium' | 'low';
/**
 * Fixed camera preset (ADR-38). Rider: the teaching home view from above the
 * heels (ADR-23), the default. Detail: a low three-quarter view from the heel
 * side. Numbers in ART.camera.views.
 */
export type CameraView = 'rider' | 'detail';

export interface InputsSlice extends TrickInputs {
  /** Preset last applied, cleared as soon as a slider moves. */
  activePreset: PresetId | null;
  setInput: (key: InputKey, value: number) => void;
  applyPreset: (id: PresetId) => void;
}

export interface PlaybackSlice {
  status: PlaybackStatus;
  /** 0 to 1 of the current flight's airtime. Committed at most 10 Hz while playing. */
  progress: number;
  /** Playback speed, one of SPEEDS. Applies live, mid-flight. Not logged. */
  rate: PlaybackRate;
  /** The slow speed `s` switches to: the last speed below 1x the student picked. */
  slowRate: PlaybackRate;
  /** The flight being played or last played; null before the first pop and after reset. */
  flight: Flight | null;
  /** Increments on every pop so the render loop can tell a new flight from a resumed one. */
  flightId: number;
  /** Who popped the flight on screen: the student, or the computer in a game of SKATE (ADR-43). */
  flightBy: SkatePlayer;
  /** Recognized result of the last landed flight; null until it lands. */
  result: TrickResult | null;
  /** Progress when the current scrub gesture started; null when not scrubbing. */
  scrubFrom: number | null;
  /** Pops with the current inputs. Under reduced motion the trick resolves at once. */
  popTrick: () => void;
  togglePause: () => void;
  /** The speed slider. Snaps to the nearest stop. Not announced (the slider speaks its value). */
  setRate: (rate: number) => void;
  /** The [ and ] keys: one stop slower or faster, announced. */
  stepRate: (direction: 1 | -1) => void;
  /** The s key: normal speed or back to the last slow speed, announced. */
  toggleSlowMotion: () => void;
  /** Moves the frozen board. Pauses a playing flight. Logs nothing until commitScrub. */
  scrub: (progress: number) => void;
  /** Ends a scrub gesture (pointer up, key up, blur): one playback.scrubbed event. */
  commitScrub: () => void;
  /** Called by FlightDriver: the 10 Hz progress commit. Not logged. Also mirrors it into the live playhead. */
  syncProgress: (progress: number) => void;
  /**
   * Resolves the flight in the air (idempotent): called by FlightDriver when
   * progress reaches 1, by popTrick when the pop does not animate, and by the
   * ui slice when motion is reduced or the 3D view fails mid-flight. `lead`,
   * if given, opens the one announcement that also carries the result.
   */
  land: (lead?: string) => void;
}

export interface AssessmentSlice {
  sessionStart: number;
  events: TrickEvent[];
  completed: PresetId[];
  resetSession: () => void;
  /** Internal: the only writer of `events`. Called from store actions only. */
  log: (type: EventType, payload?: TrickEvent['payload']) => void;
}

export interface UiSlice {
  /** The screen showing (ADR-45). Read from the URL hash at start, default home. Not logged, not reset. */
  screen: Screen;
  /** The welcome screen's preview is paused (WCAG 2.2.2): it shows the still pose. Persisted under trick-lab.preview. Not logged. */
  previewPaused: boolean;
  perfVisible: boolean;
  shortcutsOpen: boolean;
  theme: Theme;
  /** Mirrors prefers-reduced-motion; App keeps it in sync. Turning it on mid-flight resolves the flight (ADR-6). */
  reducedMotion: boolean;
  announcement: { message: string; nonce: number };
  focusRequest: (FocusTarget & { nonce: number }) | null;
  /** Increments when the student asks to reset the camera. */
  viewResetNonce: number;
  /** The camera preset that SceneCamera places and "Reset view" returns to (ADR-38). Persisted under trick-lab.camera-view, default rider. Not logged, not reset, not exported. */
  cameraView: CameraView;
  /** Persisted under trick-lab.quality. Not logged: the event contract has no UI events. */
  quality: Quality;
  /** True while the tier is the device's auto-pick, false once the student chose one. */
  qualityAuto: boolean;
  /** Set when a GLB fails to load; the scene then shows the primitive board and the High and Medium options are disabled. The saved `quality` is kept; read the tier in use with effectiveQuality (quality.ts). */
  boardAssetFailed: boolean;
  /** Set when the whole 3D view fails (SceneBoundary). Not persisted, not logged. Pops then resolve at once, like reduced motion (ADR-6). */
  sceneUnavailable: boolean;
  /** Shoes on the board. Persisted under trick-lab.feet, default on. Not logged. */
  feetVisible: boolean;
  /** The rider's legs above the shoes (ADR-37), drawn only while the feet are. Persisted under trick-lab.legs, default on. Not logged, not exported. */
  legsVisible: boolean;
  /** Foot trails: the route of each shoe through the trick, with arrowheads (DESIGN.md 8.5). Persisted under trick-lab.foot-trails, default off. Not logged. User-facing name is "foot trails"; renaming the identifier is a follow-up. */
  footPathsVisible: boolean;
  /** Which foot leads (ADR-25). Persisted under trick-lab.stance, default goofy. Not logged, not reset, not exported. */
  stance: Stance;
  /** Motion cues: arrows on the deck showing how each shoe will move against the board for the set inputs (ADR-26). Persisted under trick-lab.motion-cues, default on. Not logged. */
  motionCuesVisible: boolean;
  /**
   * Goes to a screen (ADR-45). Leaving the game ends it (a game in play is
   * logged as quit), a trick in the air lands at once, as under reduced
   * motion, and focus moves to the new screen's heading. Not logged.
   */
  setScreen: (screen: Screen) => void;
  /** Pauses or plays the welcome screen's preview, persisted and announced. */
  togglePreview: () => void;
  togglePerf: () => void;
  setShortcutsOpen: (open: boolean) => void;
  toggleTheme: () => void;
  setReducedMotion: (reduced: boolean) => void;
  resetView: () => void;
  /** Moves the camera to a preset, persisted and announced; a no-op if unchanged. */
  setCameraView: (view: CameraView) => void;
  setQuality: (quality: Quality) => void;
  toggleFeet: () => void;
  /** Shows or hides the legs, persisted and announced. */
  toggleLegs: () => void;
  /** Shows or hides the foot trails. User-facing name is "foot trails"; renaming the identifier is a follow-up. */
  toggleFootPaths: () => void;
  /** Switches goofy and regular, persisted and announced; a no-op if unchanged. */
  setStance: (stance: Stance) => void;
  /** Shows or hides the motion cues. */
  toggleMotionCues: () => void;
  /** Called by the scene's error boundary when the board model cannot load. */
  setBoardAssetFailed: () => void;
  /** Called by SceneBoundary when the 3D view cannot render: announces once and resolves a flight in the air. */
  setSceneUnavailable: () => void;
  announce: (message: string) => void;
  requestFocus: (target: FocusTarget) => void;
}

/** Where leaving a game in play would go (ADR-46): another screen, or back to the game's own start. */
export type LeaveTarget = Screen | 'setup';

/** The game of SKATE against the computer (ADR-43, real-game rules ADR-44, game screen ADR-46). Rules in sim/skate.ts. */
export interface SkateSlice {
  skate: SkateGame;
  /** The computer takes its go on its own after a short wait (ADR-46). Persisted under trick-lab.skate-auto, default on. Not logged. */
  skateAuto: boolean;
  /** A leave asked for while a game is in play, waiting for the student to confirm it (ADR-46); null otherwise. Not logged. */
  skateLeave: LeaveTarget | null;
  /** What the last attempt did in the game, in plain words; '' before the first. */
  skateMessage: string;
  /** Games won this session, per player. Cleared by reset. */
  skateRecord: Record<SkatePlayer, number>;
  /** Picks the computer's level; only between games. Not logged (skate.started carries it). */
  setSkateLevel: (level: SkateLevel) => void;
  /** Starts a game: letters cleared, the board back on the pad, a coin flip picks who sets first. Logged and announced; focus goes to the game's heading. */
  startSkate: () => void;
  /** The computer goes on its own, or waits for "Computer's go". Persisted and announced. */
  toggleSkateAuto: () => void;
  /** Leaves the game for a screen or its own start. With a game in play it asks first (skateLeave); otherwise it goes now. */
  requestLeave: (target: LeaveTarget) => void;
  /** The student confirmed the leave: the game ends (logged as quit) and the screen changes. */
  confirmLeave: () => void;
  /** The student kept playing. */
  cancelLeave: () => void;
  /** The student calls the trick they will set (ADR-44): only on their set turn, never a trick already set this game. Announced, not logged (their trick.popped carries the call). */
  callSkateTrick: (id: TrickId) => void;
  /** Ends a game in play (logged as quit), or closes a finished one, back to practice. */
  quitSkate: () => void;
  /** Internal, popTrick: on the computer's turn, its inputs and the announcement lead; null on the student's turn. */
  computerGo: () => { inputs: TrickInputs; lead: string; call: string } | null;
  /** Internal, the playback slice's resolve: applies the rules to a resolved flight. Logs, and returns the sentences to announce. */
  scoreSkate: (result: TrickResult, by: SkatePlayer) => string[];
  /** Internal, resetSession: ends a game in play, logged as reset. */
  endSkateOnReset: () => void;
}

export type TrickState = InputsSlice & PlaybackSlice & AssessmentSlice & UiSlice & SkateSlice;
