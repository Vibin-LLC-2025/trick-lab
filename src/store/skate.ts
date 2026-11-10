import type { StateCreator } from 'zustand';
import { BAR } from '../sim/bar';
import {
  afterAttempt,
  awaitingCall,
  callProblem,
  callTrick,
  CLEAN_ONLY_NOTE,
  coinFlip,
  computerAttempt,
  computerTurn,
  lessonFor,
  lessonText,
  lettersText,
  newSkateGame,
  SKATE_LEVELS,
  SKATE_WORD,
  skateActive,
  skateInstruction,
  startSkateGame,
  turnOf,
  withArticle,
  withComputerCall,
  type SkateGame,
} from '../sim/skate';
import { inFlight } from './playback';
import { readPref, savePref } from './prefs';
import { computerWaiting } from './roll';
import type { Clock } from './assessment';
import type { PopMode, SkateSlice, TrickState } from './types';

/** The computer goes on its own (ADR-46). */
export const SKATE_AUTO_KEY = 'trick-lab.skate-auto';
/** How the player pops in a game: on the timing bar, or exactly (ADR-65). */
export const POP_MODE_KEY = 'trick-lab.pop-mode';
/** The first game's walk-through has been done or skipped (ADR-66). */
export const TAUGHT_KEY = 'trick-lab.skate-taught';

/** A source of numbers in [0, 1). The store takes one so tests can script the coin flip and the computer. */
export type Random = () => number;

/**
 * Runs `fn` once, `ms` from now, and returns what cancels it. The store takes
 * one for the timing bar's end (ADR-65): setTimeout in the app, a fake in
 * tests, so the bar's timing is exact there.
 */
export type Schedule = (fn: () => void, ms: number) => () => void;

export const initialSkate = (level: SkateGame['level'] = 'normal') => ({
  skate: newSkateGame(level),
  skateMessage: '',
  skateRecord: { you: 0, computer: 0 },
  pendingPop: null,
  lastRelease: null,
  skateLesson: false,
});

const POP_MODE_ANNOUNCEMENT: Record<PopMode, string> = {
  timed: 'Timing bar: Pop starts the bar, and Pop again in the band releases it.',
  exact: 'Exact: Pop does exactly what the sliders say.',
};

const score = (g: SkateGame) => ({ you: g.letters.you, computer: g.letters.computer });
const letters = (n: number) => SKATE_WORD.slice(0, n);

/**
 * The game of SKATE (ADR-43, ADR-44). This slice owns the game's state and
 * its log events; the playback slice asks it who pops (computerGo) and tells
 * it how each flight ended (scoreSkate), so the rules run on the same
 * recognized result the outcome card shows. Every random draw (the coin flip,
 * the computer's call and its release of the bar) comes from `random`. The
 * timing bar (ADR-65) is owned here too: it reads `now` and ends through
 * `schedule`, both handed in, so nothing in it depends on a real timer.
 */
