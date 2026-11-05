import { displayUnit, displayValue, INPUT_NAMES, valueText } from '../sim/format';
import { INPUT_LIMITS, type InputKey } from '../sim/tricks';
import { useTrickStore } from '../store';

const KEYS: InputKey[] = ['pop', 'flick', 'scoop'];

const HELP: Record<InputKey, string> = {
  pop: 'Peak height of the jump',
  // Signed rates (ADR-30): the slider is centred on 0 and the side picks the direction.
  flick: 'Flip rate about the long axis: right for a kickflip, left for a heelflip',
  scoop: 'Shove rate about the vertical axis: right for backside, left for frontside',
};

function Field({ k }: { k: InputKey }) {
  const value = useTrickStore((s) => s[k]);
  const setInput = useTrickStore((s) => s.setInput);
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
      <input
        id={id}
        className="field__range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText(k, value)}
        onChange={(e) => setInput(k, Number(e.currentTarget.value))}
      />
    </div>
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
    </section>
  );
}
