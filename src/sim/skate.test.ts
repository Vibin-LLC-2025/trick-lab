import { describe, expect, it } from 'vitest';
import { computeFlight } from './flight';
import {
  afterAttempt,
  aimFor,
  awaitingCall,
  callProblem,
  callTrick,
  CLEAN_ONLY_NOTE,
  cleanSetup,
  coinFlip,
  markUsed,
  computerAttempt,
  guideText,
  lettersText,
  openTricks,
  pickCall,
  SETTABLE_GROUPS,
  SETTABLE_TRICKS,
  SKATE_LEVEL_ORDER,
  SKATE_LEVELS,
  skateCalls,
  skateInstruction,
  startSkateGame,
  trickGuide,
  turnOf,
  turnView,
  withComputerCall,
  type SkateGame,
  type SkatePhase,
} from './skate';
import { INPUT_LIMITS, NAMED_TRICKS, presetById, recognize, resolveTrick } from './tricks';

/** Seeded generator, so the landing-rate checks are the same on every run. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0.25 twice gives a normal draw of 0 (cos of a quarter turn): the computer hits its aim. */
const dead = () => 0.25;

const kickflip = resolveTrick(presetById('kickflip').inputs);
const heelflip = resolveTrick(presetById('heelflip').inputs);
const kickflipBail = resolveTrick({ pop: 0.15, flick: 1.9, scoop: 0 });
const ollie = resolveTrick({ pop: 0.35, flick: 0, scoop: 0 });
const unnamed = resolveTrick({ pop: 0.35, flick: 1.9, scoop: -0.9 });
const kickCall = { id: 'kickflip' as const, name: 'Kickflip', flips: 1, halfShoves: 0 };
const heelCall = { id: 'heelflip' as const, name: 'Heelflip', flips: -1, halfShoves: 0 };

const game = (phase: SkatePhase, over: Partial<SkateGame> = {}): SkateGame => ({ ...startSkateGame('normal', 'computer'), phase, ...over });

