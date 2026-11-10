import { create } from 'zustand';
import { createAssessmentSlice, type Clock } from './assessment';
import { createInputsSlice } from './inputs';
import { createPlaybackSlice } from './playback';
import { createPlayhead, type Playhead } from './playhead';
import { createRecordsSlice, localDate, type Today } from './records';
import { createSkateSlice, type Random, type Schedule } from './skate';
import { createUiSlice } from './ui';
import type { TrickState } from './types';

export { SPEEDS, speedIndex, speedLabel, speedText } from './speed';
export { animates } from './playback';
export { effectiveQuality } from './quality';
export { LAB_FOLDS, previewAnimates, previewCanPlay, screenFromHash, screenHash, SCREENS } from './ui';
export { liveProgress, type Playhead } from './playhead';
export { computerWaiting, landingMoves, rollAllowed, rollMoves, type LandingState, type RollState } from './roll';

export type { Random, Schedule } from './skate';
export { TAUGHT_KEY } from './skate';
export { hasRecords, RECORD_TRICKS, recordCounts, type Records, type Today, type TrickRecord } from './records';
export type { TrickState, TrickEvent, EventType, FocusTarget, LabFold, LeaveTarget, Screen, Theme, Quality, Stance, CameraView, PlaybackStatus, PlaybackRate, SoundKind, PopMode, PendingPop, LastRelease } from './types';

/** The app's scheduler for the timing bar's end (ADR-65): a plain timeout. */
const timeout: Schedule = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/**
 * Factory so tests can inject a deterministic clock, the computer's random
 * numbers (the game of SKATE, ADR-43), today's date (the records, ADR-64)
 * and the scheduler that ends the timing bar (ADR-65), and get an isolated
 * store.
 * Each store gets its own live playhead (playhead.ts), as `store.playhead`:
 * one mutable object, made here before any frame can run, never replaced,
 * and outside the reactive state, so two stores never share it.
 */
export const createTrickStore = (
  now: Clock = () => performance.now(),
  random: Random = () => Math.random(),
  today: Today = () => localDate(),
  schedule: Schedule = timeout,
) => {
  const playhead: Playhead = createPlayhead();
  const store = create<TrickState>()((...a) => ({
    ...createInputsSlice(...a),
    ...createPlaybackSlice(playhead)(...a),
    ...createAssessmentSlice(now, playhead)(...a),
    ...createUiSlice(...a),
    ...createSkateSlice(random, now, schedule)(...a),
    ...createRecordsSlice(today)(...a),
  }));
  return Object.assign(store, { playhead });
};

export const useTrickStore = createTrickStore();
