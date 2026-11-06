// The game of SKATE (ADR-43), pure: the rules, the computer's calls and its
// attempts. No React, no three, no store. The computer does not roll a die
// for land or bail: it aims at the inputs that land its trick, misses the
// aim by a random amount that depends on the level, and the real flight and
// recognition decide what happened, exactly as they do for the student.
import { airtimeFor, type TrickInputs } from './flight';
import { INPUT_LIMITS, NAMED_TRICKS, PRESETS, snapInput, type TrickId, type TrickResult } from './tricks';

export const SKATE_WORD = 'SKATE';
/** Letters that end a game: one per letter of SKATE. */
export const SKATE_LETTERS = SKATE_WORD.length;

export type SkatePlayer = 'you' | 'computer';
export type SkateLevel = 'easy' | 'normal' | 'hard';
/**
 * off: practice, no game. computer-set: the computer is up to set a trick.
 * you-copy: the student copies the computer's trick. you-set: the student
 * sets. computer-copy: the computer copies the student's trick. over: someone
 * spelled SKATE.
 */
export type SkatePhase = 'off' | 'computer-set' | 'you-copy' | 'you-set' | 'computer-copy' | 'over';

/** A trick to land or to copy. */
export interface SkateCall {
  id: TrickId;
  name: string;
  flips: number;
  halfShoves: number;
}

export interface SkateGame {
  phase: SkatePhase;
  level: SkateLevel;
  /** Letters each player has, 0 to 5. */
  letters: Record<SkatePlayer, number>;
  /** The trick in play: the computer's call while it sets, the trick to copy while copying; null otherwise. */
  call: SkateCall | null;
  /** The computer's last set, so it does not call the same trick twice in a row. */
  lastSet: TrickId | null;
  winner: SkatePlayer | null;
}

/**
 * Per level: how far the computer misses its aim, and what it may call.
 * `spread` scales the miss: the standard deviation on a rate is spread times
 * (0.25 + the rate), so a bigger flick or scoop is harder to get right and
 * an axis the trick does not use stays nearly still. Normal lands a kickflip
 * about 3 times in 4 and a 360 flip about half the time (skate.test.ts).
 */
export const SKATE_LEVELS: Record<SkateLevel, { label: string; spread: number; calls: readonly TrickId[]; hint: string }> = {
  easy: {
    label: 'Easy',
    spread: 0.1,
    calls: ['kickflip', 'heelflip', 'pop-shove-it', 'frontside-pop-shove-it'],
    hint: 'The computer misses often and only calls flips and shove-its.',
  },
  normal: {
    label: 'Normal',
    spread: 0.06,
    calls: PRESETS.map((p) => p.id),
    hint: 'The computer calls the seven preset tricks.',
  },
  hard: {
    label: 'Hard',
    spread: 0.035,
    calls: NAMED_TRICKS.filter((t) => t.id !== 'ollie').map((t) => t.id),
    hint: 'The computer rarely misses and calls every named trick, doubles included.',
  },
};

export const SKATE_LEVEL_ORDER: readonly SkateLevel[] = ['easy', 'normal', 'hard'];

export const isSkateLevel = (v: unknown): v is SkateLevel => v === 'easy' || v === 'normal' || v === 'hard';

const callOf = (id: TrickId): SkateCall => {
  const t = NAMED_TRICKS.find((n) => n.id === id);
  if (!t) throw new Error(`No named trick ${id}`);
  return { id: t.id, name: t.name, flips: t.flips, halfShoves: t.halfShoves };
};

export const callFor = (result: Pick<TrickResult, 'id' | 'name' | 'flips' | 'halfShoves'>): SkateCall => ({
  id: result.id,
  name: result.name,
  flips: result.flips,
  halfShoves: result.halfShoves,
});

/** The pool for a level, as calls. */
export const skateCalls = (level: SkateLevel): SkateCall[] => SKATE_LEVELS[level].calls.map(callOf);

export const newSkateGame = (level: SkateLevel = 'normal'): SkateGame => ({
  phase: 'off',
  level,
  letters: { you: 0, computer: 0 },
  call: null,
  lastSet: null,
  winner: null,
});

