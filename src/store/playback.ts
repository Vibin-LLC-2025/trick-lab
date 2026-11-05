import type { StateCreator } from 'zustand';
import { computeFlight } from '../sim/flight';
import { describeInputs, describeResult } from '../sim/format';
import { newlyCompleted, objectiveLabel, OBJECTIVES, recognize } from '../sim/tricks';
import { liveProgress, type Playhead } from './playhead';
import { DEFAULT_SLOW, snapSpeed, speedIndex, speedText, SPEEDS } from './speed';
import type { PlaybackSlice, TrickState } from './types';

export const initialPlayback = () => ({
  status: 'idle' as const,
  progress: 0,
  rate: 1,
  slowRate: DEFAULT_SLOW,
  flight: null,
  result: null,
  scrubFrom: null,
});

/**
 * Whether a pop plays as an animation (ADR-6). Not under reduced motion, and
 * not once the 3D view has failed (no FlightDriver is left to advance it):
 * then a pop resolves at once and the timeline steps through the flight.
 */
export const animates = (s: Pick<TrickState, 'reducedMotion' | 'sceneUnavailable'>) => !s.reducedMotion && !s.sceneUnavailable;

/** A popped flight that has not resolved yet: playing or paused. */
export const inFlight = (s: Pick<TrickState, 'flight' | 'result'>) => s.flight !== null && s.result === null;

const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
const pct = (u: number) => Math.round(u * 100);
const round = (x: number, dp: number) => Number(x.toFixed(dp));
const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1) + '.';

/** `head` is this store's live playhead (playhead.ts), shared with FlightDriver. */
export const createPlaybackSlice =
  (head: Playhead): StateCreator<TrickState, [], [], PlaybackSlice> =>
  (set, get) => {
    /** Resolves the current flight: logs, scores objectives, announces. */
    const resolve = (lead: string[]) => {
      const s = get();
      if (!s.flight || s.result) return;
      const result = recognize(s.flight);
      set({ status: 'done', progress: 1, result, scrubFrom: null });
      head.progress = 1;
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
        const flightId = s.flightId + 1;
        // The new flight owns the playhead from its first frame.
        head.flightId = flightId;
        head.progress = 0;
        set({
          status: 'playing',
          progress: 0,
          flight: computeFlight(inputs),
          flightId,
          result: null,
          scrubFrom: null,
        });
        s.log('trick.popped', { ...inputs, preset: s.activePreset });
        const lead = `Popped with ${describeInputs(inputs)}.`;
        // Reduced motion, or no 3D view: no playback at all. Resolve now and
        // leave the board at its final pose; the timeline steps through the flight.
        if (!animates(s)) resolve([lead]);
        else s.announce(lead);
      },

      togglePause: () => {
        const s = get();
        if (s.status === 'playing') {
          // Freeze where the board is, not at the last 10 Hz commit.
          const progress = clamp01(liveProgress(head, s));
          head.flightId = s.flightId;
          head.progress = progress;
          set({ status: 'paused', progress });
          s.announce('Paused. Use the timeline to scrub.');
        } else if (s.status === 'paused') {
          // Nothing may play once motion is off or the view is gone: resolve instead.
          if (!animates(s)) {
            resolve([]);
            return;
          }
          head.flightId = s.flightId;
          head.progress = s.progress;
          set({ status: 'playing' });
          s.announce('Resumed.');
        }
      },

      setRate: (value) => {
        const rate = snapSpeed(value);
        if (rate === get().rate) return;
        set(rate < 1 ? { rate, slowRate: rate } : { rate });
      },

      stepRate: (direction) => {
        const s = get();
        const i = Math.min(SPEEDS.length - 1, Math.max(0, speedIndex(s.rate) + direction));
        const rate = SPEEDS[i]!;
        if (rate === s.rate) {
          s.announce(direction < 0 ? `Already the slowest, ${speedText(rate)}.` : `Already the fastest, ${speedText(rate)}.`);
          return;
        }
        s.setRate(rate);
        s.announce(sentence(speedText(rate)));
      },

      toggleSlowMotion: () => {
        const s = get();
        const rate = s.rate < 1 ? 1 : s.slowRate;
        set({ rate });
        s.announce(rate === 1 ? 'Slow motion off, normal speed.' : `Slow motion on, ${speedText(rate)}.`);
      },

      scrub: (progress) => {
        const s = get();
        if (!s.flight || s.status === 'idle') return;
        // The gesture starts where the board is (the live playhead while
        // playing); the destination the student picked always wins.
        const scrubFrom = s.scrubFrom ?? clamp01(liveProgress(head, s));
        const to = clamp01(progress);
        head.flightId = s.flightId;
        head.progress = to;
        set({ progress: to, status: s.status === 'playing' ? 'paused' : s.status, scrubFrom });
      },

      commitScrub: () => {
        const { scrubFrom, progress, log } = get();
        if (scrubFrom === null) return;
        set({ scrubFrom: null });
        if (pct(scrubFrom) !== pct(progress)) log('playback.scrubbed', { from: pct(scrubFrom), to: pct(progress) });
      },

      syncProgress: (progress) => {
        const s = get();
        if (s.status !== 'playing') return;
        const p = clamp01(progress);
        // The driver commits its own playhead value; keep the two in step.
        if (head.flightId === s.flightId) head.progress = p;
        set({ progress: p });
      },

      land: (lead) => resolve(lead ? [lead] : []),
    };
  };
