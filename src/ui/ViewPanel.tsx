import { effectiveQuality, useTrickStore, type CameraView, type Quality, type Stance } from '../store';
import { Toggle } from './Toggle';

const CAMERA_OPTIONS: { value: CameraView; label: string }[] = [
  { value: 'rider', label: 'Rider' },
  { value: 'detail', label: 'Detail' },
];

/**
 * "Camera" (ADR-38): the same native radio group as Stance and Quality, two
 * fixed presets. Rider is the teaching home view (ADR-23) and the default;
 * Detail is a low three-quarter view from the heel side. "Reset view" goes
 * back to the checked one. No keyboard shortcut.
 */
function CameraControl() {
  const view = useTrickStore((s) => s.cameraView);
  const setCameraView = useTrickStore((s) => s.setCameraView);
  return (
    <fieldset className="segmented" aria-describedby="camera-hint">
      <legend className="segmented__legend">Camera</legend>
      <div className="segmented__options">
        {CAMERA_OPTIONS.map((o) => (
          <label key={o.value} className="segmented__option">
            <input
              className="segmented__input"
              type="radio"
              name="camera"
              value={o.value}
              checked={view === o.value}
              onChange={() => setCameraView(o.value)}
            />
            <span className="segmented__label">{o.label}</span>
          </label>
        ))}
      </div>
      <p className="segmented__hint" id="camera-hint">
        Rider: looking down from above your heels. Detail: low and to the side, to see the deck, trucks and soles.
      </p>
    </fieldset>
  );
}

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
/**
 * Reset view in the header, then what the scene shows (feet, legs
 * while the feet are shown, trails, motion cues) and the perf badge as switches (the theme and the
 * shortcuts moved to the top bar, ADR-45), then
 * the camera preset (ADR-38), stance and quality (DESIGN.md 9). Each is also reachable without a pointer.
 */
export function ViewPanel() {
  const perfVisible = useTrickStore((s) => s.perfVisible);
  const togglePerf = useTrickStore((s) => s.togglePerf);
  const resetView = useTrickStore((s) => s.resetView);
  const feetVisible = useTrickStore((s) => s.feetVisible);
  const toggleFeet = useTrickStore((s) => s.toggleFeet);
  const legsVisible = useTrickStore((s) => s.legsVisible);
  const toggleLegs = useTrickStore((s) => s.toggleLegs);
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
        </div>
      </div>
      <div className="view-panel__toggles">
        <Toggle label="Feet" name="Show feet" pressed={feetVisible} onClick={toggleFeet} />
        {/* The legs stand in the shoes (ADR-37): no feet, nothing to show, so no switch. */}
        {feetVisible && <Toggle label="Legs" name="Show legs" pressed={legsVisible} onClick={toggleLegs} />}
        <Toggle label="Foot trails" name="Show foot trails" pressed={footPathsVisible} onClick={toggleFootPaths} />
        <Toggle label="Motion cues" name="Show motion cues" pressed={motionCuesVisible} onClick={toggleMotionCues} />
        <Toggle label="Perf badge" pressed={perfVisible} keys="p" onClick={togglePerf} />
      </div>
      <CameraControl />
      <StanceControl />
      <QualityControl />
    </section>
  );
}
