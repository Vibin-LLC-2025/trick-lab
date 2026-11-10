import { useEffect, useState } from 'react';
import { outcomeCard } from '../sim/format';
import {
  CLEAN_ONLY_NOTE,
  computerTurn,
  GUIDE_TIP,
  lettersText,
  openTricks,
  SETTABLE_GROUPS,
  SKATE_LEVEL_ORDER,
  SKATE_LEVELS,
  SKATE_WORD,
  skateActive,
  trickGuide,
  turnView,
  type SkateCall,
  type SkatePlayer,
} from '../sim/skate';
import type { TrickId } from '../sim/tricks';
import { useTrickStore, type TrickState } from '../store';
import { Inputs } from './Inputs';
import { barPress, CONTROLS_MODE, FlickHint, TimingBar } from './RoughControls';
import { ConfirmDialog } from './ConfirmDialog';
import { Toggle } from './Toggle';

/**
 * How long the computer waits before it takes its go on its own (ADR-46):
 * long enough to read the last result and see what it is going for. Must
 * equal --skate-turn-delay in tokens.css, which times the countdown bar (tested).
 */
export const COMPUTER_DELAY_MS = 2200;

/**
 * Whether the computer's wait is running (ADR-46): it is up on the game
 * screen, nothing is in the air, auto is on and no dialog is open. Shared by
 * the timer and the countdown bar, so the two always start together.
 */
const computerWaiting = (s: TrickState) =>
  s.screen === 'skate' &&
  computerTurn(s.skate) &&
  s.skateAuto &&
  s.status !== 'playing' &&
  s.status !== 'paused' &&
  !s.shortcutsOpen &&
  s.skateLeave === null;

/** The turn a wait belongs to: a new turn, a landing or a second try starts a new wait. */
const turnKey = (s: TrickState) => `${s.skate.phase}|${s.flightId}|${s.skate.secondTry}`;

/**
 * The computer's go comes on its own (ADR-46): while its wait runs, it pops
 * after COMPUTER_DELAY_MS. The same action as its button and Space, so the
 * store decides everything. The wait starts over on every new turn and
 * landing, and whenever it was held (a dialog) and runs again. The callback
 * checks once more, so a wait held in the same tick never pops.
 */
function useComputerTurns() {
  const waiting = useTrickStore(computerWaiting);
  const turn = useTrickStore(turnKey);
  useEffect(() => {
    if (!waiting) return;
    const id = setTimeout(() => {
      if (computerWaiting(useTrickStore.getState())) useTrickStore.getState().popTrick();
    }, COMPUTER_DELAY_MS);
    return () => clearTimeout(id);
  }, [waiting, turn]);
}

/** How long a newly earned letter's stamp runs (app.css `skate-stamp`); after it the letter is a plain sticker. */
export const STAMP_MS = 480;

/**
 * Five letter tiles; the ones a player has are stickers (ADR-57). A letter
 * earned while this is on screen stamps in once (`skate__letter--new`, no
 * movement under reduced motion); letters already there when it mounts do
 * not, and a new game (fewer letters) starts clean. Read as text by the
 * hidden label. The player up is marked.
 */
function Letters({ who, count, up }: { who: SkatePlayer; count: number; up: boolean }) {
  // Letters this row has already shown; any beyond them stamp in.
  const [shown, setShown] = useState(count);
  if (count < shown) setShown(count);
  useEffect(() => {
    if (count <= shown) return;
    const id = setTimeout(() => setShown(count), STAMP_MS);
    return () => clearTimeout(id);
  }, [count, shown]);
  return (
    <div className={`skate__row${up ? ' skate__row--up' : ''}`}>
      <dt className="skate__who">
        {who === 'you' ? 'You' : 'Computer'}
        {up && <span className="visually-hidden">, up now</span>}
      </dt>
      <dd className="skate__letters">
        {SKATE_WORD.split('').map((l, i) => (
          <span
            key={l}
            className={`skate__letter${i < count ? ' skate__letter--got' : ''}${i >= shown && i < count ? ' skate__letter--new' : ''}`}
            aria-hidden="true"
          >
            {l}
          </span>
        ))}
        <span className="visually-hidden">{lettersText(count)}</span>
      </dd>
    </div>
  );
}

