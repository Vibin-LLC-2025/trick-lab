import { create } from 'zustand';
import { createAssessmentSlice, type Clock } from './assessment';
import { createInputsSlice } from './inputs';
import { createPlaybackSlice } from './playback';
import { createPlayhead, type Playhead } from './playhead';
import { createRecordsSlice, localDate, type Today } from './records';
import { createSkateSlice, type Random } from './skate';
import { createUiSlice } from './ui';
import type { TrickState } from './types';

export { GAME_PACE, playRate, SPEEDS, speedIndex, speedLabel, speedText } from './speed';
export { animates } from './playback';
export { effectiveQuality } from './quality';
export { LAB_FOLDS, previewAnimates, previewCanPlay, screenFromHash, screenHash, SCREENS } from './ui';
export { liveProgress, type Playhead } from './playhead';
export { noticeUp, type SkateNotice } from './notice';
export { computerWaiting, landingMoves, rollAllowed, rollMoves, type LandingState, type RollState } from './roll';
export { boardRider, DECK_KEY, shownDeck } from './deck';
export { GAME_VIEW_LABEL, GAME_VIEWS, replayMoves, type GameView, type ReplayState } from './replay';

export type { Random } from './skate';
export { TAUGHT_KEY } from './skate';
export { hasRecords, RECORD_TRICKS, recordCounts, type Records, type Today, type TrickRecord } from './records';
export type { TrickState, TrickEvent, EventType, FocusTarget, LabFold, LeaveTarget, Screen, Theme, Quality, Stance, CameraView, PlaybackStatus, PlaybackRate, SoundKind, PopMode, PendingPop, LastRelease } from './types';

/**
 * Factory so tests can inject a deterministic clock, the computer's random
 * numbers (the game of SKATE, ADR-43) and today's date (the records,
 * ADR-64), and get an isolated store. The timing bar reads the clock (ADR-65)
 * and goes round until the player releases it (ADR-78), so it needs no
 * scheduler.
 * Each store gets its own live playhead (playhead.ts), as `store.playhead`:
 * one mutable object, made here before any frame can run, never replaced,
 * and outside the reactive state, so two stores never share it.
 */
export const createTrickStore = (
  now: Clock = () => performance.now(),
  random: Random = () => Math.random(),
  today: Today = () => localDate(),
) => {
  const playhead: Playhead = createPlayhead();
  const store = create<TrickState>()((...a) => ({
    ...createInputsSlice(...a),
    ...createPlaybackSlice(playhead)(...a),
    ...createAssessmentSlice(now, playhead)(...a),
    ...createUiSlice(...a),
    ...createSkateSlice(random, now)(...a),
    ...createRecordsSlice(today)(...a),
  }));
  return Object.assign(store, { playhead });
};

export const useTrickStore = createTrickStore();
