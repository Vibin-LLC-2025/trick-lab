import { useEffect, useState, type CSSProperties } from 'react';
import { BAR, barWhen } from '../sim/bar';
import { outcomeCard } from '../sim/format';
import {
  BAR_MISS,
  BAR_STEPS,
  CLEAN_ONLY_NOTE,
  computerTurn,
  GUIDE_TIP,
  lessonFor,
  lettersText,
  levelHint,
  openTricks,
  popStyle,
  SETTABLE_GROUPS,
  SKATE_LEVEL_ORDER,
  SKATE_LEVELS,
  SKATE_WORD,
  skateActive,
  trickGuide,
  turnOf,
  turnView,
  type PopStyle,
  type SkateCall,
  type SkatePlayer,
} from '../sim/skate';
import type { TrickId } from '../sim/tricks';
// The computer's wait (ADR-46) is the store's, shared by the timer and the countdown bar, so the two always start together.
import { COMPUTER_DELAY_MS, computerWaiting, GAME_VIEW_LABEL, GAME_VIEWS, noticeUp, replayMoves, useTrickStore, type PopMode, type TrickState } from '../store';
import { Inputs } from './Inputs';
import { ConfirmDialog } from './ConfirmDialog';
import { Toggle } from './Toggle';

/**
 * How long the computer waits before it takes its go on its own (ADR-46):
 * long enough to read the last result and see what it is going for. Must
 * equal --skate-turn-delay in tokens.css, which times the countdown bar (tested).
 */
export { COMPUTER_DELAY_MS };

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

/** Both players' letters, Quit, and while a game is in play its two switches (DESIGN.md 11.2: the top-right card over the stage). */
function Scoreboard() {
  const game = useTrickStore((s) => s.skate);
  const requestLeave = useTrickStore((s) => s.requestLeave);
  const slow = useTrickStore((s) => s.rate < 1);
  const toggleSlowMotion = useTrickStore((s) => s.toggleSlowMotion);
  const auto = useTrickStore((s) => s.skateAuto);
  const toggleSkateAuto = useTrickStore((s) => s.toggleSkateAuto);
  const replay = useTrickStore((s) => s.instantReplay);
  const toggleInstantReplay = useTrickStore((s) => s.toggleInstantReplay);
  // No replay plays under reduced motion (ADR-72), so its switch is not offered there.
  const reduced = useTrickStore((s) => s.reducedMotion);
  const up = turnView(game)?.who ?? null;
  return (
    <section className="panel hud__score" aria-labelledby="skate-letters-heading" data-covers="right">
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
      {skateActive(game) && (
        <div className="skate__toggles">
          <Toggle label="Slow motion" pressed={slow} keys="s" onClick={toggleSlowMotion} />
          <Toggle label="Computer goes on its own" pressed={auto} onClick={toggleSkateAuto} />
          {!reduced && <Toggle label="Instant replay" pressed={replay} onClick={toggleInstantReplay} />}
        </div>
      )}
      <CameraChoice />
    </section>
  );
}

/**
 * The game's camera as a radio group (arrow keys move and choose): Free, the
 * default (ADR-81), turned by dragging the stage and zoomed by scrolling or
 * pinching, with Reset view to bring it home; or one of three fixed angles
 * (step 17, ADR-72), which need no pointer at all.
 */
function CameraChoice() {
  const view = useTrickStore((s) => s.gameView);
  const setGameView = useTrickStore((s) => s.setGameView);
  const resetView = useTrickStore((s) => s.resetView);
  return (
    <fieldset className="segmented" aria-describedby={view === 'free' ? 'game-camera-hint' : undefined}>
      <legend className="segmented__legend">Camera</legend>
      <div className="segmented__options">
        {GAME_VIEWS.map((v) => (
          <label key={v} className="segmented__option">
            <input className="segmented__input" type="radio" name="game-camera" value={v} checked={view === v} onChange={() => setGameView(v)} />
            <span className="segmented__label">{GAME_VIEW_LABEL[v]}</span>
          </label>
        ))}
      </div>
      {view === 'free' && (
        <div className="segmented__hint skate__camera-free">
          <span id="game-camera-hint">Drag the view to turn it; scroll or pinch to zoom.</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={resetView}>
            Reset view
          </button>
        </div>
      )}
    </fieldset>
  );
}

