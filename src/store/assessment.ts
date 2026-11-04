import type { StateCreator } from 'zustand';
import type { AssessmentSlice, TrickState } from './types';
import { initialInputs } from './inputs';
import { initialPlayback } from './playback';

export type Clock = () => number;

export const createAssessmentSlice =
  (now: Clock): StateCreator<TrickState, [], [], AssessmentSlice> =>
  (set, get) => {
    let seq = 0;
    return {
      sessionStart: now(),
      events: [],
      completed: [],

      log: (type, payload = {}) => {
        seq += 1;
        const t = Math.round(now() - get().sessionStart);
        set((s) => ({ events: [...s.events, { id: `e${seq}`, t, type, payload }] }));
      },

      // Inputs, board pose and score go back to the start; the event log is
      // kept, because a reset is itself an assessable action (ADR-7).
      resetSession: () => {
        set({ ...initialInputs(), ...initialPlayback(), completed: [] });
        get().log('session.reset');
        get().requestFocus({ kind: 'setup-heading' });
        get().announce('Reset. Inputs are back to defaults, the board is on the pad and objectives are cleared.');
      },
    };
  };
