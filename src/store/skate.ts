import type { StateCreator } from 'zustand';
import {
  afterAttempt,
  computerAttempt,
  computerTurn,
  lettersText,
  newSkateGame,
  pickCall,
  SKATE_LEVELS,
  SKATE_WORD,
  skateActive,
  skateInstruction,
  startSkateGame,
  withArticle,
  type SkateGame,
} from '../sim/skate';
import type { SkateSlice, TrickState } from './types';

/** A source of numbers in [0, 1). The store takes one so tests can script the computer. */
export type Random = () => number;

export const initialSkate = (level: SkateGame['level'] = 'normal') => ({
  skate: newSkateGame(level),
  skateMessage: '',
  skateRecord: { you: 0, computer: 0 },
});

const score = (g: SkateGame) => ({ you: g.letters.you, computer: g.letters.computer });
const letters = (n: number) => SKATE_WORD.slice(0, n);

/**
 * The game of SKATE (ADR-43). This slice owns the game's state and its log
 * events; the playback slice asks it who pops (computerGo) and tells it how
 * each flight ended (scoreSkate), so the rules run on the same recognized
 * result the outcome card shows.
 */
export const createSkateSlice =
  (random: Random): StateCreator<TrickState, [], [], SkateSlice> =>
  (set, get) => ({
    ...initialSkate(),

    setSkateLevel: (level) => {
      const { skate } = get();
      if (skateActive(skate) || skate.level === level) return;
      set({ skate: { ...skate, level } });
    },

    startSkate: () => {
      const s = get();
      if (s.status === 'playing') {
        s.announce('Wait for the board to land, then start the game.');
        return;
      }
      if (skateActive(s.skate)) s.log('skate.ended', { winner: null, reason: 'restart', ...score(s.skate) });
      const skate = startSkateGame(s.skate.level);
      set({ skate, skateMessage: '' });
      s.log('skate.started', { level: skate.level });
      s.requestFocus({ kind: 'skate-heading' });
      s.announce(
        `Game of SKATE started, ${SKATE_LEVELS[skate.level].label.toLowerCase()} level. Presets are off. The computer sets first: press Space to watch it.`,
      );
    },

    quitSkate: () => {
      const s = get();
      if (s.skate.phase === 'off') return;
      if (skateActive(s.skate)) {
        // A flight still in the air lands as usual but scores nothing (scoreSkate ignores it once the game is off).
        s.log('skate.ended', { winner: null, reason: 'quit', ...score(s.skate) });
        s.announce('Game of SKATE ended. Back to practice: presets are on again.');
      } else {
        s.announce('Back to practice: presets are on again.');
      }
      set({ skate: newSkateGame(s.skate.level), skateMessage: '' });
      s.requestFocus({ kind: 'skate-heading' });
    },

    computerGo: () => {
      const { skate } = get();
      if (!computerTurn(skate)) return null;
      if (skate.phase === 'computer-set') {
        const call = pickCall(skate.level, skate.lastSet, random);
        set({ skate: { ...skate, call } });
        return {
          inputs: computerAttempt(call, skate.level, random),
          lead: `The computer goes for ${withArticle(call.name)}.`,
          call: call.id,
        };
      }
      const call = skate.call!;
      return {
        inputs: computerAttempt(call, skate.level, random),
        lead: `The computer tries to copy your ${call.name.toLowerCase()}.`,
        call: call.id,
      };
    },

    scoreSkate: (result, by) => {
      const s = get();
      if (!skateActive(s.skate)) return [];
      const step = afterAttempt(s.skate, by, result);
      if (!step.message) return [];
      set({ skate: step.game, skateMessage: step.message });
      if (step.set) s.log('skate.set', { by, trick: step.set.id });
      if (step.letterTo) {
        s.log('skate.letter', { player: step.letterTo, letters: letters(step.game.letters[step.letterTo]) });
      }
      const out = [step.message];
      if (step.game.phase === 'over' && step.game.winner) {
        const winner = step.game.winner;
        s.log('skate.ended', { winner, reason: 'spelled', ...score(step.game) });
        set({ skateRecord: { ...s.skateRecord, [winner]: s.skateRecord[winner] + 1 } });
      } else if (step.letterTo) {
        out.push(`Letters: you ${lettersText(step.game.letters.you)}, computer ${lettersText(step.game.letters.computer)}.`);
      }
      // What happened, then what to do next (the panel shows the two apart).
      out.push(skateInstruction(step.game));
      return out;
    },

    endSkateOnReset: () => {
      const s = get();
      if (skateActive(s.skate)) s.log('skate.ended', { winner: null, reason: 'reset', ...score(s.skate) });
      set(initialSkate(s.skate.level));
    },
  });
