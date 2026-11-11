import type { CSSProperties } from 'react';
import { displayUnit, displayValue, INPUT_NAMES, valueText } from '../sim/format';
import { INPUT_LIMITS, type InputKey } from '../sim/tricks';
import { ZONE_WORDS, type Span, type ZoneKey } from '../sim/zones';
import { sliderForecast, sliderPlace, sliderZones, useTrickStore } from '../store';

const KEYS: InputKey[] = ['pop', 'flick', 'scoop'];

const HELP: Record<InputKey, string> = {
  pop: 'Peak height of the jump',
  // Signed rates (ADR-30): the slider is centred on 0 and the side picks the direction.
  flick: 'Flip rate about the long axis: right for a kickflip, left for a heelflip',
  scoop: 'Shove rate about the vertical axis: right for backside, left for frontside',
};

/** The forecast line under the game's sliders (ADR-83); each slider is described by it. */
const FORECAST_ID = 'skate-forecast';

/** Where a stretch of a slider sits along its track, 0 to 1, for the zone's two custom properties (app.css). */
function spanStyle(k: ZoneKey, span: Span): CSSProperties {
  const { min, max } = INPUT_LIMITS[k];
  const at = (v: number) => ((v - min) / (max - min)).toFixed(4);
  return { '--zone-from': at(span.from), '--zone-to': at(span.to) } as CSSProperties;
}

/**
 * A slider's landing zone in a game (ADR-83, DESIGN.md 11.6): the strip under
 * the track that lands the trick to do, and the clean part inside it.
 * Decorative: the slider's spoken value says when it is in either.
 */
function ZoneBand({ k }: { k: ZoneKey }) {
  const zone = useTrickStore((s) => sliderZones(s)?.[k] ?? null);
  if (!zone) return null;
  return (
    <>
      <span className="field__zone" aria-hidden="true" style={spanStyle(k, zone)} />
      {zone.clean && <span className="field__zone field__zone--clean" aria-hidden="true" style={spanStyle(k, zone.clean)} />}
    </>
  );
}

function Field({ k }: { k: InputKey }) {
  const value = useTrickStore((s) => s[k]);
  const setInput = useTrickStore((s) => s.setInput);
  // In a game: where the value sits against the trick's landing zone, and the forecast it is described by (ADR-83).
  const place = useTrickStore((s) => (k === 'pop' ? null : sliderPlace(s, k)));
  const forecast = useTrickStore((s) => sliderForecast(s) !== null);
  const { min, max, step } = INPUT_LIMITS[k];
  const id = `input-${k}`;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {INPUT_NAMES[k]}
        <span className="visually-hidden">, {HELP[k].toLowerCase()}</span>
      </label>
      <output className="field__value" htmlFor={id} aria-hidden="true">
        {displayValue(k, value)}
        <span className="field__unit">{displayUnit(k, value)}</span>
      </output>
      <div className="field__track">
        {k !== 'pop' && <ZoneBand k={k} />}
        <input
          id={id}
          className="field__range"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-valuetext={place ? `${valueText(k, value)}, ${ZONE_WORDS[place]}` : valueText(k, value)}
          aria-describedby={forecast ? FORECAST_ID : undefined}
          onChange={(e) => setInput(k, Number(e.currentTarget.value))}
        />
      </div>
    </div>
  );
}

/**
 * What the sliders make if the pop is timed right (ADR-83): plain text, not a
 * live region, never announced on its own. On the game screen its line is
 * kept, empty, when there is nothing to say (the computer's go), so the tray
 * is the same height on every turn and the camera never refits between goes
 * (ADR-86).
 */
function Forecast() {
  const text = useTrickStore(sliderForecast);
  const game = useTrickStore((s) => s.screen === 'skate');
  if (!text) return game ? <p className="field__forecast" aria-hidden="true" /> : null;
  return (
    <p id={FORECAST_ID} className="field__forecast">
      {text}
    </p>
  );
}

export function Inputs() {
  return (
    <section className="panel" aria-labelledby="inputs-heading">
      <h2 id="inputs-heading" className="panel__title">
        Inputs
      </h2>
      <div className="inputs">
        {KEYS.map((k) => (
          <Field key={k} k={k} />
        ))}
      </div>
      <Forecast />
    </section>
  );
}