/** A new game: the computer sets first, so the student sees how a turn works. */
export const startSkateGame = (level: SkateLevel): SkateGame => ({ ...newSkateGame(level), phase: 'computer-set' });

export const skateActive = (g: SkateGame) => g.phase !== 'off' && g.phase !== 'over';
export const computerTurn = (g: SkateGame) => g.phase === 'computer-set' || g.phase === 'computer-copy';

/** "S K A", or "no letters". */
export const lettersText = (n: number) => (n === 0 ? 'no letters' : SKATE_WORD.slice(0, n).split('').join(' '));

/** The highest rate the computer aims at, so its miss still fits under the slider's limit of 3. */
const AIM_MAX_RATE = 2.6;

/**
 * The inputs that land a call dead on: the lowest pop on the slider grid,
 * from 0.35 m up, that keeps both rates at or under 2.6 rev/s (the three
 * double flips still need 2.86 rev/s of flick at the highest pop), then the flick
 * and scoop that turn exactly the call's flips and half shoves in that
 * airtime. Every named trick lands from its aim (skate.test.ts).
 */
export function aimFor(call: Pick<SkateCall, 'flips' | 'halfShoves'>): TrickInputs {
  const turnsNeeded = Math.max(Math.abs(call.flips), Math.abs(call.halfShoves) / 2);
  let pop = 0.35;
  while (pop < INPUT_LIMITS.pop.max && turnsNeeded / airtimeFor(pop) > AIM_MAX_RATE) pop = snapInput('pop', pop + INPUT_LIMITS.pop.step);
  const T = airtimeFor(pop);
  return { pop, flick: call.flips / T, scoop: call.halfShoves / 2 / T };
}

/** A standard normal draw (Box-Muller), clamped to 3 deviations so one wild draw cannot turn a call into another trick. */
function normal(rand: () => number): number {
  const u = 1 - rand();
  const v = rand();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(-3, Math.min(3, z));
}

const clampRate = (key: 'flick' | 'scoop', x: number) => {
  const { min, max } = INPUT_LIMITS[key];
  return Number(Math.min(max, Math.max(min, x)).toFixed(2)) + 0;
};

/**
 * The computer's try at a call: the aim, with the flick and the scoop each
 * missed by a normal draw (two draws each, flick first). Pop is on target:
 * the computer always pops the same.
 */
export function computerAttempt(call: SkateCall, level: SkateLevel, rand: () => number): TrickInputs {
  const aim = aimFor(call);
  const { spread } = SKATE_LEVELS[level];
  const miss = (rate: number) => rate + normal(rand) * spread * (0.25 + Math.abs(rate));
  return { pop: aim.pop, flick: clampRate('flick', miss(aim.flick)), scoop: clampRate('scoop', miss(aim.scoop)) };
}

/** The computer's next set: any trick of its level but the one it set last. */
export function pickCall(level: SkateLevel, previous: TrickId | null, rand: () => number): SkateCall {
  const all = skateCalls(level);
  const pool = all.length > 1 ? all.filter((c) => c.id !== previous) : all;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
}

/** What one attempt did to the game. */
export interface SkateStep {
  game: SkateGame;
  /** Who got a letter, if anyone. */
  letterTo: SkatePlayer | null;
  /** A trick that was just set (landed by the setter), to be copied. */
  set: SkateCall | null;
  /** What happened, in plain words. What to do next is skateInstruction of the new game. */
  message: string;
}

