import { beforeEach, describe, expect, it } from 'vitest';
import { computerWaiting, createTrickStore, noticeUp } from '.';
import { BAR } from '../sim/bar';

const YOU_FIRST = 0.25;
const COMPUTER_FIRST = 0.75;

/** A store with the test's clock, on the game screen; the first random draw is the coin flip, every later one 0.25. */
function makeStore(first = YOU_FIRST) {
  let t = 5000;
  let draws = 0;
  const store = createTrickStore(
    () => t,
    () => (draws++ === 0 ? first : YOU_FIRST),
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

/** The player's kickflip, called and released on the bar's centre, landed: made at flick 1.9, missed at 1.0. */
function myGo(s: Store, flick = 1.9) {
  if (s.getState().skate.phase === 'you-set') s.getState().callSkateTrick('kickflip');
  s.getState().setInput('flick', flick);
  s.getState().pressPop();
  s.advance(BAR.centreMs);
  s.getState().pressPop();
  s.getState().land();
}

/** What FlightDriver does after a landing: the board stops, the landing plays out, the replay ends. */
function rest(s: Store) {
  s.getState().rollRested();
  s.getState().landingDone();
  s.getState().endReplay();
}

const focus = (s: Store) => s.getState().focusRequest?.kind;

beforeEach(() => localStorage.clear());

describe("the game's notices (ADR-80)", () => {
  it('starts a game with the coin flip: up at once, focus on its Continue, and the computer waits for it', () => {
    const s = makeStore(COMPUTER_FIRST);
    s.getState().startSkate();
    expect(s.getState().skateNotice).toMatchObject({ kind: 'coin', first: 'computer' });
    expect(noticeUp(s.getState())).toBe(true);
    expect(focus(s)).toBe('skate-notice');
    // The computer won the toss, but it neither waits nor rolls in until the notice is read.
    expect(computerWaiting(s.getState())).toBe(false);
    expect(s.getState().roll).toBe('still');
    // The coin flip is still said as the game starts.
    expect(s.getState().announcement.message).toMatch(/Coin flip: the computer sets first\./);

    s.getState().continueSkate();
    expect(s.getState().skateNotice).toBeNull();
    expect(focus(s)).toBe('skate-heading');
    expect(computerWaiting(s.getState())).toBe(true);
    expect(s.getState().roll).toBe('push');
  });

  it('Pop (the button and Space) is Continue while a notice is up, and pops nothing; nothing is logged', () => {
    const s = makeStore();
    s.getState().startSkate();
    s.getState().callSkateTrick('kickflip');
    const events = s.getState().events.length;
    s.getState().pressPop();
    expect(s.getState().skateNotice).toBeNull();
    expect(s.getState().pendingPop).toBeNull();
    expect(s.getState().flight).toBeNull();
    expect(s.getState().events).toHaveLength(events);
    // The next press is the bar's start.
    s.getState().pressPop();
    expect(s.getState().pendingPop).not.toBeNull();
  });

  it("after a go, says what it did and whose turn is next once the go is at rest, after the replay", () => {
    const s = makeStore();
    s.getState().startSkate();
    s.getState().continueSkate();
    myGo(s);
    expect(s.getState().skateNotice).toMatchObject({ kind: 'go', by: 'you', made: true, news: 'You landed your kickflip!', letterTo: null });
    // Not yet: the board rolls on, then the replay plays (ADR-72), and focus stays put.
    expect(noticeUp(s.getState())).toBe(false);
    // The rider's recovery plays out with the landing (ADR-96).
    s.getState().landingDone();
    s.getState().rollRested();
    expect(s.getState().replay).toBe('plays');
    expect(noticeUp(s.getState())).toBe(false);
    expect(focus(s)).toBe('skate-heading');
    // Pop then skips the replay (ADR-72), and the notice comes up and takes focus.
    s.getState().pressPop();
    expect(noticeUp(s.getState())).toBe(true);
    expect(focus(s)).toBe('skate-notice');
    expect(computerWaiting(s.getState())).toBe(false);
  });

  it('Pop before the go is at rest waits for the board, and says so', () => {
    const s = makeStore();
    s.getState().startSkate();
    s.getState().continueSkate();
    myGo(s, 1.0);
    // A miss on the set: the computer sets next. The bailed board is still falling and sliding (ADR-68).
    expect(s.getState().landing).toBe('plays');
    expect(noticeUp(s.getState())).toBe(false);
    const flightId = s.getState().flightId;
    s.getState().pressPop();
    expect(s.getState().flightId).toBe(flightId);
    expect(s.getState().announcement.message).toBe('One moment: the board is still coming to rest.');
  });

  it('a missed copy gives a letter, and the notice says so', () => {
    const s = makeStore(COMPUTER_FIRST);
    s.getState().startSkate();
    s.getState().continueSkate();
    // The computer's set, landed (it hits its aim with 0.25).
    s.getState().pressPop();
    s.getState().land();
    rest(s);
    expect(s.getState().skateNotice).toMatchObject({ kind: 'go', by: 'computer', made: true, letterTo: null });
    s.getState().continueSkate();
    expect(s.getState().skate.phase).toBe('you-copy');
    // An ollie for its heelflip: a letter.
    s.getState().setInput('flick', 0);
    myGo(s, 0);
    rest(s);
    expect(s.getState().skateNotice).toMatchObject({ kind: 'go', by: 'you', made: false, letterTo: 'you' });
    expect(s.getState().skate.letters.you).toBe(1);
  });

  it('Continue clears the stage for the next go: the board back on the pad, the result kept', () => {
    const s = makeStore();
    s.getState().startSkate();
    s.getState().continueSkate();
    myGo(s);
    rest(s);
    const result = s.getState().result;
    expect(s.getState().flight).not.toBeNull();
    const clears = s.getState().stageClears;
    s.getState().continueSkate();
    const g = s.getState();
    expect(g.flight).toBeNull();
    expect(g.status).toBe('idle');
    expect(g.progress).toBe(0);
    expect(g.landing).toBe('none');
    expect(g.result).toBe(result);
    expect(g.stageClears).toBe(clears + 1);
    expect(s.playhead.progress).toBe(0);
  });

  it('there is none at the end of the game: the result takes the screen', () => {
    const s = makeStore();
    s.getState().startSkate();
    s.getState().continueSkate();
    const g = s.getState().skate;
    s.setState({ skate: { ...g, phase: 'you-copy', call: { id: 'kickflip', name: 'Kickflip', flips: 1, halfShoves: 0 }, letters: { you: 4, computer: 0 }, secondTry: true } });
    myGo(s, 1.0);
    expect(s.getState().skate.phase).toBe('over');
    expect(s.getState().skateNotice).toBeNull();
    expect(focus(s)).toBe('skate-heading');
  });

  it('under reduced motion a go is at rest as it resolves, so its notice is up at once', () => {
    const s = makeStore();
    s.getState().setReducedMotion(true);
    s.getState().setPopMode('exact');
    s.getState().startSkate();
    s.getState().continueSkate();
    s.getState().callSkateTrick('kickflip');
    s.getState().setInput('flick', 1.9);
    s.getState().pressPop();
    expect(s.getState().result?.landed).toBe(true);
    expect(noticeUp(s.getState())).toBe(true);
    expect(focus(s)).toBe('skate-notice');
  });

  it('is gone with a quit, a reset, or a new game; a pop made some other way passes it over', () => {
    const quit = makeStore();
    quit.getState().startSkate();
    quit.getState().quitSkate();
    expect(quit.getState().skateNotice).toBeNull();

    const reset = makeStore();
    reset.getState().startSkate();
    reset.getState().resetSession();
    expect(reset.getState().skateNotice).toBeNull();

    const again = makeStore();
    again.getState().startSkate();
    const first = again.getState().skateNotice!.id;
    again.getState().startSkate();
    expect(again.getState().skateNotice!.id).not.toBe(first);

    const plain = makeStore(COMPUTER_FIRST);
    plain.getState().startSkate();
    plain.getState().popTrick();
    expect(plain.getState().skateNotice).toBeNull();
    expect(plain.getState().flightBy).toBe('computer');
  });

  it('a replay cut short by the leave dialog leaves the go at rest: Keep playing brings the notice up', () => {
    const s = makeStore();
    s.getState().startSkate();
    s.getState().continueSkate();
    myGo(s);
    s.getState().landingDone();
    s.getState().rollRested();
    expect(s.getState().replay).toBe('plays');
    s.getState().requestLeave('lab');
    s.getState().cancelLeave();
    expect(noticeUp(s.getState())).toBe(true);
    expect(focus(s)).toBe('skate-notice');
  });
});
