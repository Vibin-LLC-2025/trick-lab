import type { StateCreator } from 'zustand';
import {
  afterAttempt,
  callProblem,
  callTrick,
  CLEAN_ONLY_NOTE,
  coinFlip,
  computerAttempt,
  computerTurn,
  lettersText,
  newSkateGame,
  SKATE_LEVELS,
  SKATE_WORD,
  skateActive,
  skateInstruction,
  startSkateGame,
  withArticle,
  withComputerCall,
  type SkateGame,
} from '../sim/skate';
import { inFlight } from './playback';
import { readPref, savePref } from './prefs';
import type { SkateSlice, TrickState } from './types';

/** The computer goes on its own (ADR-46). */
export const SKATE_AUTO_KEY = 'trick-lab.skate-auto';

/** A source of numbers in [0, 1). The store takes one so tests can script the coin flip and the computer. */
export type Random = () => number;

export const initialSkate = (level: SkateGame['level'] = 'normal') => ({
  skate: newSkateGame(level),
  skateMessage: '',
  skateRecord: { you: 0, computer: 0 },
});

const score = (g: SkateGame) => ({ you: g.letters.you, computer: g.letters.computer });
const letters = (n: number) => SKATE_WORD.slice(0, n);

/**
 * The game of SKATE (ADR-43, ADR-44). This slice owns the game's state and
 * its log events; the playback slice asks it who pops (computerGo) and tells
 * it how each flight ended (scoreSkate), so the rules run on the same
 * recognized result the outcome card shows. Every random draw (the coin flip,
 * the computer's call and its miss) comes from `random`.
 */
export const createSkateSlice =
  (random: Random): StateCreator<TrickState, [], [], SkateSlice> =>
  (set, get) => ({
    ...initialSkate(),
    skateAuto: readPref(SKATE_AUTO_KEY) !== 'off',
    skateLeave: null,

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
      if (skateActive(s.skate)) s.log('skate.ended', { winner: null, reason: 'restart', ...score(s.skate) });
      const first = coinFlip(random);
      // The computer picks its call as soon as its set turn begins, so the student sees it before it pops.
      const skate = withComputerCall(startSkateGame(s.skate.level, first), random);
      const flip = first === 'you' ? 'Coin flip: you set first.' : 'Coin flip: the computer sets first.';
      // A fresh game starts with the board on the pad and no result from before (ADR-46). The speed is kept.
      set({ skate, skateMessage: flip, status: 'idle', progress: 0, flight: null, result: null, scrubFrom: null, flightBy: 'you' });
      s.log('skate.started', { level: skate.level, first });
      s.requestFocus({ kind: 'skate-heading' });
      const rule = SKATE_LEVELS[skate.level].cleanOnly ? ` ${CLEAN_ONLY_NOTE}` : '';
      s.announce(`Game of SKATE started, ${SKATE_LEVELS[skate.level].label.toLowerCase()} level.${rule} ${flip} ${skateInstruction(skate)}`);
    },

    toggleSkateAuto: () => {
      const skateAuto = !get().skateAuto;
      savePref(SKATE_AUTO_KEY, skateAuto ? 'on' : 'off');
      set({ skateAuto });
      get().announce(skateAuto ? 'The computer goes on its own.' : "The computer waits for you: press Computer's go or Space.");
    },

    requestLeave: (target) => {
      const s = get();
      if (s.screen === 'skate' && skateActive(s.skate)) {
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
      if (s.skate.call?.id === id) return;
      const skate = callTrick(s.skate, id);
      set({ skate });
      // Not logged on its own: the student's trick.popped carries the call.
      s.announce(`You called ${withArticle(skate.call!.name)}. Land it and the computer has to copy it.`);
    },

    quitSkate: () => {
      const s = get();
      if (s.skate.phase === 'off') return;
      if (skateActive(s.skate)) {
        // A flight still in the air lands as usual but scores nothing (scoreSkate ignores it once the game is off).
        s.log('skate.ended', { winner: null, reason: 'quit', ...score(s.skate) });
        s.announce('Game of SKATE ended.');
      }
      set({ skate: newSkateGame(s.skate.level), skateMessage: '' });
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
          inputs: computerAttempt(call, game.level, random),
          lead: `The computer goes for ${withArticle(call.name)}.`,
          call: call.id,
        };
      }
      const call = skate.call!;
      return {
        inputs: computerAttempt(call, skate.level, random),
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
        // A leave still asked for has nothing left to end: the dialog closes, and the result takes focus (ADR-46).
        set({ skateRecord: { ...s.skateRecord, [winner]: s.skateRecord[winner] + 1 }, skateLeave: null });
        // The turn controls give way to the result, so focus goes to its heading rather than to the page (ADR-46).
        s.requestFocus({ kind: 'skate-heading' });
      } else if (step.letterTo) {
        out.push(`Letters: you ${lettersText(game.letters.you)}, computer ${lettersText(game.letters.computer)}.`);
      }
      // What happened, then what to do next (the panel shows the two apart).
      out.push(skateInstruction(game));
      return out;
    },

    endSkateOnReset: () => {
      const s = get();
      if (skateActive(s.skate)) s.log('skate.ended', { winner: null, reason: 'reset', ...score(s.skate) });
      set(initialSkate(s.skate.level));
    },
  });
