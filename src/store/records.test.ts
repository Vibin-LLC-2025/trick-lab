import { beforeEach, describe, expect, it } from 'vitest';
import { createTrickStore } from '.';
import { presetById } from '../sim/tricks';
import {
  emptyRecords,
  hasRecords,
  localDate,
  parseRecords,
  RECORD_TRICKS,
  recordCounts,
  RECORDS_KEY,
  serializeRecords,
  withGame,
  withLanding,
  type Records,
} from './records';

/** A store with a scripted coin flip and computer (as store/skate.test.ts) and a date that tests set. */
function makeStore(queue: number[] = []) {
  let t = 1000;
  const day = { value: '2026-11-09' };
  const store = createTrickStore(
    () => (t += 10),
    () => queue.shift() ?? 0.25,
    () => day.value,
  );
  return Object.assign(store, { day });
}
type Store = ReturnType<typeof makeStore>;
const pop = (s: Store) => {
  s.getState().popTrick();
  s.getState().land();
};
const tryInputs = (s: Store, flick: number, scoop = 0, popHeight = 0.35) => {
  s.getState().setInput('pop', popHeight);
  s.getState().setInput('flick', flick);
  s.getState().setInput('scoop', scoop);
  pop(s);
};
const saved = () => parseRecords(localStorage.getItem(RECORDS_KEY));

beforeEach(() => localStorage.clear());

describe('records, pure (ADR-64)', () => {
  it('the first landing sets the date and the grade; a clean one lifts a sketchy best; the date never moves', () => {
    let r = emptyRecords();
    r = withLanding(r, { id: 'kickflip', grade: 'sketchy' }, '2026-11-09');
    expect(r.tricks.kickflip).toEqual({ first: '2026-11-09', best: 'sketchy' });
    const same = withLanding(r, { id: 'kickflip', grade: 'sketchy' }, '2026-11-10');
    expect(same).toBe(r);
    r = withLanding(r, { id: 'kickflip', grade: 'clean' }, '2026-11-11');
    expect(r.tricks.kickflip).toEqual({ first: '2026-11-09', best: 'clean' });
    // Clean stays clean, and a bail or a trick with no name changes nothing.
    expect(withLanding(r, { id: 'kickflip', grade: 'sketchy' }, '2026-11-12')).toBe(r);
    expect(withLanding(r, { id: 'kickflip', grade: 'bail' }, '2026-11-12')).toBe(r);
    expect(withLanding(r, { id: 'unnamed', grade: 'clean' }, '2026-11-12')).toBe(r);
    expect(recordCounts(r)).toEqual({ landed: 1, clean: 1, of: 16 });
    expect(RECORD_TRICKS.map((t) => t.id)).toContain('ollie');
  });

  it('games count per level, and a loss ends the run of wins', () => {
    let r = emptyRecords();
    expect(hasRecords(r)).toBe(false);
    r = withGame(r, 'normal', true);
    r = withGame(r, 'hard', true);
    expect(r.streak).toBe(2);
    r = withGame(r, 'normal', false);
    expect(r.games).toEqual({ easy: { won: 0, lost: 0 }, normal: { won: 1, lost: 1 }, hard: { won: 1, lost: 0 } });
    expect(r.streak).toBe(0);
    expect(hasRecords(r)).toBe(true);
  });

  it('survives a round trip, and drops anything broken without losing the rest', () => {
    const r: Records = { tricks: { kickflip: { first: '2026-11-09', best: 'clean' } }, games: { ...emptyRecords().games, easy: { won: 2, lost: 1 } }, streak: 2 };
    expect(parseRecords(serializeRecords(r))).toEqual(r);
    expect(parseRecords(null)).toEqual(emptyRecords());
    expect(parseRecords('not json')).toEqual(emptyRecords());
    expect(parseRecords('{"v":99,"streak":5}')).toEqual(emptyRecords());
    const messy = JSON.stringify({
      v: 1,
      tricks: { kickflip: { first: '2026-11-09', best: 'clean' }, heelflip: { first: 'yesterday', best: 'clean' }, 'made-up': { first: '2026-11-09', best: 'clean' }, ollie: 7 },
      games: { easy: { won: 2.9, lost: -1 }, hard: 'lots' },
      streak: 'x',
    });
    expect(parseRecords(messy)).toEqual({ tricks: { kickflip: { first: '2026-11-09', best: 'clean' } }, games: { ...emptyRecords().games, easy: { won: 2, lost: 0 } }, streak: 0 });
  });

  it("today's date is the device's own, as YYYY-MM-DD", () => {
    expect(localDate(new Date(2026, 10, 9, 23, 59))).toBe('2026-11-09');
    expect(localDate(new Date(2027, 0, 3, 0, 1))).toBe('2027-01-03');
  });
});

