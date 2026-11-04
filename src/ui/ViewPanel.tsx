import { useTrickStore, type BoardDetail } from '../store';

const DETAIL_OPTIONS: { value: BoardDetail; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
];

/**
 * "Board detail" (DESIGN.md 7.7): a native radio group dressed as a segmented
 * control, so Tab reaches the checked option, arrow keys move within the
 * group, and a screen reader hears the group name, the hint and "checked".
 * No keyboard shortcut (the letter keys are taken). Disabled, showing Low,
 * if the board model failed to load.
 */
function BoardDetailControl() {
  const detail = useTrickStore((s) => (s.boardAssetFailed ? 'low' : s.boardDetail));
  const failed = useTrickStore((s) => s.boardAssetFailed);
  const setBoardDetail = useTrickStore((s) => s.setBoardDetail);
  return (
    <fieldset className="segmented" aria-describedby="board-detail-hint">
      <legend className="segmented__legend">Board detail</legend>
      <div className="segmented__options">
        {DETAIL_OPTIONS.map((o) => (
          <label key={o.value} className="segmented__option">
            <input
              className="segmented__input"
              type="radio"
              name="board-detail"
              value={o.value}
              checked={detail === o.value}
              disabled={failed}
              onChange={() => setBoardDetail(o.value)}
            />
            <span className="segmented__label">{o.label}</span>
          </label>
        ))}
      </div>
      <p className="segmented__hint" id="board-detail-hint">
        Low uses the simple board. Faster on Chromebooks.
      </p>
    </fieldset>
  );
}

/** Theme, camera, perf, shortcuts and board detail. Each is also reachable without a pointer. */
export function ViewPanel() {
  const theme = useTrickStore((s) => s.theme);
  const perfVisible = useTrickStore((s) => s.perfVisible);
  const toggleTheme = useTrickStore((s) => s.toggleTheme);
  const togglePerf = useTrickStore((s) => s.togglePerf);
  const resetView = useTrickStore((s) => s.resetView);
  const setShortcutsOpen = useTrickStore((s) => s.setShortcutsOpen);

  return (
    <section className="panel" aria-labelledby="view-heading">
      <h2 id="view-heading" className="panel__title">
        View
      </h2>
      <div className="playback">
        <button
          type="button"
          className="btn btn--ghost"
          aria-pressed={theme === 'light'}
          aria-keyshortcuts="t"
          onClick={toggleTheme}
        >
          Light theme
        </button>
        <button type="button" className="btn btn--ghost" onClick={resetView}>
          Reset view
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          aria-pressed={perfVisible}
          aria-keyshortcuts="p"
          onClick={togglePerf}
        >
          Perf badge
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          aria-haspopup="dialog"
          aria-keyshortcuts="?"
          onClick={() => setShortcutsOpen(true)}
        >
          Shortcuts
        </button>
      </div>
      <BoardDetailControl />
    </section>
  );
}