describe('the computer', () => {
  it('aims at inputs that land every named trick, inside the sliders', () => {
    for (const t of NAMED_TRICKS) {
      const aim = aimFor(t);
      const r = recognize(computeFlight(aim));
      expect(r.id, t.id).toBe(t.id);
      expect(r.landed, t.id).toBe(true);
      expect(aim.pop).toBeGreaterThanOrEqual(INPUT_LIMITS.pop.min);
      expect(aim.pop).toBeLessThanOrEqual(INPUT_LIMITS.pop.max);
      // 2.6 rev/s leaves the computer room to miss; only the double flips, at the highest pop, need more.
      const limit = Math.abs(t.flips) === 2 ? INPUT_LIMITS.flick.max : 2.6;
      expect(Math.abs(aim.flick)).toBeLessThanOrEqual(limit);
      expect(Math.abs(aim.scoop)).toBeLessThanOrEqual(limit);
    }
  });

  it('pops at 0.35 m for the presets and higher only when a trick needs it', () => {
    expect(aimFor(kickCall).pop).toBe(0.35);
    expect(aimFor({ flips: 2, halfShoves: 0 }).pop).toBeGreaterThan(0.35);
  });

  it('lands its call when it does not miss its aim', () => {
    for (const c of skateCalls('hard')) {
      const r = resolveTrick(computerAttempt(c, 'easy', dead));
      expect(r.landed && r.id === c.id, c.id).toBe(true);
    }
  });

  it('misses more on easier levels and on harder tricks, and never leaves the sliders', () => {
    const rate = (id: string, level: (typeof SKATE_LEVEL_ORDER)[number]) => {
      const call = skateCalls('hard').find((c) => c.id === id)!;
      const rand = mulberry32(7);
      let landed = 0;
      for (let i = 0; i < 2000; i++) {
        const inputs = computerAttempt(call, level, rand);
        expect(Math.abs(inputs.flick)).toBeLessThanOrEqual(INPUT_LIMITS.flick.max);
        expect(Math.abs(inputs.scoop)).toBeLessThanOrEqual(INPUT_LIMITS.scoop.max);
        const r = resolveTrick(inputs);
        // Made: landed as called, and clean where the level counts only clean landings (ADR-63).
        if (r.landed && r.id === id && (!SKATE_LEVELS[level].cleanOnly || r.grade === 'clean')) landed += 1;
      }
      return landed / 2000;
    };
    const kick = { easy: rate('kickflip', 'easy'), normal: rate('kickflip', 'normal'), hard: rate('kickflip', 'hard') };
    expect(kick.easy).toBeLessThan(kick.normal);
    expect(kick.normal).toBeLessThan(kick.hard);
    // The level comment in skate.ts: Normal lands a kickflip about 3 in 4, a 360 flip about half the time.
    expect(kick.normal).toBeGreaterThan(0.65);
    expect(kick.normal).toBeLessThan(0.88);
    const tre = rate('360-flip', 'normal');
    expect(tre).toBeGreaterThan(0.4);
    expect(tre).toBeLessThan(0.65);
    expect(rate('double-tre', 'hard')).toBeLessThan(kick.hard);
    // Hard under the clean rule (ADR-63's table): about what it landed before the rule.
    expect(kick.hard).toBeGreaterThan(0.93);
    const doubleTre = rate('double-tre', 'hard');
    expect(doubleTre).toBeGreaterThan(0.55);
    expect(doubleTre).toBeLessThan(0.78);
    const tre3 = rate('360-flip', 'hard');
    expect(tre3).toBeGreaterThan(0.8);
    expect(tre3).toBeLessThan(0.93);
  });

  it('every settable trick has a clean setup on the slider grid (ADR-63)', () => {
    for (const c of SETTABLE_TRICKS) {
      const inputs = cleanSetup(c);
      for (const key of ['pop', 'flick', 'scoop'] as const) {
        const { min, max, step } = INPUT_LIMITS[key];
        expect(inputs[key], `${c.id} ${key}`).toBeGreaterThanOrEqual(min);
        expect(inputs[key], `${c.id} ${key}`).toBeLessThanOrEqual(max);
        // On the grid: a whole number of steps from the minimum.
        expect(Math.abs((inputs[key] - min) / step - Math.round((inputs[key] - min) / step)), `${c.id} ${key}`).toBeLessThan(1e-6);
      }
      const r = resolveTrick(inputs);
      expect(r.id, c.id).toBe(c.id);
      expect(r.grade, c.id).toBe('clean');
    }
    // The double flips have one clean setup only: pop 0.55 m with the flick at its limit.
    expect(cleanSetup(SETTABLE_TRICKS.find((t) => t.id === 'double-kickflip')!)).toEqual({ pop: 0.55, flick: 3, scoop: 0 });
    expect(cleanSetup(SETTABLE_TRICKS.find((t) => t.id === 'double-tre')!)).toEqual({ pop: 0.55, flick: 3, scoop: 1.5 });
  });

  it('calls from its level, never a trick already set, and not its own last call twice running', () => {
    expect(skateCalls('easy')).toHaveLength(4);
    expect(skateCalls('normal')).toHaveLength(7);
    expect(skateCalls('hard')).toHaveLength(NAMED_TRICKS.length - 1);
    expect(skateCalls('hard').some((c) => c.id === 'ollie')).toBe(false);
    const rand = mulberry32(3);
    let lastCall = null as ReturnType<typeof pickCall>['id'] | null;
    for (let i = 0; i < 200; i++) {
      const call = pickCall({ level: 'easy', used: ['kickflip'], lastCall }, rand);
      expect(SKATE_LEVELS.easy.calls).toContain(call.id);
      expect(call.id).not.toBe('kickflip');
      expect(call.id).not.toBe(lastCall);
      lastCall = call.id;
    }
  });

  it("moves on to the next level's tricks once its own are used up, and wipes the slate when every trick is", () => {
    const easyUsed = [...SKATE_LEVELS.easy.calls];
    const rand = mulberry32(5);
    for (let i = 0; i < 50; i++) {
      const call = pickCall({ level: 'easy', used: easyUsed, lastCall: null }, rand);
      expect(SKATE_LEVELS.normal.calls).toContain(call.id);
      expect(easyUsed).not.toContain(call.id);
    }
    const allUsed = SETTABLE_TRICKS.map((t) => t.id);
    expect(openTricks({ used: allUsed })).toHaveLength(SETTABLE_TRICKS.length);
    expect(allUsed).toContain(pickCall({ level: 'normal', used: allUsed, lastCall: null }, rand).id);
  });

  it('picks its call as its set turn begins, and only then', () => {
    const picked = withComputerCall(game('computer-set'), () => 0);
    expect(picked.call?.id).toBe('kickflip');
    const copying = game('you-copy', { call: kickCall });
    expect(withComputerCall(copying, () => 0)).toBe(copying);
    const called = game('computer-set', { call: heelCall });
    expect(withComputerCall(called, () => 0)).toBe(called);
  });
});

