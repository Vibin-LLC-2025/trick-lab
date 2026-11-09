// ROUGH (PLAN-PLAY-POLISH-REACH step 8, 2026-11-09): the two candidate game
// controls for the owner to play, behind `?controls=flick` and
// `?controls=bar`. No polish on purpose: inline styles, no announcements of
// its own, the attempt's state held here and not in the store. Step 9 builds
// the chosen one properly (store-owned, DESIGN.md classes, announced) and
// deletes the other and this file's leftovers.
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { BAR, barFeedback, controlsModeFrom, FLICK_IT, keyAttempt, pointerAttempt, timedAttempt, windUpName } from '../sim/controls';
import type { TrickInputs } from '../sim/flight';
import { awaitingCall, skateActive, turnOf } from '../sim/skate';
import { useTrickStore, type TrickState } from '../store';

/** The rough control the URL asks for; null is today's sliders and Pop. */
export const CONTROLS_MODE = controlsModeFrom(typeof window === 'undefined' ? '' : window.location.search);

/** The student is up in a game on the game screen, with nothing in the air and no dialog open. */
const studentUp = (s: TrickState) =>
  s.screen === 'skate' && skateActive(s.skate) && turnOf(s.skate) === 'you' && s.status !== 'playing' && s.status !== 'paused' && !s.shortcutsOpen && s.skateLeave === null;

/** A rough control takes Space from the global shortcut: the student's go, while a rough mode is on. */
export const roughOwnsSpace = (s: TrickState) => CONTROLS_MODE !== null && studentUp(s);

const nativeSpace = (el: Element | null) => el instanceof HTMLElement && !!el.closest('input, button, select, textarea, a[href], summary');

// ---------------------------------------------------------------- A. flick it

const ARROWS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as const;
type Arrow = (typeof ARROWS)[keyof typeof ARROWS];

/** A crouch in progress: by pointer (a drag from where it was pressed) or by keys (Space held, arrows adding). */
type Crouch =
  | { by: 'pointer'; since: number; x0: number; y0: number; dx: number; dy: number }
  | { by: 'keys'; since: number; held: Record<Arrow, number>; down: Partial<Record<Arrow, number>> };

const heldNow = (c: Extract<Crouch, { by: 'keys' }>, now: number) => {
  const out = { ...c.held };
  for (const k of Object.keys(c.down) as Arrow[]) out[k] += now - (c.down[k] ?? now);
  return out;
};

const attemptOf = (c: Crouch, now: number): TrickInputs =>
  c.by === 'pointer' ? pointerAttempt(now - c.since, c.dx, c.dy) : keyAttempt(now - c.since, heldNow(c, now));

const padStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: '50%',
  touchAction: 'none',
  cursor: 'grab',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 6,
  padding: 12,
  userSelect: 'none',
  borderTop: '1px dashed color-mix(in srgb, currentColor 35%, transparent)',
};
const noteStyle: CSSProperties = { margin: 0, padding: '4px 10px', borderRadius: 6, background: 'color-mix(in srgb, Canvas 80%, transparent)', color: 'CanvasText', font: 'inherit' };

/**
 * The flick pad: the lower half of the stage. Press and hold to crouch, drag
 * to add flick (sideways) and scoop (up and down), let go to pop. By
 * keyboard: hold Space, add with the arrows, let go of Space. A page element
 * over the 3D view, so a drag here does not turn the camera.
 */
