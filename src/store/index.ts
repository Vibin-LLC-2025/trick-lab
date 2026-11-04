import { create } from 'zustand';
import { createAssessmentSlice, type Clock } from './assessment';
import { createInputsSlice } from './inputs';
import { createPlaybackSlice } from './playback';
import { createUiSlice } from './ui';
import type { TrickState } from './types';

export type { TrickState, TrickEvent, EventType, FocusTarget, Theme, BoardDetail, PlaybackStatus, PlaybackRate } from './types';

/** Factory so tests can inject a deterministic clock and get an isolated store. */
export const createTrickStore = (now: Clock = () => performance.now()) =>
  create<TrickState>()((...a) => ({
    ...createInputsSlice(...a),
    ...createPlaybackSlice(...a),
    ...createAssessmentSlice(now)(...a),
    ...createUiSlice(...a),
  }));

export const useTrickStore = createTrickStore();
