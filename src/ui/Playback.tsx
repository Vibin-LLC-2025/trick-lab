import { useEffect, useRef } from 'react';
import { SPEEDS, speedIndex, speedLabel, speedText, useTrickStore } from '../store';

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

/**
 * Speed (2026-11-04, replaces the slow-motion toggle): a native range over
 * the SPEEDS stops, 0.05x to 2x. It stays enabled while the board is in the
 * air, and FlightDriver reads the rate every frame, so dragging it slows or
 * speeds a flight already playing. Arrows move one stop, Home and End jump
 * to the ends. The global keys [ and ] step it and s toggles slow motion.
 */
function Speed() {
  const rate = useTrickStore((s) => s.rate);
  const setRate = useTrickStore((s) => s.setRate);
  return (
    <div className="timeline">
      <label className="timeline__label" htmlFor="speed">
        Speed <span aria-hidden="true">{speedLabel(rate)}</span>
      </label>
      <input
        id="speed"
        className="timeline__range"
        type="range"
        min={0}
        max={SPEEDS.length - 1}
        step={1}
        value={speedIndex(rate)}
        aria-valuetext={speedText(rate)}
        aria-keyshortcuts="[ ] s"
        onChange={(e) => setRate(SPEEDS[Number(e.currentTarget.value)] ?? 1)}
      />
    </div>
  );
}

export function Playback() {
  const status = useTrickStore((s) => s.status);
  const popTrick = useTrickStore((s) => s.popTrick);
  const togglePause = useTrickStore((s) => s.togglePause);
  const resetSession = useTrickStore((s) => s.resetSession);
  const announce = useTrickStore((s) => s.announce);
  const playing = status === 'playing';
  const pausable = status === 'playing' || status === 'paused';

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
          className="btn"
          aria-disabled={!pausable || undefined}
          onClick={() => (pausable ? togglePause() : announce('Nothing is playing. Pop first.'))}
        >
          {status === 'paused' ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className="btn btn--danger" aria-keyshortcuts="r" onClick={resetSession}>
          Reset
        </button>
        <Speed />
        <Timeline />
      </div>
    </section>
  );
}
