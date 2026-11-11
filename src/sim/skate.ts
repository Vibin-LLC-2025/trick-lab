// The game of SKATE (ADR-43, real-game rules ADR-44), pure: the rules, the
// computer's calls and its attempts. No React, no three, no store. The
// computer does not roll a die for land or bail: it sets the inputs that
// land its trick, releases the timing bar a random amount early or late
// (ADR-65: the same bar the player pops on), and the real flight and
// recognition decide what happened, exactly as they do for the player.
// Randomness always comes in as a parameter.
import { BAR, clampRelease, timedAttempt, type Band } from './bar';
import { airtimeFor, type TrickInputs } from './flight';
import { displayValue, inputDirection } from './format';
import { CLEAN_ROLL, CLEAN_YAW, DEFAULT_INPUTS, INPUT_LIMITS, NAMED_TRICKS, PRESETS, snapInput, type TrickId, type TrickResult } from './tricks';

export const SKATE_WORD = 'SKATE';
/** Letters that end a game: one per letter of SKATE. */
export const SKATE_LETTERS = SKATE_WORD.length;

export type SkatePlayer = 'you' | 'computer';
export type SkateLevel = 'easy' | 'normal' | 'hard';
/**
 * off: practice, no game. computer-set: the computer is up to set a trick.
 * you-copy: the student copies the computer's trick. you-set: the student
 * calls and sets a trick. computer-copy: the computer copies the student's
 * trick. over: someone spelled SKATE.
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
  /** Who won the coin flip and set first; null before a game starts. */
  first: SkatePlayer | null;
  /**
   * The trick in play. computer-set: the computer's call, picked as its set
   * turn begins (withComputerCall). you-set: the student's call, null until
   * they call one. you-copy and computer-copy: the trick to copy. Null otherwise.
   */
  call: SkateCall | null;
  /** Tricks set (called and landed by the setter) this game, in order. None of them can be set again. */
  used: TrickId[];
  /** The computer's last call, landed or not, so it does not go for the same trick twice running. */
  lastCall: TrickId | null;
  /** The copier is on their last letter and has missed once: the next attempt is their second and last try. */
  secondTry: boolean;
  winner: SkatePlayer | null;
}

/**
 * How well the computer times the bar (ADR-65). Its release is the band's
 * centre plus a normal draw whose standard deviation, in ms, is
 * baseMs * (1 + perFlip * flips + perShove * shove turns): a trick that
 * turns more is harder to time. The three numbers per level were fitted so
 * the computer makes each trick about as often as it did with its old miss
 * on each rate (ADR-65's table).
 */
export interface ComputerTiming {
  baseMs: number;
  perFlip: number;
  perShove: number;
}

/**
 * Per level: the timing bar's band (ADR-65), how well the computer times it,
 * what it may call, and whether only a clean landing counts (ADR-63).
 * The band is narrower and a miss costs more as the level goes up. Normal
 * makes a kickflip about 4 times in 5 and a 360 flip about half the time
 * (skate.test.ts). Hard counts only clean landings, for both players.
 */
export const SKATE_LEVELS: Record<
  SkateLevel,
  { label: string; band: Band; timing: ComputerTiming; calls: readonly TrickId[]; cleanOnly: boolean; hint: string }
> = {
  easy: {
    label: 'Easy',
    band: { halfMs: 140, k: 0.5 },
    timing: { baseMs: 103, perFlip: 2.4, perShove: 3 },
    calls: ['kickflip', 'heelflip', 'pop-shove-it', 'frontside-pop-shove-it'],
    cleanOnly: false,
    hint: 'The computer misses often and sticks to simple flips and shove-its.',
  },
  normal: {
    label: 'Normal',
    band: { halfMs: 100, k: 0.6 },
    timing: { baseMs: 55, perFlip: 1.5, perShove: 1.8 },
    calls: PRESETS.map((p) => p.id),
    cleanOnly: false,
    hint: 'The computer goes for the seven classic tricks, up to the 360 flip.',
  },
  hard: {
    label: 'Hard',
    band: { halfMs: 60, k: 0.7 },
    timing: { baseMs: 21, perFlip: 0.9, perShove: 0.95 },
    calls: NAMED_TRICKS.filter((t) => t.id !== 'ollie').map((t) => t.id),
    cleanOnly: true,
    hint: 'The computer rarely misses and goes for every trick, doubles included. Only a clean landing counts, for both of you.',
  },
};

