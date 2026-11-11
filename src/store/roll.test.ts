import { beforeEach, describe, expect, it } from 'vitest';
import { computerWaiting, createTrickStore, landingMoves, rollMoves } from '.';
import { BAR } from '../sim/bar';
import { describeScene } from '../sim/format';

const YOU_FIRST = 0.25;
const COMPUTER_FIRST = 0.75;

/** A store with the test's clock (as in bar.test.ts), on the game screen. */
function makeStore(queue: number[] = [YOU_FIRST]) {
  let t = 5000;
  const store = createTrickStore(
    () => t,
    () => queue.shift() ?? 0.25,
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
const roll = (s: Store) => s.getState().roll;

/** A game with the player up and a kickflip called (flick 1.9 at pop 0.35 m). */
function kickflipUp(queue?: number[]) {
  const s = makeStore(queue);
  s.getState().startSkate();
  s.getState().continueSkate();
  s.getState().callSkateTrick('kickflip');
  s.getState().setInput('flick', 1.9);
  return s;
}

beforeEach(() => localStorage.clear());

describe('rolling in the game (step 12, ADR-67)', () => {
  it('is still until a go starts; the timing bar is the push', () => {
    const s = kickflipUp();
    expect(roll(s)).toBe('still');
    s.getState().pressPop();
    expect(roll(s)).toBe('push');
    s.advance(BAR.centreMs);
    s.getState().pressPop();
    expect(s.getState().status).toBe('playing');
    expect(roll(s)).toBe('push');
  });

  it('slows to a stop after the landing, and the view says when it has stopped', () => {
    const s = kickflipUp();
    s.getState().pressPop();
    s.advance(BAR.centreMs);
    s.getState().pressPop();
    s.getState().land();
    expect(roll(s)).toBe('slow');
    // The kickflip landed, so the computer is up to copy it, and it rolls in once the board has stopped
    // and the student's instant replay has played (ADR-72).
    expect(s.getState().skate.phase).toBe('computer-copy');
    s.getState().rollRested();
    expect(s.getState().replay).toBe('plays');
    expect(roll(s)).toBe('still');
    s.getState().endReplay();
    // The go's notice waits for Continue (ADR-80), and the computer with it.
    expect(roll(s)).toBe('still');
    s.getState().continueSkate();
    expect(roll(s)).toBe('push');
    // With the game screen held by a dialog the computer is not waiting, so a stopped board stays stopped.
    s.getState().slowRoll();
    s.getState().requestLeave('lab');
    s.getState().rollRested();
    expect(roll(s)).toBe('still');
  });

  it('a pop in Exact pushes off with the pop', () => {
    const s = makeStore();
    s.getState().setPopMode('exact');
    s.getState().startSkate();
    s.getState().continueSkate();
    s.getState().callSkateTrick('kickflip');
    s.getState().popTrick();
    expect(roll(s)).toBe('push');
  });

  it('a bar dropped with no pop slows the board', () => {
    const s = kickflipUp();
    s.getState().pressPop();
    s.getState().setShortcutsOpen(true);
    expect(s.getState().pendingPop).toBeNull();
    expect(roll(s)).toBe('slow');
  });

  it('the computer rolls in before it pops: at the start when it sets first, and again once the board has stopped', () => {
    const s = makeStore([COMPUTER_FIRST]);
    s.getState().startSkate();
    s.getState().continueSkate();
    expect(roll(s)).toBe('push');
    s.getState().popTrick();
    expect(s.getState().flightBy).toBe('computer');
    s.getState().land();
    expect(roll(s)).toBe('slow');
    // The player is up to copy now (or the computer sets again after a miss): only a waiting computer pushes off.
    const computerNext = s.getState().skate.phase.startsWith('computer');
    s.getState().rollRested();
    expect(roll(s)).toBe(computerNext ? 'push' : 'still');
  });

  it('with auto off the computer waits for its button, stopped', () => {
    const s = makeStore([COMPUTER_FIRST]);
    s.getState().startSkate();
    s.getState().continueSkate();
    expect(roll(s)).toBe('push');
    s.getState().toggleSkateAuto();
    expect(roll(s)).toBe('slow');
    s.getState().rollRested();
    expect(roll(s)).toBe('still');
    s.getState().toggleSkateAuto();
    expect(roll(s)).toBe('push');
  });

  it('is cut short by leaving the screen, quitting, a reset or reduced motion', () => {
    const cases: [string, (s: Store) => void][] = [
      ['screen', (s) => s.getState().setScreen('lab')],
      ['quit', (s) => s.getState().quitSkate()],
      ['reset', (s) => s.getState().resetSession()],
      ['motion', (s) => s.getState().setReducedMotion(true)],
      ['view', (s) => s.getState().setSceneUnavailable()],
    ];
    for (const [, cut] of cases) {
      const s = kickflipUp();
      s.getState().pressPop();
      expect(roll(s)).toBe('push');
      cut(s);
      expect(roll(s)).toBe('still');
    }
  });

  it('never rolls in the lab, under reduced motion or with no 3D view', () => {
    const lab = makeStore();
    lab.getState().setScreen('lab');
    lab.getState().popTrick();
    expect(roll(lab)).toBe('still');

    const reduced = makeStore();
    reduced.getState().setReducedMotion(true);
    reduced.getState().setPopMode('exact');
    reduced.getState().startSkate();
    reduced.getState().continueSkate();
    reduced.getState().callSkateTrick('kickflip');
    reduced.getState().popTrick();
    expect(roll(reduced)).toBe('still');
  });

  it('moves frames only while nothing holds it: a pause or a dialog holds its speed', () => {
    const s = kickflipUp();
    s.getState().setPopMode('exact');
    s.getState().popTrick();
    expect(rollMoves(s.getState())).toBe(true);
    s.getState().togglePause();
    expect(roll(s)).toBe('push');
    expect(rollMoves(s.getState())).toBe(false);
    s.getState().togglePause();
    expect(rollMoves(s.getState())).toBe(true);
    s.getState().requestLeave('lab');
    expect(rollMoves(s.getState())).toBe(false);
  });

  it('the scene description says the board is rolling, then stopping', () => {
    const s = kickflipUp();
    s.getState().pressPop();
    expect(describeScene(s.getState())).toContain('Rolling along the concrete, nose first.');
    s.getState().cancelPop();
    expect(describeScene(s.getState())).toContain('Rolling to a stop.');
    s.getState().rollRested();
    expect(describeScene(s.getState())).toContain('resting flat on a concrete pad');
    expect(describeScene(s.getState())).not.toContain('Rolling');
  });
});

/** A game in Exact with the player up, a kickflip called, and the flick set so the pop lands as `grade`. */
function exactUp(flick: number) {
  const s = makeStore();
  s.getState().setPopMode('exact');
  s.getState().startSkate();
  s.getState().continueSkate();
  s.getState().callSkateTrick('kickflip');
  s.getState().setInput('flick', flick);
  return s;
}
const CLEAN = 1.9;
const SKETCHY = 2.0;
const BAIL = 1.1;

describe('landings with weight in the store (step 13, ADR-68)', () => {
  it('a clean landing has no motion of its own; a sketchy one plays, with the board rolling on', () => {
    const clean = exactUp(CLEAN);
    clean.getState().popTrick();
    clean.getState().land();
    expect(clean.getState().result!.grade).toBe('clean');
    expect(clean.getState().landing).toBe('over');
    expect(roll(clean)).toBe('slow');

    const sketchy = exactUp(SKETCHY);
    sketchy.getState().popTrick();
    sketchy.getState().land();
    expect(sketchy.getState().result!.grade).toBe('sketchy');
    expect(sketchy.getState().landing).toBe('plays');
    expect(roll(sketchy)).toBe('slow');
    sketchy.getState().landingDone();
    expect(sketchy.getState().landing).toBe('over');
  });

  it('a bail stops the rider at once and plays the board falling and sliding; the computer rolls in once it is over', () => {
    const s = exactUp(BAIL);
    s.getState().popTrick();
    s.getState().land();
    expect(s.getState().result!.grade).toBe('bail');
    expect(s.getState().landing).toBe('plays');
    expect(roll(s)).toBe('still');
    // A miss on the set: the computer sets next, and waits for the landing before it rolls in.
    expect(s.getState().skate.phase).toBe('computer-set');
    s.getState().rollRested();
    expect(roll(s)).toBe('still');
    s.getState().landingDone();
    // The student's miss is replayed first (ADR-78), and the computer waits for it.
    expect(s.getState().replay).toBe('plays');
    expect(roll(s)).toBe('still');
    s.getState().endReplay();
    s.getState().continueSkate();
    // The computer rolls in on a fresh board: the bailed one is gone.
    expect(roll(s)).toBe('push');
    expect(s.getState().landing).toBe('none');
  });

  it('the next go clears the landing: a pop, or the board rolling in', () => {
    const s = exactUp(BAIL);
    s.getState().popTrick();
    s.getState().land();
    s.getState().landingDone();
    s.getState().endReplay();
    s.getState().continueSkate();
    expect(roll(s)).toBe('push');
    expect(s.getState().landing).toBe('none');
    s.getState().popTrick();
    expect(s.getState().landing).toBe('none');
  });

  it('is cut short to its end pose by a change of quality, reduced motion, a lost 3D view or a quit, and gone with the screen', () => {
    const cuts: ((s: Store) => void)[] = [
      (s) => s.getState().setQuality('low'),
      (s) => s.getState().setReducedMotion(true),
      (s) => s.getState().setSceneUnavailable(),
      (s) => s.getState().quitSkate(),
    ];
    for (const cut of cuts) {
      const s = exactUp(BAIL);
      s.getState().popTrick();
      s.getState().land();
      expect(s.getState().landing).toBe('plays');
      cut(s);
      expect(s.getState().landing).toBe('over');
    }
    const s = exactUp(BAIL);
    s.getState().popTrick();
    s.getState().land();
    s.getState().setScreen('lab');
    expect(s.getState().landing).toBe('none');
  });

  it('shows the end pose at once where nothing may move, and never in the lab', () => {
    const s = exactUp(BAIL);
    s.getState().setReducedMotion(true);
    s.getState().popTrick();
    expect(s.getState().result!.grade).toBe('bail');
    expect(s.getState().landing).toBe('over');

    const lab = makeStore();
    lab.getState().setScreen('lab');
    lab.getState().setInput('flick', BAIL);
    lab.getState().popTrick();
    lab.getState().land();
    expect(lab.getState().landing).toBe('none');
  });

  it('holds while paused or behind a dialog, like the roll', () => {
    const s = exactUp(SKETCHY);
    s.getState().popTrick();
    s.getState().land();
    expect(landingMoves(s.getState())).toBe(true);
    s.getState().setShortcutsOpen(true);
    expect(landingMoves(s.getState())).toBe(false);
  });

  it("the computer's wait starts only once the student's go is at rest: the landing played out and the board stopped (ADR-78)", () => {
    const s = exactUp(SKETCHY);
    // No replay here, so the wait is all there is between the two goes.
    s.getState().toggleInstantReplay();
    s.getState().popTrick();
    s.getState().land();
    expect(s.getState().skate.phase).toBe('computer-copy');
    expect(s.getState().landing).toBe('plays');
    expect(computerWaiting(s.getState())).toBe(false);
    s.getState().landingDone();
    // Still rolling on after the landing: not yet.
    expect(roll(s)).toBe('slow');
    expect(computerWaiting(s.getState())).toBe(false);
    s.getState().rollRested();
    // At rest, the go's notice is up; Continue, and the wait runs, and the computer rolls in while it does (ADR-80).
    expect(computerWaiting(s.getState())).toBe(false);
    s.getState().continueSkate();
    expect(computerWaiting(s.getState())).toBe(true);
    expect(roll(s)).toBe('push');
  });

  it('the scene description says what the landing did', () => {
    const s = exactUp(BAIL);
    // The computer waits for its button, so the bailed board stays where it slid.
    s.getState().toggleSkateAuto();
    s.getState().popTrick();
    s.getState().land();
    expect(describeScene(s.getState())).toMatch(/The board (falls|slides)/);
    s.getState().landingDone();
    // The miss is replayed first (ADR-78); after it, the bailed board is back where it slid.
    expect(s.getState().replay).toBe('plays');
    s.getState().endReplay();
    expect(describeScene(s.getState())).toMatch(/The board (fell|slid)/);
    const k = exactUp(SKETCHY);
    k.getState().popTrick();
    k.getState().land();
    expect(describeScene(k.getState())).toContain('the feet ride it out');
  });
});