/** How the player pops in this game (ADR-83): the sliders set for them, the bar with their own sliders, or Exact. */
const popStyleOf = (s: TrickState): PopStyle => popStyle(s.skate.level, s.popMode === 'timed');

/**
 * The trick guide (ADR-44): which way and how far to flick and scoop, in
 * words, never the slider values. Only where the player sets the sliders
 * (Hard, Exact): on Easy and Normal the game sets them (ADR-83).
 */
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

/**
 * The first game's walk-through (ADR-66, DESIGN.md 11.3): the player's first
 * go as two or three prompts, the one to do now marked in words and by
 * weight, the ones done struck through and said as done. In place of the
 * trick guide until the first pop. The store says each prompt as it is reached.
 */
function Lesson() {
  // Select the parts, then derive: a selector that builds a new object would re-render forever.
  const game = useTrickStore((s) => s.skate);
  const style = useTrickStore(popStyleOf);
  const pop = useTrickStore((s) => s.pop);
  const flick = useTrickStore((s) => s.flick);
  const scoop = useTrickStore((s) => s.scoop);
  const barRunning = useTrickStore((s) => s.pendingPop !== null);
  const skip = useTrickStore((s) => s.skipLesson);
  const lesson = lessonFor(game, style, { pop, flick, scoop }, barRunning);
  if (!lesson) return null;
  return (
    <div className="lesson">
      <p className="lesson__title">First game: your first trick, in {lesson.steps.length} steps</p>
      <ol className="lesson__steps">
        {lesson.steps.map((text, i) => (
          <li
            key={text}
            className={`lesson__step${i < lesson.at ? ' lesson__step--done' : i === lesson.at ? ' lesson__step--now' : ''}`}
            aria-current={i === lesson.at ? 'step' : undefined}
          >
            {text}
            {i < lesson.at && <span className="visually-hidden"> Done.</span>}
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn--ghost btn--sm" onClick={skip}>
        Skip the walk-through
      </button>
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
  const style = useTrickStore(popStyleOf);
  // In a first game the walk-through says the presses itself (ADR-66), so this line keeps to the rule.
  const lesson = useTrickStore((s) => s.skateLesson);
  const inAir = status === 'playing' || status === 'paused';
  const presses = style === 'assisted' && !lesson ? ': press Get ready, then Pop! in the green band.' : '.';

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
  if (game.phase === 'you-copy') {
    if (style === 'assisted') return <p className="turn__status">Land it to copy it{presses}</p>;
    return (
      <p className="turn__status">
        Set the sliders the way the guide says, then press {style === 'timed' ? 'Get ready, and Pop! in the green band' : 'Pop'}.
      </p>
    );
  }
  if (!game.call) return <p className="turn__status">Call the trick you will try. Land it and the computer has to copy it.</p>;
  if (style === 'assisted') return <p className="turn__status">Land it and the computer has to copy it{presses}</p>;
  return <p className="turn__status">Land it and the computer has to copy it. Miss, and it&apos;s the computer&apos;s turn to set.</p>;
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
  const lesson = useTrickStore((s) => s.skateLesson);
  const assisted = useTrickStore((s) => popStyleOf(s) === 'assisted');
  const view = turnView(game);
  if (!view) return null;
  return (
    <section className={`panel turn turn--${view.who} hud__turn`} aria-labelledby="skate-heading" data-covers="left">
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
      {view.who === 'you' && lesson ? <Lesson /> : view.who === 'you' && game.call && !assisted && <Guide call={game.call} />}
    </section>
  );
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * The timing bar (ADR-65, ADR-83, ADR-86, DESIGN.md 11.1): a slim strip
 * joined to the top of the tray, so it covers as little of the stage as it
 * can and never moves the picture: it is there for the whole game, the band
 * alone and dimmed before the first press and once the stage is clear. While
 * the bar runs, the level's band and a marker that sweeps across, round again
 * from the left after each sweep until the second press (ADR-78). After a
 * release, the player's or the computer's, the marker rests where it was and
 * a verdict in a few words says what it did, until Continue clears the stage.
 * None in Exact. The picture is decorative (aria-hidden): the store announces
 * the bar's start and the release's result. The sweep is a CSS animation
 * started by the same store change that started the bar and repeated each
 * sweep, so it trails the store's clock by a frame at most. The custom
 * properties carry the band and the marker's place; all the styling is in
 * app.css.
 */
export function TimingStrip() {
  const timed = useTrickStore((s) => s.popMode === 'timed' && skateActive(s.skate));
  const pending = useTrickStore((s) => s.pendingPop);
  const last = useTrickStore((s) => s.lastRelease);
  // The go's release stays up until Continue clears the stage (ADR-80).
  const onStage = useTrickStore((s) => s.flight !== null);
  const band = useTrickStore((s) => SKATE_LEVELS[s.skate.level].band);
  if (!timed) return null;
  const part = (ms: number) => `${((ms / BAR.sweepMs) * 100).toFixed(2)}%`;
  const shown = !pending && last && onStage ? last : null;
  const style = {
    '--band-from': part(BAR.centreMs - band.halfMs),
    '--band-width': part(band.halfMs * 2),
    ...(shown ? { '--at': (shown.ms / BAR.sweepMs).toFixed(4) } : null),
  } as CSSProperties;
  const when = shown ? barWhen(shown.ms, band) : null;
  const tone = pending ? 'run' : when === null ? 'idle' : when === 'in the band' ? 'in' : 'off';
  return (
    <div className={`timing timing--${tone}`} aria-hidden="true" data-covers="bottom">
      <p className="timing__head">
        {shown ? (
          <>
            <span className="timing__who">{shown.by === 'you' ? 'Your release' : "Computer's release"}</span>
            <span className="timing__verdict">{cap(when ?? '')}</span>
          </>
        ) : (
          <span className="timing__verdict">Pop! in the green band</span>
        )}
      </p>
      <div className="skate__bar" style={style}>
        <span className="skate__bar-band" />
        {/* Keyed on the bar, so each sweep starts from the left. No marker at rest. */}
        {pending ? <span key={pending.id} className="skate__bar-marker skate__bar-marker--run" /> : shown && <span className="skate__bar-marker" />}
      </div>
    </div>
  );
}

/**
 * The tray (DESIGN.md 11.2): the timing bar's strip (ADR-86), the sliders
 * with their zones and forecast (ADR-83), then Pop, or the computer's go. On a
 * wide screen the sliders sit bottom left under the turn card, the strip
 * along the bottom between the cards and Pop bottom right, so the bottom of
 * the stage keeps one slim row (ADR-86); where the panels stack under the
 * stage they follow one another. With the timing bar on the
 * player's go the one button has two names, one per press: "Get ready" starts
 * the bar, "Pop!" releases it.
 */
function Controls() {
  const status = useTrickStore((s) => s.status);
  const cpu = useTrickStore((s) => computerTurn(s.skate));
  const pressPop = useTrickStore((s) => s.pressPop);
  const mine = useTrickStore((s) => s.popMode === 'timed' && turnOf(s.skate) === 'you');
  const running = useTrickStore((s) => s.pendingPop !== null);
  // While the instant replay plays the same button skips it (ADR-72), so focus never moves.
  const replaying = useTrickStore(replayMoves);
  const label = replaying ? 'Skip replay' : cpu ? "Computer's go" : mine ? (running ? 'Pop!' : 'Get ready') : 'Pop';
  return (
    // On a wide screen its three parts are cards of the HUD (ADR-86): the sliders bottom left, the bar's strip along the
    // bottom between the cards, Pop bottom right. Each says which side of the stage it covers, so the camera frames clear of it.
    <div className="hud__tray">
      <TimingStrip />
      <div className="hud__inputs" data-covers="left">
        <Inputs />
      </div>
      <section className="panel hud__pop" aria-label="Pop" data-covers="right">
        <div className="skate__controls">
          {/* aria-disabled, not disabled: the button stays focusable and explains itself. One press is one action:
              with the timing bar the first starts it and the second releases it (the store decides, ADR-65), and
              the name says which (ADR-83). */}
          <button
            type="button"
            className="btn btn--primary skate__pop"
            aria-label={label}
            aria-keyshortcuts={replaying ? 'Space Escape' : 'Space'}
            aria-disabled={status === 'playing' || undefined}
            onClick={pressPop}
          >
            {label} <kbd aria-hidden="true">Space</kbd>
          </button>
        </div>
      </section>
    </div>
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
    <section className="panel hud__last" aria-labelledby="skate-last-heading" data-covers="right">
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

/** How you pop (ADR-65): the choice at the game's start, and what each means. */
const POP_MODES: readonly { mode: PopMode; label: string; hint: string }[] = [
  {
    mode: 'timed',
    label: 'Timing bar',
    hint: `${BAR_STEPS} ${BAR_MISS} With sound on you can time it by ear.`,
  },
  { mode: 'exact', label: 'Exact', hint: 'No bar: you set the sliders yourself, and the board does exactly what they say, every time.' },
];

/** The whole game in three lines (ADR-66: the first game's walk-through teaches the rest by doing). */
const RULES = [
  'A coin flip decides who sets first. The setter calls a trick, then tries to land it.',
  'Landed: the other player has to copy it, or take a letter. Missed: the other player sets next.',
  'No trick twice, and two tries on your last letter. Spell S K A T E and you lose.',
];

/** Between games: how to play, the computer's level and Start. */
function Setup() {
  const level = useTrickStore((s) => s.skate.level);
  const record = useTrickStore((s) => s.skateRecord);
  const games = useTrickStore((s) => s.records.games[s.skate.level]);
  const streak = useTrickStore((s) => s.records.streak);
  const setLevel = useTrickStore((s) => s.setSkateLevel);
  const popMode = useTrickStore((s) => s.popMode);
  const setPopMode = useTrickStore((s) => s.setPopMode);
  const taught = useTrickStore((s) => s.skateTaught);
  const start = useTrickStore((s) => s.startSkate);
  const played = record.you + record.computer;
  return (
    <section className="panel turn turn--setup hud__turn" aria-labelledby="skate-heading" data-covers="left">
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
          {levelHint(level, popMode === 'timed')}
        </p>
      </fieldset>
      <fieldset className="segmented" aria-describedby="skate-pop-hint">
        <legend className="segmented__legend">How you pop</legend>
        <div className="segmented__options">
          {POP_MODES.map((m) => (
            <label key={m.mode} className="segmented__option">
              <input className="segmented__input" type="radio" name="skate-pop" value={m.mode} checked={popMode === m.mode} onChange={() => setPopMode(m.mode)} />
              <span className="segmented__label">{m.label}</span>
            </label>
          ))}
        </div>
        <p className="segmented__hint" id="skate-pop-hint">
          {POP_MODES.find((m) => m.mode === popMode)!.hint}
        </p>
      </fieldset>
      <div className="skate__actions">
        <button type="button" className="btn btn--primary" onClick={start}>
          Start game
        </button>
      </div>
      {!taught && <p className="panel__note">Your first game walks you through your first trick.</p>}
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
    <section className={`panel turn turn--over turn--${won ? 'won' : 'lost'} hud__turn`} aria-labelledby="skate-heading" data-covers="left">
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
 * The game screen (ADR-46; as a game, over the stage, ADR-66, DESIGN.md
 * 11.2): between games, how to play and Start, where the turn card will be; in a game, only
 * what the game needs, as a heads-up display: the turn card, both players'
 * letters, the last trick, and along the bottom the tray with the sliders,
 * Pop (the timing bar is over the stage, ADR-83); at the end, who won. On a narrow screen
 * the same panels stack under the stage. The computer's go comes on its own
 * unless switched off.
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

/** Whose turn it is, large, over the stage where the panels stack under it (a narrow screen, ADR-46); hidden where the turn card itself is over the stage (ADR-66). Decorative: the turn card says the same in the DOM. */
export function TurnChip() {
  // Select the game, then derive: a selector that builds a new object would re-render forever.
  const game = useTrickStore((s) => s.skate);
  const view = turnView(game);
  if (!view) return null;
  return (
    <p className={`turn-chip turn-chip--${view.who}`} aria-hidden="true" data-covers="left">
      <span className="turn-chip__who">{view.title}</span>
      {view.trick && <span className="turn-chip__trick">{view.trick}</span>}
    </p>
  );
}

/** "You" or "Computer" on the coin's face. */
const COIN_FACE: Record<SkatePlayer, string> = { you: 'You', computer: 'CPU' };

/**
 * The notice that waits over the stage (ADR-80, DESIGN.md 11.4): at a game's
 * start the coin flip, a coin that spins and lands on who sets first (still
 * under reduced motion); after each go what it did, the letter it gave, and
 * whose turn is next and with what trick. It waits for Continue (the button,
 * Space or Enter): the store says when it is up and moves focus to Continue
 * as it comes up, and the computer's go waits for it. The go's result was
 * announced as it landed, so Continue is described by the short title only.
 * Text sits on the solid panel; only the dimming behind it is see-through.
 */
export function Notice() {
  const notice = useTrickStore((s) => s.skateNotice);
  const up = useTrickStore(noticeUp);
  const game = useTrickStore((s) => s.skate);
  const calm = useTrickStore((s) => s.reducedMotion);
  const go = useTrickStore((s) => s.continueSkate);
  if (!notice || !up) return null;
  const next = turnView(game);
  const coin = notice.kind === 'coin';
  const tone = coin ? null : notice.made ? 'made' : 'missed';
  return (
    <section
      key={notice.id}
      className={`notice${next ? ` notice--${next.who}` : ''}`}
      aria-labelledby="skate-notice-kicker"
      data-calm={calm || undefined}
    >
      <div className={`notice__panel${tone ? ` notice__panel--${tone}` : ''}`}>
        {coin ? (
          <>
            <p id="skate-notice-kicker" className="notice__kicker">
              Coin flip
            </p>
            <div className="notice__coin" aria-hidden="true">
              <span className={`notice__face notice__face--${notice.first}`}>{COIN_FACE[notice.first]}</span>
              <span className={`notice__face notice__face--back notice__face--${notice.first === 'you' ? 'computer' : 'you'}`}>
                {COIN_FACE[notice.first === 'you' ? 'computer' : 'you']}
              </span>
            </div>
            <p className="notice__news notice__news--coin">{notice.first === 'you' ? 'You set first' : 'The computer sets first'}</p>
          </>
        ) : (
          <>
            <p id="skate-notice-kicker" className="notice__kicker">
              {notice.by === 'you' ? 'Your go' : "Computer's go"}
            </p>
            <p className="notice__news">{notice.news}</p>
            {notice.letterTo && (
              <p className="notice__letter">
                <span>{notice.letterTo === 'you' ? 'You get a letter' : 'The computer gets a letter'}</span>
                <span className="notice__letters" aria-hidden="true">
                  {SKATE_WORD.slice(0, game.letters[notice.letterTo])
                    .split('')
                    .map((l, i) => (
                      <span key={i} className={`skate__letter skate__letter--got${i === game.letters[notice.letterTo!] - 1 ? ' skate__letter--new' : ''}`}>
                        {l}
                      </span>
                    ))}
                </span>
                <span className="visually-hidden">{lettersText(game.letters[notice.letterTo])}</span>
              </p>
            )}
          </>
        )}
        {next && (
          <div className="notice__next">
            <h2 id="skate-notice-title" className="notice__title">
              {next.title}
            </h2>
            <p className="notice__task">
              <span className="notice__label">{next.label}</span>
              <span className="notice__trick">{next.trick ?? 'Call a trick'}</span>
            </p>
          </div>
        )}
        <button id="skate-notice-continue" type="button" className="btn btn--primary notice__continue" aria-describedby="skate-notice-title" onClick={go}>
          Continue <kbd aria-hidden="true">Enter</kbd>
        </button>
      </div>
    </section>
  );
}

/**
 * The fade between turns (ADR-80): when Continue clears the stage for the
 * next go, the stage's own colour fades off the fresh scene, so the new turn
 * reads as a new start. Keyed on the store's count of clears, so each one
 * plays once. Decorative; none under reduced motion, where the board is
 * simply back on the pad.
 */
export function StageWipe() {
  const clears = useTrickStore((s) => s.stageClears);
  const calm = useTrickStore((s) => s.reducedMotion);
  if (clears === 0 || calm) return null;
  return <span key={clears} className="stage-wipe" aria-hidden="true" />;
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
