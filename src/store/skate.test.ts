import { describe, expect, it } from 'vitest';
import { createTrickStore } from '.';
import { presetById, type PresetId } from '../sim/tricks';

/**
 * A store whose coin flip and computer are scripted. Each draw takes the next
 * number from `queue`, then `aim.value` once the queue is empty. For the
 * coin flip, below 0.5 is the student. For the computer's miss, 0.25 makes
 * every miss 0 (it lands what it goes for) and 0.999 makes it miss by the
 * most it can. pickCall reads one draw too: 0.25 picks the second open trick
 * of the level's list.
 */
function makeStore(queue: number[] = []) {
  let t = 1000;
  const aim = { value: 0.25 };
  const store = createTrickStore(
    () => (t += 10),
    () => queue.shift() ?? aim.value,
  );
  // Not a first game: the walk-through (ADR-66) has its own tests in lesson.test.ts.
  store.setState({ skateTaught: true });
  return Object.assign(store, { aim });
}

type Store = ReturnType<typeof makeStore>;
const types = (s: Store) => s.getState().events.map((e) => e.type);
const said = (s: Store) => s.getState().announcement.message;
const pop = (s: Store) => {
  s.getState().popTrick();
  s.getState().land();
};
/** The student's own pop with these inputs. */
const tryInputs = (s: Store, flick: number, scoop = 0) => {
  s.getState().setInput('flick', flick);
  s.getState().setInput('scoop', scoop);
  pop(s);
};
/** The student calls a preset trick and pops its inputs (presets are off in a game, so through the sliders). */
const callAndSet = (s: Store, id: PresetId) => {
  s.getState().callSkateTrick(id);
  const { flick, scoop } = presetById(id).inputs;
  tryInputs(s, flick, scoop);
};
const COMPUTER_FIRST = 0.75;
const YOU_FIRST = 0.25;

