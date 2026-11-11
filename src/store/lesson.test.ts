import { beforeEach, describe, expect, it } from 'vitest';
import { createTrickStore, TAUGHT_KEY } from '.';
import { BAR } from '../sim/bar';
import { lessonFor, lessonSetup, lessonText, SETTABLE_TRICKS, startSkateGame, withComputerCall, callTrick } from '../sim/skate';
import { resolveTrick } from '../sim/tricks';

const YOU_FIRST = 0.25;
const COMPUTER_FIRST = 0.75;

/** A store on a device that has never played (nothing saved), with the test's clock, as store/bar.test.ts. */
function makeStore(queue: number[] = [YOU_FIRST]) {
  let t = 1000;
  const store = createTrickStore(
    () => t,
    () => queue.shift() ?? 0.25,
    () => '2026-11-09',
  );
  return Object.assign(store, {
    advance: (ms: number) => {
      t += ms;
    },
  });
}
type Store = ReturnType<typeof makeStore>;
const said = (s: Store) => s.getState().announcement.message;

beforeEach(() => localStorage.clear());

describe("the first game's walk-through, pure (ADR-66, ADR-83)", () => {
  const zero = { pop: 0.35, flick: 0, scoop: 0 };
  const yourSet = startSkateGame('normal', 'you');

  it('asks for the setup at the pop the sliders start on wherever that lands clean, so a first trick is one slider', () => {
    expect(lessonSetup({ flips: 1, halfShoves: 0 })).toEqual({ pop: 0.35, flick: 1.9, scoop: 0 });
    expect(lessonSetup({ flips: -1, halfShoves: 0 })).toEqual({ pop: 0.35, flick: -1.9, scoop: 0 });
    for (const t of SETTABLE_TRICKS) {
      const r = resolveTrick(lessonSetup(t));
      expect(r.id, t.id).toBe(t.id);
      expect(r.grade, t.id).toBe('clean');
    }
    // A double flip cannot be clean from 0.35 m: the cleanest setup, at a higher pop.
    expect(lessonSetup({ flips: 2, halfShoves: 0 }).pop).toBeGreaterThan(0.35);
  });

  it('with the sliders set for the player (Easy and Normal on the bar): the two presses, after the call when up to set', () => {
    expect(lessonFor(yourSet, 'assisted', zero, false)).toEqual({
      steps: ['Call your trick.', 'Press Get ready, then Pop! in the green band.'],
      at: 0,
    });
    const called = callTrick(yourSet, 'kickflip');
    const l = lessonFor(called, 'assisted', zero, false)!;
    expect(l).toEqual({ steps: ['Press Get ready.', 'Press Pop! when the marker is in the green band.'], at: 0 });
    expect(lessonText(l)).toBe('Step 1 of 2: Press Get ready.');
    // No slider numbers, and the sliders do not move it on: only the bar does.
    expect(l.steps.join(' ')).not.toMatch(/\d/);
    expect(lessonFor(called, 'assisted', { pop: 0.35, flick: 1.9, scoop: 0 }, false)!.at).toBe(0);
    expect(lessonFor(called, 'assisted', zero, true)!.at).toBe(1);
    const copy = { ...withComputerCall(startSkateGame('normal', 'computer'), () => 0.25), phase: 'you-copy' as const };
    expect(lessonFor(copy, 'assisted', zero, false)!.steps).toEqual(l.steps);
  });

  it('up to set with no call yet where the player sets the sliders: a kickflip, in three prompts on the bar and two in Exact', () => {
    const l = lessonFor(yourSet, 'timed', zero, false)!;
    expect(l.steps).toEqual([
      'Call the kickflip, then set the sliders for the kickflip: Pop 0.35 m, Flick 1.9 toward kickflip, Scoop 0.0.',
      'Press Get ready, or Space, to start the bar.',
      'Press Pop! when the marker is in the green band.',
    ]);
    expect(l.at).toBe(0);
    expect(lessonText(l)).toBe('Step 1 of 3: Call the kickflip, then set the sliders for the kickflip: Pop 0.35 m, Flick 1.9 toward kickflip, Scoop 0.0.');
    // The sliders alone are not the setup: the trick has to be called too.
    expect(lessonFor(yourSet, 'timed', { pop: 0.35, flick: 1.9, scoop: 0 }, false)!.at).toBe(0);
    expect(lessonFor(yourSet, 'exact', zero, false)!.steps).toEqual([l.steps[0], 'Press Pop, or Space.']);
  });

  it('follows the trick in play: the one called, or the one to copy; and moves on as each prompt is done', () => {
    const called = callTrick(yourSet, 'pop-shove-it');
    expect(lessonFor(called, 'timed', zero, false)!.steps[0]).toBe('Set the sliders for the pop shove-it: Pop 0.35 m, Flick 0.0, Scoop 0.9 toward backside.');
    expect(lessonFor(called, 'timed', zero, false)!.at).toBe(0);
    const ready = { pop: 0.35, flick: 0, scoop: 0.9 };
    expect(lessonFor(called, 'timed', ready, false)!.at).toBe(1);
    expect(lessonFor(called, 'timed', ready, true)!.at).toBe(2);
    // Exact has no third prompt to reach.
    expect(lessonFor(called, 'exact', ready, true)!.at).toBe(1);
    // A copy of the computer's heelflip.
    const copy = { ...withComputerCall(startSkateGame('normal', 'computer'), () => 0.25), phase: 'you-copy' as const };
    expect(lessonFor(copy, 'timed', zero, false)!.steps[0]).toBe('Set the sliders for the heelflip: Pop 0.35 m, Flick 1.9 toward heelflip, Scoop 0.0.');
  });

  it("is not for the computer's go, or between games", () => {
    for (const style of ['assisted', 'timed', 'exact'] as const) {
      expect(lessonFor(startSkateGame('normal', 'computer'), style, zero, false)).toBeNull();
      expect(lessonFor({ ...yourSet, phase: 'over' }, style, zero, false)).toBeNull();
    }
  });
});

