import { lettersText, SKATE_LEVEL_ORDER, SKATE_LEVELS, SKATE_WORD, skateActive, skateInstruction, type SkatePlayer } from '../sim/skate';
import { useTrickStore } from '../store';

/** Five letter tiles; the ones a player has are filled. Read as text by the hidden label. */
function Letters({ who, count }: { who: SkatePlayer; count: number }) {
  return (
    <div className="skate__row">
      <dt className="skate__who">{who === 'you' ? 'You' : 'Computer'}</dt>
      <dd className="skate__letters">
        {SKATE_WORD.split('').map((l, i) => (
          <span key={l} className={`skate__letter${i < count ? ' skate__letter--got' : ''}`} aria-hidden="true">
            {l}
          </span>
        ))}
        <span className="visually-hidden">{lettersText(count)}</span>
      </dd>
    </div>
  );
}

/**
 * The game of SKATE against the computer (ADR-43). Between games: the rules,
 * the computer's level and Start. In a game: both players' letters, what just
 * happened and what to do next. Every action is a button; the turns run on
 * the Pop button and Space. The Announcer speaks each change, so nothing
 * here is a live region.
 */
export function Skate() {
  const game = useTrickStore((s) => s.skate);
  const message = useTrickStore((s) => s.skateMessage);
  const record = useTrickStore((s) => s.skateRecord);
  const setLevel = useTrickStore((s) => s.setSkateLevel);
  const start = useTrickStore((s) => s.startSkate);
  const quit = useTrickStore((s) => s.quitSkate);
  const active = skateActive(game);
  const played = record.you + record.computer;

  return (
    <section className="panel" aria-labelledby="skate-heading">
      <div className="panel__head">
        {/* Focus target when a game starts or ends (tabIndex -1: focusable by script, not in tab order). */}
        <h2 id="skate-heading" className="panel__title" tabIndex={-1}>
          Game of SKATE
          {played > 0 && (
            <span className="panel__count">
              {' '}
              won {record.you} of {played}
            </span>
          )}
        </h2>
        {active && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={quit}>
            Quit game
          </button>
        )}
      </div>

      {game.phase === 'off' ? (
        <>
          <p className="panel__note">
            Play the computer. When one of you lands a trick, the other has to copy it. Miss a copy and you get a letter.
            Spell S K A T E and you lose.
          </p>
          <fieldset className="segmented" aria-describedby="skate-level-hint">
            <legend className="segmented__legend">Computer</legend>
            <div className="segmented__options">
              {SKATE_LEVEL_ORDER.map((level) => (
                <label key={level} className="segmented__option">
                  <input
                    className="segmented__input"
                    type="radio"
                    name="skate-level"
                    value={level}
                    checked={game.level === level}
                    onChange={() => setLevel(level)}
                  />
                  <span className="segmented__label">{SKATE_LEVELS[level].label}</span>
                </label>
              ))}
            </div>
            <p className="segmented__hint" id="skate-level-hint">
              {SKATE_LEVELS[game.level].hint}
            </p>
          </fieldset>
          <div className="skate__actions">
            <button type="button" className="btn btn--primary" onClick={start}>
              Start game
            </button>
          </div>
        </>
      ) : (
        <>
          <dl className="skate__score">
            <Letters who="you" count={game.letters.you} />
            <Letters who="computer" count={game.letters.computer} />
          </dl>
          {message && <p className="panel__note">{message}</p>}
          <p className="skate__call">{skateInstruction(game)}</p>
          {game.phase === 'over' && (
            <div className="skate__actions">
              <button type="button" className="btn btn--primary" onClick={start}>
                Play again
              </button>
              <button type="button" className="btn" onClick={quit}>
                Back to practice
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
