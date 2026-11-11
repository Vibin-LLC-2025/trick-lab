import { beforeEach, describe, expect, it } from 'vitest';
import { createTrickStore, sliderForecast, sliderPlace, sliderZones } from '.';
import { BAR } from '../sim/bar';
import { lessonSetup, type SkateLevel } from '../sim/skate';
import type { PopMode } from './types';

const YOU_FIRST = 0.25;
const COMPUTER_FIRST = 0.75;

/**
 * A store on the game screen with the coin flip scripted (below 0.5 is the
 * player) and the computer landing what it goes for (0.25 releases on the
 * band's centre), not a first game, on a level and a way of popping.
 */
function makeStore(level: SkateLevel, popMode: PopMode, first = YOU_FIRST) {
  let t = 1000;
  const queue = [first];
  const store = createTrickStore(
    () => t,
    () => queue.shift() ?? 0.25,
    () => '2026-11-11',
  );
  store.setState({ skateTaught: true, screen: 'skate' });
  store.getState().setSkateLevel(level);
  store.getState().setPopMode(popMode);
  store.getState().startSkate();
  store.getState().continueSkate();
  return Object.assign(store, {
    advance: (ms: number) => {
      t += ms;
    },
  });
}
type Store = ReturnType<typeof makeStore>;
const said = (s: Store) => s.getState().announcement.message;
const sliders = (s: Store) => ({ pop: s.getState().pop, flick: s.getState().flick, scoop: s.getState().scoop });
const inputEvents = (s: Store) => s.getState().events.filter((e) => e.type === 'input.changed');

beforeEach(() => localStorage.clear());

