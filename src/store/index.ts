import { create } from 'zustand';
import { createAssessmentSlice, type Clock } from './assessment';
import { createInputsSlice } from './inputs';
import { createPlaybackSlice } from './playback';
import { createPlayhead, type Playhead } from './playhead';
import { createSkateSlice, type Random } from './skate';
import { createUiSlice } from './ui';
import type { TrickState } from './types';

export { SPEEDS, speedIndex, speedLabel, speedText } from './speed';
export { animates } from './playback';
export { effectiveQuality } from './quality';
export { previewAnimates, previewCanPlay, screenFromHash, screenHash, SCREENS } from './ui';
export { liveProgress, type Playhead } from './playhead';

export type { Random } from './skate';
export type { TrickState, TrickEvent, EventType, FocusTarget, Screen, Theme, Quality, Stance, CameraView, PlaybackStatus, PlaybackRate } from './types';

/**
 * Factory so tests can inject a deterministic clock and the computer's random
 * numbers (the game of SKATE, ADR-43), and get an isolated store.
 * Each store gets its own live playhead (playhead.ts), as `store.playhead`:
 * one mutable object, made here before any frame can run, never replaced,
 * and outside the reactive state, so two stores never share it.
 */
export const createTrickStore = (now: Clock = () => performance.now(), random: Random = () => Math.random()) => {
  const playhead: Playhead = createPlayhead();
  const store = create<TrickState>()((...a) => ({
    ...createInputsSlice(...a),
    ...createPlaybackSlice(playhead)(...a),
    ...createAssessmentSlice(now, playhead)(...a),
    ...createUiSlice(...a),
    ...createSkateSlice(random)(...a),
  }));
  return Object.assign(store, { playhead });
};

export const useTrickStore = createTrickStore();
