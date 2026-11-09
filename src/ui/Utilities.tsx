import { useTrickStore } from '../store';
import { Toggle } from './Toggle';

/** Opens the shortcuts dialog: the DOM control for `?`, on every screen (ADR-45). */
export function ShortcutsButton({ label = 'Shortcuts' }: { label?: string }) {
  const setShortcutsOpen = useTrickStore((s) => s.setShortcutsOpen);
  return (
    <button type="button" className="btn btn--ghost btn--sm" aria-haspopup="dialog" aria-keyshortcuts="?" onClick={() => setShortcutsOpen(true)}>
      {label}
    </button>
  );
}

/** The light theme switch: the DOM control for `t`, on every screen (ADR-45). */
export function ThemeToggle() {
  const theme = useTrickStore((s) => s.theme);
  const toggleTheme = useTrickStore((s) => s.toggleTheme);
  return <Toggle label="Light theme" pressed={theme === 'light'} keys="t" onClick={toggleTheme} />;
}

/** The sound switch (ADR-58), on every screen beside the theme: off until the student turns it on. */
export function SoundToggle() {
  const soundOn = useTrickStore((s) => s.soundOn);
  const toggleSound = useTrickStore((s) => s.toggleSound);
  return <Toggle label="Sound" pressed={soundOn} onClick={toggleSound} />;
}

/**
 * Pauses or plays the welcome screen's preview (ADR-45; WCAG 2.2.2, motion
 * that starts on its own must be pausable). Shown only where the preview
 * could play: on reduced motion, the Low tier or with no 3D view it is a
 * still already.
 */
export function PreviewToggle() {
  const paused = useTrickStore((s) => s.previewPaused);
  const togglePreview = useTrickStore((s) => s.togglePreview);
  return (
    <button type="button" className="btn btn--sm preview-toggle" onClick={togglePreview}>
      {paused ? 'Play preview' : 'Pause preview'}
    </button>
  );
}