/** Said wherever Hard's rule needs saying: the guide, and the start of a game. */
export const CLEAN_ONLY_NOTE = `Only a clean landing counts on Hard: within ${CLEAN_ROLL} degrees on the flip and ${CLEAN_YAW} on the shove.`;

export const SKATE_LEVEL_ORDER: readonly SkateLevel[] = ['easy', 'normal', 'hard'];

const callOf = (id: TrickId): SkateCall => {
  const t = NAMED_TRICKS.find((n) => n.id === id);
  if (!t) throw new Error(`No named trick ${id}`);
  return { id: t.id, name: t.name, flips: t.flips, halfShoves: t.halfShoves };
};

/** The pool for a level, as calls. */
export const skateCalls = (level: SkateLevel): SkateCall[] => SKATE_LEVELS[level].calls.map(callOf);

/**
 * Every trick a player may call, in the table order of NAMED_TRICKS: every
 * named trick but the ollie, which anyone copies, so it would only waste a turn.
 */
export const SETTABLE_TRICKS: readonly SkateCall[] = NAMED_TRICKS.filter((t) => t.id !== 'ollie').map((t) => callOf(t.id));

/** The settable tricks in three families, for the call picker: flips, shove-its, and the two together. */
export const SETTABLE_GROUPS: readonly { label: string; tricks: readonly SkateCall[] }[] = [
  { label: 'Flips', tricks: SETTABLE_TRICKS.filter((t) => t.halfShoves === 0) },
  { label: 'Shove-its', tricks: SETTABLE_TRICKS.filter((t) => t.flips === 0) },
  { label: 'Flip and shove', tricks: SETTABLE_TRICKS.filter((t) => t.flips !== 0 && t.halfShoves !== 0) },
];

/** The tricks that can be set now: every settable trick nobody has set yet this game (no repeats). */
export function openTricks(g: Pick<SkateGame, 'used'>): SkateCall[] {
  const open = SETTABLE_TRICKS.filter((t) => !g.used.includes(t.id));
  // markUsed never lets `used` hold every trick; this only guards a hand-made game.
  return open.length > 0 ? open : [...SETTABLE_TRICKS];
}

/**
 * `used` after `id` is set. In the very long game where that uses up the last
 * open trick, the slate is wiped and a fresh one starts with `id`, so every
 * other trick can be set again and no-repeats holds from there on.
 */
export function markUsed(used: readonly TrickId[], id: TrickId): TrickId[] {
  const next = used.includes(id) ? [...used] : [...used, id];
  return SETTABLE_TRICKS.every((t) => next.includes(t.id)) ? [id] : next;
}

export const newSkateGame = (level: SkateLevel = 'normal'): SkateGame => ({
  phase: 'off',
  level,
  letters: { you: 0, computer: 0 },
  first: null,
  call: null,
  used: [],
  lastCall: null,
  secondTry: false,
  winner: null,
});

/** The coin flip for who sets first: heads (below one half) is the student. */
export const coinFlip = (rand: () => number): SkatePlayer => (rand() < 0.5 ? 'you' : 'computer');

/** A new game: no letters, and the coin flip winner sets first. The computer's call comes from withComputerCall. */
export const startSkateGame = (level: SkateLevel, first: SkatePlayer): SkateGame => ({
  ...newSkateGame(level),
  phase: first === 'you' ? 'you-set' : 'computer-set',
  first,
});

