import { beforeEach, describe, expect, it } from 'vitest';
import { createTrickStore } from '.';
import { BAR } from '../sim/bar';
import { SKATE_LEVELS } from '../sim/skate';
import { POP_MODE_KEY } from './skate';

const YOU_FIRST = 0.25;
const COMPUTER_FIRST = 0.75;
const CENTRE = BAR.centreMs;
const HALF = SKATE_LEVELS.normal.band.halfMs;

/**
 * A store whose clock is the test's (ADR-65): time moves only through
 * `advance`, so the timing bar is exact. The coin flip and the computer are
 * scripted as in skate.test.ts: after the queue, 0.25 makes the computer
 * release on the band's centre.
 */
function makeStore(queue: number[] = [YOU_FIRST]) {
  let t = 5000;
  const store = createTrickStore(
    () => t,
    () => queue.shift() ?? 0.25,
    () => '2026-11-09',
  );
  // Not a first game: the walk-through (ADR-66) has its own tests in lesson.test.ts.
  store.setState({ skateTaught: true });
  return Object.assign(store, {
    advance: (ms: number) => {
      t += ms;
    },
  });
}
type Store = ReturnType<typeof makeStore>;
const said = (s: Store) => s.getState().announcement.message;
const popped = (s: Store) => s.getState().events.filter((e) => e.type === 'trick.popped');
const types = (s: Store) => s.getState().events.map((e) => e.type);

/** A game on Normal with the player up, a kickflip called and its clean setup on the sliders (flick 1.9 at pop 0.35 m). */
function kickflipUp(queue?: number[]) {
  const s = makeStore(queue);
  s.getState().startSkate();
  s.getState().continueSkate();
  s.getState().callSkateTrick('kickflip');
  s.getState().setInput('flick', 1.9);
  return s;
}

beforeEach(() => localStorage.clear());

