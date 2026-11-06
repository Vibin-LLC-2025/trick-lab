import { describe, expect, it } from 'vitest';
import { computeFlight } from './flight';
import {
  afterAttempt,
  aimFor,
  computerAttempt,
  lettersText,
  pickCall,
  SKATE_LEVEL_ORDER,
  SKATE_LEVELS,
  skateCalls,
  skateInstruction,
  startSkateGame,
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

const game = (phase: SkatePhase, over: Partial<SkateGame> = {}): SkateGame => ({ ...startSkateGame('normal'), phase, ...over });

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
        if (r.landed && r.id === id) landed += 1;
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
  });

  it('calls from its level and never the same trick twice in a row', () => {
    expect(skateCalls('easy')).toHaveLength(4);
    expect(skateCalls('normal')).toHaveLength(7);
    expect(skateCalls('hard')).toHaveLength(NAMED_TRICKS.length - 1);
    expect(skateCalls('hard').some((c) => c.id === 'ollie')).toBe(false);
    const rand = mulberry32(3);
    let last = null as ReturnType<typeof pickCall>['id'] | null;
    for (let i = 0; i < 200; i++) {
      const call = pickCall('easy', last, rand);
      expect(SKATE_LEVELS.easy.calls).toContain(call.id);
      expect(call.id).not.toBe(last);
      last = call.id;
    }
  });
});

describe('the rules', () => {
  it('the computer lands its set: the student copies it', () => {
    const step = afterAttempt(game('computer-set', { call: kickCall }), 'computer', kickflip);
    expect(step.game.phase).toBe('you-copy');
    expect(step.game.call?.id).toBe('kickflip');
    expect(step.set?.id).toBe('kickflip');
    expect(step.message).toBe('The computer landed a kickflip.');
  });

  it('the computer misses its set: the student sets', () => {
    const step = afterAttempt(game('computer-set', { call: kickCall }), 'computer', kickflipBail);
    expect(step.game.phase).toBe('you-set');
    expect(step.game.call).toBeNull();
    expect(step.game.lastSet).toBe('kickflip');
    expect(step.letterTo).toBeNull();
  });

  it('a copy counts only for the same trick, landed', () => {
    const copied = afterAttempt(game('you-copy', { call: kickCall }), 'you', kickflip);
    expect(copied.game.phase).toBe('computer-set');
    expect(copied.letterTo).toBeNull();

    const wrong = afterAttempt(game('you-copy', { call: kickCall }), 'you', heelflip);
    expect(wrong.letterTo).toBe('you');
    expect(wrong.game.letters.you).toBe(1);
    expect(wrong.message).toBe('You landed a heelflip, but the trick to copy was a kickflip. You got S.');

    const bailed = afterAttempt(game('you-copy', { call: kickCall, letters: { you: 2, computer: 0 } }), 'you', kickflipBail);
    expect(bailed.game.letters.you).toBe(3);
    expect(bailed.message).toBe('You missed the kickflip. You got A.');
  });

  it('the fifth letter ends the game', () => {
    const lost = afterAttempt(game('you-copy', { call: kickCall, letters: { you: 4, computer: 1 } }), 'you', kickflipBail);
    expect(lost.game.phase).toBe('over');
    expect(lost.game.winner).toBe('computer');
    expect(lost.message).toMatch(/You got E\. That spells SKATE: the computer wins\.$/);

    const won = afterAttempt(game('computer-copy', { call: kickCall, letters: { you: 0, computer: 4 } }), 'computer', kickflipBail);
    expect(won.game.phase).toBe('over');
    expect(won.game.winner).toBe('you');
    expect(won.message).toBe('The computer missed your kickflip. The computer got E. That spells SKATE: you win!');
  });

  it("the student's set: a landed named trick with a flip or a shove", () => {
    const set = afterAttempt(game('you-set'), 'you', kickflip);
    expect(set.game.phase).toBe('computer-copy');
    expect(set.game.call?.id).toBe('kickflip');
    expect(set.set?.id).toBe('kickflip');

    const missed = afterAttempt(game('you-set'), 'you', kickflipBail);
    expect(missed.game.phase).toBe('computer-set');
    expect(missed.letterTo).toBeNull();

    // An ollie or an unnamed trick keeps the turn and says why.
    for (const r of [ollie, unnamed]) {
      const step = afterAttempt(game('you-set'), 'you', r);
      expect(step.game.phase).toBe('you-set');
      expect(step.message).not.toBe('');
    }
  });

  it('the computer copies or takes a letter, and the student sets again', () => {
    const copied = afterAttempt(game('computer-copy', { call: kickCall }), 'computer', kickflip);
    expect(copied.game.phase).toBe('you-set');
    expect(copied.letterTo).toBeNull();

    const missed = afterAttempt(game('computer-copy', { call: kickCall }), 'computer', kickflipBail);
    expect(missed.game.phase).toBe('you-set');
    expect(missed.letterTo).toBe('computer');
    expect(missed.message).toBe('The computer missed your kickflip. The computer got S.');
  });

  it('an attempt by the player who is not up changes nothing', () => {
    const g = game('you-copy', { call: kickCall });
    expect(afterAttempt(g, 'computer', kickflip)).toMatchObject({ game: g, message: '' });
    expect(afterAttempt(game('off'), 'you', kickflip).message).toBe('');
  });

  it('says what to do in every phase, in plain words', () => {
    const phases: [SkatePhase, Partial<SkateGame>][] = [
      ['computer-set', {}],
      ['computer-set', { call: kickCall }],
      ['you-copy', { call: kickCall }],
      ['you-set', {}],
      ['computer-copy', { call: kickCall }],
      ['over', { winner: 'you' }],
      ['over', { winner: 'computer' }],
    ];
    for (const [phase, over] of phases) {
      const text = skateInstruction(game(phase, over));
      expect(text, phase).not.toBe('');
      expect(text).not.toMatch(/—/);
    }
    expect(skateInstruction(game('off'))).toBe('');
    expect(lettersText(0)).toBe('no letters');
    expect(lettersText(3)).toBe('S K A');
  });
});