describe('game of SKATE', () => {
  it('starts with a coin flip: the computer won, so its call is up before it pops', () => {
    const store = makeStore([COMPUTER_FIRST]);
    store.getState().startSkate();
    store.getState().continueSkate();
    const s = store.getState();
    expect(s.skate.phase).toBe('computer-set');
    expect(s.skate.first).toBe('computer');
    expect(s.skate.letters).toEqual({ you: 0, computer: 0 });
    // Normal, nothing used, 0.25 of 7: the heelflip.
    expect(s.skate.call?.id).toBe('heelflip');
    expect(s.focusRequest?.kind).toBe('skate-heading');
    expect(s.events.at(-1)).toMatchObject({ type: 'skate.started', payload: { level: 'normal', first: 'computer' } });
    expect(said(store)).toBe(
      "Game of SKATE started, normal level. Coin flip: the computer sets first. Computer's turn: it's going for a heelflip.",
    );

    store.getState().applyPreset('kickflip');
    expect(store.getState().activePreset).toBeNull();
    expect(types(store)).not.toContain('preset.applied');
    expect(said(store)).toBe('Presets are off during a game of SKATE. Set the sliders yourself.');
  });

  it('the student won the coin flip: they call a trick before they can pop, and the set counts only for that trick', () => {
    const store = makeStore([YOU_FIRST]);
    store.getState().startSkate();
    store.getState().continueSkate();
    expect(store.getState().skate).toMatchObject({ phase: 'you-set', first: 'you', call: null });
    expect(said(store)).toMatch(/Coin flip: you set first\. Your turn to set: call a trick, then land it\./);

    store.getState().popTrick();
    expect(said(store)).toBe('Call your trick first: pick the trick you are going for, then pop.');
    expect(types(store)).not.toContain('trick.popped');

    store.getState().callSkateTrick('kickflip');
    expect(store.getState().skate.call?.id).toBe('kickflip');
    expect(said(store)).toBe('You called a kickflip. Land it and the computer has to copy it.');
    callAndSet(store, 'kickflip');
    const s = store.getState();
    expect(s.events.find((e) => e.type === 'trick.popped')).toMatchObject({ payload: { by: 'you', call: 'kickflip', preset: null } });
    expect(s.skate).toMatchObject({ phase: 'computer-copy', used: ['kickflip'] });
    expect(s.skate.call?.id).toBe('kickflip');
    expect(s.events.at(-1)).toMatchObject({ type: 'skate.set', payload: { by: 'you', trick: 'kickflip' } });
    expect(said(store)).toMatch(/You landed your kickflip! Computer's turn: it has to copy your kickflip\.$/);
  });

  it('a set that lands a different trick than the call does not count and passes the turn', () => {
    const store = makeStore([YOU_FIRST]);
    store.getState().startSkate();
    store.getState().continueSkate();
    store.getState().callSkateTrick('kickflip');
    tryInputs(store, -1.9); // a heelflip
    const s = store.getState();
    expect(s.skate.phase).toBe('computer-set');
    expect(s.skate.used).toEqual([]);
    expect(s.skate.letters).toEqual({ you: 0, computer: 0 });
    expect(s.skateMessage).toBe("You landed a heelflip, but you called a kickflip, so it doesn't count. The computer sets next.");
    // The computer's call for its set is already up.
    expect(s.skate.call).not.toBeNull();
  });

  it('calls are refused for a trick already set, off the set turn, and while a trick is in the air', () => {
    const store = makeStore([YOU_FIRST]);
    store.getState().startSkate();
    store.getState().continueSkate();
    callAndSet(store, 'kickflip');
    store.aim.value = 0.25;
    pop(store); // the computer copies the kickflip: the student sets again
    expect(store.getState().skate.phase).toBe('you-set');

    store.getState().callSkateTrick('kickflip');
    expect(store.getState().skate.call).toBeNull();
    expect(said(store)).toBe('The kickflip has already been set this game. Pick another trick.');

    store.getState().callSkateTrick('heelflip');
    store.getState().setInput('flick', -1.9);
    store.getState().popTrick();
    store.getState().callSkateTrick('pop-shove-it');
    expect(store.getState().skate.call?.id).toBe('heelflip');
    expect(said(store)).toBe('Wait for the board to land, then call your next trick.');
    store.getState().land();
    expect(store.getState().skate.phase).toBe('computer-copy');

    store.getState().callSkateTrick('pop-shove-it');
    expect(said(store)).toBe('You can call a trick only when it is your turn to set.');
  });

  it("the computer pops its own inputs, keeps the student's sliders and earns no objective", () => {
    const store = makeStore([COMPUTER_FIRST]);
    store.getState().setInput('pop', 0.5);
    store.getState().startSkate();
    store.getState().continueSkate();
    store.getState().popTrick();
    const s = store.getState();
    expect(s.flightBy).toBe('computer');
    expect(s.pop).toBe(0.5);
    expect(s.flight?.inputs.pop).toBe(0.35);
    expect(s.events.at(-1)).toMatchObject({ type: 'trick.popped', payload: { by: 'computer', call: 'heelflip', preset: null } });
    expect(said(store)).toBe('The computer goes for a heelflip.');

    store.getState().land();
    const after = store.getState();
    expect(after.result?.id).toBe('heelflip');
    expect(after.completed).toEqual([]);
    expect(after.skate.phase).toBe('you-copy');
    expect(after.events.find((e) => e.type === 'trick.resolved')?.payload.by).toBe('computer');
    expect(after.events.at(-1)).toMatchObject({ type: 'skate.set', payload: { by: 'computer', trick: 'heelflip' } });
    expect(said(store)).toMatch(/^The computer's trick: Heelflip landed clean./);
    expect(said(store)).toMatch(/The computer landed a heelflip\. Your turn: copy the computer's heelflip\. Set the sliders, then press Pop\.$/);
  });

  it('a copy of the right trick earns its objective and the computer sets again, never a trick already set', () => {
    const store = makeStore([COMPUTER_FIRST]);
    store.getState().startSkate();
    store.getState().continueSkate();
    pop(store); // computer: heelflip
    tryInputs(store, -1.9); // student: heelflip
    let s = store.getState();
    expect(s.flightBy).toBe('you');
    expect(s.completed).toEqual(['heelflip']);
    expect(s.skate.phase).toBe('computer-set');
    expect(s.skateMessage).toBe('You copied the heelflip!');
    // Its next call is the second open trick that is not the heelflip: the pop shove-it.
    expect(s.skate.call?.id).toBe('pop-shove-it');

    pop(store);
    tryInputs(store, 1.9); // student: a kickflip, the wrong trick
    s = store.getState();
    expect(s.skate.letters.you).toBe(1);
    expect(s.skate.used).toEqual(['heelflip', 'pop-shove-it']);
    expect(s.events.at(-1)).toMatchObject({ type: 'skate.letter', payload: { player: 'you', letters: 'S' } });
    expect(said(store)).toMatch(/You got S\. Letters: you S, computer no letters\. Computer's turn: it's going for a /);
  });

  it('the student sets after the computer misses, and the computer takes a letter when it cannot copy', () => {
    const store = makeStore([COMPUTER_FIRST]);
    store.getState().startSkate();
    store.getState().continueSkate();
    store.aim.value = 0.999;
    pop(store);
    expect(store.getState().skate.phase).toBe('you-set');

    callAndSet(store, 'kickflip');
    expect(store.getState().skate.phase).toBe('computer-copy');

    store.getState().popTrick();
    expect(said(store)).toBe('The computer tries to copy your kickflip.');
    store.getState().land();
    expect(store.getState().skate.letters.computer).toBe(1);
    expect(store.getState().skate.phase).toBe('you-set');
  });

  it('plays to the end: the student gets a second try on the last letter, then the computer wins', () => {
    const store = makeStore([COMPUTER_FIRST]);
    store.getState().startSkate();
    store.getState().continueSkate();
    for (let i = 0; i < 4; i++) {
      pop(store); // the computer lands its set
      tryInputs(store, 0); // the student ollies
    }
    expect(store.getState().skate.letters.you).toBe(4);
    pop(store);
    tryInputs(store, 0);
    let s = store.getState();
    expect(s.skate).toMatchObject({ phase: 'you-copy', secondTry: true });
    expect(s.skate.letters.you).toBe(4);
    expect(said(store)).toMatch(/so you get a second try\. Your turn: copy .* Last letter: this is the second try\.$/);
    // Five different sets: no trick was set twice.
    expect(new Set(s.skate.used).size).toBe(5);

    tryInputs(store, 0);
    s = store.getState();
    expect(s.skate.phase).toBe('over');
    expect(s.skate.winner).toBe('computer');
    expect(s.skateRecord).toEqual({ you: 0, computer: 1 });
    expect(s.events.filter((e) => e.type === 'skate.letter')).toHaveLength(5);
    expect(s.events.at(-1)).toMatchObject({ type: 'skate.ended', payload: { winner: 'computer', reason: 'spelled', you: 5 } });
    expect(said(store)).toMatch(/That spells SKATE: the computer wins\. The computer won this one\. Play again for a rematch\.$/);

    // Presets are back, and a pop is the student's own.
    store.getState().applyPreset('kickflip');
    expect(store.getState().activePreset).toBe('kickflip');
    store.getState().popTrick();
    expect(store.getState().flightBy).toBe('you');
  });

  it('plays to the end: the student wins when the computer misses five copies, with its second try', () => {
    const store = makeStore([YOU_FIRST]);
    store.aim.value = 0.999;
    store.getState().startSkate();
    store.getState().continueSkate();
    const sets: PresetId[] = ['kickflip', 'heelflip', 'pop-shove-it', 'frontside-pop-shove-it', 'varial-flip'];
    for (const id of sets) {
      callAndSet(store, id);
      pop(store); // the computer misses it
    }
    let s = store.getState();
    expect(s.skate).toMatchObject({ phase: 'computer-copy', secondTry: true, letters: { computer: 4 } });
    store.getState().popTrick();
    expect(said(store)).toBe('The computer tries your varial flip again: its second try on its last letter.');
    store.getState().land();
    s = store.getState();
    expect(s.skate.winner).toBe('you');
    expect(s.skateRecord).toEqual({ you: 1, computer: 0 });
    expect(said(store)).toMatch(/That spells SKATE: you win! You won! Play again for a rematch\.$/);
  });

  it('a paused trick must land before the next pop', () => {
    const store = makeStore([COMPUTER_FIRST]);
    store.getState().startSkate();
    store.getState().continueSkate();
    store.getState().popTrick();
    store.getState().togglePause();
    store.getState().popTrick();
    expect(said(store)).toBe('This trick has not landed yet. Press Resume to finish it.');
    expect(types(store).filter((t) => t === 'trick.popped')).toHaveLength(1);
  });

  it('a trick paused in the air from before a game never scores in it: the next game waits for it to land', () => {
    const queue = [COMPUTER_FIRST];
    const store = makeStore(queue);
    store.getState().startSkate();
    store.getState().continueSkate();
    store.getState().popTrick(); // the computer goes for its heelflip
    store.getState().togglePause();
    store.getState().quitSkate();

    store.getState().startSkate();
    store.getState().continueSkate();
    expect(store.getState().skate.phase).toBe('off');
    expect(said(store)).toBe('A trick is paused in the air. Press Resume to land it, then start the game.');
    expect(types(store).filter((t) => t === 'skate.started')).toHaveLength(1);

    // It lands as practice, scoring nothing; then the game starts clean.
    store.getState().land();
    expect(types(store)).not.toContain('skate.set');
    queue.push(COMPUTER_FIRST);
    store.getState().startSkate();
    store.getState().continueSkate();
    expect(store.getState().skate).toMatchObject({ phase: 'computer-set', used: [], letters: { you: 0, computer: 0 } });
    expect(types(store).filter((t) => t === 'skate.started')).toHaveLength(2);
  });

  it('quit and reset end a game in play, logged; the level is kept', () => {
    const store = makeStore();
    store.getState().setSkateLevel('hard');
    store.getState().startSkate();
    store.getState().continueSkate();
    store.getState().quitSkate();
    expect(store.getState().skate.phase).toBe('off');
    expect(store.getState().skate.level).toBe('hard');
    expect(store.getState().events.at(-1)).toMatchObject({ type: 'skate.ended', payload: { winner: null, reason: 'quit' } });

    store.getState().startSkate();
    store.getState().continueSkate();
    store.getState().resetSession();
    expect(store.getState().skate.phase).toBe('off');
    expect(store.getState().skate.level).toBe('hard');
    expect(types(store).slice(-2)).toEqual(['skate.ended', 'session.reset']);
    expect(said(store)).toMatch(/The game of SKATE ended\.$/);
  });

  it('a new game starts with the board on the pad and no result from before, keeping the speed', () => {
    const store = makeStore([COMPUTER_FIRST]);
    store.getState().applyPreset('kickflip');
    store.getState().popTrick();
    store.getState().land();
    store.getState().toggleSlowMotion();
    expect(store.getState().result).not.toBeNull();
    store.getState().startSkate();
    store.getState().continueSkate();
    const s = store.getState();
    expect(s).toMatchObject({ status: 'idle', progress: 0, flight: null, result: null, flightBy: 'you' });
    expect(s.rate).toBeLessThan(1);
    expect(s.skateMessage).toBe('Coin flip: the computer sets first.');
  });

  it('leaving a game in play waits for a yes; between games it just goes', () => {
    const store = makeStore([YOU_FIRST]);
    store.getState().setScreen('skate');
    store.getState().startSkate();
    store.getState().continueSkate();
    store.getState().requestLeave('home');
    expect(store.getState().skateLeave).toBe('home');
    expect(store.getState().screen).toBe('skate');
    store.getState().cancelLeave();
    expect(store.getState().skateLeave).toBeNull();
    expect(store.getState().skate.phase).toBe('you-set');
    expect(types(store)).not.toContain('skate.ended');

    store.getState().requestLeave('setup');
    store.getState().confirmLeave();
    expect(store.getState().screen).toBe('skate');
    expect(store.getState().skate.phase).toBe('off');
    expect(store.getState().events.at(-1)).toMatchObject({ type: 'skate.ended', payload: { reason: 'quit' } });

    store.getState().requestLeave('lab');
    expect(store.getState().skateLeave).toBeNull();
    expect(store.getState().screen).toBe('lab');
    // A confirm with nothing pending does nothing.
    store.getState().confirmLeave();
    expect(store.getState().screen).toBe('lab');
  });

  it('a screen change (the back button) clears a leave still waiting for its answer', () => {
    const store = makeStore([YOU_FIRST]);
    store.getState().setScreen('skate');
    store.getState().startSkate();
    store.getState().continueSkate();
    store.getState().requestLeave('home');
    store.getState().setScreen('lab');
    expect(store.getState().skateLeave).toBeNull();
    expect(store.getState().skate.phase).toBe('off');
  });

  it('the computer going on its own is a saved, announced switch, not logged', () => {
    localStorage.clear();
    const store = makeStore();
    expect(store.getState().skateAuto).toBe(true);
    store.getState().toggleSkateAuto();
    expect(store.getState().skateAuto).toBe(false);
    expect(localStorage.getItem('trick-lab.skate-auto')).toBe('off');
    expect(makeStore().getState().skateAuto).toBe(false);
    store.getState().toggleSkateAuto();
    expect(said(store)).toBe('The computer goes on its own.');
    expect(types(store)).toEqual([]);
    localStorage.clear();
  });

  it('the end of a game moves focus to its result, since the turn controls are gone', () => {
    const store = makeStore([COMPUTER_FIRST]);
    store.getState().startSkate();
    store.getState().continueSkate();
    store.setState({ skate: { ...store.getState().skate, letters: { you: 0, computer: 4 }, secondTry: true, phase: 'computer-copy', call: { id: 'kickflip', name: 'Kickflip', flips: 1, halfShoves: 0 } } });
    const before = store.getState().focusRequest?.nonce ?? 0;
    store.aim.value = 0.999;
    pop(store);
    expect(store.getState().skate.winner).toBe('you');
    expect(store.getState().focusRequest).toMatchObject({ kind: 'skate-heading' });
    expect(store.getState().focusRequest!.nonce).toBeGreaterThan(before);
  });

  it('a leave still waiting for its answer is dropped when the game ends behind it', () => {
    const store = makeStore([COMPUTER_FIRST]);
    store.getState().setScreen('skate');
    store.getState().startSkate();
    store.getState().continueSkate();
    store.setState({ skate: { ...store.getState().skate, letters: { you: 0, computer: 4 }, secondTry: true, phase: 'computer-copy', call: { id: 'kickflip', name: 'Kickflip', flips: 1, halfShoves: 0 } } });
    store.aim.value = 0.999;
    store.getState().popTrick();
    store.getState().requestLeave('home');
    expect(store.getState().skateLeave).toBe('home');
    store.getState().land();
    expect(store.getState().skate.phase).toBe('over');
    expect(store.getState().skateLeave).toBeNull();
    expect(store.getState().screen).toBe('skate');
  });

  it('the level changes only between games', () => {
    const store = makeStore();
    store.getState().startSkate();
    store.getState().continueSkate();
    store.getState().setSkateLevel('easy');
    expect(store.getState().skate.level).toBe('normal');
  });
});

// ADR-57: the stage celebrates the student's attempts that count; the store decides which.
describe('the celebration in a game', () => {
  it("celebrates the student's copy and set that count, never a miss, a wrong trick or the computer's", () => {
    const store = makeStore([COMPUTER_FIRST]);
    store.getState().startSkate();
    store.getState().continueSkate();
    // The computer lands its heelflip: its trick, not the student's to celebrate.
    pop(store);
    expect(store.getState().skate.phase).toBe('you-copy');
    expect(store.getState().celebration).toBeNull();
    // A kickflip is a landing, but not the heelflip to copy: a letter, no celebration.
    const kick = presetById('kickflip').inputs;
    tryInputs(store, kick.flick, kick.scoop);
    expect(store.getState().skate.letters.you).toBe(1);
    expect(store.getState().celebration).toBeNull();
    // The computer sets its next trick and lands it; the student copies it this time.
    pop(store);
    const call = store.getState().skate.call!;
    expect(store.getState().skate.phase).toBe('you-copy');
    const copy = presetById(call.id as PresetId).inputs;
    tryInputs(store, copy.flick, copy.scoop);
    expect(store.getState().skate.letters.you).toBe(1);
    expect(store.getState().celebration).toEqual({ nonce: 1, trick: call.name, clean: true });
    // Nothing about it is logged.
    expect(types(store).filter((t) => t.includes('celebrat'))).toEqual([]);
  });

  it("celebrates the student's own set when it lands as called", () => {
    const store = makeStore([YOU_FIRST]);
    store.getState().startSkate();
    store.getState().continueSkate();
    callAndSet(store, 'kickflip');
    expect(store.getState().skate.phase).toBe('computer-copy');
    expect(store.getState().celebration).toEqual({ nonce: 1, trick: 'Kickflip', clean: true });
  });
});

// ADR-58: the game's sounds come after the landing's, in order.
describe('the game sounds', () => {
  const cues = (store: Store) => {
    const kinds: string[] = [];
    store.subscribe((s, prev) => {
      if (s.soundCue && s.soundCue !== prev.soundCue) kinds.push(s.soundCue.kind);
    });
    return kinds;
  };

  it('asks for a letter after the landing that earns it, and the jingle when someone spells SKATE', () => {
    const store = makeStore([COMPUTER_FIRST]);
    store.getState().startSkate();
    store.getState().continueSkate();
    const kinds = cues(store);
    pop(store);
    expect(kinds).toEqual(['pop', 'land']);
    // A wrong trick on the copy (an ollie lands, but it is not the call): the landing, then the letter.
    tryInputs(store, 0, 0);
    expect(kinds.slice(2)).toEqual(['pop', 'land', 'letter']);
  });

  it('plays the losing jingle after the fifth letter', () => {
    const store = makeStore([COMPUTER_FIRST]);
    store.getState().startSkate();
    store.getState().continueSkate();
    store.setState((s) => ({ skate: { ...s.skate, letters: { you: 4, computer: 0 }, secondTry: true } }));
    pop(store);
    const kinds = cues(store);
    tryInputs(store, 0, 0);
    expect(store.getState().skate.winner).toBe('computer');
    expect(kinds).toEqual(['pop', 'land', 'letter', 'lose']);
  });

  it('plays the winning jingle when the computer spells SKATE', () => {
    const store = makeStore([YOU_FIRST]);
    store.getState().startSkate();
    store.getState().continueSkate();
    store.setState((s) => ({ skate: { ...s.skate, letters: { you: 0, computer: 4 } } }));
    callAndSet(store, 'kickflip');
    const kinds = cues(store);
    store.aim.value = 0.999;
    // The computer misses the copy twice (its last letter gives it a second try).
    pop(store);
    pop(store);
    expect(store.getState().skate.winner).toBe('you');
    expect(kinds.slice(-2)).toEqual(['letter', 'win']);
  });
});

describe('graded landings in a game (ADR-63)', () => {
  it('on Hard a sketchy set does not count: no set, no celebration, and the computer sets next', () => {
    const store = makeStore([YOU_FIRST]);
    store.getState().setSkateLevel('hard');
    store.getState().startSkate();
    store.getState().continueSkate();
    expect(said(store)).toBe(
      'Game of SKATE started, hard level. Only a clean landing counts on Hard: within 10 degrees on the flip and 8 on the shove. Coin flip: you set first. Your turn to set: call a trick, then land it. The computer has to copy it.',
    );
    store.getState().callSkateTrick('kickflip');
    // Flick 2.0 at pop 0.35 m: a kickflip 25 degrees past, landed but sketchy.
    tryInputs(store, 2);
    const s = store.getState();
    expect(s.result).toMatchObject({ id: 'kickflip', landed: true, grade: 'sketchy' });
    expect(s.skate.phase).toBe('computer-set');
    expect(s.skate.used).toEqual([]);
    expect(s.celebration).toBeNull();
    expect(types(store)).not.toContain('skate.set');
    expect(s.skateMessage).toBe('You landed your kickflip, but sketchy: on Hard only a clean landing counts. The computer sets next.');
    expect(said(store)).toMatch(/^Kickflip landed, sketchy: 25 degrees past on the flip\. .*You landed your kickflip, but sketchy: on Hard only a clean landing counts\./);
    expect(s.events.find((e) => e.type === 'trick.resolved')!.payload).toMatchObject({ landed: true, grade: 'sketchy' });
  });

  it('on Normal the same sketchy set counts, and its celebration is not a clean one', () => {
    const store = makeStore([YOU_FIRST]);
    store.getState().startSkate();
    store.getState().continueSkate();
    store.getState().callSkateTrick('kickflip');
    tryInputs(store, 2);
    expect(store.getState().skate.phase).toBe('computer-copy');
    expect(store.getState().skate.used).toEqual(['kickflip']);
    expect(store.getState().celebration).toEqual({ nonce: 1, trick: 'Kickflip', clean: false });
  });
});