describe('the timing bar in the store (ADR-65)', () => {
  it('is how you pop by default; the first press starts the bar and pops nothing', () => {
    const s = kickflipUp();
    expect(s.getState().popMode).toBe('timed');
    s.getState().pressPop();
    const st = s.getState();
    expect(st.pendingPop).toEqual({ id: 1, startedAt: 5000, intended: { pop: 0.35, flick: 1.9, scoop: 0 }, level: 'normal' });
    expect(st.status).toBe('idle');
    expect(st.flight).toBeNull();
    expect(popped(s)).toHaveLength(0);
    // Sound is off by default, so the start says the bar is silent and where Exact is.
    expect(said(s)).toBe('Bar running, with no sound: press Pop! when the marker is in the green band. Turn sound on to hear it, or choose Exact before a game.');
  });

  it('with sound on the start is two words, so it does not talk over the ticks', () => {
    const s = kickflipUp();
    s.getState().toggleSound();
    s.getState().pressPop();
    expect(said(s)).toBe('Bar running.');
  });

  it('a second press in the band pops exactly the setup; the record says how the pop was made', () => {
    const s = kickflipUp();
    s.getState().pressPop();
    s.advance(CENTRE + 40);
    s.getState().pressPop();
    const st = s.getState();
    expect(st.pendingPop).toBeNull();
    expect(st.status).toBe('playing');
    expect(st.flightBy).toBe('you');
    expect(st.lastRelease).toEqual({ by: 'you', ms: CENTRE + 40 });
    expect(popped(s)).toHaveLength(1);
    expect(popped(s)[0]!.payload).toEqual({
      by: 'you',
      pop: 0.35,
      flick: 1.9,
      scoop: 0,
      preset: null,
      call: 'kickflip',
      how: 'timed',
      releaseMs: CENTRE + 40,
      offMs: 40,
      setFlick: 1.9,
      setScoop: 0,
    });
    // Nothing is announced at the pop: the bar's start still stands, and the result says the rest.
    expect(said(s)).toMatch(/^Bar running/);
    s.getState().land();
    expect(said(s)).toMatch(/^In the band: exactly what you set\. Kickflip landed clean\. .*You landed your kickflip!/);
    expect(s.getState().skate.phase).toBe('computer-copy');
  });

  it('late over-rotates and early under-rotates, and the result names the mistake', () => {
    const late = kickflipUp();
    late.getState().pressPop();
    late.advance(CENTRE + HALF + 60);
    late.getState().pressPop();
    // 60 ms outside on Normal: 6 percent more flick.
    expect(popped(late)[0]!.payload).toMatchObject({ flick: 2.014, setFlick: 1.9, releaseMs: CENTRE + HALF + 60, offMs: HALF + 60 });
    late.getState().land();
    expect(late.getState().result).toMatchObject({ id: 'kickflip', grade: 'sketchy' });
    expect(said(late)).toMatch(/^Late: 6 percent more spin than you set\. Kickflip landed, sketchy: \d+ degrees past on the flip\./);

    const early = kickflipUp();
    early.getState().pressPop();
    early.advance(200);
    early.getState().pressPop();
    early.getState().land();
    expect(early.getState().result).toMatchObject({ landed: false, outcome: 'under-rotated' });
    expect(said(early)).toMatch(/^Early: 50 percent less spin than you set\. .*not landed: flip under-rotated/);
    // A missed set: no letter, the computer sets next.
    expect(early.getState().skate.letters).toEqual({ you: 0, computer: 0 });
    expect(early.getState().skate.phase).toBe('computer-set');
  });

  it('good timing with the wrong setup says it was the sliders', () => {
    const s = kickflipUp();
    s.getState().setInput('flick', 2);
    s.getState().pressPop();
    s.advance(CENTRE);
    s.getState().pressPop();
    s.getState().land();
    expect(s.getState().result?.grade).toBe('sketchy');
    expect(said(s)).toMatch(/^In the band: exactly what you set\. Kickflip landed, sketchy: .* The timing was right, so it was the sliders\./);
  });

  it('the attempt is the sliders as the bar started: moving one during the sweep changes nothing', () => {
    const s = kickflipUp();
    s.getState().pressPop();
    s.advance(300);
    s.getState().setInput('flick', -1.9);
    s.advance(CENTRE - 300);
    s.getState().pressPop();
    expect(popped(s)[0]!.payload).toMatchObject({ flick: 1.9, setFlick: 1.9 });
  });

  it('with no second press the bar goes round and never pops on its own (ADR-78)', () => {
    const s = kickflipUp();
    s.getState().pressPop();
    // Long past the sweep's end, many laps over: still running, nothing popped, no letter.
    s.advance(BAR.sweepMs * 10);
    expect(s.getState().pendingPop).not.toBeNull();
    expect(s.getState().status).toBe('idle');
    expect(popped(s)).toHaveLength(0);
    expect(s.getState().skate.letters).toEqual({ you: 0, computer: 0 });
    // A press on the third lap is read where the marker is on that lap: in the band.
    s.advance(CENTRE + 40);
    s.getState().pressPop();
    expect(s.getState().lastRelease).toEqual({ by: 'you', ms: CENTRE + 40 });
    expect(popped(s)[0]!.payload).toMatchObject({ how: 'timed', releaseMs: CENTRE + 40, offMs: 40, flick: 1.9 });
    s.getState().land();
    expect(said(s)).toMatch(/^In the band: exactly what you set\. Kickflip landed clean\./);
  });

  it("the sweep's end is the next lap's start: the latest release, then the earliest", () => {
    const late = kickflipUp();
    late.getState().pressPop();
    late.advance(BAR.sweepMs - 1);
    late.getState().pressPop();
    expect(popped(late)[0]!.payload).toMatchObject({ releaseMs: BAR.sweepMs - 1, offMs: BAR.sweepMs - 1 - CENTRE });

    const early = kickflipUp();
    early.getState().pressPop();
    early.advance(BAR.sweepMs);
    early.getState().pressPop();
    expect(popped(early)[0]!.payload).toMatchObject({ releaseMs: 0, offMs: -CENTRE });
  });

  it.each([
    ['a screen change', (s: Store) => s.getState().setScreen('lab'), 'Pop cancelled. Game of SKATE ended.'],
    ['quitting the game', (s: Store) => s.getState().quitSkate(), 'Pop cancelled. Game of SKATE ended.'],
    ['a new game', (s: Store) => s.getState().startSkate(), /^Pop cancelled\. Game of SKATE started/],
    ['Reset', (s: Store) => s.getState().resetSession(), /^Pop cancelled\. Reset\./],
    ['the shortcuts dialog opening', (s: Store) => s.getState().setShortcutsOpen(true), 'Pop cancelled.'],
    ['the leave dialog opening', (s: Store) => s.getState().requestLeave('home'), 'Pop cancelled.'],
    ['the tab being hidden', (s: Store) => s.getState().cancelPop(), 'Pop cancelled.'],
  ] as const)('%s cancels a running bar: no attempt, no letter, and it says so', (_name, act, message) => {
    const s = kickflipUp();
    s.getState().setScreen('skate');
    s.getState().startSkate();
    s.getState().continueSkate();
    s.getState().callSkateTrick('kickflip');
    s.getState().pressPop();
    expect(s.getState().pendingPop).not.toBeNull();
    act(s);
    expect(s.getState().pendingPop).toBeNull();
    if (typeof message === 'string') expect(said(s)).toBe(message);
    else expect(said(s)).toMatch(message);
    // Nothing pops later either: the bar had no end of its own to come.
    s.advance(BAR.sweepMs * 2);
    expect(popped(s)).toHaveLength(0);
    expect(types(s)).not.toContain('skate.letter');
    expect(s.getState().skate.letters).toEqual({ you: 0, computer: 0 });
  });

  it('cancelling with no bar running says nothing', () => {
    const s = kickflipUp();
    const before = said(s);
    s.getState().cancelPop();
    expect(s.getState().dropPop()).toBe('');
    expect(said(s)).toBe(before);
  });

  it('a set needs its call first, and a board in the air is not a bar: the plain pop says what is wrong', () => {
    const s = makeStore();
    s.getState().startSkate();
    s.getState().continueSkate();
    s.getState().pressPop();
    expect(s.getState().pendingPop).toBeNull();
    expect(said(s)).toBe('Call your trick first: pick the trick you are going for, then pop.');
    s.getState().callSkateTrick('kickflip');
    s.getState().pressPop();
    // The call cannot change under a running bar.
    s.getState().callSkateTrick('heelflip');
    expect(said(s)).toBe('The bar is running. Pop first, then call another trick.');
    expect(s.getState().skate.call?.id).toBe('kickflip');
    s.getState().pressPop();
    s.getState().pressPop();
    expect(said(s)).toBe('The board is still in the air.');
    expect(popped(s)).toHaveLength(1);
  });

  it("on the computer's turn Pop is its go, and it goes through the same bar", () => {
    const s = makeStore([COMPUTER_FIRST]);
    s.getState().startSkate();
    s.getState().continueSkate();
    s.getState().pressPop();
    const st = s.getState();
    expect(st.pendingPop).toBeNull();
    expect(st.flightBy).toBe('computer');
    // 0.25 after the coin flip: a release dead on the centre, so exactly its aim.
    expect(st.lastRelease).toEqual({ by: 'computer', ms: CENTRE });
    const p = popped(s)[0]!.payload;
    expect(p).toMatchObject({ by: 'computer', how: 'timed', releaseMs: CENTRE, offMs: 0, call: 'heelflip' });
    expect(p.flick).toBe(p.setFlick);
    expect(said(s)).toBe('The computer goes for a heelflip.');
  });

  it('under reduced motion a release resolves at once, with one announcement: what the release did, then the result', () => {
    const s = kickflipUp();
    s.getState().setReducedMotion(true);
    s.getState().pressPop();
    s.advance(CENTRE);
    s.getState().pressPop();
    expect(s.getState().status).toBe('done');
    expect(said(s)).toMatch(/^In the band: exactly what you set\. Kickflip landed clean\./);
  });

  it('on Hard a release that lands sketchy does not count', () => {
    const s = makeStore();
    s.getState().setSkateLevel('hard');
    s.getState().startSkate();
    s.getState().continueSkate();
    s.getState().callSkateTrick('kickflip');
    s.getState().setInput('flick', 1.9);
    s.getState().pressPop();
    // 40 ms outside Hard's band: about 5 percent more flick, 13 degrees past: landed, not clean.
    s.advance(CENTRE + SKATE_LEVELS.hard.band.halfMs + 40);
    s.getState().pressPop();
    s.getState().land();
    expect(s.getState().result).toMatchObject({ id: 'kickflip', landed: true, grade: 'sketchy' });
    expect(said(s)).toMatch(/^A little late: 5 percent more spin than you set\. .*but sketchy: on Hard only a clean landing counts/);
    expect(s.getState().skate.phase).toBe('computer-set');
  });

  it('Exact is one choice away between games: remembered, announced, never logged, and Pop is then one press', () => {
    const s = makeStore();
    s.getState().setPopMode('exact');
    expect(s.getState().popMode).toBe('exact');
    expect(localStorage.getItem(POP_MODE_KEY)).toBe('exact');
    expect(said(s)).toBe('Exact: Pop does exactly what the sliders say.');
    expect(types(s)).toEqual([]);
    // A new store on the same device starts from the saved choice.
    expect(makeStore().getState().popMode).toBe('exact');

    s.getState().startSkate();
    s.getState().continueSkate();
    // Not in the middle of a game.
    s.getState().setPopMode('timed');
    expect(s.getState().popMode).toBe('exact');
    s.getState().callSkateTrick('kickflip');
    s.getState().setInput('flick', 1.9);
    s.getState().pressPop();
    expect(s.getState().pendingPop).toBeNull();
    expect(s.getState().status).toBe('playing');
    expect(s.getState().lastRelease).toBeNull();
    expect(popped(s)[0]!.payload).toEqual({ by: 'you', pop: 0.35, flick: 1.9, scoop: 0, preset: null, call: 'kickflip', how: 'exact' });
    expect(said(s)).toMatch(/^Popped with /);
    s.getState().land();
    s.getState().quitSkate();
    s.getState().setPopMode('timed');
    expect(said(s)).toBe('Timing bar: Press Get ready, then Pop! when the marker is in the green band. Early spins less, late spins more.');
    expect(localStorage.getItem(POP_MODE_KEY)).toBe('timed');
  });

  it('the lab never uses the bar: its pop is exact, and the record says so', () => {
    const s = makeStore();
    s.getState().setScreen('lab');
    s.getState().pressPop();
    expect(s.getState().pendingPop).toBeNull();
    expect(popped(s)[0]!.payload).toEqual({ by: 'you', pop: 0.35, flick: 0, scoop: 0, preset: null, how: 'exact' });
  });
});
