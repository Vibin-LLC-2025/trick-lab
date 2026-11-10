import type { Stance } from '../sim/feet';
import type { Flight, TrickInputs } from '../sim/flight';
import type { SkateGame, SkateLevel, SkatePlayer } from '../sim/skate';
import type { InputKey, PresetId, TrickId, TrickResult } from '../sim/tricks';
import type { Records } from './records';
import type { LandingState, RollState } from './roll';

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

/**
 * A sound the store asks for (ADR-58): the board popping, landing or bailing,
 * a SKATE letter earned (either player's), and a game won or lost. The
 * player (src/audio) plays it only while sound is on.
 */
export type SoundKind = 'pop' | 'land' | 'bail' | 'letter' | 'win' | 'lose';
/** One of SPEEDS in store/speed.ts. */
export type PlaybackRate = number;
export type FocusTarget = { kind: 'setup-heading' } | { kind: 'skate-heading' } | { kind: 'screen-heading' };
/**
 * Which screen is showing (ADR-45): the welcome screen with the two choices,
 * the game of SKATE, or the practice lab. Mirrored in the URL hash, so the
 * browser's back button and a bookmark work.
 */
export type Screen = 'home' | 'skate' | 'lab';
/**
 * The lab's sections that open and close (ADR-47): speed and timeline, view
 * settings, the flight numbers, foot motion, objectives and the event log.
 * Presets, sliders, Pop and the outcome are always shown.
 */
export type LabFold = 'replay' | 'view' | 'numbers' | 'feet' | 'objectives' | 'log';
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
  /** Pops with the current inputs, exactly. Under reduced motion the trick resolves at once. A timing bar still running is dropped. */
  popTrick: () => void;
  /**
   * Internal, the skate slice's release (ADR-65): the player's pop from a
   * release of the timing bar. Same rules and log as popTrick, with the
   * inputs the release made of the setup. Nothing is announced at the pop:
   * what the release did opens the result's announcement.
   */
  popTimed: (pop: TimedPop) => void;
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
  /** Rolling (step 12, ADR-67, store/roll.ts): still, speeding up or cruising, or slowing to a stop. Not logged. */
  roll: RollState;
  /** Internal: a go starts in a game (a bar, a pop, the computer's wait), so the board pushes off. Does nothing where rollAllowed is false. */
  startRoll: () => void;
  /** Internal: a landing, or a bar dropped with no pop: the board slows to a stop. */
  slowRoll: () => void;
  /** Internal: cut short (a screen change, quit, a new game, reset, reduced motion, the 3D view failing): stopped at once. */
  stopRoll: () => void;
  /** Called by FlightDriver when a slowing board has stopped. If the computer is waiting for its go, it pushes off again. */
  rollRested: () => void;
  /** The landing's own motion in a game (step 13, ADR-68, sim/settle.ts): none, playing, or over (its end pose). Not logged. */
  landing: LandingState;
  /** Called by FlightDriver when the landing's motion has played out. If the computer is waiting for its go, it rolls in. */
  landingDone: () => void;
  /** Internal: cut short (a change of quality level, reduced motion, the 3D view failing, a quit): the end pose at once. */
  endLanding: () => void;
}

/** How you pop in a game (ADR-65): on the timing bar, or exactly what the sliders say. */
export type PopMode = 'timed' | 'exact';

/** A timing bar that is running (ADR-65): the player pressed Pop and has not released yet. */
export interface PendingPop {
  /** Goes up by one per bar, so a late or doubled callback does nothing. */
  id: number;
  /** The store's clock when the bar started, ms. */
  startedAt: number;
  /** The sliders as the bar started: what the player is going for. */
  intended: TrickInputs;
  level: SkateLevel;
}

/** A release of the timing bar, as the skate slice hands it to the pop. */
export interface TimedPop {
  intended: TrickInputs;
  /** When the bar was released, ms into the sweep. */
  releaseMs: number;
  level: SkateLevel;
  /** The bar ran to its end with no second press. */
  timedOut: boolean;
}

