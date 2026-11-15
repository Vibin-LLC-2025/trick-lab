import { beforeEach, describe, expect, it } from 'vitest';
import { bendShown, computerWaiting, isFisheye, orbitsFree, createTrickStore, noticeUp, replayMoves, replayOffered } from '.';
import { BAR } from '../sim/bar';
import { GAME_VIEW_KEY, GAME_VIEW_LABEL, GAME_VIEWS, gameViewFrom, INSTANT_REPLAY_KEY } from './replay';

const YOU_FIRST = 0.25;

/** A store with the test's clock (as in roll.test.ts), on the game screen. */
function makeStore() {
  let t = 5000;
  const store = createTrickStore(
    () => t,
    () => YOU_FIRST,
    () => '2026-11-10',
  );
  store.setState({ skateTaught: true });
  store.getState().setScreen('skate');
  return Object.assign(store, {
    advance: (ms: number) => {
      t += ms;
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
  s.getState().continueSkate();
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
    // Then the go's notice waits for Continue (ADR-80), and the computer with it.
    expect(noticeUp(s.getState())).toBe(true);
    expect(s.getState().roll).toBe('still');
    s.getState().continueSkate();
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

  it('does not follow a miss on its own: the notice offers Watch replay, which plays it and brings the notice back (ADR-105)', () => {
    const missed = makeStore();
    missed.getState().startSkate();
    missed.getState().continueSkate();
    myGo(missed, 1.0);
    expect(missed.getState().result?.landed).toBe(false);
    expect(missed.getState().replay).toBe('none');
    rest(missed);
    // At rest the notice is up at once, focused, with the replay on offer, and says why the go missed.
    expect(missed.getState().replay).toBe('none');
    expect(noticeUp(missed.getState())).toBe(true);
    expect(missed.getState().focusRequest?.kind).toBe('skate-notice');
    expect(replayOffered(missed.getState())).toBe(true);
    const notice = missed.getState().skateNotice;
    expect(notice?.kind === 'go' ? notice.why : null).toMatch(/short on the flip/);
    // Watch replay: the notice gives way, focus goes to the turn's heading, and the computer still waits.
    missed.getState().watchReplay();
    expect(missed.getState().replay).toBe('plays');
    expect(noticeUp(missed.getState())).toBe(false);
    expect(missed.getState().focusRequest?.kind).toBe('skate-heading');
    expect(missed.getState().roll).toBe('still');
    // After it the notice is back, with focus on Continue again.
    missed.getState().endReplay();
    expect(noticeUp(missed.getState())).toBe(true);
    expect(missed.getState().focusRequest?.kind).toBe('skate-notice');
    expect(missed.getState().roll).toBe('still');
    missed.getState().continueSkate();
    expect(missed.getState().roll).toBe('push');
  });

  it("offers no Watch replay for a landed go, with the switch off, or under reduced motion (ADR-105)", () => {
    const made = madeSet();
    rest(made);
    made.getState().endReplay();
    expect(noticeUp(made.getState())).toBe(true);
    expect(replayOffered(made.getState())).toBe(false);
    made.getState().watchReplay();
    expect(made.getState().replay).toBe('none');
    const off = makeStore();
    off.setState({ instantReplay: false });
    off.getState().startSkate();
    off.getState().continueSkate();
    myGo(off, 1.0);
    rest(off);
    expect(noticeUp(off.getState())).toBe(true);
    expect(replayOffered(off.getState())).toBe(false);
    off.getState().watchReplay();
    expect(off.getState().replay).toBe('none');
    const calm = makeStore();
    calm.getState().startSkate();
    calm.getState().continueSkate();
    calm.setState({ reducedMotion: true });
    myGo(calm, 1.0);
    expect(noticeUp(calm.getState())).toBe(true);
    expect(replayOffered(calm.getState())).toBe(false);
  });

  it('does not follow the go that ends the game: the result takes the screen', () => {
    const s = makeStore();
    s.getState().startSkate();
    s.getState().continueSkate();
    const g = s.getState().skate;
    // Copying the computer's kickflip on the last letter, second try.
    s.setState({ skate: { ...g, phase: 'you-copy', call: { id: 'kickflip', name: 'Kickflip', flips: 1, halfShoves: 0 }, letters: { you: 4, computer: 0 }, secondTry: true } });
    s.getState().setInput('flick', 1.0);
    s.getState().pressPop();
    s.advance(BAR.centreMs);
    s.getState().pressPop();
    s.getState().land();
    expect(s.getState().skate.phase).toBe('over');
    expect(s.getState().replay).toBe('none');
  });

  it("does not follow the computer's go, or a game with the switch off", () => {

    const off = makeStore();
    off.getState().toggleInstantReplay();
    expect(localStorage.getItem(INSTANT_REPLAY_KEY)).toBe('off');
    off.getState().startSkate();
    off.getState().continueSkate();
    myGo(off);
    expect(off.getState().replay).toBe('none');

    // The computer's copy that follows a made set: no replay of its go.
    const s = madeSet();
    rest(s);
    s.getState().endReplay();
    s.getState().continueSkate();
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

  it('goes on after a change of quality or a lost 3D view cut the landing short, with nothing else left to move it on (2026-11-13)', () => {
    // A miss: the board has stopped at once and the landing plays; a miss is not replayed on its own (ADR-105).
    const bailed = () => {
      const s = makeStore();
      s.getState().startSkate();
      s.getState().continueSkate();
      myGo(s, 1.0);
      expect(s.getState().result?.landed).toBe(false);
      expect(s.getState().landing).toBe('plays');
      expect(s.getState().replay).toBe('none');
      return s;
    };
    // A new quality level keeps the 3D view: the notice is up, focused, and still offers the replay.
    const quality = bailed();
    quality.getState().setQuality('low');
    expect(quality.getState().landing).toBe('over');
    expect(noticeUp(quality.getState())).toBe(true);
    expect(quality.getState().focusRequest?.kind).toBe('skate-notice');
    expect(replayOffered(quality.getState())).toBe(true);
    // A lost 3D view has nothing to replay on: the go's notice is up and focused.
    const lost = bailed();
    lost.getState().setSceneUnavailable();
    expect(lost.getState().landing).toBe('over');
    expect(lost.getState().replay).toBe('none');
    expect(noticeUp(lost.getState())).toBe(true);
    expect(lost.getState().focusRequest?.kind).toBe('skate-notice');
    expect(replayOffered(lost.getState())).toBe(false);
  });

  it('shows the notice, and focuses it, when reduced motion is turned on after touchdown (2026-11-13)', () => {
    const s = madeSet();
    expect(noticeUp(s.getState())).toBe(false);
    s.getState().setReducedMotion(true);
    expect(s.getState().replay).toBe('none');
    expect(noticeUp(s.getState())).toBe(true);
    expect(s.getState().focusRequest?.kind).toBe('skate-notice');
  });

  it('never plays under reduced motion', () => {
    const s = makeStore();
    s.getState().setReducedMotion(true);
    s.getState().startSkate();
    s.getState().continueSkate();
    myGo(s);
    expect(s.getState().result?.landed).toBe(true);
    expect(s.getState().replay).toBe('none');
  });
});

describe("the game's camera (ADR-72, ADR-100)", () => {
  it('is free by default (ADR-81), even where the old key saved the filmer; a choice is saved and announced, never logged', () => {
    localStorage.setItem('trick-lab.game-camera', 'film');
    const s = makeStore();
    expect(GAME_VIEW_KEY).toBe('trick-lab.game-view');
    expect(s.getState().gameView).toBe('free');
    s.getState().setGameView('film');
    expect(s.getState().gameView).toBe('film');
    expect(localStorage.getItem(GAME_VIEW_KEY)).toBe('film');
    expect(s.getState().announcement.message).toBe('Camera: the filmer, low and to the side of the nose.');
    expect(s.getState().events.filter((e) => e.type.startsWith('camera'))).toEqual([]);
    expect(makeStore().getState().gameView).toBe('film');
  });

  it('has exactly three views, in order: Free, Free fisheye, Filmer', () => {
    expect(GAME_VIEWS).toEqual(['free', 'freeFisheye', 'film']);
    expect(GAME_VIEWS.map((v) => GAME_VIEW_LABEL[v])).toEqual(['Free', 'Free fisheye', 'Filmer']);
  });

  // ADR-100: the removed cameras are read as the nearest survivor; storage is not rewritten on read.
  it.each([
    ['fisheye', 'freeFisheye'],
    ['side', 'free'],
    ['above', 'free'],
    ['free', 'free'],
    ['freeFisheye', 'freeFisheye'],
    ['film', 'film'],
    ['', 'free'],
    ['nonsense', 'free'],
    ['Free', 'free'],
  ] as const)('reads a saved %j as %s', (saved, view) => {
    expect(gameViewFrom(saved)).toBe(view);
    localStorage.setItem(GAME_VIEW_KEY, saved);
    expect(makeStore().getState().gameView).toBe(view);
    expect(localStorage.getItem(GAME_VIEW_KEY)).toBe(saved);
  });

  it('reads nothing saved as free, and ignores the legacy key (ADR-81)', () => {
    expect(gameViewFrom(null)).toBe('free');
    localStorage.setItem('trick-lab.game-camera', 'fisheye');
    expect(makeStore().getState().gameView).toBe('free');
  });

  it('still changes the view for the session when storage is blocked', () => {
    const proto = Object.getPrototypeOf(localStorage) as Storage;
    const get = proto.getItem;
    const set = proto.setItem;
    proto.getItem = () => {
      throw new Error('blocked');
    };
    proto.setItem = () => {
      throw new Error('blocked');
    };
    try {
      const s = makeStore();
      expect(s.getState().gameView).toBe('free');
      s.getState().setGameView('freeFisheye');
      expect(s.getState().gameView).toBe('freeFisheye');
    } finally {
      proto.getItem = get;
      proto.setItem = set;
    }
  });
});

describe('Free fisheye (ADR-93, ADR-100)', () => {
  it('bends the picture in Free fisheye and in the replay, and nowhere else', () => {
    const base = { screen: 'skate', replay: 'none', gameView: 'film' } as const;
    expect(bendShown(base)).toBe(false);
    expect(bendShown({ ...base, gameView: 'free' })).toBe(false);
    expect(bendShown({ ...base, gameView: 'freeFisheye' })).toBe(true);
    expect(bendShown({ ...base, replay: 'plays' })).toBe(true);
    expect(bendShown({ ...base, screen: 'lab', gameView: 'freeFisheye' })).toBe(false);
    expect(bendShown({ ...base, screen: 'home', gameView: 'freeFisheye' })).toBe(false);
  });

  it('turns like Free; Filmer does not turn', () => {
    expect(orbitsFree('freeFisheye')).toBe(true);
    expect(orbitsFree('free')).toBe(true);
    expect(orbitsFree('film')).toBe(false);
    expect(isFisheye('freeFisheye')).toBe(true);
    expect(isFisheye('free')).toBe(false);
    expect(isFisheye('fisheye')).toBe(false);
  });
});

describe('the automatic step-down in a game (ADR-59; the 2026-11-13 review, C-01)', () => {
  /** The third choppy go steps the tier down; the go must still reach its replay or its notice. */
  function steppedGo(flick: number, replayOn: boolean) {
    const s = makeStore();
    s.setState({ quality: 'high', qualityAuto: true, paces: [60, 60], paceJudged: false, instantReplay: replayOn });
    s.getState().setPaceSource(() => 60);
    s.getState().startSkate();
    s.getState().continueSkate();
    myGo(s, flick);
    expect(s.getState().quality).toBe('medium');
    return s;
  }

  it.each([
    [1.9, true],
    [1.9, false],
    [1.0, true],
    [1.0, false],
  ] as const)('flick %s, replay on %s: the go reaches its replay or a focused Continue with no landing callback', (flick, replayOn) => {
    const s = steppedGo(flick, replayOn);
    // The step-down ended the landing (the view is rebuilt); only the roll is left to come to rest where it still rolls.
    expect(s.getState().landing).not.toBe('plays');
    if (s.getState().roll === 'slow') s.getState().rollRested();
    // Only a landed go is replayed on its own (ADR-105).
    if (replayOn && flick === 1.9) {
      expect(s.getState().replay).toBe('plays');
      s.getState().endReplay();
    }
    expect(s.getState().replay).toBe('none');
    expect(noticeUp(s.getState())).toBe(true);
    expect(s.getState().focusRequest?.kind).toBe('skate-notice');
  });

  it('covers a bail as well as a made trick', () => {
    expect(steppedGo(1.0, false).getState().result?.grade).toBe('bail');
    expect(steppedGo(1.9, false).getState().result?.landed).toBe(true);
  });
});

describe('Shortcuts opened during a replay (the 2026-11-13 review, C-07)', () => {
  it("ends the replay, and on closing puts the go's notice up and asks for its Continue's focus", () => {
    const s = madeSet();
    rest(s);
    expect(s.getState().replay).toBe('plays');
    s.getState().setShortcutsOpen(true);
    expect(s.getState().replay).toBe('none');
    const before = s.getState().focusRequest?.nonce ?? 0;
    s.getState().setShortcutsOpen(false);
    expect(noticeUp(s.getState())).toBe(true);
    expect(s.getState().focusRequest?.kind).toBe('skate-notice');
    expect(s.getState().focusRequest!.nonce).toBeGreaterThan(before);
  });

  it('asks for nothing new when no go is waiting', () => {
    const s = makeStore();
    const before = s.getState().focusRequest;
    s.getState().setShortcutsOpen(true);
    s.getState().setShortcutsOpen(false);
    expect(s.getState().focusRequest).toBe(before);
  });
});

describe("the view lost mid-go: the store's path (ADR-80; the 2026-11-13 review, C-04)", () => {
  // The device-loss paths that call it are scene/contextLoss.test.ts's and browser/contextLoss.spec.ts's; these check
  // what the store does from each phase of a go: it scores once, leaves no replay due and nothing waiting on a frame,
  // and puts the go's notice up with its Continue focused.
  const resolved = (s: Store) => s.getState().events.filter((e) => e.type === 'trick.resolved').length;
  const settled = (s: Store) => {
    expect(s.getState().replay).toBe('none');
    expect(s.getState().landing).not.toBe('plays');
    expect(s.getState().roll).toBe('still');
    expect(noticeUp(s.getState())).toBe(true);
    expect(s.getState().focusRequest?.kind).toBe('skate-notice');
  };
  const started = () => {
    const s = makeStore();
    s.getState().startSkate();
    s.getState().continueSkate();
    s.getState().callSkateTrick('kickflip');
    s.getState().setInput('flick', 1.9);
    return s;
  };

  it('during the timing bar: the bar stays playable (it is on the page), and its go resolves at once', () => {
    const s = started();
    s.getState().pressPop();
    s.getState().setSceneUnavailable();
    expect(s.getState().pendingPop).not.toBeNull();
    s.advance(BAR.centreMs);
    s.getState().pressPop();
    expect(resolved(s)).toBe(1);
    settled(s);
  });

  it('during the flight: the go lands and scores once', () => {
    const s = started();
    s.getState().pressPop();
    s.advance(BAR.centreMs);
    s.getState().pressPop();
    expect(s.getState().status).toBe('playing');
    s.getState().setSceneUnavailable();
    expect(resolved(s)).toBe(1);
    settled(s);
    // FlightDriver is gone, but were a late frame to land it, nothing scores twice.
    s.getState().land();
    expect(resolved(s)).toBe(1);
  });

  it('during the landing, and during the replay', () => {
    const a = started();
    a.getState().pressPop();
    a.advance(BAR.centreMs);
    a.getState().pressPop();
    a.getState().land();
    expect(a.getState().landing).toBe('plays');
    a.getState().setSceneUnavailable();
    expect(resolved(a)).toBe(1);
    settled(a);

    const b = madeSet();
    rest(b);
    expect(b.getState().replay).toBe('plays');
    b.getState().setSceneUnavailable();
    expect(resolved(b)).toBe(1);
    settled(b);
  });
});