export const createSkateSlice =
  (random: Random, now: Clock, schedule: Schedule): StateCreator<TrickState, [], [], SkateSlice> =>
  (set, get) => {
    let popSeq = 0;
    /** Cancels the running bar's end, if one is scheduled. */
    let cancelEnd: (() => void) | null = null;
    /** The walk-through's prompt last said, so each is said once as it is reached (ADR-66). */
    let lessonAt = 0;

    /** The walk-through's prompts for the state as it is, or null when it is not running or not the player's go. */
    const lesson = () => {
      const s = get();
      return s.skateLesson ? lessonFor(s.skate, s.popMode === 'timed', s, s.pendingPop !== null) : null;
    };
    /** The walk-through's opening, for the announcement that starts the player's first go. */
    const lessonLead = () => {
      const l = lesson();
      lessonAt = l?.at ?? 0;
      return l ? ` First game, so here is your first trick in ${l.steps.length} steps. ${lessonText(l)}` : '';
    };

    /** Drops the running bar: no attempt, no letter. True if there was one. */
    const drop = (): boolean => {
      if (!get().pendingPop) return false;
      cancelEnd?.();
      cancelEnd = null;
      set({ pendingPop: null });
      // No pop after all: the board slows to a stop (ADR-67). A release pops at once and pushes it again.
      if (get().status !== 'playing') get().slowRoll();
      return true;
    };

    /**
     * Releases bar `id`: by the second press, at the clock's time, or by the
     * bar's own end. A call for a bar that is no longer the running one (a
     * press and the end in the same tick, an end after the game was quit)
     * does nothing.
     */
    const release = (id: number, timedOut: boolean) => {
      const pending = get().pendingPop;
      if (!pending || pending.id !== id) return;
      const releaseMs = timedOut ? BAR.sweepMs : Math.min(BAR.sweepMs, Math.max(0, now() - pending.startedAt));
      drop();
      get().popTimed({ intended: pending.intended, releaseMs, level: pending.level, timedOut });
    };

    return {
      ...initialSkate(),
      skateAuto: readPref(SKATE_AUTO_KEY) !== 'off',
      skateLeave: null,
      popMode: readPref(POP_MODE_KEY) === 'exact' ? 'exact' : 'timed',
      skateTaught: readPref(TAUGHT_KEY) === 'yes',

      skipLesson: () => {
        if (!get().skateLesson) return;
        get().endLesson();
        get().announce('Walk-through skipped.');
      },

      endLesson: () => {
        if (!get().skateLesson) return;
        savePref(TAUGHT_KEY, 'yes');
        set({ skateLesson: false, skateTaught: true });
      },

      lessonMoved: () => {
        const l = lesson();
        if (!l) return;
        // The setup has just been reached: say what comes next. Moving away from it again is not news.
        if (l.at === 1 && lessonAt === 0) get().announce(lessonText(l));
        lessonAt = l.at;
      },

      setPopMode: (popMode) => {
        const s = get();
        if (skateActive(s.skate) || s.popMode === popMode) return;
        savePref(POP_MODE_KEY, popMode);
        set({ popMode });
        s.announce(POP_MODE_ANNOUNCEMENT[popMode]);
      },

      pressPop: () => {
        const s = get();
        if (s.pendingPop) {
          release(s.pendingPop.id, false);
          return;
        }
        // The bar is the player's own go in a game, with a trick in play and the board down. Anything else is the plain pop,
        // which is the computer's go on its turn and says what is wrong otherwise.
        const mine = s.popMode === 'timed' && turnOf(s.skate) === 'you' && !awaitingCall(s.skate) && s.status !== 'playing' && !inFlight(s);
        if (!mine) {
          s.popTrick();
          return;
        }
        const id = ++popSeq;
        set({ pendingPop: { id, startedAt: now(), intended: { pop: s.pop, flick: s.flick, scoop: s.scoop }, level: s.skate.level }, lastRelease: null });
        cancelEnd = schedule(() => release(id, true), BAR.sweepMs);
        // The bar is the push: the board is at its cruise by the band (ADR-67).
        s.startRoll();
        // Short while the ticks play; with sound off the bar is silent, so say so and where Exact is.
        s.announce(s.soundOn ? 'Bar running.' : 'Bar running, with no sound: press Pop again in the band. Turn sound on to hear it, or choose Exact before a game.');
      },

      cancelPop: () => {
        if (drop()) get().announce('Pop cancelled.');
      },

      dropPop: () => (drop() ? 'Pop cancelled. ' : ''),

      setSkateLevel: (level) => {
        const { skate } = get();
        if (skateActive(skate) || skate.level === level) return;
        set({ skate: { ...skate, level } });
      },

      startSkate: () => {
        const s = get();
        // A flight from before the game would otherwise land into it and score against the new call.
        if (s.status === 'playing') {
          s.announce('Wait for the board to land, then start the game.');
          return;
        }
        if (inFlight(s)) {
          s.announce('A trick is paused in the air. Press Resume to land it, then start the game.');
          return;
        }
        const cancelled = s.dropPop();
        // A new game starts with the board stopped (ADR-67); the computer, if it sets first, rolls in below.
        s.stopRoll();
        if (skateActive(s.skate)) s.log('skate.ended', { winner: null, reason: 'restart', ...score(s.skate) });
        const first = coinFlip(random);
        // The computer picks its call as soon as its set turn begins, so the student sees it before it pops.
        const skate = withComputerCall(startSkateGame(s.skate.level, first), random);
        const flip = first === 'you' ? 'Coin flip: you set first.' : 'Coin flip: the computer sets first.';
        // A fresh game starts with the board on the pad and no result from before (ADR-46). The speed is kept.
        // A player's first game walks them through their first go (ADR-66).
        set({ skate, skateMessage: flip, status: 'idle', progress: 0, flight: null, result: null, scrubFrom: null, flightBy: 'you', lastRelease: null, skateLesson: !s.skateTaught });
        s.log('skate.started', { level: skate.level, first });
        if (computerWaiting(get())) get().startRoll();
        s.requestFocus({ kind: 'skate-heading' });
        const rule = SKATE_LEVELS[skate.level].cleanOnly ? ` ${CLEAN_ONLY_NOTE}` : '';
        s.announce(`${cancelled}Game of SKATE started, ${SKATE_LEVELS[skate.level].label.toLowerCase()} level.${rule} ${flip} ${skateInstruction(skate)}${lessonLead()}`);
      },

      toggleSkateAuto: () => {
        const skateAuto = !get().skateAuto;
        savePref(SKATE_AUTO_KEY, skateAuto ? 'on' : 'off');
        set({ skateAuto });
        // The computer's wait comes and goes with auto, and its roll-in with it (ADR-67).
        const s = get();
        if (skateAuto && s.roll === 'still' && computerWaiting(s)) s.startRoll();
        else if (!skateAuto && s.status !== 'playing' && !s.pendingPop) s.slowRoll();
        get().announce(skateAuto ? 'The computer goes on its own.' : "The computer waits for you: press Computer's go or Space.");
      },

      requestLeave: (target) => {
        const s = get();
        if (s.screen === 'skate' && skateActive(s.skate)) {
          // A dialog opening drops a running bar (ADR-65).
          s.cancelPop();
          set({ skateLeave: target });
          return;
        }
        if (target === 'setup') s.quitSkate();
        else s.setScreen(target);
      },

      confirmLeave: () => {
        const target = get().skateLeave;
        if (!target) return;
        set({ skateLeave: null });
        if (target === 'setup') get().quitSkate();
        else get().setScreen(target);
      },

      cancelLeave: () => {
        if (get().skateLeave) set({ skateLeave: null });
      },

      callSkateTrick: (id) => {
        const s = get();
        const problem = callProblem(s.skate, id);
        if (problem) {
          s.announce(problem);
          return;
        }
        if (inFlight(s)) {
          s.announce('Wait for the board to land, then call your next trick.');
          return;
        }
        if (s.pendingPop) {
          s.announce('The bar is running. Pop first, then call another trick.');
          return;
        }
        if (s.skate.call?.id === id) return;
        const skate = callTrick(s.skate, id);
        set({ skate });
        // Not logged on its own: the student's trick.popped carries the call.
        const l = lesson();
        if (l) lessonAt = l.at;
        s.announce(`You called ${withArticle(skate.call!.name)}. Land it and the computer has to copy it.${l ? ` ${lessonText(l)}` : ''}`);
      },

      quitSkate: () => {
        const s = get();
        if (s.skate.phase === 'off') return;
        s.stopRoll();
        if (skateActive(s.skate)) {
          const cancelled = s.dropPop();
          // A flight still in the air lands as usual but scores nothing (scoreSkate ignores it once the game is off).
          s.log('skate.ended', { winner: null, reason: 'quit', ...score(s.skate) });
          s.announce(`${cancelled}Game of SKATE ended.`);
        }
        set({ skate: newSkateGame(s.skate.level), skateMessage: '', lastRelease: null, skateLesson: false });
        s.requestFocus({ kind: 'skate-heading' });
      },

      computerGo: () => {
        const { skate } = get();
        if (!computerTurn(skate)) return null;
        if (skate.phase === 'computer-set') {
          // The call is normally picked when the turn began; pick it now if not.
          const game = withComputerCall(skate, random);
          if (game !== skate) set({ skate: game });
          const call = game.call!;
          return {
            ...computerAttempt(call, game.level, random),
            lead: `The computer goes for ${withArticle(call.name)}.`,
            call: call.id,
          };
        }
        const call = skate.call!;
        return {
          ...computerAttempt(call, skate.level, random),
          lead: skate.secondTry
            ? `The computer tries your ${call.name.toLowerCase()} again: its second try on its last letter.`
            : `The computer tries to copy your ${call.name.toLowerCase()}.`,
          call: call.id,
        };
      },

      scoreSkate: (result, by) => {
        const s = get();
        if (!skateActive(s.skate)) return [];
        const step = afterAttempt(s.skate, by, result);
        if (!step.message) return [];
        const game = withComputerCall(step.game, random);
        set({ skate: game, skateMessage: step.message });
        if (by === 'you' && step.made) s.celebrate(result.name, result.grade === 'clean');
        if (step.set) s.log('skate.set', { by, trick: step.set.id });
        if (step.letterTo) {
          s.log('skate.letter', { player: step.letterTo, letters: letters(game.letters[step.letterTo]) });
          s.cue('letter');
        }
        const out = [step.message];
        if (game.phase === 'over' && game.winner) {
          const winner = game.winner;
          s.log('skate.ended', { winner, reason: 'spelled', ...score(game) });
          s.cue(winner === 'you' ? 'win' : 'lose');
          // The game goes on the player's records, by level (ADR-64).
          s.noteGame(game.level, winner === 'you');
          // A leave still asked for has nothing left to end: the dialog closes, and the result takes focus (ADR-46).
          set({ skateRecord: { ...s.skateRecord, [winner]: s.skateRecord[winner] + 1 }, skateLeave: null });
          // The turn controls give way to the result, so focus goes to its heading rather than to the page (ADR-46).
          s.requestFocus({ kind: 'skate-heading' });
        } else if (step.letterTo) {
          out.push(`Letters: you ${lettersText(game.letters.you)}, computer ${lettersText(game.letters.computer)}.`);
        }
        // What happened, then what to do next (the panel shows the two apart).
        out.push(`${skateInstruction(game)}${lessonLead()}`);
        return out;
      },

      endSkateOnReset: () => {
        const s = get();
        drop();
        if (skateActive(s.skate)) s.log('skate.ended', { winner: null, reason: 'reset', ...score(s.skate) });
        set(initialSkate(s.skate.level));
      },
    };
  };
