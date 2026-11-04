import type { StateCreator } from 'zustand';
import { computeFlight } from '../sim/flight';
import { describeInputs, describeResult } from '../sim/format';
import { newlyCompleted, objectiveLabel, OBJECTIVES, recognize } from '../sim/tricks';
import type { PlaybackSlice, TrickState } from './types';

export const initialPlayback = () => ({
  status: 'idle' as const,
  progress: 0,
  rate: 1 as const,
  flight: null,
  result: null,
  scrubFrom: null,
});

const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
const pct = (u: number) => Math.round(u * 100);
const round = (x: number, dp: number) => Number(x.toFixed(dp));

export const createPlaybackSlice: StateCreator<TrickState, [], [], PlaybackSlice> = (set, get) => {
  /** Resolves the current flight: logs, scores objectives, announces. */
  const resolve = (lead: string[]) => {
    const s = get();
    if (!s.flight || s.result) return;
    const result = recognize(s.flight);
    set({ status: 'done', progress: 1, result, scrubFrom: null });
    s.log('trick.resolved', {
      trick: result.id,
      name: result.name,
      landed: result.landed,
      outcome: result.outcome,
      rollTotal: round(result.rollTotal, 1),
      yawTotal: round(result.yawTotal, 1),
      airtime: round(result.airtime, 3),
    });

    const out = [...lead, describeResult(result)];
    const fresh = newlyCompleted(result, s.completed);
    if (fresh.length > 0) {
      const completed = [...s.completed, ...fresh];
      set({ completed });
      for (const id of fresh) {
        s.log('objective.completed', { objective: id });
        out.push(`Objective complete: ${objectiveLabel(id)}.`);
      }
      out.push(`${completed.length} of ${OBJECTIVES.length} objectives done.`);
    }
    s.announce(out.join(' '));
  };

  return {
    ...initialPlayback(),
    flightId: 0,

    popTrick: () => {
      const s = get();
      if (s.status === 'playing') {
        s.announce('The board is still in the air.');
        return;
      }
      const inputs = { pop: s.pop, flick: s.flick, scoop: s.scoop };
      set({
        status: 'playing',
        progress: 0,
        flight: computeFlight(inputs),
        flightId: s.flightId + 1,
        result: null,
        scrubFrom: null,
      });
      s.log('trick.popped', { ...inputs, preset: s.activePreset });
      const lead = `Popped with ${describeInputs(inputs)}.`;
      // Reduced motion: no playback at all. Resolve now and leave the board at
      // its final pose; the timeline lets the student step through the flight.
      if (s.reducedMotion) resolve([lead]);
      else s.announce(lead);
    },

    togglePause: () => {
      const { status, announce } = get();
      if (status === 'playing') {
        set({ status: 'paused' });
        announce('Paused. Use the timeline to scrub.');
      } else if (status === 'paused') {
        set({ status: 'playing' });
        announce('Resumed.');
      }
    },

    toggleSlowMotion: () => {
      const rate = get().rate === 1 ? 0.25 : 1;
      set({ rate });
      get().announce(rate === 1 ? 'Slow motion off.' : 'Slow motion on, quarter speed.');
    },

    scrub: (progress) => {
      const s = get();
      if (!s.flight || s.status === 'idle') return;
      set({
        progress: clamp01(progress),
        status: s.status === 'playing' ? 'paused' : s.status,
        scrubFrom: s.scrubFrom ?? s.progress,
      });
    },

    commitScrub: () => {
      const { scrubFrom, progress, log } = get();
      if (scrubFrom === null) return;
      set({ scrubFrom: null });
      if (pct(scrubFrom) !== pct(progress)) log('playback.scrubbed', { from: pct(scrubFrom), to: pct(progress) });
    },

    syncProgress: (progress) => {
      if (get().status === 'playing') set({ progress: clamp01(progress) });
    },

    land: () => resolve([]),
  };
};