function Scoreboard() {
  const game = useTrickStore((s) => s.skate);
  const requestLeave = useTrickStore((s) => s.requestLeave);
  const up = turnView(game)?.who ?? null;
  return (
    <section className="panel" aria-labelledby="skate-letters-heading">
      <div className="panel__head">
        <h2 id="skate-letters-heading" className="panel__title">
          Letters
        </h2>
        {skateActive(game) && (
          <button type="button" className="btn btn--ghost btn--sm" aria-haspopup="dialog" onClick={() => requestLeave('setup')}>
            Quit game
          </button>
        )}
      </div>
      <dl className="skate__score">
        <Letters who="you" count={game.letters.you} up={up === 'you'} />
        <Letters who="computer" count={game.letters.computer} up={up === 'computer'} />
      </dl>
    </section>
  );
}

/** The trick guide (ADR-44): which way and how far to flick and scoop, in words, never the slider values. */
function Guide({ call }: { call: SkateCall }) {
  const guide = trickGuide(call);
  const cleanOnly = useTrickStore((s) => SKATE_LEVELS[s.skate.level].cleanOnly);
  return (
    <div className="skate__guide">
      <p className="skate__guide-title">How to {call.name.toLowerCase()}</p>
      <dl className="skate__guide-list">
        <dt>Flick</dt>
        <dd>{guide.flick}</dd>
        <dt>Scoop</dt>
        <dd>{guide.scoop}</dd>
      </dl>
      <p className="panel__note">{GUIDE_TIP}</p>
      {cleanOnly && <p className="panel__note">{CLEAN_ONLY_NOTE}</p>}
    </div>
  );
}