describe('records in the store (ADR-64)', () => {
  it("writes the player's landings from the landing's resolution, saved at once and never logged", () => {
    const store = makeStore();
    // Flick 2.0 at pop 0.35 m: a kickflip, landed sketchy.
    tryInputs(store, 2);
    expect(store.getState().records.tricks.kickflip).toEqual({ first: '2026-11-09', best: 'sketchy' });
    expect(saved().tricks.kickflip).toEqual({ first: '2026-11-09', best: 'sketchy' });
    // A day later, clean: the best grade moves, the first date does not.
    store.day.value = '2026-11-10';
    tryInputs(store, 1.9);
    expect(store.getState().records.tricks.kickflip).toEqual({ first: '2026-11-09', best: 'clean' });
    // A bail and a trick with no name are not records.
    tryInputs(store, 1.9, 0, 0.15);
    tryInputs(store, 1.9, -0.9);
    expect(Object.keys(store.getState().records.tricks)).toEqual(['kickflip']);
    const events = store.getState().events;
    expect(events.some((e) => e.type.includes('record'))).toBe(false);
    expect(JSON.stringify(events)).not.toContain('2026-11-09');
  });

  it('a new store on the same device starts from what was saved, and Reset keeps it', () => {
    const first = makeStore();
    tryInputs(first, 0, 0.9);
    const next = makeStore();
    expect(next.getState().records.tricks['pop-shove-it']).toEqual({ first: '2026-11-09', best: 'clean' });
    next.getState().resetSession();
    expect(next.getState().records.tricks['pop-shove-it']).toBeDefined();
    expect(saved().tricks['pop-shove-it']).toBeDefined();
  });

  it("the computer's landings are not the player's records", () => {
    // The computer wins the coin flip and lands its heelflip.
    const store = makeStore([0.75]);
    store.getState().startSkate();
    pop(store);
    expect(store.getState().flightBy).toBe('computer');
    expect(store.getState().result?.landed).toBe(true);
    expect(store.getState().records.tricks).toEqual({});
  });

  it('a finished game goes on the record for its level: a loss here, and the run of wins ends', () => {
    localStorage.setItem(RECORDS_KEY, serializeRecords({ ...emptyRecords(), streak: 3 }));
    const store = makeStore([0.75]);
    store.getState().startSkate();
    // The computer sets and never misses; the player answers every set with an ollie and takes five letters.
    for (let i = 0; i < 40 && store.getState().skate.phase !== 'over'; i++) {
      if (store.getState().skate.phase === 'computer-set') pop(store);
      else tryInputs(store, 0);
    }
    const s = store.getState();
    expect(s.skate).toMatchObject({ phase: 'over', winner: 'computer' });
    expect(s.records.games.normal).toEqual({ won: 0, lost: 1 });
    expect(s.records.streak).toBe(0);
    expect(saved().games.normal).toEqual({ won: 0, lost: 1 });
    // The ollies were landings all the same.
    expect(s.records.tricks.ollie?.best).toBe('clean');
    // A game that is quit is not a record.
    store.getState().startSkate();
    store.getState().quitSkate();
    expect(store.getState().records.games.normal).toEqual({ won: 0, lost: 1 });
  });

  it('clearing asks first; keeping changes nothing; confirming clears, saves and says so', () => {
    const store = makeStore();
    const kick = presetById('kickflip').inputs;
    store.getState().requestClearRecords();
    expect(store.getState().recordsClearAsked).toBe(false);
    expect(store.getState().announcement.message).toBe('There are no records to clear yet.');

    tryInputs(store, kick.flick);
    store.getState().requestClearRecords();
    expect(store.getState().recordsClearAsked).toBe(true);
    expect(store.getState().records.tricks.kickflip).toBeDefined();
    store.getState().cancelClearRecords();
    expect(store.getState().recordsClearAsked).toBe(false);
    expect(store.getState().records.tricks.kickflip).toBeDefined();

    // Confirming with no question open does nothing.
    store.getState().confirmClearRecords();
    expect(store.getState().records.tricks.kickflip).toBeDefined();
    store.getState().requestClearRecords();
    store.getState().confirmClearRecords();
    expect(store.getState().records).toEqual(emptyRecords());
    expect(saved()).toEqual(emptyRecords());
    expect(store.getState().announcement.message).toBe('Records cleared.');
    expect(store.getState().events.some((e) => e.type.includes('record'))).toBe(false);
  });
});
