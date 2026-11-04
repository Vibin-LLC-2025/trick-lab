import type { Flight, TrickInputs } from '../sim/flight';
import type { InputKey, PresetId, TrickResult } from '../sim/tricks';

export type EventType =
  | 'input.changed'
  | 'preset.applied'
  | 'trick.popped'
  | 'trick.resolved'
  | 'playback.scrubbed'
  | 'objective.completed'
  | 'session.reset';

export interface TrickEvent {
  id: string;
  /** ms since session start, rounded */
  t: number;
  type: EventType;
  payload: Record<string, string | number | boolean | null>;
}

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'done';
export type PlaybackRate = 1 | 0.25;
export type FocusTarget = { kind: 'setup-heading' };
export type Theme = 'dark' | 'light';
/** Board level of detail: the GLB model (high) or the primitive board (low). */
export type BoardDetail = 'high' | 'low';

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
  rate: PlaybackRate;
  /** The flight being played or last played; null before the first pop and after reset. */
  flight: Flight | null;
  /** Increments on every pop so the render loop can tell a new flight from a resumed one. */
  flightId: number;
  /** Recognized result of the last landed flight; null until it lands. */
  result: TrickResult | null;
  /** Progress when the current scrub gesture started; null when not scrubbing. */
  scrubFrom: number | null;
  /** Pops with the current inputs. Under reduced motion the trick resolves at once. */
  popTrick: () => void;
  togglePause: () => void;
  toggleSlowMotion: () => void;
  /** Moves the frozen board. Pauses a playing flight. Logs nothing until commitScrub. */
  scrub: (progress: number) => void;
  /** Ends a scrub gesture (pointer up, key up, blur): one playback.scrubbed event. */
  commitScrub: () => void;
  /** Called by FlightDriver: the 10 Hz progress commit. Not logged. */
  syncProgress: (progress: number) => void;
  /** Called by FlightDriver when progress reaches 1, or by popTrick under reduced motion. */
  land: () => void;
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
  perfVisible: boolean;
  shortcutsOpen: boolean;
  theme: Theme;
  /** Mirrors prefers-reduced-motion; App keeps it in sync. */
  reducedMotion: boolean;
  announcement: { message: string; nonce: number };
  focusRequest: (FocusTarget & { nonce: number }) | null;
  /** Increments when the student asks to reset the camera. */
  viewResetNonce: number;
  /** Persisted under trick-lab.board-detail. Not logged: the event contract has no UI events. */
  boardDetail: BoardDetail;
  /** Set when the GLB fails to load; the scene then shows the primitive board and the control is disabled. */
  boardAssetFailed: boolean;
  togglePerf: () => void;
  setShortcutsOpen: (open: boolean) => void;
  toggleTheme: () => void;
  setReducedMotion: (reduced: boolean) => void;
  resetView: () => void;
  setBoardDetail: (detail: BoardDetail) => void;
  /** Called by the scene's error boundary when the board model cannot load. */
  setBoardAssetFailed: () => void;
  announce: (message: string) => void;
  requestFocus: (target: FocusTarget) => void;
}

export type TrickState = InputsSlice & PlaybackSlice & AssessmentSlice & UiSlice;
