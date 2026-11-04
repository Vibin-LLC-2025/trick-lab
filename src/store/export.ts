import type { TrickState } from './types';

/** Shape of the downloadable assessment record. Always the full log, never the panel's window. */
export function buildExport(s: Pick<TrickState, 'events' | 'completed'>, at: Date) {
  return {
    schema: 'trick-lab.events/1',
    experiment: 'land-the-trick',
    exportedAt: at.toISOString(),
    objectivesCompleted: s.completed,
    events: s.events,
  };
}

export const exportFilename = (at: Date) => `trick-lab-events-${at.toISOString().slice(0, 10)}.json`;