export const skateActive = (g: SkateGame) => g.phase !== 'off' && g.phase !== 'over';
export const computerTurn = (g: SkateGame) => g.phase === 'computer-set' || g.phase === 'computer-copy';
/** Whose go it is: the player about to pop, or null when no game is in play. */
export const turnOf = (g: SkateGame): SkatePlayer | null => (!skateActive(g) ? null : computerTurn(g) ? 'computer' : 'you');
/** The student is up to set but has not called a trick yet, so a pop would not count. */
export const awaitingCall = (g: SkateGame) => g.phase === 'you-set' && g.call === null;

/** "S K A", or "no letters". */
export const lettersText = (n: number) => (n === 0 ? 'no letters' : SKATE_WORD.slice(0, n).split('').join(' '));

/** The highest rate the computer aims at, so a late release still fits under the slider's limit of 3. */
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

/** The slider steps nearest a call's exact rates at one pop height, and how far off they land against the clean limits (under 1 is clean). */
function setupAt(call: Pick<SkateCall, 'flips' | 'halfShoves'>, pop: number): { inputs: TrickInputs; score: number } {
  const T = airtimeFor(pop);
  const flick = snapInput('flick', call.flips / T);
  const scoop = snapInput('scoop', call.halfShoves / 2 / T);
  const rollOff = Math.abs(flick * T * 360 - call.flips * 360);
  const yawOff = Math.abs(scoop * T * 360 - call.halfShoves * 180);
  return { inputs: { pop, flick, scoop }, score: Math.max(rollOff / CLEAN_ROLL, yawOff / CLEAN_YAW) };
}

/**
 * The slider setup that lands a call cleanest (ADR-63): for each pop on the
 * slider grid, the flick and scoop steps nearest the rates that turn exactly
 * the call's flips and half shoves, scored by its worse axis against the
 * clean limits; the best score wins, and of equal scores the lowest pop.
 * Every settable trick has a clean one (skate.test.ts): the double flips
 * only at pop 0.55 m with flick 3.0. Tests use it, since `aimFor`'s exact rates are off the slider
 * grid; the first game's walk-through uses `lessonSetup`.
 */
export function cleanSetup(call: Pick<SkateCall, 'flips' | 'halfShoves'>): TrickInputs {
  const P = INPUT_LIMITS.pop;
  let best: TrickInputs = { pop: P.min, flick: 0, scoop: 0 };
  let bestScore = Infinity;
  for (let pop = P.min; pop <= P.max + 1e-9; pop = snapInput('pop', pop + P.step)) {
    const { inputs, score } = setupAt(call, pop);
    if (score < bestScore - 1e-9) {
      bestScore = score;
      best = inputs;
    }
    if (pop >= P.max) break;
  }
  return best;
}

/**
 * The setup the first game's walk-through asks for (ADR-66): the one at the
 * pop height the sliders start on, 0.35 m, when that lands clean, so a first
 * trick is one slider to move; otherwise the cleanest (the double flips need
 * the highest pop).
 */
export function lessonSetup(call: Pick<SkateCall, 'flips' | 'halfShoves'>): TrickInputs {
  const first = setupAt(call, DEFAULT_INPUTS.pop);
  return first.score < 1 ? first.inputs : cleanSetup(call);
}

/** A standard normal draw (Box-Muller), clamped to 3 deviations so one wild draw cannot decide a game. */
function normal(rand: () => number): number {
  const u = 1 - rand();
  const v = rand();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(-3, Math.min(3, z));
}

/** The spread of the computer's release for a call on a level, ms (ComputerTiming). */
export function timingSpread(call: Pick<SkateCall, 'flips' | 'halfShoves'>, level: SkateLevel): number {
  const { baseMs, perFlip, perShove } = SKATE_LEVELS[level].timing;
  return baseMs * (1 + perFlip * Math.abs(call.flips) + perShove * (Math.abs(call.halfShoves) / 2));
}