describe("the first game's walk-through in the store (ADR-66, ADR-83)", () => {
  it('on Normal: the sliders are set at the call, the walk-through is the two presses, and the first pop ends it', () => {
    const s = makeStore();
    s.getState().startSkate();
    s.getState().continueSkate();
    expect(said(s)).toMatch(
      /Your turn to set: call a trick, then land it\. The computer has to copy it\. First game, so here is your first trick in 2 steps\. Step 1 of 2: Call your trick\.$/,
    );
    s.getState().callSkateTrick('kickflip');
    expect(said(s)).toBe('You called a kickflip. Land it and the computer has to copy it. Sliders set for a kickflip. Step 1 of 2: Press Get ready.');
    expect(s.getState()).toMatchObject({ pop: 0.35, flick: 1.9, scoop: 0 });
    // A slider moved by hand says nothing more: the walk-through follows the bar, not the sliders.
    s.getState().setInput('flick', 1.8);
    s.getState().setInput('flick', 1.9);
    expect(said(s)).toMatch(/^You called a kickflip/);
    s.getState().pressPop();
    expect(said(s)).toBe('Bar running, with no sound: press Pop! when the marker is in the green band. Turn sound on to hear it, or choose Exact before a game.');
    s.advance(BAR.centreMs);
    s.getState().pressPop();
    expect(s.getState().skateLesson).toBe(false);
    s.getState().land();
    expect(s.getState().result).toMatchObject({ id: 'kickflip', grade: 'clean' });
  });

  it('on Hard it gives the sliders: said at the start, at the call, and when the setup is reached; the first pop ends it for good', () => {
    const s = makeStore();
    s.getState().setSkateLevel('hard');
    expect(s.getState().skateTaught).toBe(false);
    s.getState().startSkate();
    s.getState().continueSkate();
    expect(s.getState().skateLesson).toBe(true);
    expect(said(s)).toMatch(
      /Your turn to set: call a trick, then land it\. The computer has to copy it\. First game, so here is your first trick in 3 steps\. Step 1 of 3: Call the kickflip, then set the sliders for the kickflip: Pop 0\.35 m, Flick 1\.9 toward kickflip, Scoop 0\.0\.$/,
    );
    s.getState().callSkateTrick('kickflip');
    // Hard never sets the sliders (ADR-83).
    expect(s.getState().flick).toBe(0);
    expect(said(s)).toBe(
      'You called a kickflip. Land it and the computer has to copy it. Step 1 of 3: Set the sliders for the kickflip: Pop 0.35 m, Flick 1.9 toward kickflip, Scoop 0.0.',
    );
    // On the way there nothing is said (the slider speaks its own value); on reaching the setup, the next prompt.
    s.getState().setInput('flick', 1);
    expect(said(s)).toMatch(/^You called a kickflip/);
    s.getState().setInput('flick', 1.9);
    expect(said(s)).toBe('Step 2 of 3: Press Get ready, or Space, to start the bar.');
    // Away and back says it again; staying put does not.
    s.getState().setInput('flick', 2);
    s.getState().setInput('flick', 1.9);
    expect(said(s)).toBe('Step 2 of 3: Press Get ready, or Space, to start the bar.');

    s.getState().pressPop();
    expect(s.getState().skateLesson).toBe(true);
    s.advance(BAR.centreMs);
    s.getState().pressPop();
    expect(s.getState().skateLesson).toBe(false);
    expect(s.getState().skateTaught).toBe(true);
    expect(localStorage.getItem(TAUGHT_KEY)).toBe('yes');
    s.getState().land();
    expect(s.getState().result).toMatchObject({ id: 'kickflip', grade: 'clean' });
    // Never part of the event log.
    expect(s.getState().events.some((e) => /lesson|taught/.test(JSON.stringify(e)))).toBe(false);

    // The next game, and a new store on the same device, are not first games.
    s.getState().quitSkate();
    s.getState().startSkate();
    s.getState().continueSkate();
    expect(s.getState().skateLesson).toBe(false);
    expect(said(s)).not.toMatch(/First game/);
    expect(makeStore().getState().skateTaught).toBe(true);
  });

  it("when the computer sets first, the walk-through opens with the player's first go: the copy", () => {
    const s = makeStore([COMPUTER_FIRST]);
    s.getState().setSkateLevel('hard');
    s.getState().startSkate();
    s.getState().continueSkate();
    expect(s.getState().skateLesson).toBe(true);
    expect(said(s)).not.toMatch(/First game/);
    // The computer lands its heelflip; the copy is the player's first go.
    s.getState().popTrick();
    s.getState().land();
    expect(s.getState().skate.phase).toBe('you-copy');
    // Hard's computer goes for a double heelflip here, which needs the highest pop.
    expect(s.getState().skate.call?.id).toBe('double-heelflip');
    expect(said(s)).toMatch(
      /Your turn: copy the computer's double heelflip\. Set the sliders, then press Get ready\. First game, so here is your first trick in 3 steps\. Step 1 of 3: Set the sliders for the double heelflip: Pop 0\.55 m, Flick 3\.0 toward heelflip, Scoop 0\.0\.$/,
    );
    // The computer's pop did not end it, and nothing set the sliders.
    expect(s.getState().skateLesson).toBe(true);
    expect(s.getState()).toMatchObject({ pop: 0.35, flick: 0 });
    s.getState().setInput('pop', 0.55);
    s.getState().setInput('flick', -3);
    expect(said(s)).toBe('Step 2 of 3: Press Get ready, or Space, to start the bar.');
  });

  it('on Normal, a copy as the first go: its sliders are set and the walk-through is the two presses', () => {
    const s = makeStore([COMPUTER_FIRST]);
    s.getState().startSkate();
    s.getState().continueSkate();
    s.getState().popTrick();
    s.getState().land();
    expect(s.getState().skate.phase).toBe('you-copy');
    expect(s.getState()).toMatchObject({ pop: 0.35, flick: -1.9, scoop: 0 });
    expect(said(s)).toMatch(
      /Your turn: copy the computer's heelflip\. Sliders set for a heelflip\. First game, so here is your first trick in 2 steps\. Step 1 of 2: Press Get ready\.$/,
    );
  });

  it('in Exact it is two prompts, and the plain pop ends it', () => {
    const s = makeStore();
    s.getState().setPopMode('exact');
    s.getState().startSkate();
    s.getState().continueSkate();
    expect(said(s)).toMatch(/your first trick in 2 steps/);
    s.getState().callSkateTrick('kickflip');
    // Exact never sets the sliders (ADR-83).
    expect(s.getState().flick).toBe(0);
    s.getState().setInput('flick', 1.9);
    expect(said(s)).toBe('Step 2 of 2: Press Pop, or Space.');
    s.getState().pressPop();
    expect(s.getState().skateLesson).toBe(false);
    expect(s.getState().skateTaught).toBe(true);
  });

  it('can be skipped, for good and said; quitting in the middle of it leaves it for the next game', () => {
    const quit = makeStore();
    quit.getState().startSkate();
    quit.getState().continueSkate();
    quit.getState().quitSkate();
    expect(quit.getState().skateLesson).toBe(false);
    expect(quit.getState().skateTaught).toBe(false);
    quit.getState().startSkate();
    quit.getState().continueSkate();
    expect(quit.getState().skateLesson).toBe(true);

    quit.getState().skipLesson();
    expect(quit.getState().skateLesson).toBe(false);
    expect(quit.getState().skateTaught).toBe(true);
    expect(said(quit)).toBe('Walk-through skipped.');
    expect(localStorage.getItem(TAUGHT_KEY)).toBe('yes');
    // Nothing more to skip, and nothing more said.
    quit.getState().callSkateTrick('kickflip');
    expect(said(quit)).toBe('You called a kickflip. Land it and the computer has to copy it. Sliders set for a kickflip.');
    quit.getState().skipLesson();
    expect(said(quit)).toBe('You called a kickflip. Land it and the computer has to copy it. Sliders set for a kickflip.');
  });

  it('a bar that is dropped does not end it: only a pop does', () => {
    const s = makeStore();
    s.getState().startSkate();
    s.getState().continueSkate();
    s.getState().callSkateTrick('kickflip');
    s.getState().setInput('flick', 1.9);
    s.getState().pressPop();
    s.getState().cancelPop();
    expect(s.getState().skateLesson).toBe(true);
    expect(s.getState().skateTaught).toBe(false);
  });
});