describe('the rules', () => {
  it('a coin flip picks who sets first', () => {
    expect(coinFlip(() => 0.25)).toBe('you');
    expect(coinFlip(() => 0.75)).toBe('computer');
    const you = startSkateGame('easy', 'you');
    expect(you).toMatchObject({ phase: 'you-set', first: 'you', level: 'easy', call: null, used: [], letters: { you: 0, computer: 0 } });
    expect(awaitingCall(you)).toBe(true);
    expect(turnOf(you)).toBe('you');
    const cpu = startSkateGame('hard', 'computer');
    expect(cpu).toMatchObject({ phase: 'computer-set', first: 'computer' });
    expect(turnOf(cpu)).toBe('computer');
    expect(turnOf(game('over'))).toBeNull();
  });

  it('the computer lands its set: the student copies it, and the trick is used up', () => {
    const step = afterAttempt(game('computer-set', { call: kickCall }), 'computer', kickflip);
    expect(step.game.phase).toBe('you-copy');
    expect(step.game.call?.id).toBe('kickflip');
    expect(step.game.used).toEqual(['kickflip']);
    expect(step.set?.id).toBe('kickflip');
    expect(step.message).toBe('The computer landed a kickflip.');
  });

  it('the computer misses its set: no letter, and the student sets', () => {
    const step = afterAttempt(game('computer-set', { call: kickCall }), 'computer', kickflipBail);
    expect(step.game.phase).toBe('you-set');
    expect(step.game.call).toBeNull();
    expect(step.game.used).toEqual([]);
    expect(step.game.lastCall).toBe('kickflip');
    expect(step.letterTo).toBeNull();
    expect(step.message).toBe("The computer missed the kickflip, so it's your turn to set.");
  });

  it('a copy counts only for the same trick, landed; the setter sets again either way', () => {
    const copied = afterAttempt(game('you-copy', { call: kickCall }), 'you', kickflip);
    expect(copied.game.phase).toBe('computer-set');
    expect(copied.letterTo).toBeNull();
    expect(copied.message).toBe('You copied the kickflip!');

    const wrong = afterAttempt(game('you-copy', { call: kickCall }), 'you', heelflip);
    expect(wrong.letterTo).toBe('you');
    expect(wrong.game.phase).toBe('computer-set');
    expect(wrong.game.letters.you).toBe(1);
    expect(wrong.message).toBe('You landed a heelflip, but the trick to copy was a kickflip. You got S.');

    const noName = afterAttempt(game('you-copy', { call: kickCall }), 'you', unnamed);
    expect(noName.message).toBe('You landed a trick with no name, but the trick to copy was a kickflip. You got S.');

    const bailed = afterAttempt(game('you-copy', { call: kickCall, letters: { you: 2, computer: 0 } }), 'you', kickflipBail);
    expect(bailed.game.letters.you).toBe(3);
    expect(bailed.message).toBe('You missed the kickflip. You got A.');
  });

  it('on the last letter the copier gets a second try, then the fifth letter ends the game', () => {
    const first = afterAttempt(game('you-copy', { call: kickCall, letters: { you: 4, computer: 1 } }), 'you', kickflipBail);
    expect(first.letterTo).toBeNull();
    expect(first.game).toMatchObject({ phase: 'you-copy', secondTry: true, call: kickCall, letters: { you: 4 } });
    expect(first.message).toBe("You missed the kickflip. You're on your last letter, so you get a second try.");
    expect(skateInstruction(first.game)).toMatch(/Last letter: this is the second try\.$/);

    const lost = afterAttempt(first.game, 'you', kickflipBail);
    expect(lost.game.phase).toBe('over');
    expect(lost.game.winner).toBe('computer');
    expect(lost.game.secondTry).toBe(false);
    expect(lost.message).toMatch(/You got E\. That spells SKATE: the computer wins\.$/);

    // Landing the second try is a clean copy: no letter, and the computer sets again.
    const saved = afterAttempt(first.game, 'you', kickflip);
    expect(saved.game).toMatchObject({ phase: 'computer-set', secondTry: false, letters: { you: 4 } });

    const cpuFirst = afterAttempt(game('computer-copy', { call: kickCall, letters: { you: 0, computer: 4 } }), 'computer', kickflipBail);
    expect(cpuFirst.game).toMatchObject({ phase: 'computer-copy', secondTry: true });
    expect(cpuFirst.message).toBe("The computer missed your kickflip. It's on its last letter, so it gets a second try.");
    const won = afterAttempt(cpuFirst.game, 'computer', kickflipBail);
    expect(won.game.phase).toBe('over');
    expect(won.game.winner).toBe('you');
    expect(won.message).toBe('The computer missed your kickflip. The computer got E. That spells SKATE: you win!');
  });

  it('wipes the slate once every trick has been set, and keeps no-repeats from there on', () => {
    const allButKick = SETTABLE_TRICKS.map((t) => t.id).filter((id) => id !== 'kickflip');
    expect(markUsed(['heelflip'], 'kickflip')).toEqual(['heelflip', 'kickflip']);
    expect(markUsed(allButKick, 'kickflip')).toEqual(['kickflip']);

    const set = afterAttempt(game('you-set', { call: kickCall, used: allButKick }), 'you', kickflip);
    expect(set.game.used).toEqual(['kickflip']);
    // The computer copies it and the student sets again: the kickflip is spent on the fresh slate, all else is open.
    const next = afterAttempt(set.game, 'computer', kickflip);
    expect(next.game.phase).toBe('you-set');
    expect(callProblem(next.game, 'kickflip')).toMatch(/already been set this game/);
    expect(callProblem(next.game, 'heelflip')).toBeNull();
    expect(openTricks(next.game)).toHaveLength(SETTABLE_TRICKS.length - 1);
    // And the computer's next set skips it too.
    const cpu = afterAttempt(game('computer-set', { call: heelCall, used: next.game.used }), 'computer', heelflip);
    expect(cpu.game.used).toEqual(['kickflip', 'heelflip']);
  });

  it('only a copier on their last letter gets a second try', () => {
    const step = afterAttempt(game('you-copy', { call: kickCall, letters: { you: 3, computer: 4 } }), 'you', kickflipBail);
    expect(step.letterTo).toBe('you');
    expect(step.game.secondTry).toBe(false);
  });

  it("the student's call: any named trick with a flip or a shove, not one already set, only on their set turn", () => {
    const g = game('you-set', { used: ['kickflip'] });
    expect(callProblem(g, 'heelflip')).toBeNull();
    expect(callProblem(g, 'double-tre')).toBeNull();
    expect(callProblem(g, 'kickflip')).toBe('The kickflip has already been set this game. Pick another trick.');
    expect(callProblem(g, 'ollie')).toMatch(/^An ollie is too easy to set\./);
    expect(callProblem(g, 'unnamed')).toMatch(/cannot be called/);
    expect(callProblem(game('you-copy', { call: kickCall }), 'heelflip')).toMatch(/only when it is your turn to set/);
    expect(callTrick(g, 'heelflip').call).toEqual(heelCall);
    // The picker lists every settable trick once, in three families.
    expect(SETTABLE_GROUPS.flatMap((grp) => grp.tricks.map((t) => t.id)).sort()).toEqual(SETTABLE_TRICKS.map((t) => t.id).sort());
  });

  it("the student's set counts only for the trick they called", () => {
    const called = game('you-set', { call: kickCall });
    const set = afterAttempt(called, 'you', kickflip);
    expect(set.game).toMatchObject({ phase: 'computer-copy', call: kickCall, used: ['kickflip'] });
    expect(set.set?.id).toBe('kickflip');
    expect(set.message).toBe('You landed your kickflip!');

    const other = afterAttempt(called, 'you', heelflip);
    expect(other.game).toMatchObject({ phase: 'computer-set', call: null, used: [] });
    expect(other.letterTo).toBeNull();
    expect(other.message).toBe("You landed a heelflip, but you called a kickflip, so it doesn't count. The computer sets next.");

    const missed = afterAttempt(called, 'you', kickflipBail);
    expect(missed.game.phase).toBe('computer-set');
    expect(missed.letterTo).toBeNull();
    expect(missed.message).toBe('You missed your kickflip. The computer sets next.');

    // An ollie or a trick with no name is just not the call.
    for (const r of [ollie, unnamed]) expect(afterAttempt(called, 'you', r).game.phase).toBe('computer-set');
    // Without a call nothing is scored (popTrick refuses the pop before it gets here).
    expect(afterAttempt(game('you-set'), 'you', kickflip).message).toBe('');
  });

  it('the computer copies or takes a letter, and the student sets again', () => {
    const copied = afterAttempt(game('computer-copy', { call: kickCall }), 'computer', kickflip);
    expect(copied.game.phase).toBe('you-set');
    expect(copied.game.call).toBeNull();
    expect(copied.letterTo).toBeNull();

    const missed = afterAttempt(game('computer-copy', { call: kickCall }), 'computer', kickflipBail);
    expect(missed.game.phase).toBe('you-set');
    expect(missed.letterTo).toBe('computer');
    expect(missed.message).toBe('The computer missed your kickflip. The computer got S.');
  });

  it('on Hard a set or a copy counts only if it lands clean, for both players (ADR-63)', () => {
    const sketchy = recognize({ ...computeFlight(presetById('kickflip').inputs), rollTotal: 378 });
    expect(sketchy).toMatchObject({ id: 'kickflip', landed: true, grade: 'sketchy' });
    expect(kickflip.grade).toBe('clean');
    const hard = (phase: SkatePhase, extra: Partial<SkateGame> = {}) => game(phase, { call: kickCall, level: 'hard', ...extra });

    // Easy and Normal count a sketchy landing.
    expect(afterAttempt(game('you-set', { call: kickCall, level: 'normal' }), 'you', sketchy).made).toBe(true);
    expect(afterAttempt(game('you-copy', { call: kickCall, level: 'easy' }), 'you', sketchy).made).toBe(true);

    const set = afterAttempt(hard('you-set'), 'you', sketchy);
    expect(set).toMatchObject({ made: false, set: null, letterTo: null });
    expect(set.game.phase).toBe('computer-set');
    expect(set.game.used).toEqual([]);
    expect(set.message).toBe('You landed your kickflip, but sketchy: on Hard only a clean landing counts. The computer sets next.');

    const copy = afterAttempt(hard('you-copy'), 'you', sketchy);
    expect(copy).toMatchObject({ made: false, letterTo: 'you' });
    expect(copy.message).toBe('You landed the kickflip, but sketchy: on Hard only a clean landing counts. You got S.');

    const cpuSet = afterAttempt(hard('computer-set'), 'computer', sketchy);
    expect(cpuSet.game.phase).toBe('you-set');
    expect(cpuSet.message).toBe("The computer landed the kickflip sketchy, and on Hard only a clean landing counts, so it's your turn to set.");

    const cpuCopy = afterAttempt(hard('computer-copy'), 'computer', sketchy);
    expect(cpuCopy).toMatchObject({ made: false, letterTo: 'computer' });
    expect(cpuCopy.message).toBe('The computer landed your kickflip, but sketchy: on Hard only a clean landing counts. The computer got S.');

    // Clean still counts on Hard, and the last-letter second try still applies to a sketchy copy.
    expect(afterAttempt(hard('you-set'), 'you', kickflip).made).toBe(true);
    const retry = afterAttempt(hard('you-copy', { letters: { you: 4, computer: 0 } }), 'you', sketchy);
    expect(retry.letterTo).toBeNull();
    expect(retry.game.secondTry).toBe(true);
    expect(SKATE_LEVELS.hard.hint).toContain('Only a clean landing counts');
    expect(CLEAN_ONLY_NOTE).toBe('Only a clean landing counts on Hard: within 10 degrees on the flip and 8 on the shove.');
  });

  it('an attempt by the player who is not up changes nothing', () => {
    const g = game('you-copy', { call: kickCall });
    expect(afterAttempt(g, 'computer', kickflip)).toMatchObject({ game: g, message: '', made: false });
    expect(afterAttempt(game('off'), 'you', kickflip).message).toBe('');
  });

  // ADR-57: the store celebrates the student's attempts that count, and only those.
  it('marks an attempt made only when a set lands as called or a copy lands the same trick', () => {
    const made = (phase: Parameters<typeof game>[0], by: 'you' | 'computer', r: typeof kickflip, extra = {}) =>
      afterAttempt(game(phase, { call: kickCall, ...extra }), by, r).made;
    expect(made('computer-set', 'computer', kickflip)).toBe(true);
    expect(made('computer-set', 'computer', heelflip)).toBe(false);
    expect(made('you-copy', 'you', kickflip)).toBe(true);
    expect(made('you-copy', 'you', heelflip)).toBe(false);
    expect(made('you-copy', 'you', kickflipBail)).toBe(false);
    expect(made('you-copy', 'you', kickflipBail, { letters: { you: 4, computer: 0 } })).toBe(false);
    expect(made('you-set', 'you', kickflip)).toBe(true);
    expect(made('you-set', 'you', heelflip)).toBe(false);
    expect(made('you-set', 'you', kickflipBail)).toBe(false);
    expect(made('computer-copy', 'computer', kickflip)).toBe(true);
    expect(made('computer-copy', 'computer', kickflipBail)).toBe(false);
  });

  it('says what to do in every phase, in plain words', () => {
    const phases: [SkatePhase, Partial<SkateGame>][] = [
      ['computer-set', {}],
      ['computer-set', { call: kickCall }],
      ['you-copy', { call: kickCall }],
      ['you-set', {}],
      ['you-set', { call: kickCall }],
      ['computer-copy', { call: kickCall }],
      ['over', { winner: 'you' }],
      ['over', { winner: 'computer' }],
    ];
    for (const [phase, over] of phases) {
      const text = skateInstruction(game(phase, over));
      expect(text, phase).not.toBe('');
      expect(text).not.toMatch(/—/);
    }
    expect(skateInstruction(game('computer-set', { call: kickCall }))).toBe("Computer's turn: it's going for a kickflip.");
    expect(skateInstruction(game('you-set'))).toBe('Your turn to set: call a trick, then land it. The computer has to copy it.');
    expect(skateInstruction(game('off'))).toBe('');
    expect(lettersText(0)).toBe('no letters');
    expect(lettersText(3)).toBe('S K A');
  });
});

