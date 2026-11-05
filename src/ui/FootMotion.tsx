import { useMemo } from 'react';
import { footSteps, type FootStep } from '../sim/format';
import { useTrickStore } from '../store';

const WHO: Record<FootStep['foot'], string> = { front: 'Front foot', back: 'Back foot', both: 'Both feet' };
const NAMED = /^(Front foot|Back foot|Both feet) /;

/**
 * "Foot motion" (DESIGN.md 8.5): the steps each foot takes for the current
 * inputs, or for the flight on screen, in order. It is the text equivalent of
 * the foot trails and uses their colours as swatches (position and the words
 * "front" and "back" carry the meaning too). While a flight plays or is
 * scrubbed, the steps under the playhead are marked "now" (a filled step
 * number, a tinted row and bold text; DESIGN.md 9). Not a live region: the
 * playhead moves too often to announce.
 */
export function FootMotion() {
  const flight = useTrickStore((s) => s.flight);
  const pop = useTrickStore((s) => s.pop);
  const flick = useTrickStore((s) => s.flick);
  const scoop = useTrickStore((s) => s.scoop);
  const progress = useTrickStore((s) => s.progress);
  const status = useTrickStore((s) => s.status);
  const steps = useMemo(() => footSteps({ flight, pop, flick, scoop }), [flight, pop, flick, scoop]);
  const moving = flight !== null && status !== 'idle';

  return (
    <section className="panel" aria-labelledby="foot-motion-heading">
      <div className="panel__head">
        <h2 id="foot-motion-heading" className="panel__title">
          Foot motion
        </h2>
        <p className="foot-steps__legend">
          <span className="foot-steps__key">
            <span className="foot-steps__swatch foot-steps__swatch--front" aria-hidden="true" />
            Front<span className="visually-hidden"> foot, blue trail.</span>
          </span>{' '}
          <span className="foot-steps__key">
            <span className="foot-steps__swatch foot-steps__swatch--back" aria-hidden="true" />
            Back<span className="visually-hidden"> foot, yellow trail.</span>
          </span>
        </p>
      </div>
      <ol className="foot-steps">
        {steps.map((step) => {
          const now = moving && progress >= step.start && progress <= step.end && !(progress >= 1 && step.end < 1);
          return (
            <li key={step.text} className={`foot-step foot-step--${step.foot}${now ? ' foot-step--now' : ''}`}>
              {/* A sentence that does not open with the foot (the bail) keeps the dot; its name is read, not shown. */}
              <span className="foot-step__who">
                {NAMED.test(step.text) ? WHO[step.foot] : <span className="visually-hidden">{WHO[step.foot]}:</span>}
              </span>{' '}
              <span className="foot-step__text">{step.text.replace(NAMED, '')}</span>
              {now && <span className="visually-hidden">, now</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
