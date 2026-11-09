import { useTrickStore, type Screen } from '../store';
import { ShortcutsButton, ThemeToggle } from './Utilities';

const TITLE: Record<Exclude<Screen, 'home'>, string> = { skate: 'Game of SKATE', lab: 'Practice lab' };
const OTHER: Record<Exclude<Screen, 'home'>, { screen: Screen; label: string }> = {
  skate: { screen: 'lab', label: 'Practice lab' },
  lab: { screen: 'skate', label: 'Game of SKATE' },
};

/**
 * The bar over the game and the lab (ADR-45, DESIGN.md 12): Home, the
 * screen's title (its one h1, the focus target after a screen change), the
 * shortcuts and the theme (the DOM controls for ? and t on both screens),
 * and a way across to the other mode.
 */
export function TopBar({ screen }: { screen: Exclude<Screen, 'home'> }) {
  const setScreen = useTrickStore((s) => s.setScreen);
  const other = OTHER[screen];
  return (
    <header className="topbar">
      <button type="button" className="btn btn--ghost btn--sm topbar__home" onClick={() => setScreen('home')}>
        <span aria-hidden="true">&larr;</span> Home
      </button>
      <h1 id="screen-heading" className="topbar__title" tabIndex={-1}>
        {TITLE[screen]}
      </h1>
      <div className="topbar__actions">
        <ShortcutsButton />
        <ThemeToggle />
        <nav aria-label="Modes">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setScreen(other.screen)}>
            {other.label}
          </button>
        </nav>
      </div>
    </header>
  );
}