export function FlickPad() {
  const up = useTrickStore(studentUp);
  const needsCall = useTrickStore((s) => awaitingCall(s.skate));
  const crouch = useRef<Crouch | null>(null);
  // What the crouch would do if let go now, redrawn each animation frame while it lasts.
  const [live, setLive] = useState<{ crouch: number; name: string } | null>(null);

  useEffect(() => {
    if (!up) {
      crouch.current = null;
      return;
    }
    let raf = 0;
    const tick = () => {
      const c = crouch.current;
      if (c) {
        const now = performance.now();
        setLive({ crouch: Math.min(1, (now - c.since) / FLICK_IT.popFullMs), name: windUpName(attemptOf(c, now)) });
      } else setLive(null);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const release = () => {
      const c = crouch.current;
      if (!c) return;
      crouch.current = null;
      useTrickStore.getState().popAttempt(attemptOf(c, performance.now()));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const c = crouch.current;
      if (e.key === ' ') {
        if (nativeSpace(document.activeElement)) return;
        e.preventDefault();
        if (e.repeat || c) return;
        // A set needs a call first: the store says so.
        if (awaitingCall(useTrickStore.getState().skate)) {
          useTrickStore.getState().popTrick();
          return;
        }
        crouch.current = { by: 'keys', since: performance.now(), held: { left: 0, right: 0, up: 0, down: 0 }, down: {} };
      } else if (e.key === 'Escape' && c) {
        crouch.current = null;
      } else if (c?.by === 'keys' && e.key in ARROWS) {
        e.preventDefault();
        const k = ARROWS[e.key as keyof typeof ARROWS];
        if (c.down[k] === undefined) c.down[k] = performance.now();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const c = crouch.current;
      if (c?.by !== 'keys') return;
      if (e.key === ' ') {
        e.preventDefault();
        release();
      } else if (e.key in ARROWS) {
        const k = ARROWS[e.key as keyof typeof ARROWS];
        const since = c.down[k];
        if (since !== undefined) {
          c.held[k] += performance.now() - since;
          delete c.down[k];
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [up]);

  if (!up) return null;

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (crouch.current) return;
    if (awaitingCall(useTrickStore.getState().skate)) {
      useTrickStore.getState().popTrick();
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    crouch.current = { by: 'pointer', since: performance.now(), x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const c = crouch.current;
    if (c?.by !== 'pointer') return;
    c.dx = e.clientX - c.x0;
    c.dy = e.clientY - c.y0;
  };
  const onUp = () => {
    const c = crouch.current;
    if (c?.by !== 'pointer') return;
    crouch.current = null;
    useTrickStore.getState().popAttempt(attemptOf(c, performance.now()));
  };
  const onCancel = () => {
    if (crouch.current?.by === 'pointer') crouch.current = null;
  };

  return (
    <div
      style={padStyle}
      aria-label="Flick pad: press and hold to crouch, drag sideways to flick and up or down to scoop, let go to pop"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
    >
      {live ? (
        <>
          <p style={noteStyle}>Winding up: {live.name}</p>
          <progress max={1} value={live.crouch} aria-label="Crouch" />
        </>
      ) : (
        <p style={noteStyle}>
          {needsCall ? 'Call your trick first.' : 'Press and hold here (or hold Space) to crouch. Drag (or the arrow keys) to flick and scoop. Let go to pop.'}
        </p>
      )}
    </div>
  );
}

/** The hint in the game's column where the sliders were, in flick mode. */
export function FlickHint() {
  return (
    <section className="panel" aria-label="How to pop">
      <ul className="skate__rules">
        <li>Press and hold on the lower half of the stage, or hold Space, to crouch. The longer you hold, the higher the pop.</li>
        <li>Drag right for a kickflip and left for a heelflip, down for backside and up for frontside. By keyboard: the arrow keys, the same way round, while Space is held.</li>
        <li>Let go to pop. A higher pop stays up longer, so it needs less flick and scoop.</li>
      </ul>
    </section>
  );
}

// ------------------------------------------------------------- B. timing bar

/** The bar's sweep in progress, outside React so Space and the button share it. */
const bar: { since: number | null; timer: ReturnType<typeof setTimeout> | null; listeners: Set<() => void>; said: string } = {
  since: null,
  timer: null,
  listeners: new Set(),
  said: '',
};
const tell = () => bar.listeners.forEach((l) => l());

function releaseBar() {
  if (bar.since === null) return;
  const ms = performance.now() - bar.since;
  if (bar.timer) clearTimeout(bar.timer);
  bar.since = null;
  bar.timer = null;
  const s = useTrickStore.getState();
  bar.said = barFeedback(ms, s.skate.level);
  tell();
  s.popAttempt(timedAttempt({ pop: s.pop, flick: s.flick, scoop: s.scoop }, ms, s.skate.level));
}

/** Pop in bar mode: the first press starts the sweep, the second releases; the sweep's end releases by itself. */
export function barPress() {
  const s = useTrickStore.getState();
  // Not the student's go, or no call yet: the store's own Pop says what is wrong or lets the computer go.
  if (!studentUp(s) || awaitingCall(s.skate)) {
    s.popTrick();
    return;
  }
  if (bar.since !== null) {
    releaseBar();
    return;
  }
  bar.since = performance.now();
  bar.said = '';
  bar.timer = setTimeout(releaseBar, BAR.sweepMs);
  tell();
}

/** Drops a sweep with no attempt (the student's go ended some other way: quit, a dialog, a screen change). */
function cancelBar() {
  if (bar.since === null) return;
  if (bar.timer) clearTimeout(bar.timer);
  bar.since = null;
  bar.timer = null;
  tell();
}

/** The timing bar under Pop: the band, and a marker sweeping across while the bar runs. */
export function TimingBar() {
  const up = useTrickStore(studentUp);
  const level = useTrickStore((s) => s.skate.level);
  // The bar as last drawn: where the marker is (0 to 1, null when not running) and what the last release did.
  const [view, setView] = useState<{ at: number | null; said: string }>({ at: null, said: '' });
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      cancelAnimationFrame(raf);
      const since = bar.since;
      setView({ at: since === null ? null : Math.min(1, (performance.now() - since) / BAR.sweepMs), said: bar.said });
      // Every frame while the bar runs.
      if (since !== null) raf = requestAnimationFrame(draw);
    };
    bar.listeners.add(draw);
    return () => {
      cancelAnimationFrame(raf);
      bar.listeners.delete(draw);
    };
  }, []);
  useEffect(() => {
    if (!up) cancelBar();
  }, [up]);

  const pct = (ms: number) => `${(ms / BAR.sweepMs) * 100}%`;
  return (
    <div>
      <div
        aria-hidden="true"
        style={{ position: 'relative', height: 16, borderRadius: 4, background: 'color-mix(in srgb, currentColor 14%, transparent)', overflow: 'hidden' }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: pct(BAR.centreMs - BAR.half[level]),
            width: pct(BAR.half[level] * 2),
            background: 'color-mix(in srgb, currentColor 45%, transparent)',
          }}
        />
        {view.at !== null && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${view.at * 100}% - 2px)`, width: 4, background: 'currentColor' }} />
        )}
      </div>
      <p className="panel__note">
        {view.at !== null
          ? 'Press Pop again when the marker is in the band.'
          : view.said || 'Pop starts the bar. Press Pop again in the band: early spins less than you set, late spins more.'}
      </p>
    </div>
  );
}
