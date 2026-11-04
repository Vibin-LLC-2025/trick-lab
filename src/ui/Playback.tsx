import { useEffect, useRef } from 'react';
import { useTrickStore } from '../store';

/**
 * A run of arrow or Page key presses is one scrub gesture: commit once the
 * keys have been still this long (integration pass, 2026-11-04; before, every
 * key-up logged its own playback.scrubbed event).
 */
export const KEY_SCRUB_SETTLE_MS = 600;

function Timeline() {
  const progress = useTrickStore((s) => s.progress);
  const status = useTrickStore((s) => s.status);
  const hasFlight = useTrickStore((s) => s.flight !== null);
  const scrub = useTrickStore((s) => s.scrub);
  const commitScrub = useTrickStore((s) => s.commitScrub);
  const pct = Math.round(progress * 100);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitNow = () => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = null;
    commitScrub();
  };
  const commitSoon = () => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(commitNow, KEY_SCRUB_SETTLE_MS);
  };
  useEffect(() => () => {
    if (settle.current) clearTimeout(settle.current);
  }, []);
  // Scrubbable when paused or done (always the case under reduced motion,
  // where a pop resolves at once). Native range keys: arrows 1 percent,
  // Page Up/Down 10 percent (one tenth of the range), Home and End.
  const enabled = hasFlight && status !== 'playing';

  return (
    <div className="timeline">
      <label className="timeline__label" htmlFor="timeline">
        Timeline <span aria-hidden="true">{pct}% of flight</span>
      </label>
      <input
        id="timeline"
        className="timeline__range"
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        disabled={!enabled}
        aria-valuetext={`${pct} percent of flight`}
        onChange={(e) => scrub(Number(e.currentTarget.value) / 100)}
        // One playback.scrubbed event per gesture: the store logs on commit.
        // Pointer: on release. Keyboard: once the keys settle, or on blur.
        onPointerUp={commitNow}
        onKeyUp={commitSoon}
        onBlur={commitNow}
      />
    </div>
  );
}

export function Playback() {
  const status = useTrickStore((s) => s.status);
  const rate = useTrickStore((s) => s.rate);
  const popTrick = useTrickStore((s) => s.popTrick);
  const togglePause = useTrickStore((s) => s.togglePause);
  const toggleSlowMotion = useTrickStore((s) => s.toggleSlowMotion);
  const resetSession = useTrickStore((s) => s.resetSession);
  const announce = useTrickStore((s) => s.announce);
  const playing = status === 'playing';
  const pausable = status === 'playing' || status === 'paused';
  const slow = rate === 0.25;

  return (
    <section className="panel" aria-labelledby="playback-heading">
      <h2 id="playback-heading" className="panel__title">
        Playback
      </h2>
      <div className="playback">
        {/* aria-disabled, not disabled: the button stays focusable and explains itself. */}
        <button
          type="button"
          className="btn btn--primary"
          aria-label="Pop"
          aria-keyshortcuts="Space"
          aria-disabled={playing || undefined}
          onClick={popTrick}
        >
          Pop <kbd aria-hidden="true">Space</kbd>
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          aria-disabled={!pausable || undefined}
          onClick={() => (pausable ? togglePause() : announce('Nothing is playing. Pop first.'))}
        >
          {status === 'paused' ? 'Resume' : 'Pause'}
        </button>
        <button
          type="button"
          className={`toggle${slow ? ' toggle--on' : ''}`}
          aria-pressed={slow}
          aria-keyshortcuts="s"
          onClick={toggleSlowMotion}
        >
          Slow motion <span className="toggle__state">{slow ? '0.25x' : '1x'}</span>
        </button>
        <button type="button" className="btn btn--danger" aria-keyshortcuts="r" onClick={resetSession}>
          Reset
        </button>
        <Timeline />
      </div>
    </section>
  );
}
