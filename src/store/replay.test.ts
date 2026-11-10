import { beforeEach, describe, expect, it } from 'vitest';
import { computerWaiting, createTrickStore, replayMoves } from '.';
import { BAR } from '../sim/bar';
import { GAME_VIEW_KEY, INSTANT_REPLAY_KEY } from './replay';

const YOU_FIRST = 0.25;

/** A store with the test's clock and scheduler (as in roll.test.ts), on the game screen. */
function makeStore() {
  let t = 5000;
  const jobs: { at: number; fn: () => void; live: boolean }[] = [];
  const store = createTrickStore(
    () => t,
    () => YOU_FIRST,
    () => '2026-11-10',
    (fn, ms) => {
      const job = { at: t + ms, fn, live: true };
      jobs.push(job);
      return () => {
        job.live = false;
      };
    },
  );
  store.setState({ skateTaught: true });
  store.getState().setScreen('skate');
  return Object.assign(store, {
    advance: (ms: number) => {
      t += ms;
      for (const job of jobs) {
        if (job.live && job.at <= t) {
          job.live = false;
          job.fn();
        }
      }
    },
  });
}
type Store = ReturnType<typeof makeStore>;

/** The player's go, called and popped on the bar's centre, landed: a made kickflip at flick 1.9 (clean), or a miss at flick 1.0. */
function myGo(s: Store, flick = 1.9) {
  s.getState().callSkateTrick('kickflip');
  s.getState().setInput('flick', flick);
  s.getState().pressPop();
  s.advance(BAR.centreMs);
  s.getState().pressPop();
  s.getState().land();
}

/** The go comes to rest: the board stops, and the landing has played out. */
function rest(s: Store) {
  s.getState().rollRested();
  if (s.getState().landing === 'plays') s.getState().landingDone();
}

function madeSet() {
  const s = makeStore();
  s.getState().startSkate();
  myGo(s);
  expect(s.getState().result?.landed).toBe(true);
  return s;
}

const snapshot = (s: Store) => {
  const g = s.getState();
  return { events: g.events.length, records: JSON.stringify(g.records), skate: JSON.stringify(g.skate), paces: g.paces.length, completed: g.completed.length };
};

beforeEach(() => localStorage.clear());

describe('the instant replay (step 17, ADR-72)', () => {
  it('is due after the student makes a set, plays once the board is at rest, and the computer waits for it', () => {
    const s = madeSet();
    expect(s.getState().replay).toBe('due');
    expect(computerWaiting(s.getState())).toBe(false);
    rest(s);
    expect(s.getState().replay).toBe('plays');
    expect(replayMoves(s.getState())).toBe(true);
    // The computer has not rolled in.
    expect(s.getState().roll).toBe('still');
    s.getState().endReplay();
    expect(s.getState().replay).toBe('none');
    // Now it rolls in for its copy.
    expect(s.getState().roll).toBe('push');
  });

  it('is not seen by the events, the records, the letters or the step-down', () => {
    const s = madeSet();
    rest(s);
    const before = snapshot(s);
    s.getState().endReplay();
    expect(snapshot(s)).toEqual(before);
  });

  it('does not follow a miss, the computer\'s go, or a game with the switch off', () => {
    const missed = makeStore();
    missed.getState().startSkate();
    myGo(missed, 1.0);
    expect(missed.getState().result?.landed).toBe(false);
    expect(missed.getState().replay).toBe('none');

    const off = makeStore();
    off.getState().toggleInstantReplay();
    expect(localStorage.getItem(INSTANT_REPLAY_KEY)).toBe('off');
    off.getState().startSkate();
    myGo(off);
    expect(off.getState().replay).toBe('none');

    // The computer's copy that follows a made set: no replay of its go.
    const s = madeSet();
    rest(s);
    s.getState().endReplay();
    s.getState().pressPop();
    expect(s.getState().flightBy).toBe('computer');
    s.getState().land();
    expect(s.getState().replay).toBe('none');
  });

  it('is skipped by Pop, which then does nothing else', () => {
    const s = madeSet();
    rest(s);
    const flightId = s.getState().flightId;
    s.getState().pressPop();
    expect(s.getState().replay).toBe('none');
    expect(s.getState().flightId).toBe(flightId);
  });

  it('ends with a dialog, a screen change, reduced motion, the 3D view failing, a quit or the switch going off', () => {
    const cases: [string, (s: Store) => void][] = [
      ['leave dialog', (s) => s.getState().requestLeave('lab')],
      ['shortcuts', (s) => s.getState().setShortcutsOpen(true)],
      ['screen', (s) => s.getState().setScreen('lab')],
      ['reduced motion', (s) => s.getState().setReducedMotion(true)],
      ['no view', (s) => s.getState().setSceneUnavailable()],
      ['quit', (s) => s.getState().quitSkate()],
      ['switch', (s) => s.getState().toggleInstantReplay()],
      ['new game', (s) => s.getState().startSkate()],
    ];
    for (const [name, end] of cases) {
      const playing = madeSet();
      rest(playing);
      end(playing);
      expect(playing.getState().replay, name).toBe('none');
      // Due, not yet playing: cut the same way.
      const due = madeSet();
      end(due);
      rest(due);
      expect(due.getState().replay, `${name}, due`).toBe('none');
    }
  });

  it('never plays under reduced motion', () => {
    const s = makeStore();
    s.getState().setReducedMotion(true);
    s.getState().startSkate();
    myGo(s);
    expect(s.getState().result?.landed).toBe(true);
    expect(s.getState().replay).toBe('none');
  });
});

describe("the game's camera (ADR-72)", () => {
  it('is the filmer by default; a choice is saved and announced, never logged', () => {
    const s = makeStore();
    expect(s.getState().gameView).toBe('film');
    s.getState().setGameView('side');
    expect(s.getState().gameView).toBe('side');
    expect(localStorage.getItem(GAME_VIEW_KEY)).toBe('side');
    expect(s.getState().announcement.message).toBe('Camera: side on, low.');
    expect(s.getState().events.filter((e) => e.type.startsWith('camera'))).toEqual([]);
    expect(makeStore().getState().gameView).toBe('side');
  });
});