describe('the turn card (ADR-46)', () => {
  it('says whose turn, what they are doing and the trick, in every phase of a game', () => {
    expect(turnView(game('computer-set', { call: kickCall }))).toEqual({ who: 'computer', title: "Computer's turn", label: 'Going for', trick: 'Kickflip' });
    expect(turnView(game('computer-copy', { call: kickCall }))).toEqual({ who: 'computer', title: "Computer's turn", label: 'Copying your', trick: 'Kickflip' });
    expect(turnView(game('you-copy', { call: kickCall }))).toEqual({ who: 'you', title: 'Your turn', label: "Copy the computer's", trick: 'Kickflip' });
    expect(turnView(game('you-set'))).toEqual({ who: 'you', title: 'Your turn', label: 'Your set', trick: null });
    expect(turnView(game('you-set', { call: kickCall }))?.trick).toBe('Kickflip');
    expect(turnView(game('off'))).toBeNull();
    expect(turnView(game('over', { winner: 'you' }))).toBeNull();
    // Whose turn agrees with turnOf, which the store and the auto turns use.
    for (const phase of ['computer-set', 'computer-copy', 'you-copy', 'you-set'] as const) {
      expect(turnView(game(phase, { call: kickCall }))?.who).toBe(turnOf(game(phase, { call: kickCall })));
    }
  });
});

