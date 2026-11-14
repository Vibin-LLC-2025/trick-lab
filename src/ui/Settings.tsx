import { useEffect, useRef, useState } from 'react';
import { skateActive } from '../sim/skate';
import { GAME_VIEW_LABEL, GAME_VIEWS, orbitsFree, useTrickStore, type Screen } from '../store';
import { Toggle } from './Toggle';
import { ShortcutsButton, SoundToggle, ThemeToggle } from './Utilities';

/**
 * The game's camera as a radio group (arrow keys move and choose), three
 * views (ADR-100): Free, the default (ADR-81), and Free fisheye (ADR-93),
 * turned by dragging the stage and zoomed by scrolling or pinching, with
 * Reset view to bring them home; or Filmer, the one fixed angle (step 17,
 * ADR-72), which needs no pointer at all.
 */
function CameraChoice() {
  const view = useTrickStore((s) => s.gameView);
  const setGameView = useTrickStore((s) => s.setGameView);
  const resetView = useTrickStore((s) => s.resetView);
  return (
    <fieldset className="segmented" aria-describedby={orbitsFree(view) ? 'game-camera-hint' : undefined}>
      <legend className="segmented__legend">Camera</legend>
      <div className="segmented__options">
        {GAME_VIEWS.map((v) => (
          <label key={v} className="segmented__option">
            <input className="segmented__input" type="radio" name="game-camera" value={v} checked={view === v} onChange={() => setGameView(v)} />
            <span className="segmented__label">{GAME_VIEW_LABEL[v]}</span>
          </label>
        ))}
      </div>
      {orbitsFree(view) && (
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

/** The switches that only mean something in a game in play (ADR-46, ADR-72): with the camera, the game's part of Settings. */
function GameSettings() {
  const slow = useTrickStore((s) => s.rate < 1);
  const toggleSlowMotion = useTrickStore((s) => s.toggleSlowMotion);
  const auto = useTrickStore((s) => s.skateAuto);
  const toggleSkateAuto = useTrickStore((s) => s.toggleSkateAuto);
  const replay = useTrickStore((s) => s.instantReplay);
  const toggleInstantReplay = useTrickStore((s) => s.toggleInstantReplay);
  // No replay plays under reduced motion (ADR-72), so its switch is not offered there.
  const reduced = useTrickStore((s) => s.reducedMotion);
  return (
    <div className="settings__group" role="group" aria-label="Game">
      <p className="settings__label" aria-hidden="true">
        Game
      </p>
      <Toggle label="Slow motion" pressed={slow} keys="s" onClick={toggleSlowMotion} />
      <Toggle label="Computer goes on its own" pressed={auto} onClick={toggleSkateAuto} />
      {!reduced && <Toggle label="Instant replay" pressed={replay} onClick={toggleInstantReplay} />}
      <CameraChoice />
    </div>
  );
}

/** The gear's eight teeth, in degrees. */
const TEETH = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * Settings (ADR-89, DESIGN.md 12.5): one button in the top bar that opens a
 * panel with every switch the screen has, so none of them sits over the
 * stage. Sound, the theme and the shortcuts on both screens; in a game in
 * play, Slow motion, Computer goes on its own, Instant replay and the camera
 * too. A disclosure, not a dialog: the game goes on behind it and every key
 * still works. Escape or a press outside closes it; Escape from inside puts
 * focus back on the button, as a native dialog would. The panel is over the
 * stage's top right corner and carries no `data-covers`: the camera never
 * reframes for it.
 */
export function Settings({ screen }: { screen: Exclude<Screen, 'home'> }) {
  const [open, setOpen] = useState(false);
  const inGame = useTrickStore((s) => screen === 'skate' && skateActive(s.skate));
  const shortcutsOpen = useTrickStore((s) => s.shortcutsOpen);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // The shortcuts dialog opened from the panel closes it.
  if (open && shortcutsOpen) setOpen(false);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (root.current?.contains(document.activeElement)) button.current?.focus();
      setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="settings" ref={root}>
      <button
        ref={button}
        type="button"
        className="btn btn--ghost btn--sm settings__button"
        aria-expanded={open}
        aria-controls="settings-panel"
        onClick={() => setOpen(!open)}
      >
        <svg className="settings__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="4.2" fill="none" stroke="currentColor" strokeWidth="2.4" />
          {TEETH.map((deg) => (
            <rect key={deg} x="6.9" y="0.6" width="2.2" height="3.2" rx="0.6" fill="currentColor" transform={`rotate(${deg} 8 8)`} />
          ))}
        </svg>
        Settings
      </button>
      {open && (
        <div id="settings-panel" className="settings__panel" role="group" aria-label="Settings">
          {inGame && <GameSettings />}
          <div className="settings__group" role="group" aria-label="App">
            <p className="settings__label" aria-hidden="true">
              App
            </p>
            <SoundToggle />
            <ThemeToggle />
            <ShortcutsButton label="Keyboard shortcuts" />
          </div>
        </div>
      )}
    </div>
  );
}
