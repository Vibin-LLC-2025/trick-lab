// The live playhead (ADR-4, 2026-11-04 audit fix). While a trick plays,
// FlightDriver advances progress every frame but commits it to the store only
// at 10 Hz, so the store's `progress` can be up to 100 ms stale. Pause and
// scrub must start from where the board actually is, so the driver also
// writes the current progress into this one mutable object, every frame and
// without allocating. It lives beside the store, not in its state: writing it
// never notifies a subscriber and never renders React.

import type { TrickState } from './types';

export interface Playhead {
  /** The flightId the progress belongs to; -1 when it belongs to none (before the first pop, after reset). */
  flightId: number;
  /** 0 to 1 of that flight's airtime. */
  progress: number;
}

/** One per store, made by createTrickStore before any frame can run. */
export const createPlayhead = (): Playhead => ({ flightId: -1, progress: 0 });

/**
 * Where the board is now. The playhead while it belongs to the current
 * flight and the flight is playing; otherwise the store's own progress, which
 * is authoritative whenever nothing is advancing it (paused, scrubbed, done,
 * idle) and is mirrored into the playhead by the actions that set it.
 */
export function liveProgress(head: Playhead, s: Pick<TrickState, 'status' | 'flight' | 'flightId' | 'progress'>): number {
  return s.status === 'playing' && s.flight !== null && head.flightId === s.flightId ? head.progress : s.progress;
}
