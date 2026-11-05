import { effectiveQuality, useTrickStore, type Quality, type Stance } from '../store';

const STANCE_OPTIONS: { value: Stance; label: string }[] = [
  { value: 'goofy', label: 'Goofy' },
  { value: 'regular', label: 'Regular' },
];

/**
 * "Stance" (DESIGN.md 8.6, ADR-25): the same native radio group as Quality.
 * Goofy is the default; Regular turns the board on the pad and swaps the
 * feet. The camera stays on the heel side. No keyboard shortcut.
 */
function StanceControl() {
  const stance = useTrickStore((s) => s.stance);
  const setStance = useTrickStore((s) => s.setStance);
  return (
    <fieldset className="segmented" aria-describedby="stance-hint">
      <legend className="segmented__legend">Stance</legend>
      <div className="segmented__options">
        {STANCE_OPTIONS.map((o) => (
          <label key={o.value} className="segmented__option">
            <input
              className="segmented__input"
              type="radio"
              name="stance"
              value={o.value}
              checked={stance === o.value}
              onChange={() => setStance(o.value)}
            />
            <span className="segmented__label">{o.label}</span>
          </label>
        ))}
      </div>
      <p className="segmented__hint" id="stance-hint">
        Goofy: right foot forward, nose on the right. Regular: left foot forward, nose on the left.
      </p>
    </fieldset>
  );
}

const QUALITY_OPTIONS: { value: Quality; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

/**
 * "Quality" (DESIGN.md 7.7 and 8.4, ADR-16): a native radio group dressed as
 * a segmented control, so Tab reaches the checked option, arrow keys move
 * within the group, and a screen reader hears the group name, the hint and
 * "checked". No keyboard shortcut (the letter keys are taken). High and
 * Medium are disabled, showing Low, if a model failed to load. The hint says
 * when the tier was picked for the device rather than chosen.
 */
function QualityControl() {
  // The tier in use, not the saved one: Low once a model failed (ADR-15).
  const quality = useTrickStore(effectiveQuality);
  const auto = useTrickStore((s) => s.qualityAuto && !s.boardAssetFailed);
  const failed = useTrickStore((s) => s.boardAssetFailed);
  const setQuality = useTrickStore((s) => s.setQuality);
  return (
    <fieldset className="segmented" aria-describedby="quality-hint">
      <legend className="segmented__legend">Quality</legend>
      <div className="segmented__options">
        {QUALITY_OPTIONS.map((o) => (
          <label key={o.value} className="segmented__option">
            <input
              className="segmented__input"
              type="radio"
              name="quality"
              value={o.value}
              checked={quality === o.value}
              disabled={failed && o.value !== 'low'}
              onChange={() => setQuality(o.value)}
            />
            <span className="segmented__label">{o.label}</span>
          </label>
        ))}
      </div>
      <p className="segmented__hint" id="quality-hint">
        {auto ? 'Picked for this device. ' : ''}High adds shoes, shadows and a finer board. Low is the simple board, fastest on Chromebooks.
      </p>
    </fieldset>
  );
}

/**
 * A switch-style toggle: a button with aria-pressed (the `.toggle` contract).
 * `name` is the accessible name when the visible label is shortened; it
 * always contains the visible label (WCAG 2.5.3, label in name).
 */
function Toggle({
  label,
  name,
  pressed,
  keys,
  onClick,
}: {
  label: string;
  name?: string;
  pressed: boolean;
  keys?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`toggle${pressed ? ' toggle--on' : ''}`}
      aria-pressed={pressed}
      aria-label={name}
      aria-keyshortcuts={keys}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/**
 * Camera and shortcuts in the header, then what the scene shows (feet,
 * trails, motion cues), the theme and the perf badge as switches, then
 * stance and quality (DESIGN.md 9). Each is also reachable without a pointer.
 */
export function ViewPanel() {
  const theme = useTrickStore((s) => s.theme);
  const perfVisible = useTrickStore((s) => s.perfVisible);
  const toggleTheme = useTrickStore((s) => s.toggleTheme);
  const togglePerf = useTrickStore((s) => s.togglePerf);
  const resetView = useTrickStore((s) => s.resetView);
  const setShortcutsOpen = useTrickStore((s) => s.setShortcutsOpen);
  const feetVisible = useTrickStore((s) => s.feetVisible);
  const toggleFeet = useTrickStore((s) => s.toggleFeet);
  const footPathsVisible = useTrickStore((s) => s.footPathsVisible);
  const toggleFootPaths = useTrickStore((s) => s.toggleFootPaths);
  const motionCuesVisible = useTrickStore((s) => s.motionCuesVisible);
  const toggleMotionCues = useTrickStore((s) => s.toggleMotionCues);

  return (
    <section className="panel" aria-labelledby="view-heading">
      <div className="panel__head">
        <h2 id="view-heading" className="panel__title">
          View
        </h2>
        <div className="view-panel__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={resetView}>
            Reset view
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-haspopup="dialog"
            aria-keyshortcuts="?"
            onClick={() => setShortcutsOpen(true)}
          >
            Shortcuts
          </button>
        </div>
      </div>
      <div className="view-panel__toggles">
        <Toggle label="Feet" name="Show feet" pressed={feetVisible} onClick={toggleFeet} />
        <Toggle label="Foot trails" name="Show foot trails" pressed={footPathsVisible} onClick={toggleFootPaths} />
        <Toggle label="Motion cues" name="Show motion cues" pressed={motionCuesVisible} onClick={toggleMotionCues} />
        <Toggle label="Light theme" pressed={theme === 'light'} keys="t" onClick={toggleTheme} />
        <Toggle label="Perf badge" pressed={perfVisible} keys="p" onClick={togglePerf} />
      </div>
      <StanceControl />
      <QualityControl />
    </section>
  );
}
