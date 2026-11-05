import { create } from 'zustand';
import { createAssessmentSlice, type Clock } from './assessment';
import { createInputsSlice } from './inputs';
import { createPlaybackSlice } from './playback';
import { createPlayhead, type Playhead } from './playhead';
import { createUiSlice } from './ui';
import type { TrickState } from './types';

export { SPEEDS, speedIndex, speedLabel, speedText } from './speed';
export { animates } from './playback';
export { effectiveQuality } from './quality';
export { liveProgress, type Playhead } from './playhead';

export type { TrickState, TrickEvent, EventType, FocusTarget, Theme, Quality, Stance, PlaybackStatus, PlaybackRate } from './types';

/**
 * Factory so tests can inject a deterministic clock and get an isolated store.
 * Each store gets its own live playhead (playhead.ts), as `store.playhead`:
 * one mutable object, made here before any frame can run, never replaced,
 * and outside the reactive state, so two stores never share it.
 */
export const createTrickStore = (now: Clock = () => performance.now()) => {
  const playhead: Playhead = createPlayhead();
  const store = create<TrickState>()((...a) => ({
    ...createInputsSlice(...a),
    ...createPlaybackSlice(playhead)(...a),
    ...createAssessmentSlice(now, playhead)(...a),
    ...createUiSlice(...a),
  }));
  return Object.assign(store, { playhead });
};

export const useTrickStore = createTrickStore();