describe('the trick sets the sliders (ADR-83)', () => {
  for (const level of ['easy', 'normal'] as const) {
    it(`on ${level} with the timing bar: the call sets them, logged as slider moves and said with the call`, () => {
      const s = makeStore(level, 'timed');
      s.getState().callSkateTrick('kickflip');
      expect(sliders(s)).toEqual(lessonSetup({ flips: 1, halfShoves: 0 }));
      expect(said(s)).toBe('You called a kickflip. Land it and the computer has to copy it. Sliders set for a kickflip.');
      // One input.changed per slider that moved, in the event log's usual shape: the kickflip moves only the flick.
      expect(inputEvents(s).map((e) => e.payload)).toEqual([{ input: 'flick', label: 'Flick', value: 1.9, valueText: '1.9 revolutions per second, kickflip' }]);
      // A change of call sets them again.
      s.getState().callSkateTrick('frontside-pop-shove-it');
      expect(sliders(s)).toEqual({ pop: 0.35, flick: 0, scoop: -0.9 });
      expect(inputEvents(s).map((e) => e.payload.input)).toEqual(['flick', 'flick', 'scoop']);
      // The player can still move them, and the pop takes what they set.
      s.getState().setInput('scoop', -1);
      expect(s.getState().scoop).toBe(-1);
      s.getState().pressPop();
      s.advance(BAR.centreMs);
      s.getState().pressPop();
      expect(s.getState().events.find((e) => e.type === 'trick.popped')!.payload).toMatchObject({ setScoop: -1 });
    });
  }

  it('on Normal: a trick to copy is set as the copy becomes the player\'s, and so is the second try on the last letter', () => {
    const s = makeStore('normal', 'timed', COMPUTER_FIRST);
    s.getState().setInput('pop', 0.5);
    // The computer's go leaves the sliders alone while it is in the air.
    s.getState().popTrick();
    expect(sliders(s)).toEqual({ pop: 0.5, flick: 0, scoop: 0 });
    s.getState().land();
    expect(s.getState().skate.phase).toBe('you-copy');
    expect(sliders(s)).toEqual({ pop: 0.35, flick: -1.9, scoop: 0 });
    expect(said(s)).toMatch(/Your turn: copy the computer's heelflip\. Sliders set for a heelflip\.$/);

    // Four letters, then a miss: the second try sets them again.
    s.setState({ skate: { ...s.getState().skate, letters: { you: 4, computer: 0 } } });
    s.getState().setInput('flick', 0);
    s.getState().popTrick();
    s.getState().land();
    expect(s.getState().skate).toMatchObject({ phase: 'you-copy', secondTry: true });
    expect(sliders(s)).toEqual({ pop: 0.35, flick: -1.9, scoop: 0 });
    expect(said(s)).toMatch(/Last letter: this is the second try\. Sliders set for a heelflip\.$/);
  });

  it('on Hard never: dialing is part of Hard, so the call and the copy leave the sliders where they are and log nothing', () => {
    const s = makeStore('hard', 'timed');
    s.getState().callSkateTrick('kickflip');
    expect(sliders(s)).toEqual({ pop: 0.35, flick: 0, scoop: 0 });
    expect(said(s)).toBe('You called a kickflip. Land it and the computer has to copy it.');
    expect(inputEvents(s)).toEqual([]);
    const copy = makeStore('hard', 'timed', COMPUTER_FIRST);
    copy.getState().popTrick();
    copy.getState().land();
    expect(copy.getState().skate.phase).toBe('you-copy');
    expect(sliders(copy)).toEqual({ pop: 0.35, flick: 0, scoop: 0 });
    expect(said(copy)).toMatch(/Set the sliders, then press Get ready\.$/);
  });

  for (const level of ['easy', 'normal', 'hard'] as const) {
    it(`in Exact on ${level} never: with no bar the sliders are the game`, () => {
      const s = makeStore(level, 'exact');
      s.getState().callSkateTrick('kickflip');
      expect(sliders(s)).toEqual({ pop: 0.35, flick: 0, scoop: 0 });
      expect(said(s)).toBe('You called a kickflip. Land it and the computer has to copy it.');
      expect(inputEvents(s)).toEqual([]);
    });
  }
});

describe('the zones and the forecast, as the sliders read them (ADR-83)', () => {
  it('zones on Easy and Normal in either way of popping, whenever the player has a trick to do; never on Hard, never in the lab', () => {
    for (const [level, mode] of [
      ['easy', 'timed'],
      ['normal', 'timed'],
      ['easy', 'exact'],
      ['normal', 'exact'],
    ] as const) {
      const s = makeStore(level, mode);
      // No trick to do before the call.
      expect(sliderZones(s.getState())).toBeNull();
      s.getState().callSkateTrick('kickflip');
      expect(sliderZones(s.getState())?.flick, `${level} ${mode}`).not.toBeNull();
    }
    const hard = makeStore('hard', 'timed');
    hard.getState().callSkateTrick('kickflip');
    expect(sliderZones(hard.getState())).toBeNull();
    expect(sliderPlace(hard.getState(), 'flick')).toBeNull();
    const lab = makeStore('normal', 'timed');
    lab.getState().callSkateTrick('kickflip');
    lab.setState({ screen: 'lab' });
    expect(sliderZones(lab.getState())).toBeNull();
    expect(sliderForecast(lab.getState())).toBeNull();
  });

  it("none on the computer's go; the same zones object while nothing they read changes, new ones when pop moves", () => {
    const s = makeStore('normal', 'timed');
    s.getState().callSkateTrick('kickflip');
    const z = sliderZones(s.getState());
    s.getState().setInput('flick', 1.8);
    expect(sliderZones(s.getState())).toBe(z);
    expect(sliderPlace(s.getState(), 'flick')).toBe('landing');
    s.getState().setInput('pop', 0.45);
    const higher = sliderZones(s.getState());
    expect(higher).not.toBe(z);
    expect(higher!.flick!.from).toBeLessThan(z!.flick!.from);
    // Called and set: the player pops, misses (no letter on a set), and it is the computer's turn.
    s.getState().setInput('flick', 0);
    s.getState().popTrick();
    s.getState().land();
    expect(s.getState().skate.phase).toBe('computer-set');
    expect(sliderZones(s.getState())).toBeNull();
    expect(sliderForecast(s.getState())).toBeNull();
  });

  it('the forecast on every level, against the trick to do', () => {
    const s = makeStore('normal', 'timed');
    expect(sliderForecast(s.getState())).toBe('This makes: ollie, clean.');
    s.getState().callSkateTrick('kickflip');
    expect(sliderForecast(s.getState())).toBe('This makes: kickflip, clean.');
    s.getState().setInput('flick', 1.7);
    expect(sliderForecast(s.getState())).toBe('This makes: a bail: 33 degrees short on the flip.');
    const hard = makeStore('hard', 'timed');
    hard.getState().callSkateTrick('kickflip');
    expect(sliderForecast(hard.getState())).toBe('This makes: ollie, not the kickflip you need.');
    hard.getState().setInput('flick', 1.8);
    expect(sliderForecast(hard.getState())).toBe('This makes: kickflip, sketchy: 14 degrees short on the flip. Only clean counts on Hard.');
  });
});
