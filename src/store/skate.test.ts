import { describe, expect, it } from 'vitest';
import { createTrickStore } from '.';

/**
 * A store whose computer is scripted: `aim.value` 0.25 makes every miss 0
 * (the computer lands what it goes for) and 0.999 makes it miss by the
 * most it can. pickCall also reads it: 0.25 picks the second trick of the
 * level's list that is not the last set.
 */
function makeStore() {
  let t = 1000;
  const aim = { value: 0.25 };
  const store = createTrickStore(
    () => (t += 10),
    () => aim.value,
  );
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

describe('game of SKATE', () => {
  it('starts with no letters, the computer up, presets off and focus on the game', () => {
    const store = makeStore();
    store.getState().startSkate();
    const s = store.getState();
    expect(s.skate.phase).toBe('computer-set');
    expect(s.skate.letters).toEqual({ you: 0, computer: 0 });
    expect(s.focusRequest?.kind).toBe('skate-heading');
    expect(s.events.at(-1)).toMatchObject({ type: 'skate.started', payload: { level: 'normal' } });
    expect(said(store)).toMatch(/^Game of SKATE started, normal level\./);

    store.getState().applyPreset('kickflip');
    expect(store.getState().activePreset).toBeNull();
    expect(types(store)).not.toContain('preset.applied');
    expect(said(store)).toBe('Presets are off during a game of SKATE. Set the sliders yourself.');
  });

  it("the computer pops its own inputs, keeps the student's sliders and earns no objective", () => {
    const store = makeStore();
    store.getState().setInput('pop', 0.5);
    store.getState().startSkate();
    store.getState().popTrick();
    const s = store.getState();
    expect(s.flightBy).toBe('computer');
    expect(s.pop).toBe(0.5);
    expect(s.flight?.inputs.pop).toBe(0.35);
    // Normal, no last set, 0.25 of 7: the heelflip.
    expect(s.skate.call?.id).toBe('heelflip');
    expect(s.events.at(-1)).toMatchObject({ type: 'trick.popped', payload: { by: 'computer', call: 'heelflip', preset: null } });
    expect(said(store)).toBe('The computer goes for a heelflip.');

    store.getState().land();
    const after = store.getState();
    expect(after.result?.id).toBe('heelflip');
    expect(after.completed).toEqual([]);
    expect(after.skate.phase).toBe('you-copy');
    expect(after.events.find((e) => e.type === 'trick.resolved')?.payload.by).toBe('computer');
    expect(after.events.at(-1)).toMatchObject({ type: 'skate.set', payload: { by: 'computer', trick: 'heelflip' } });
    expect(said(store)).toMatch(/^The computer's trick: Heelflip landed\./);
    expect(said(store)).toMatch(/The computer landed a heelflip\. Copy the computer's heelflip: set the sliders, then press Pop\.$/);
  });

  it('a copy of the right trick earns its objective and the computer sets again; a wrong one is a letter', () => {
    const store = makeStore();
    store.getState().startSkate();
    pop(store); // computer: heelflip
    tryInputs(store, -1.9); // student: heelflip
    let s = store.getState();
    expect(s.flightBy).toBe('you');
    expect(s.completed).toEqual(['heelflip']);
    expect(s.skate.phase).toBe('computer-set');
    expect(s.skateMessage).toBe('You copied the heelflip.');

    pop(store); // computer: its second pick that is not the heelflip, the pop shove-it
    expect(store.getState().skate.call?.id).toBe('pop-shove-it');
    tryInputs(store, 1.9); // student: a kickflip
    s = store.getState();
    expect(s.skate.letters.you).toBe(1);
    expect(s.events.at(-1)).toMatchObject({ type: 'skate.letter', payload: { player: 'you', letters: 'S' } });
    expect(said(store)).toMatch(/You got S\. Letters: you S, computer no letters\. The computer is up\./);
  });

  it('the student sets after the computer misses, and the computer takes a letter when it cannot copy', () => {
    const store = makeStore();
    store.getState().startSkate();
    store.aim.value = 0.999;
    pop(store);
    expect(store.getState().skate.phase).toBe('you-set');

    tryInputs(store, 1.9); // a kickflip set
    expect(store.getState().skate.phase).toBe('computer-copy');
    expect(store.getState().skate.call?.id).toBe('kickflip');
    expect(said(store)).toMatch(/You set a kickflip\. The computer has to copy your kickflip\./);

    store.getState().popTrick();
    expect(said(store)).toBe('The computer tries to copy your kickflip.');
    store.getState().land();
    expect(store.getState().skate.letters.computer).toBe(1);
    expect(store.getState().skate.phase).toBe('you-set');
  });

  it('plays to the end: five missed copies spell SKATE and the computer wins', () => {
    const store = makeStore();
    store.getState().startSkate();
    for (let i = 0; i < 5; i++) {
      pop(store); // the computer lands its set
      tryInputs(store, 0); // the student ollies
    }
    const s = store.getState();
    expect(s.skate.phase).toBe('over');
    expect(s.skate.winner).toBe('computer');
    expect(s.skateRecord).toEqual({ you: 0, computer: 1 });
    expect(s.events.filter((e) => e.type === 'skate.letter')).toHaveLength(5);
    expect(s.events.at(-1)).toMatchObject({ type: 'skate.ended', payload: { winner: 'computer', reason: 'spelled', you: 5 } });
    expect(said(store)).toMatch(/That spells SKATE: the computer wins\. Press Play again for a rematch, or Back to practice\.$/);

    // Presets are back, and a pop is the student's own.
    store.getState().applyPreset('kickflip');
    expect(store.getState().activePreset).toBe('kickflip');
    store.getState().popTrick();
    expect(store.getState().flightBy).toBe('you');
  });

  it('plays to the end: the student wins when the computer misses five copies', () => {
    const store = makeStore();
    store.getState().startSkate();
    store.aim.value = 0.999;
    pop(store); // the computer misses its set
    for (let i = 0; i < 5; i++) {
      tryInputs(store, 1.9); // the student sets a kickflip
      pop(store); // the computer misses it
    }
    const s = store.getState();
    expect(s.skate.winner).toBe('you');
    expect(s.skateRecord).toEqual({ you: 1, computer: 0 });
    expect(said(store)).toMatch(/That spells SKATE: you win! Press Play again/);
  });

  it('a paused trick must land before the next pop', () => {
    const store = makeStore();
    store.getState().startSkate();
    store.getState().popTrick();
    store.getState().togglePause();
    store.getState().popTrick();
    expect(said(store)).toBe('This trick has not landed yet. Press Resume to finish it.');
    expect(types(store).filter((t) => t === 'trick.popped')).toHaveLength(1);
  });

  it('quit and reset end a game in play, logged; the level is kept', () => {
    const store = makeStore();
    store.getState().setSkateLevel('hard');
    store.getState().startSkate();
    store.getState().quitSkate();
    expect(store.getState().skate.phase).toBe('off');
    expect(store.getState().skate.level).toBe('hard');
    expect(store.getState().events.at(-1)).toMatchObject({ type: 'skate.ended', payload: { winner: null, reason: 'quit' } });

    store.getState().startSkate();
    store.getState().resetSession();
    expect(store.getState().skate.phase).toBe('off');
    expect(store.getState().skate.level).toBe('hard');
    expect(types(store).slice(-2)).toEqual(['skate.ended', 'session.reset']);
    expect(said(store)).toMatch(/The game of SKATE ended\.$/);
  });

  it('the level changes only between games', () => {
    const store = makeStore();
    store.getState().startSkate();
    store.getState().setSkateLevel('easy');
    expect(store.getState().skate.level).toBe('normal');
  });
});
