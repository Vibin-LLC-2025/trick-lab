import type { TrickState } from './types';

/**
 * Shape of the downloadable assessment record. Always the full log, never the
 * panel's window. Schema 2 (ADR-63, 2026-11-09): `trick.resolved` carries the
 * landing's `grade` (clean, sketchy or bail) beside `landed`. Nothing was
 * removed from schema 1.
 */
export function buildExport(s: Pick<TrickState, 'events' | 'completed'>, at: Date) {
  return {
    schema: 'trick-lab.events/2',
    experiment: 'land-the-trick',
    exportedAt: at.toISOString(),
    objectivesCompleted: s.completed,
    events: s.events,
  };
}

export const exportFilename = (at: Date) => `trick-lab-events-${at.toISOString().slice(0, 10)}.json`;
