import { PRESETS } from '../sim/tricks';
import { useTrickStore } from '../store';

/**
 * Trick presets. Applying one keeps focus on its button (native behavior) and
 * announces the values it set. Keys 1 to 8 do the same from anywhere.
 */
export function Presets() {
  const active = useTrickStore((s) => s.activePreset);
  const applyPreset = useTrickStore((s) => s.applyPreset);

  return (
    <section className="panel" aria-labelledby="setup-heading">
      {/* Focus target after reset (tabIndex -1: focusable by script, not in tab order). */}
      <h2 id="setup-heading" className="panel__title" tabIndex={-1}>
        Setup
      </h2>
      <div className="presets" role="group" aria-label="Trick presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            id={`preset-${p.id}`}
            className={`preset${active === p.id ? ' preset--active' : ''}`}
            aria-pressed={active === p.id}
            aria-keyshortcuts={p.key}
            onClick={() => applyPreset(p.id)}
          >
            {p.label}
            <kbd className="preset__key" aria-hidden="true">
              {p.key}
            </kbd>
          </button>
        ))}
      </div>
    </section>
  );
}
