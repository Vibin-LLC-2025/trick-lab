import { Suspense, lazy, useEffect } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { describeScene } from '../sim/format';
import { PRESETS } from '../sim/tricks';
import { useTrickStore } from '../store';
import { Announcer } from './Announcer';
import { EventLog } from './EventLog';
import { FootMotion } from './FootMotion';
import { Inputs } from './Inputs';
import { Objectives } from './Objectives';
import { PerfBadge } from './PerfBadge';
import { Playback } from './Playback';
import { Presets } from './Presets';
import { SceneBoundary } from './SceneBoundary';
import { ShortcutsDialog } from './ShortcutsDialog';
import { Telemetry } from './Telemetry';
import { ViewPanel } from './ViewPanel';

// Code-split three.js so the accessible DOM UI paints before the 3D chunk loads.
const TrickScene = lazy(() => import('../scene/TrickScene'));

/** Text entry: every shortcut stays out of the way. */
function isTyping(el: Element | null) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLInputElement) return !['range', 'radio', 'checkbox', 'button'].includes(el.type);
  return el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

/** Elements where Space already means something (press, toggle, scroll, step). */
function spaceIsNative(el: Element | null) {
  if (!(el instanceof HTMLElement)) return false;
  return !!el.closest(
    'input, button, select, textarea, a[href], summary, [contenteditable="true"], [role="slider"], [role="button"], [role="region"]',
  );
}

const PRESET_BY_KEY = new Map(PRESETS.map((p) => [p.key, p.id]));

function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useTrickStore.getState();
      // The modal dialog owns the keyboard while it is open.
      if (s.shortcutsOpen) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const target = document.activeElement;
      if (isTyping(target)) return;

      const preset = PRESET_BY_KEY.get(e.key as '1');
      let handled = true;
      if (preset) s.applyPreset(preset);
      else if (e.key === ' ') {
        if (spaceIsNative(target)) return;
        s.popTrick();
      } else if (e.key === 's' || e.key === 'S') s.toggleSlowMotion();
      else if (e.key === '[') s.stepRate(-1);
      else if (e.key === ']') s.stepRate(1);
      else if (e.key === 'r' || e.key === 'R') s.resetSession();
      else if (e.key === 'p' || e.key === 'P') s.togglePerf();
      else if (e.key === 't' || e.key === 'T') s.toggleTheme();
      else if (e.key === '?') s.setShortcutsOpen(true);
      else handled = false;
      if (handled) e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

/** Store actions request focus (after reset); the DOM applies it. */
function useFocusRequests() {
  const request = useTrickStore((s) => s.focusRequest);
  useEffect(() => {
    if (request?.kind === 'setup-heading') document.getElementById('setup-heading')?.focus();
  }, [request]);
}

/**
 * Mirrors prefers-reduced-motion into the store, which decides whether a pop
 * plays or resolves at once, and resolves a flight in the air if it turns on.
 */
function useReducedMotionSync() {
  const reduced = useReducedMotion();
  const setReducedMotion = useTrickStore((s) => s.setReducedMotion);
  useEffect(() => setReducedMotion(reduced), [reduced, setReducedMotion]);
}

function SceneDescription() {
  const text = useTrickStore(describeScene);
  return (
    <p id="scene-description" className="visually-hidden">
      {text}
    </p>
  );
}

export function App() {
  useGlobalShortcuts();
  useFocusRequests();
  useReducedMotionSync();

  return (
    <>
      <div className="app">
        <aside className="app__setup" aria-label="Setup">
          <h1 className="visually-hidden">Trick Lab: land the trick</h1>
          <Presets />
          <Inputs />
          <Playback />
          <ViewPanel />
        </aside>
        <section className="app__stage" aria-label="3D skateboard view" aria-describedby="scene-description">
          <SceneDescription />
          {/* Suspense covers loading; SceneBoundary covers failure, so a broken 3D view never takes the controls with it. */}
          <SceneBoundary>
            <Suspense fallback={null}>
              <TrickScene />
            </Suspense>
          </SceneBoundary>
          <PerfBadge />
        </section>
        <aside className="app__results" aria-label="Results">
          <Telemetry />
          <FootMotion />
          <Objectives />
          <EventLog />
        </aside>
      </div>
      <Announcer />
      <ShortcutsDialog />
    </>
  );
}