describe('the trick guide', () => {
  it('says which way and how far, in words', () => {
    expect(trickGuide(kickCall)).toEqual({
      flick: 'Toward kickflip (slider to the right), for one full flip.',
      scoop: 'None. Keep the scoop slider in the middle.',
    });
    expect(trickGuide(heelCall).flick).toBe('Toward heelflip (slider to the left), for one full flip.');
    expect(trickGuide({ flips: 0, halfShoves: -2 })).toEqual({
      flick: 'None. Keep the flick slider in the middle.',
      scoop: 'Toward frontside (slider to the left), for a full turn (360 degrees).',
    });
    expect(trickGuide({ flips: 2, halfShoves: 2 }).flick).toBe('Toward kickflip (slider to the right), for two full flips.');
    expect(trickGuide({ flips: 1, halfShoves: 1 }).scoop).toBe('Toward backside (slider to the right), for a half turn (180 degrees).');
    expect(guideText(kickCall)).toBe('Kickflip: Flick toward kickflip (slider to the right), for one full flip. No scoop.');
  });

  it('never gives away a slider value', () => {
    for (const t of SETTABLE_TRICKS) {
      const { flick, scoop } = trickGuide(t);
      for (const line of [flick, scoop, guideText(t)]) {
        expect(line, t.id).not.toMatch(/rev\/s|\d\.\d|\bm\b/);
        expect(line).not.toMatch(/—/);
      }
    }
  });
});
