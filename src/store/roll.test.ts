import { beforeEach, describe, expect, it } from 'vitest';
import { createTrickStore, rollMoves } from '.';
import { BAR } from '../sim/bar';
import { describeScene } from '../sim/format';

const YOU_FIRST = 0.25;
const COMPUTER_FIRST = 0.75;

/** A store with the test's clock and scheduler (as in bar.test.ts), on the game screen. */
function makeStore(queue: number[] = [YOU_FIRST]) {
  let t = 5000;
  const jobs: { at: number; fn: () => void; live: boolean }[] = [];
  const store = createTrickStore(
    () => t,
    () => queue.shift() ?? 0.25,
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
const roll = (s: Store) => s.getState().roll;

/** A game with the player up and a kickflip called (flick 1.9 at pop 0.35 m). */
function kickflipUp(queue?: number[]) {
  const s = makeStore(queue);
  s.getState().startSkate();
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
    // The kickflip landed, so the computer is up to copy it, and it rolls in once the board has stopped.
    expect(s.getState().skate.phase).toBe('computer-copy');
    s.getState().rollRested();
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
