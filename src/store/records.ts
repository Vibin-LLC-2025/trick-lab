import type { StateCreator } from 'zustand';
import { SKATE_LEVEL_ORDER, type SkateLevel } from '../sim/skate';
import { NAMED_TRICKS, type TrickId, type TrickResult } from '../sim/tricks';
import { readPref, savePref } from './prefs';
import type { RecordsSlice, TrickState } from './types';

/** The player's records on this device (ADR-64), as versioned JSON. */
export const RECORDS_KEY = 'trick-lab.records';
export const RECORDS_VERSION = 1;

/** One named trick's record: the first day it was landed (YYYY-MM-DD, the device's own date) and the best grade so far. */
export interface TrickRecord {
  first: string;
  best: 'clean' | 'sketchy';
}

/**
 * What is remembered between visits (ADR-64): per named trick, the first
 * landing and the best grade; per level, games won and lost against the
 * computer; and the current run of wins, at any level. Never logged, never
 * exported, not cleared by Reset.
 */
export interface Records {
  tricks: Partial<Record<TrickId, TrickRecord>>;
  games: Record<SkateLevel, { won: number; lost: number }>;
  streak: number;
}

export const emptyRecords = (): Records => ({
  tricks: {},
  games: { easy: { won: 0, lost: 0 }, normal: { won: 0, lost: 0 }, hard: { won: 0, lost: 0 } },
  streak: 0,
});

/** The tricks a record can be kept for: every named trick, the ollie included, in table order. */
export const RECORD_TRICKS = NAMED_TRICKS;

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Reads saved records. Anything missing, broken, from another version or not
 * shaped like a record is dropped piece by piece, so one bad field never
 * loses the rest, and nothing saved can crash the app.
 */
export function parseRecords(raw: string | null): Records {
  const out = emptyRecords();
  if (!raw) return out;
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return out;
  }
  if (typeof saved !== 'object' || saved === null || (saved as { v?: unknown }).v !== RECORDS_VERSION) return out;
  const s = saved as { tricks?: unknown; games?: unknown; streak?: unknown };
  if (typeof s.tricks === 'object' && s.tricks !== null) {
    for (const t of RECORD_TRICKS) {
      const r = (s.tricks as Record<string, unknown>)[t.id];
      if (typeof r !== 'object' || r === null) continue;
      const { first, best } = r as { first?: unknown; best?: unknown };
      if (isDate(first) && (best === 'clean' || best === 'sketchy')) out.tricks[t.id] = { first, best };
    }
  }
  if (typeof s.games === 'object' && s.games !== null) {
    for (const level of SKATE_LEVEL_ORDER) {
      const g = (s.games as Record<string, unknown>)[level];
      if (typeof g !== 'object' || g === null) continue;
      out.games[level] = { won: count((g as { won?: unknown }).won), lost: count((g as { lost?: unknown }).lost) };
    }
  }
  out.streak = count(s.streak);
  return out;
}

export const serializeRecords = (r: Records) => JSON.stringify({ v: RECORDS_VERSION, ...r });

/**
 * The records after the player lands `result` on `date`. A trick with no name
 * and a bail change nothing. The first landing sets the date and the grade; a
 * later clean landing lifts a sketchy best to clean; the date never moves.
 * Returns the same object when nothing changed.
 */
export function withLanding(r: Records, result: Pick<TrickResult, 'id' | 'grade'>, date: string): Records {
  if (result.id === 'unnamed' || result.grade === 'bail') return r;
  const had = r.tricks[result.id];
  if (!had) return { ...r, tricks: { ...r.tricks, [result.id]: { first: date, best: result.grade } } };
  if (had.best === 'sketchy' && result.grade === 'clean') return { ...r, tricks: { ...r.tricks, [result.id]: { ...had, best: 'clean' } } };
  return r;
}

/** The records after a game against `level` ends: a win extends the run of wins, a loss ends it. */
export function withGame(r: Records, level: SkateLevel, won: boolean): Records {
  const g = r.games[level];
  return {
    ...r,
    games: { ...r.games, [level]: won ? { ...g, won: g.won + 1 } : { ...g, lost: g.lost + 1 } },
    streak: won ? r.streak + 1 : 0,
  };
}

/** How many tricks are landed, and how many of those clean. */
export function recordCounts(r: Records): { landed: number; clean: number; of: number } {
  const all = RECORD_TRICKS.map((t) => r.tricks[t.id]).filter((t) => t !== undefined);
  return { landed: all.length, clean: all.filter((t) => t.best === 'clean').length, of: RECORD_TRICKS.length };
}

/** Whether there is anything to clear. */
export const hasRecords = (r: Records) =>
  Object.keys(r.tricks).length > 0 || r.streak > 0 || SKATE_LEVEL_ORDER.some((l) => r.games[l].won + r.games[l].lost > 0);

/** Today's date on this device, YYYY-MM-DD. The store takes it as a parameter so tests are exact. */
export type Today = () => string;
export const localDate = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The records slice (ADR-64). Store actions write the records (the landing's
 * resolution and the game's scoring), never components; every change is saved
 * at once. Nothing here is logged or exported.
 */
export const createRecordsSlice =
  (today: Today): StateCreator<TrickState, [], [], RecordsSlice> =>
  (set, get) => {
    const keep = (records: Records) => {
      if (records === get().records) return;
      savePref(RECORDS_KEY, serializeRecords(records));
      set({ records });
    };
    return {
      records: parseRecords(readPref(RECORDS_KEY)),
      recordsClearAsked: false,

      noteLanding: (result) => keep(withLanding(get().records, result, today())),
      noteGame: (level, won) => keep(withGame(get().records, level, won)),

      requestClearRecords: () => {
        const s = get();
        if (!hasRecords(s.records)) {
          s.announce('There are no records to clear yet.');
          return;
        }
        set({ recordsClearAsked: true });
      },
      confirmClearRecords: () => {
        if (!get().recordsClearAsked) return;
        set({ recordsClearAsked: false });
        keep(emptyRecords());
        get().announce('Records cleared.');
      },
      cancelClearRecords: () => {
        if (get().recordsClearAsked) set({ recordsClearAsked: false });
      },
    };
  };
