import type { StateCreator } from 'zustand';
import type { AssessmentSlice, TrickState } from './types';
import { initialInputs } from './inputs';
import { initialPlayback } from './playback';
import type { Playhead } from './playhead';
import { skateActive } from '../sim/skate';

export type Clock = () => number;

export const createAssessmentSlice =
  (now: Clock, head: Playhead): StateCreator<TrickState, [], [], AssessmentSlice> =>
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
        // The playhead belongs to no flight until the next pop.
        head.flightId = -1;
        head.progress = 0;
        const inGame = skateActive(get().skate);
        // A game in play ends, logged before the reset (ADR-43); the computer's level is kept.
        get().endSkateOnReset();
        set({ ...initialInputs(), ...initialPlayback(), completed: [] });
        get().log('session.reset');
        get().requestFocus({ kind: 'setup-heading' });
        get().announce(
          `Reset. Inputs are back to defaults, the board is on the pad and objectives are cleared.${inGame ? ' The game of SKATE ended.' : ''}`,
        );
      },
    };
  };