/** The computer's try at a call: what it set, when it released the bar, and the inputs that made. */
export interface ComputerTry {
  /** What it was going for: the aim, exactly. */
  intended: TrickInputs;
  /** When it released, ms into the sweep. */
  releaseMs: number;
  inputs: TrickInputs;
}

/**
 * The computer's try at a call (ADR-65): it sets the aim exactly, then
 * releases the bar at the band's centre plus a normal draw (one draw, two
 * numbers from `rand`). The same mapping as the player's release makes the
 * attempt of it, so it only ever misses by timing: early under-rotates, late
 * over-rotates, and an axis the trick does not use stays still.
 */
export function computerAttempt(call: SkateCall, level: SkateLevel, rand: () => number): ComputerTry {
  const intended = aimFor(call);
  const releaseMs = Math.round(clampRelease(BAR.centreMs + normal(rand) * timingSpread(call, level)));
  return { intended, releaseMs, inputs: timedAttempt(intended, releaseMs, SKATE_LEVELS[level].band) };
}

/**
 * The computer's next set. It goes for a trick of its level that nobody has
 * set yet; once its level's tricks are used up it moves on to the next
 * level's, as a skater who runs out of easy tricks has to. It avoids its own
 * last call while it has another choice. One draw from `rand`.
 */
export function pickCall(g: Pick<SkateGame, 'level' | 'used' | 'lastCall'>, rand: () => number): SkateCall {
  const open = openTricks(g);
  const from = SKATE_LEVEL_ORDER.slice(SKATE_LEVEL_ORDER.indexOf(g.level));
  let pool = open;
  for (const level of from) {
    const mine = open.filter((t) => SKATE_LEVELS[level].calls.includes(t.id));
    if (mine.length > 0) {
      pool = mine;
      break;
    }
  }
  if (pool.length > 1) pool = pool.filter((t) => t.id !== g.lastCall);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
}

/** On the computer's set turn without a call, it picks one now (so the student sees it before it pops). Otherwise unchanged. */
export function withComputerCall(g: SkateGame, rand: () => number): SkateGame {
  if (g.phase !== 'computer-set' || g.call) return g;
  return { ...g, call: pickCall(g, rand) };
}

/** Why the student cannot call `id` now, or null when they can. */
export function callProblem(g: SkateGame, id: TrickId): string | null {
  if (g.phase !== 'you-set') return 'You can call a trick only when it is your turn to set.';
  const trick = SETTABLE_TRICKS.find((t) => t.id === id);
  if (!trick) return id === 'ollie' ? 'An ollie is too easy to set. Pick a trick with a flip or a shove.' : 'That trick has no name, so it cannot be called.';
  if (!openTricks(g).some((t) => t.id === id)) return `The ${trick.name.toLowerCase()} has already been set this game. Pick another trick.`;
  return null;
}

/** The student's call for their set. Assumes callProblem returned null. */
export const callTrick = (g: SkateGame, id: TrickId): SkateGame => ({ ...g, call: callOf(id) });

/** What one attempt did to the game. */
export interface SkateStep {
  game: SkateGame;
  /** Who got a letter, if anyone. */
  letterTo: SkatePlayer | null;
  /** A trick that was just set (landed by the setter), to be copied. */
  set: SkateCall | null;
  /** The attempt counted: the setter landed the trick they called, or the copier copied it (ADR-57: the store celebrates the student's). */
  made: boolean;
  /** What happened, in plain words. What to do next is skateInstruction of the new game. */
  message: string;
}