/** The last release of the bar in this game, the player's or the computer's: where the bar's marker rests. */
export interface LastRelease {
  by: SkatePlayer;
  ms: number;
  timedOut: boolean;
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
  /** Which of the lab's sections are open (ADR-47). All closed at first; persisted under trick-lab.lab-folds. Not logged, not reset. */
  labFolds: Record<LabFold, boolean>;
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
  /**
   * The automatic step-down (ADR-59): the paces (median frame interval, ms)
   * of the tricks judged so far on this tier, and whether the tier has been
   * judged and kept. Only while the tier is the device's pick. Not
   * persisted (the step-down itself is, as trick-lab.quality-step), not
   * logged, not exported.
   */
  paces: number[];
  paceJudged: boolean;
  /**
   * How the scene reads the pace of a flight that has just ended (PerfProbe,
   * ADR-59): the median frame interval in ms of flight `flightId`, or null
   * if it drew too few frames or is not the flight the scene recorded. Null
   * with no scene. Asked once per landing, by the landing's resolution.
   */
  paceSource: ((flightId: number) => number | null) | null;
  /** Set when a GLB fails to load; the scene then shows the primitive board and the High and Medium options are disabled. The saved `quality` is kept; read the tier in use with effectiveQuality (quality.ts). */
  boardAssetFailed: boolean;
  /** Set when the whole 3D view fails (SceneBoundary). Not persisted, not logged. Pops then resolve at once, like reduced motion (ADR-6). */
  sceneUnavailable: boolean;
  /**
   * Set once, by the scene, when the stage first shows the tier's real scene:
   * lit, with every model of the tier drawn (ADR-56). The loading picture
   * covers the stage until then. Not persisted, not logged, not exported, not
   * announced (the picture is decorative; the scene description is the text).
   */
  stageReady: boolean;
  /**
   * The student's last landing worth a cheer (ADR-57): any landed trick in
   * the lab, and in a game a set landed as called or a copy made. `nonce`
   * goes up by one each time, so the stage's celebration plays once per
   * landing. `clean` says whether it was a clean landing (ADR-63: the
   * celebration shouts "Clean!"). Null until the first. Not persisted, not
   * logged, not exported, not announced (the result's announcement already
   * says it landed).
   */
  celebration: { nonce: number; trick: string; clean: boolean } | null;
  /** Sound effects (ADR-58). Persisted under trick-lab.sound, default off. Announced, not logged, not exported. */
  soundOn: boolean;
  /**
   * The last sound asked for, from a store action at the moment it happens:
   * the pop as the flight starts, the landing or bail when it lands (so at
   * the flight's own pace, slow motion included), then a letter and the
   * game's end. `nonce` goes up by one each time; several in one action
   * arrive one after another. Set whether or not sound is on. Not persisted,
   * not logged, not exported.
   */
  soundCue: { nonce: number; kind: SoundKind } | null;
  /** Shoes on the board. Persisted under trick-lab.feet, default on. Not logged. */
  feetVisible: boolean;
  /** The rider's legs above the shoes (ADR-37), drawn only while the feet are. Persisted under trick-lab.legs; without a saved choice, on with High and Medium and off on Low, following the level (ADR-70). Not logged, not exported. */
  legsVisible: boolean;
  /** Foot trails: the route of each shoe through the trick, with arrowheads (DESIGN.md 8.5). Persisted under trick-lab.foot-trails, default off. Not logged. User-facing name is "foot trails"; renaming the identifier is a follow-up. */
  footPathsVisible: boolean;
  /** Which foot leads (ADR-25). Persisted under trick-lab.stance, default goofy. Not logged, not reset, not exported. */
  stance: Stance;
  /** Motion cues: arrows on the deck showing how each shoe will move against the board for the set inputs (ADR-26). Persisted under trick-lab.motion-cues, default on. Not logged. */
  motionCuesVisible: boolean;
  /** Motion blur on High while a trick plays at normal speed (ADR-51). Persisted under trick-lab.motion-blur, default on. Not logged, not reset, not exported. */
  motionBlur: boolean;
  /**
   * Goes to a screen (ADR-45). Leaving the game ends it (a game in play is
   * logged as quit), a trick in the air lands at once, as under reduced
   * motion, and focus moves to the new screen's heading. Not logged.
   */
  setScreen: (screen: Screen) => void;
  /** Pauses or plays the welcome screen's preview, persisted and announced. */
  togglePreview: () => void;
  /** Opens or closes one of the lab's sections, persisted. Not announced: the button's expanded state says it. */
  toggleLabFold: (fold: LabFold) => void;
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
  /** Turns motion blur on or off, persisted and announced. */
  toggleMotionBlur: () => void;
  /** Called by the scene's error boundary when the board model cannot load. */
  setBoardAssetFailed: () => void;
  /**
   * Internal: judges a landed trick's pace (ADR-59), called by the landing's
   * resolution. While the tier is the device's pick: after the first few, if
   * they ran choppy, drops one tier, remembers it for the next visit and
   * returns what to say, which the resolution adds to the landing's own
   * announcement (one message, so neither is lost); otherwise keeps the tier
   * and stops judging it, and returns null. Never logged.
   */
  noteTrickPace: (ms: number) => string | null;
  /** Called by the scene (PerfProbe) to register, or with null to remove, its pace source. */
  setPaceSource: (source: ((flightId: number) => number | null) | null) => void;
  /** Called by SceneBoundary when the 3D view cannot render: announces once and resolves a flight in the air. */
  setSceneUnavailable: () => void;
  /** Called by the scene (StageReady) when the tier's real scene is first drawn. Once; never undone. */
  setStageReady: () => void;
  /** Internal: marks a landing to celebrate. Called from store actions only (the landing's resolution and the game's scoring). */
  celebrate: (trick: string, clean: boolean) => void;
  /** Turns sound on or off, persisted and announced (ADR-58). */
  toggleSound: () => void;
  /** Internal: asks for a sound. Called from store actions only. */
  cue: (kind: SoundKind) => void;
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
  /** Ends a game in play (logged as quit), or closes a finished one, back to the game screen's How to play. */
  quitSkate: () => void;
  /** Internal, popTrick: on the computer's turn, its try (what it set, when it released the bar, the inputs that made) and the announcement lead; null on the student's turn. */
  computerGo: () => { inputs: TrickInputs; intended: TrickInputs; releaseMs: number; lead: string; call: string } | null;
  /** Internal, the playback slice's resolve: applies the rules to a resolved flight. Logs, and returns the sentences to announce. */
  scoreSkate: (result: TrickResult, by: SkatePlayer) => string[];
  /** Internal, resetSession: ends a game in play, logged as reset. */
  endSkateOnReset: () => void;
  /** How the player pops in a game (ADR-65). Persisted under trick-lab.pop-mode, default timed. A preference: never logged, not exported, not reset. */
  popMode: PopMode;
  /** Picks how you pop; only between games. Persisted and announced. */
  setPopMode: (mode: PopMode) => void;
  /** The timing bar that is running, or null (ADR-65). Not persisted, not logged. */
  pendingPop: PendingPop | null;
  /** Where the bar was last released in this game, by either player; null before the first and in Exact. Not logged (trick.popped carries the release). */
  lastRelease: LastRelease | null;
  /**
   * Pop on the game screen (the button and Space). On the player's go with
   * the timing bar: the first press starts the bar (announced), the second
   * releases it, and with no second press the bar releases itself at its
   * end. Anywhere else it is popTrick: Exact, the computer's go, or what is
   * wrong (no call yet, a board in the air).
   */
  pressPop: () => void;
  /** Drops a running bar with no attempt and no letter, and says "Pop cancelled." (a dialog opening, the tab hidden). Nothing if no bar is running. */
  cancelPop: () => void;
  /** Internal: drops a running bar without announcing, and returns "Pop cancelled. " for the caller's own announcement, or "" if none was running. */
  dropPop: () => string;
  /** The player has been through the first game's walk-through, or skipped it (ADR-66). Persisted under trick-lab.skate-taught. Not logged. */
  skateTaught: boolean;
  /** The walk-through is running: this game is the player's first, and they have not popped in it yet (ADR-66). Its prompts are derived (lessonFor). Not logged. */
  skateLesson: boolean;
  /** Ends the walk-through for good, and says so. */
  skipLesson: () => void;
  /** Internal, the player's pop: the walk-through is over, and remembered as done. */
  endLesson: () => void;
  /** Internal, a slider or the call changed: says the walk-through's next prompt when its setup has just been reached. */
  lessonMoved: () => void;
}

/**
 * The player's records, kept on this device between visits (ADR-64): the
 * tricks landed and their best grade, games won and lost per level, and the
 * run of wins. Saved under trick-lab.records. Never logged, never exported,
 * not cleared by Reset.
 */
export interface RecordsSlice {
  records: Records;
  /** "Clear records" was pressed and is waiting for the player to confirm it. Not logged. */
  recordsClearAsked: boolean;
  /** Internal, the landing's resolution: the player landed this trick (a bail or a trick with no name changes nothing). */
  noteLanding: (result: TrickResult) => void;
  /** Internal, the game's scoring: a game against this level ended, won or lost. */
  noteGame: (level: SkateLevel, won: boolean) => void;
  /** Asks before clearing; with nothing to clear it says so instead. */
  requestClearRecords: () => void;
  /** The player confirmed: every record is cleared, saved and announced. */
  confirmClearRecords: () => void;
  /** The player kept the records. */
  cancelClearRecords: () => void;
}

export type TrickState = InputsSlice & PlaybackSlice & AssessmentSlice & UiSlice & SkateSlice & RecordsSlice;