/** The student's call before a set (ADR-44). Tricks already set this game cannot be called again. */
function CallPicker() {
  const game = useTrickStore((s) => s.skate);
  const callTrick = useTrickStore((s) => s.callSkateTrick);
  const open = new Set(openTricks(game).map((t) => t.id));
  return (
    <div className="field skate__pick">
      <label className="field__label" htmlFor="skate-call">
        Call your trick
      </label>
      <select
        id="skate-call"
        className="skate__select"
        value={game.call?.id ?? ''}
        onChange={(e) => {
          if (e.currentTarget.value) callTrick(e.currentTarget.value as TrickId);
        }}
      >
        <option value="" disabled>
          Pick a trick
        </option>
        {SETTABLE_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.tricks.map((t) => (
              <option key={t.id} value={t.id} disabled={!open.has(t.id)}>
                {open.has(t.id) ? t.name : `${t.name} (already set)`}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/** What the player up should do now, or what the computer is doing. */
function TurnStatus() {
  const game = useTrickStore((s) => s.skate);
  const status = useTrickStore((s) => s.status);
  const auto = useTrickStore((s) => s.skateAuto);
  const waiting = useTrickStore(computerWaiting);
  const turn = useTrickStore(turnKey);
  const inAir = status === 'playing' || status === 'paused';

  if (computerTurn(game)) {
    if (inAir) return <p className="turn__status">In the air.</p>;
    if (!auto) return <p className="turn__status">Press Computer&apos;s go or Space when you&apos;re ready.</p>;
    return (
      <>
        <p className="turn__status">Goes in a moment.</p>
        {/* Shown only while the wait runs, keyed on its turn, so the bar starts with every new wait (after a dialog too).
            Decorative: the text above says it. */}
        {waiting && <div key={turn} className="turn__timer" aria-hidden="true" />}
      </>
    );
  }
  if (game.phase === 'you-copy') return <p className="turn__status">Set the sliders the way the guide says, then press Pop.</p>;
  return (
    <p className="turn__status">
      {game.call
        ? "Land it and the computer has to copy it. Miss, and it's the computer's turn to set."
        : 'Call the trick you will try. Land it and the computer has to copy it.'}
    </p>
  );
}

/**
 * The turn card (ADR-46): what just happened, whose go it is (the heading,
 * the focus target when a game starts), the trick in big type, what to do,
 * and for the student the call picker and the guide. Colour and the word
 * both say whose turn it is.
 */
function TurnCard() {
  const game = useTrickStore((s) => s.skate);
  const message = useTrickStore((s) => s.skateMessage);
  const view = turnView(game);
  if (!view) return null;
  return (
    <section className={`panel turn turn--${view.who}`} aria-labelledby="skate-heading">
      {message && <p className="turn__news">{message}</p>}
      {/* Focus target when a game starts (tabIndex -1: focusable by script, not in tab order; Space still pops from here). */}
      <h2 id="skate-heading" className="turn__who" tabIndex={-1}>
        {view.title}
      </h2>
      <p className="turn__task">
        <span className="turn__label">{view.label}</span>
        <span className="turn__trick">{view.trick ?? 'Call a trick'}</span>
      </p>
      {game.secondTry && <p className="turn__note">Last letter: second try</p>}
      <TurnStatus />
      {game.phase === 'you-set' && <CallPicker />}
      {view.who === 'you' && game.call && <Guide call={game.call} />}
    </section>
  );
}

/** The sliders, Pop (or the computer's go) and the game's two switches. */
function Controls() {
  const status = useTrickStore((s) => s.status);
  const cpu = useTrickStore((s) => computerTurn(s.skate));
  const popTrick = useTrickStore((s) => s.popTrick);
  const slow = useTrickStore((s) => s.rate < 1);
  const toggleSlowMotion = useTrickStore((s) => s.toggleSlowMotion);
  const auto = useTrickStore((s) => s.skateAuto);
  const toggleSkateAuto = useTrickStore((s) => s.toggleSkateAuto);
  const label = cpu ? "Computer's go" : 'Pop';
  // ROUGH (step 8): `?controls=flick` has no sliders and no Pop button on the student's go; `?controls=bar` times the Pop.
  const flick = CONTROLS_MODE === 'flick';
  return (
    <>
      {flick ? <FlickHint /> : <Inputs />}
      <section className="panel" aria-label="Pop">
        <div className="skate__controls">
          {/* aria-disabled, not disabled: the button stays focusable and explains itself. */}
          {(cpu || !flick) && (
            <button
              type="button"
              className="btn btn--primary skate__pop"
              aria-label={label}
              aria-keyshortcuts="Space"
              aria-disabled={status === 'playing' || undefined}
              onClick={CONTROLS_MODE === 'bar' ? barPress : popTrick}
            >
              {label} <kbd aria-hidden="true">Space</kbd>
            </button>
          )}
          {CONTROLS_MODE === 'bar' && !cpu && <TimingBar />}
          <div className="skate__toggles">
            <Toggle label="Slow motion" pressed={slow} keys="s" onClick={toggleSlowMotion} />
            <Toggle label="Computer goes on its own" pressed={auto} onClick={toggleSkateAuto} />
          </div>
        </div>
      </section>
    </>
  );
}

/** The last trick's result, said as whose it was. Hidden until the first trick of the game. */
function LastTrick() {
  const result = useTrickStore((s) => s.result);
  const inAir = useTrickStore((s) => s.status === 'playing' || s.status === 'paused');
  const cpu = useTrickStore((s) => s.flightBy === 'computer');
  if (!result && !inAir) return null;
  const who = cpu ? 'Computer' : 'You';
  // No role="status": the single Announcer is the live region, so the result is not read twice.
  return (
    <section className="panel" aria-labelledby="skate-last-heading">
      <h2 id="skate-last-heading" className="panel__title">
        Last trick
      </h2>
      {result && !inAir ? (
        <div className={`outcome ${result.landed ? 'outcome--landed' : 'outcome--bailed'}`}>
          <p className="outcome__name">{`${who}: ${outcomeCard(result).name}`}</p>
          <p className="outcome__detail">{outcomeCard(result).detail}</p>
        </div>
      ) : (
        <div className="outcome">
          <p className="outcome__name">In the air</p>
          <p className="outcome__detail">The result shows when the board lands.</p>
        </div>
      )}
    </section>
  );
}

const RULES = [
  'A coin flip decides who sets first.',
  'The setter calls a trick, then tries to land it.',
  'Landed: the other player has to copy it. Miss the copy and take a letter.',
  'Missed: no letter, and the other player sets next.',
  'On your last letter you get a second try.',
  'No trick can be set twice. Spell S K A T E and you lose.',
];

/** Between games: how to play, the computer's level and Start. */
function Setup() {
  const level = useTrickStore((s) => s.skate.level);
  const record = useTrickStore((s) => s.skateRecord);
  const games = useTrickStore((s) => s.records.games[s.skate.level]);
  const streak = useTrickStore((s) => s.records.streak);
  const setLevel = useTrickStore((s) => s.setSkateLevel);
  const start = useTrickStore((s) => s.startSkate);
  const played = record.you + record.computer;
  return (
    <section className="panel turn turn--setup" aria-labelledby="skate-heading">
      {/* Focus target after quitting (tabIndex -1). */}
      <h2 id="skate-heading" className="turn__who" tabIndex={-1}>
        How to play
      </h2>
      <ol className="skate__rules">
        {RULES.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ol>
      <fieldset className="segmented" aria-describedby="skate-level-hint">
        <legend className="segmented__legend">Computer</legend>
        <div className="segmented__options">
          {SKATE_LEVEL_ORDER.map((l) => (
            <label key={l} className="segmented__option">
              <input className="segmented__input" type="radio" name="skate-level" value={l} checked={level === l} onChange={() => setLevel(l)} />
              <span className="segmented__label">{SKATE_LEVELS[l].label}</span>
            </label>
          ))}
        </div>
        <p className="segmented__hint" id="skate-level-hint">
          {SKATE_LEVELS[level].hint}
        </p>
      </fieldset>
      <div className="skate__actions">
        <button type="button" className="btn btn--primary" onClick={start}>
          Start game
        </button>
      </div>
      {played > 0 && (
        <p className="panel__note">
          This session: you won {record.you} of {played}.
        </p>
      )}
      {/* The record on this device, for the level picked (ADR-64). */}
      {games.won + games.lost > 0 && (
        <p className="panel__note">
          Against {SKATE_LEVELS[level].label}, all time: won {games.won}, lost {games.lost}.{streak > 1 ? ` You are on a run of ${streak} wins.` : ''}
        </p>
      )}
    </section>
  );
}

/** The end of a game: who won, the session's record, play again or change the level. Focus lands on its heading. */
function GameOver() {
  const game = useTrickStore((s) => s.skate);
  const message = useTrickStore((s) => s.skateMessage);
  const record = useTrickStore((s) => s.skateRecord);
  const start = useTrickStore((s) => s.startSkate);
  const quit = useTrickStore((s) => s.quitSkate);
  const won = game.winner === 'you';
  const level = SKATE_LEVELS[game.level].label.toLowerCase();
  return (
    <section className={`panel turn turn--over turn--${won ? 'won' : 'lost'}`} aria-labelledby="skate-heading">
      {message && <p className="turn__news">{message}</p>}
      <h2 id="skate-heading" className="turn__who" tabIndex={-1}>
        {won ? 'You win!' : 'The computer wins'}
      </h2>
      <p className="turn__status">
        {won ? `You beat the computer on ${level}.` : `It spelled SKATE on you this time, on ${level}.`} This session: you {record.you}, computer{' '}
        {record.computer}.
      </p>
      <div className="skate__actions">
        <button type="button" className="btn btn--primary" onClick={start}>
          Play again
        </button>
        <button type="button" className="btn" onClick={quit}>
          Change level
        </button>
      </div>
    </section>
  );
}

/**
 * The game screen's column (ADR-46, DESIGN.md 11): between games, how to
 * play and Start; in a game, only what the game needs: both players'
 * letters, the turn card, the sliders and Pop, and the last trick; at the
 * end, who won. The computer's go comes on its own unless switched off.
 */
export function Skate() {
  useComputerTurns();
  const phase = useTrickStore((s) => s.skate.phase);
  if (phase === 'off') return <Setup />;
  const over = phase === 'over';
  // The scoreboard keeps one place in the tree from the game into its end
  // (the result goes above it, the turn panels below drop away), so it is not
  // remounted and the letter that ends the game stamps in too (ADR-57).
  return (
    <>
      {over && <GameOver />}
      <Scoreboard />
      {!over && <TurnCard />}
      {!over && <Controls />}
      {!over && <LastTrick />}
    </>
  );
}

/** Whose turn it is, large, over the stage (ADR-46). Decorative: the turn card says the same in the DOM. */
export function TurnChip() {
  // Select the game, then derive: a selector that builds a new object would re-render forever.
  const game = useTrickStore((s) => s.skate);
  const view = turnView(game);
  if (!view) return null;
  return (
    <p className={`turn-chip turn-chip--${view.who}`} aria-hidden="true">
      <span className="turn-chip__who">{view.title}</span>
      {view.trick && <span className="turn-chip__trick">{view.trick}</span>}
    </p>
  );
}

/** Asks before a game in play is left (ADR-46). Esc keeps playing, and focus returns to the opener. */
export function LeaveDialog() {
  const target = useTrickStore((s) => s.skateLeave);
  const confirm = useTrickStore((s) => s.confirmLeave);
  const cancel = useTrickStore((s) => s.cancelLeave);
  const quitting = target === 'setup';
  return (
    <ConfirmDialog
      id="leave"
      open={target !== null}
      title={quitting ? 'Quit this game?' : 'Leave this game?'}
      text="The game ends here and both players' letters are cleared."
      keep="Keep playing"
      go={quitting ? 'Quit game' : 'Leave game'}
      onKeep={cancel}
      onGo={confirm}
    />
  );
}