/** "a kickflip", "an inward heelflip". */
export const withArticle = (name: string) => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name.toLowerCase()}`;
const a = withArticle;
const the = (name: string) => `the ${name.toLowerCase()}`;
/** What a landed result was, as a phrase: "a heelflip", or "a trick with no name". */
const landedAs = (r: TrickResult) => (r.id === 'unnamed' ? 'a trick with no name' : a(r.name));

/** Gives `who` a letter and says so; ends the game on the fifth. The setter sets again. */
function letter(g: SkateGame, who: SkatePlayer, missed: string, next: SkatePhase): SkateStep {
  const count = g.letters[who] + 1;
  const letters = { ...g.letters, [who]: count };
  const got = SKATE_WORD[count - 1];
  if (count >= SKATE_LETTERS) {
    const game: SkateGame = { ...g, phase: 'over', letters, call: null, secondTry: false, winner: who === 'you' ? 'computer' : 'you' };
    const message =
      who === 'you'
        ? `${missed} You got ${got}. That spells SKATE: the computer wins.`
        : `${missed} The computer got ${got}. That spells SKATE: you win!`;
    return { game, letterTo: who, set: null, made: false, message };
  }
  const game: SkateGame = { ...g, phase: next, letters, call: null, secondTry: false };
  const message = who === 'you' ? `${missed} You got ${got}.` : `${missed} The computer got ${got}.`;
  return { game, letterTo: who, set: null, made: false, message };
}

/** A copier on their last letter (S K A T) gets a second try at the copy after a first miss. */
const lastLetterRetry = (g: SkateGame, who: SkatePlayer) => g.letters[who] === SKATE_LETTERS - 1 && !g.secondTry;

/**
 * Applies one resolved flight to the game (ADR-43, ADR-44). A set counts only
 * if the setter lands exactly the trick they called; a miss, or a different
 * trick, passes the set to the other player with no letter. A copy counts
 * only if it lands the same trick, the same way round; a missed copy is a
 * letter, except that a copier on their last letter gets a second try. The
 * setter keeps setting until a set misses, whatever the copier does. An
 * attempt by the player who is not up changes nothing.
 */
export function afterAttempt(g: SkateGame, by: SkatePlayer, r: TrickResult): SkateStep {
  const cleanOnly = SKATE_LEVELS[g.level].cleanOnly;
  // The right trick, landed, but sketchy where only clean counts (ADR-63): it does not count, and the message says why.
  const sketchy = (c: SkateCall | null) => c !== null && cleanOnly && r.landed && r.id === c.id && r.grade !== 'clean';
  const same = (c: SkateCall | null) => c !== null && r.landed && r.id === c.id && !sketchy(c);
  const none = (message: string): SkateStep => ({ game: g, letterTo: null, set: null, made: false, message });
  const HARD = 'on Hard only a clean landing counts';

  switch (g.phase) {
    case 'computer-set': {
      if (by !== 'computer' || !g.call) return none('');
      const call = g.call;
      if (same(call)) {
        return {
          game: { ...g, phase: 'you-copy', used: markUsed(g.used, call.id), lastCall: call.id },
          letterTo: null,
          set: call,
          made: true,
          message: `The computer landed ${a(call.name)}.`,
        };
      }
      return {
        game: { ...g, phase: 'you-set', call: null, lastCall: call.id },
        letterTo: null,
        set: null,
        made: false,
        message: sketchy(call)
          ? `The computer landed ${the(call.name)} sketchy, and ${HARD}, so it's your turn to set.`
          : `The computer missed ${the(call.name)}, so it's your turn to set.`,
      };
    }
    case 'you-copy': {
      if (by !== 'you' || !g.call) return none('');
      const call = g.call;
      if (same(call)) {
        return { game: { ...g, phase: 'computer-set', call: null, secondTry: false }, letterTo: null, set: null, made: true, message: `You copied ${the(call.name)}!` };
      }
      const missed = sketchy(call)
        ? `You landed ${the(call.name)}, but sketchy: ${HARD}.`
        : r.landed
          ? `You landed ${landedAs(r)}, but the trick to copy was ${a(call.name)}.`
          : `You missed ${the(call.name)}.`;
      if (lastLetterRetry(g, 'you')) {
        return { game: { ...g, secondTry: true }, letterTo: null, set: null, made: false, message: `${missed} You're on your last letter, so you get a second try.` };
      }
      return letter(g, 'you', missed, 'computer-set');
    }
    case 'you-set': {
      if (by !== 'you' || !g.call) return none('');
      const call = g.call;
      if (same(call)) {
        return {
          game: { ...g, phase: 'computer-copy', used: markUsed(g.used, call.id) },
          letterTo: null,
          set: call,
          made: true,
          message: `You landed your ${call.name.toLowerCase()}!`,
        };
      }
      const message = sketchy(call)
        ? `You landed your ${call.name.toLowerCase()}, but sketchy: ${HARD}. The computer sets next.`
        : r.landed
          ? `You landed ${landedAs(r)}, but you called ${a(call.name)}, so it doesn't count. The computer sets next.`
          : `You missed your ${call.name.toLowerCase()}. The computer sets next.`;
      return { game: { ...g, phase: 'computer-set', call: null }, letterTo: null, set: null, made: false, message };
    }
    case 'computer-copy': {
      if (by !== 'computer' || !g.call) return none('');
      const call = g.call;
      if (same(call)) {
        return {
          game: { ...g, phase: 'you-set', call: null, secondTry: false },
          letterTo: null,
          set: null,
          made: true,
          message: `The computer copied your ${call.name.toLowerCase()}.`,
        };
      }
      const missed = sketchy(call)
        ? `The computer landed your ${call.name.toLowerCase()}, but sketchy: ${HARD}.`
        : `The computer missed your ${call.name.toLowerCase()}.`;
      if (lastLetterRetry(g, 'computer')) {
        return { game: { ...g, secondTry: true }, letterTo: null, set: null, made: false, message: `${missed} It's on its last letter, so it gets a second try.` };
      }
      return letter(g, 'computer', missed, 'you-set');
    }
    default:
      return none('');
  }
}

