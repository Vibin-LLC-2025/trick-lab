import { Suspense, lazy, useEffect } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { describeScene } from '../sim/format';
import { skateActive } from '../sim/skate';
import { PRESETS } from '../sim/tricks';
import { previewCanPlay, screenFromHash, screenHash, useTrickStore, type Screen } from '../store';
import { Announcer } from './Announcer';
import { EventLog } from './EventLog';
import { FootMotion } from './FootMotion';
import { Home } from './Home';
import { Inputs } from './Inputs';
import { Objectives } from './Objectives';
import { PerfBadge } from './PerfBadge';
import { Playback, Replay } from './Playback';
import { Presets } from './Presets';
import { SceneBoundary } from './SceneBoundary';
import { Celebration } from './Celebration';
import { StageStill } from './StageStill';
import { useSound } from '../hooks/useSound';
import { ShortcutsDialog } from './ShortcutsDialog';
import { LeaveDialog, Skate, TurnChip } from './Skate';
import { Telemetry } from './Telemetry';
import { TopBar } from './TopBar';
import { barPress, CONTROLS_MODE, FlickPad, roughOwnsSpace } from './RoughControls';
import { PreviewToggle } from './Utilities';
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

/**
 * The keys each screen answers to (ADR-45), each backed by a DOM control on
 * that screen. The theme and the shortcuts dialog work everywhere. The game
 * adds Space (Pop or the computer's go) and s (its Slow motion switch, ADR-46),
 * but not the presets (off in a game), Reset (it would end the game) or the
 * speed steps (the game has no speed slider). The lab has them all, and the
 * perf badge, whose switch is in its View panel. The welcome screen has
 * nothing to pop.
 */
const EVERYWHERE = ['t', 'T', '?'];
const PLAY = [' ', 's', 'S'];
export const SCREEN_KEYS: Record<Screen, ReadonlySet<string>> = {
  home: new Set(EVERYWHERE),
  skate: new Set([...EVERYWHERE, ...PLAY]),
  lab: new Set([...EVERYWHERE, ...PLAY, '[', ']', 'p', 'P', 'r', 'R', ...PRESET_BY_KEY.keys()]),
};

function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useTrickStore.getState();
      // A modal dialog owns the keyboard while it is open.
      if (s.shortcutsOpen || s.skateLeave) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (!SCREEN_KEYS[s.screen].has(e.key)) return;
      // The game's Pop and Slow motion are on screen only while a game is in play (ADR-46).
      if (s.screen === 'skate' && !skateActive(s.skate) && PLAY.includes(e.key)) return;
      const target = document.activeElement;
      if (isTyping(target)) return;

      const preset = PRESET_BY_KEY.get(e.key as '1');
      let handled = true;
      if (preset) s.applyPreset(preset);
      else if (e.key === ' ') {
        if (spaceIsNative(target)) return;
        // ROUGH (step 8): a rough control owns the student's Space. The bar starts or releases; the flick pad listens itself.
        if (roughOwnsSpace(s)) {
          if (CONTROLS_MODE === 'bar') barPress();
        } else s.popTrick();
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
    else if (request?.kind === 'skate-heading') document.getElementById('skate-heading')?.focus();
    else if (request?.kind === 'screen-heading') document.getElementById('screen-heading')?.focus();
  }, [request]);
}

/**
 * The screen and the URL hash follow each other (ADR-45): a screen change
 * pushes a history entry, and the back and forward buttons, or an edited
 * hash, change the screen. The store read the hash it started on.
 */
function useScreenRoute() {
  const screen = useTrickStore((s) => s.screen);
  useEffect(() => {
    const follow = () => {
      const screen = screenFromHash(window.location.hash);
      useTrickStore.getState().setScreen(screen);
      // An unknown hash means home: tidy it in place, even when home was already showing.
      if (window.location.hash !== screenHash(screen)) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${screenHash(screen)}`);
      }
    };
    window.addEventListener('popstate', follow);
    window.addEventListener('hashchange', follow);
    return () => {
      window.removeEventListener('popstate', follow);
      window.removeEventListener('hashchange', follow);
    };
  }, []);
  useEffect(() => {
    const hash = window.location.hash;
    if (hash === screenHash(screen)) return;
    const url = `${window.location.pathname}${window.location.search}${screenHash(screen)}`;
    // A hash that already means this screen (an unknown one is home) is tidied in place: no extra Back step.
    if (screenFromHash(hash) === screen) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
  }, [screen]);
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

/** The preview's text equivalent on the welcome screen (ADR-45); the stage describes the student's board everywhere else. */
export const PREVIEW_DESCRIPTION =
  'Preview: a rider on a skateboard doing a kickflip, a 360 flip and other tricks in slow motion, one after another.';

function SceneDescription() {
  const text = useTrickStore((s) => (s.screen === 'home' ? PREVIEW_DESCRIPTION : describeScene(s)));
  return (
    <p id="scene-description" className="visually-hidden">
      {text}
    </p>
  );
}

/**
 * Three screens (ADR-45): the welcome screen, the game of SKATE and the lab.
 * Every child below keeps its slot whatever the screen (false holds the
 * place), so the stage, and with it the 3D view, is never remounted when the
 * screen changes: only the layout around it does (data-screen in app.css).
 */
export function App() {
  useGlobalShortcuts();
  useFocusRequests();
  useReducedMotionSync();
  useScreenRoute();
  useSound();
  const screen = useTrickStore((s) => s.screen);
  const canPause = useTrickStore(previewCanPlay);

  return (
    <>
      <div className="app" data-screen={screen}>
        {screen !== 'home' && <TopBar screen={screen} />}
        {screen === 'home' && <Home />}
        {/* Each screen's controls are its one main landmark; the stage and the results are beside them. */}
        {screen === 'lab' && (
          <main className="app__setup" aria-label="Setup">
            {/* Up front: presets, sliders and Pop. The rest opens when wanted (ADR-47). */}
            <Presets />
            <Inputs />
            <Playback />
            <Replay />
            <ViewPanel />
          </main>
        )}
        {screen === 'skate' && (
          <main className="app__play" aria-label="Game">
            <Skate />
          </main>
        )}
        <section
          className="app__stage"
          aria-label={screen === 'home' ? 'Preview' : '3D skateboard view'}
          aria-describedby="scene-description"
        >
          <SceneDescription />
          {/* Suspense covers loading; SceneBoundary covers failure, so a broken 3D view never takes the controls with it. */}
          <SceneBoundary>
            <Suspense fallback={null}>
              <TrickScene />
            </Suspense>
          </SceneBoundary>
          {/* Over the 3D view until it first shows the tier's real scene (ADR-56); under the overlays below. */}
          <StageStill />
          <PerfBadge />
          {canPause && <PreviewToggle />}
          {screen === 'skate' && <TurnChip />}
          {/* ROUGH (step 8): the flick pad, over the lower half of the stage. */}
          {screen === 'skate' && CONTROLS_MODE === 'flick' && <FlickPad />}
          {/* The student's landed trick, over the stage (ADR-57); never on the welcome preview. */}
          {screen !== 'home' && <Celebration />}
        </section>
        {screen === 'lab' && (
          <aside className="app__results" aria-label="Results">
            <Telemetry />
            <FootMotion />
            <Objectives />
            <EventLog />
          </aside>
        )}
      </div>
      <Announcer />
      <ShortcutsDialog />
      <LeaveDialog />
    </>
  );
}