/** "a kickflip", "an inward heelflip". */
export const withArticle = (name: string) => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name.toLowerCase()}`;
const a = withArticle;
const the = (name: string) => `the ${name.toLowerCase()}`;

/** Gives `who` a letter and says so; ends the game on the fifth. */
function letter(g: SkateGame, who: SkatePlayer, missed: string, next: SkatePhase): SkateStep {
  const count = g.letters[who] + 1;
  const letters = { ...g.letters, [who]: count };
  const got = SKATE_WORD[count - 1];
  if (count >= SKATE_LETTERS) {
    const game: SkateGame = { ...g, phase: 'over', letters, call: null, winner: who === 'you' ? 'computer' : 'you' };
    const message =
      who === 'you'
        ? `${missed} You got ${got}. That spells SKATE: the computer wins.`
        : `${missed} The computer got ${got}. That spells SKATE: you win!`;
    return { game, letterTo: who, set: null, message };
  }
  const game: SkateGame = { ...g, phase: next, letters, call: null };
  const message = who === 'you' ? `${missed} You got ${got}.` : `${missed} The computer got ${got}.`;
  return { game, letterTo: who, set: null, message };
}

/**
 * Applies one resolved flight to the game. A set counts only if the setter
 * lands the trick it went for (the computer its call; the student any named
 * trick with a flip or a shove). A copy counts only if it lands the same
 * trick, the same way round. The setter keeps setting until a set misses.
 * An attempt by the player who is not up changes nothing.
 */
export function afterAttempt(g: SkateGame, by: SkatePlayer, r: TrickResult): SkateStep {
  const same = (c: SkateCall | null) => c !== null && r.landed && r.id === c.id;
  const none = (message: string): SkateStep => ({ game: g, letterTo: null, set: null, message });

  switch (g.phase) {
    case 'computer-set': {
      if (by !== 'computer' || !g.call) return none('');
      const call = g.call;
      if (same(call)) {
        return {
          game: { ...g, phase: 'you-copy', lastSet: call.id },
          letterTo: null,
          set: call,
          message: `The computer landed ${a(call.name)}.`,
        };
      }
      return {
        game: { ...g, phase: 'you-set', call: null, lastSet: call.id },
        letterTo: null,
        set: null,
        message: `The computer missed ${the(call.name)}.`,
      };
    }
    case 'you-copy': {
      if (by !== 'you' || !g.call) return none('');
      const call = g.call;
      if (same(call)) return { game: { ...g, phase: 'computer-set', call: null }, letterTo: null, set: null, message: `You copied ${the(call.name)}.` };
      const missed = r.landed
        ? `You landed ${a(r.name)}, but the trick to copy was ${a(call.name)}.`
        : `You missed ${the(call.name)}.`;
      return letter(g, 'you', missed, 'computer-set');
    }
    case 'you-set': {
      if (by !== 'you') return none('');
      if (!r.landed) {
        return { game: { ...g, phase: 'computer-set', call: null }, letterTo: null, set: null, message: 'You missed your set.' };
      }
      if (r.id === 'ollie') return none('An ollie is too easy to set. Add some flick or scoop and try again.');
      if (r.id === 'unnamed') return none(`${r.name} has no name, so it cannot be set. Try a named trick.`);
      const call = callFor(r);
      return {
        game: { ...g, phase: 'computer-copy', call },
        letterTo: null,
        set: call,
        message: `You set ${a(call.name)}.`,
      };
    }
    case 'computer-copy': {
      if (by !== 'computer' || !g.call) return none('');
      const call = g.call;
      if (same(call)) return { game: { ...g, phase: 'you-set', call: null }, letterTo: null, set: null, message: `The computer copied your ${call.name.toLowerCase()}.` };
      return letter(g, 'computer', `The computer missed your ${call.name.toLowerCase()}.`, 'you-set');
    }
    default:
      return none('');
  }
}

/** What to do now, in plain words: the panel's call line and the end of each announcement. */
export function skateInstruction(g: SkateGame): string {
  switch (g.phase) {
    case 'computer-set':
      return g.call ? `The computer is going for ${a(g.call.name)}.` : `The computer is up. Press "Computer's go" or Space to watch it set a trick.`;
    case 'you-copy':
      return g.call ? `Copy the computer's ${g.call.name.toLowerCase()}: set the sliders, then press Pop.` : '';
    case 'you-set':
      return 'Your set: land any trick with a flip or a shove. The computer has to copy it.';
    case 'computer-copy':
      return g.call ? `The computer has to copy your ${g.call.name.toLowerCase()}. Press "Computer's go" or Space to watch.` : '';
    case 'over':
      return 'Press Play again for a rematch, or Back to practice.';
    default:
      return '';
  }
}