/**
 * What a trick needs, in words and without numbers, for the trick guide: the
 * side and amount of flick and of scoop. The student still picks the values.
 */
export interface TrickGuide {
  flick: string;
  scoop: string;
}

const COUNT_WORDS = ['no', 'one', 'two', 'three'];

export function trickGuide(t: Pick<SkateCall, 'flips' | 'halfShoves'>): TrickGuide {
  const flips = Math.abs(t.flips);
  const halves = Math.abs(t.halfShoves);
  const flick =
    flips === 0
      ? 'None. Keep the flick slider in the middle.'
      : `Toward ${t.flips > 0 ? 'kickflip (slider to the right)' : 'heelflip (slider to the left)'}, for ${COUNT_WORDS[flips] ?? flips} full ${flips === 1 ? 'flip' : 'flips'}.`;
  const turn = halves === 1 ? 'a half turn (180 degrees)' : halves === 2 ? 'a full turn (360 degrees)' : `${halves} half turns`;
  const scoop =
    halves === 0
      ? 'None. Keep the scoop slider in the middle.'
      : `Toward ${t.halfShoves > 0 ? 'backside (slider to the right)' : 'frontside (slider to the left)'}, for ${turn}.`;
  return { flick, scoop };
}

/** The tip under every guide: how pop trades against spin. */
export const GUIDE_TIP = 'Pop higher and the board stays up longer, so it needs less flick and scoop to turn the same amount.';

/** What to do now, in plain words: the panel's call line and the end of each announcement. */
export function skateInstruction(g: SkateGame): string {
  const retry = g.secondTry ? ' Last letter: this is the second try.' : '';
  switch (g.phase) {
    case 'computer-set':
      return g.call ? `Computer's turn: it's going for ${a(g.call.name)}.` : "Computer's turn to set a trick.";
    case 'you-copy':
      return g.call ? `Your turn: copy the computer's ${g.call.name.toLowerCase()}. Set the sliders, then press Pop.${retry}` : '';
    case 'you-set':
      return g.call
        ? `Your turn to set: land the ${g.call.name.toLowerCase()} you called and the computer has to copy it.`
        : 'Your turn to set: call a trick, then land it. The computer has to copy it.';
    case 'computer-copy':
      return g.call ? `Computer's turn: it has to copy your ${g.call.name.toLowerCase()}.${retry}` : '';
    case 'over':
      return g.winner === 'you' ? 'You won! Play again for a rematch.' : 'The computer won this one. Play again for a rematch.';
    default:
      return '';
  }
}

/** The game screen's turn card and stage chip (ADR-46): whose go it is, what they are doing, and the trick. */
export interface TurnView {
  who: SkatePlayer;
  /** "Your turn" or "Computer's turn". */
  title: string;
  /** What the player up is doing, said before the trick: "Copy the computer's", "Your set", "Going for", "Copying your". */
  label: string;
  /** The trick in play, or null while the student has not called one yet. */
  trick: string | null;
}

/** The turn card's words for a game in play; null between games and once one is over. */
export function turnView(g: SkateGame): TurnView | null {
  const trick = g.call?.name ?? null;
  switch (g.phase) {
    case 'computer-set':
      return { who: 'computer', title: "Computer's turn", label: 'Going for', trick };
    case 'computer-copy':
      return { who: 'computer', title: "Computer's turn", label: 'Copying your', trick };
    case 'you-copy':
      return { who: 'you', title: 'Your turn', label: "Copy the computer's", trick };
    case 'you-set':
      return { who: 'you', title: 'Your turn', label: 'Your set', trick };
    default:
      return null;
  }
}

/**
 * The first game's walk-through (ADR-66): the player's first go, as two or
 * three short prompts, with `at` the one to do now. It is for whatever trick
 * that go is: the computer's set to copy, the trick the player called, or a
 * kickflip when they are up to set and have not called yet. The one place
 * the game gives slider values (the trick guide never does, ADR-44): the
 * clean setup of the trick, so a first try at the bar is a fair one.
 */
export interface Lesson {
  steps: readonly string[];
  at: number;
}

const KICKFLIP: Pick<SkateCall, 'name' | 'flips' | 'halfShoves'> = { name: 'Kickflip', flips: 1, halfShoves: 0 };

/** "Pop 0.35 m, Flick 1.9 toward kickflip, Scoop 0.0". */
const setupWords = (i: TrickInputs) => {
  const rate = (key: 'flick' | 'scoop', label: string) => {
    const word = inputDirection(key, i[key]);
    return `${label} ${displayValue(key, i[key])}${word ? ` toward ${word}` : ''}`;
  };
  return `Pop ${displayValue('pop', i.pop)} m, ${rate('flick', 'Flick')}, ${rate('scoop', 'Scoop')}`;
};

/**
 * The walk-through for the game as it stands, or null when it is not the
 * player's go. `timed`: the game is played on the timing bar. `inputs`: the
 * sliders now. `barRunning`: the bar has been started and not released.
 */
export function lessonFor(g: SkateGame, timed: boolean, inputs: TrickInputs, barRunning: boolean): Lesson | null {
  if (turnOf(g) !== 'you') return null;
  const trick = g.call ?? KICKFLIP;
  const setup = lessonSetup(trick);
  const set = `the sliders for the ${trick.name.toLowerCase()}: ${setupWords(setup)}.`;
  const steps = [
    g.call ? `Set ${set}` : `Call the kickflip, then set ${set}`,
    timed ? 'Press Pop, or Space, to start the bar.' : 'Press Pop, or Space.',
    ...(timed ? ['Press Pop again when the marker is in the band.'] : []),
  ];
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  const ready = g.call !== null && near(inputs.pop, setup.pop) && near(inputs.flick, setup.flick) && near(inputs.scoop, setup.scoop);
  return { steps, at: !ready ? 0 : timed && barRunning ? 2 : 1 };
}

/** The walk-through's prompt to do now, as heard: "Step 1 of 3: Set the sliders for the kickflip: ...". */
export const lessonText = (l: Lesson) => `Step ${l.at + 1} of ${l.steps.length}: ${l.steps[l.at]}`;
