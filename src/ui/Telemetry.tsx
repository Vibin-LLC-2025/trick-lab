import { degReadout, outcomeCard, seconds, spinReadout } from '../sim/format';
import { useTrickStore } from '../store';

const NONE = 'not yet';

function OutcomeCard() {
  const result = useTrickStore((s) => s.result);
  const status = useTrickStore((s) => s.status);

  // No role="status" here: the single Announcer is the live region, so the
  // result is not read twice.
  if (result) {
    const card = outcomeCard(result);
    return (
      <div className={`outcome ${result.landed ? 'outcome--landed' : 'outcome--bailed'}`}>
        <p className="outcome__name">{card.name}</p>
        <p className="outcome__detail">{card.detail}</p>
      </div>
    );
  }
  const inAir = status === 'playing' || status === 'paused';
  return (
    <div className="outcome">
      <p className="outcome__name">{inAir ? 'In the air' : 'Set the board up and pop'}</p>
      <p className="outcome__detail">
        {inAir
          ? 'The result shows when the board lands.'
          : 'Pick a preset or move the sliders, then press Pop or Space.'}
      </p>
    </div>
  );
}

/** `dir` is a signed total's direction word (ADR-30), shown small under the number. */
function Row({ k, v, dir, bad }: { k: string; v: string | null; dir?: string; bad?: boolean }) {
  return (
    <div className="telemetry__row">
      <dt className="telemetry__k">{k}</dt>
      <dd className={`telemetry__v${v === null ? ' telemetry__v--none' : ''}${bad ? ' telemetry__v--bad' : ''}`}>
        {v ?? NONE}
        {v !== null && dir ? (
          <>
            {' '}
            <span className="telemetry__dir">{dir}</span>
          </>
        ) : null}
        {bad && <span className="visually-hidden">, off target</span>}
      </dd>
    </div>
  );
}

/**
 * The results headline (DESIGN.md 4 and 9): the outcome, then four numbers.
 * The trick name and the landed or bailed state are in the headline, so the
 * grid does not repeat them; the axis that missed is marked instead. "Air
 * spin" is the board's rate between the ramp-up and the catch (ADR-36), from
 * the flight on screen, so it shows as soon as the board is popped.
 */
export function Telemetry() {
  const r = useTrickStore((s) => s.result);
  const flight = useTrickStore((s) => s.flight);
  const missed = r && !r.landed ? r.failedAxis : null;

  return (
    <section className="panel" aria-labelledby="telemetry-heading">
      <h2 id="telemetry-heading" className="panel__title">
        Outcome
      </h2>
      <OutcomeCard />
      <dl className="telemetry">
        <Row k="Airtime" v={r ? `${seconds(r.airtime)} s` : null} />
        <Row k="Peak" v={r ? `${r.peak.toFixed(2)} m` : null} />
        <Row k="Flip" v={r ? degReadout('flip', r.rollTotal).value : null} dir={r ? degReadout('flip', r.rollTotal).dir : ''} bad={missed === 'flip'} />
        <Row k="Shove" v={r ? degReadout('shove', r.yawTotal).value : null} dir={r ? degReadout('shove', r.yawTotal).dir : ''} bad={missed === 'shove'} />
        <Row k="Air spin" v={flight ? spinReadout(flight) : null} />
      </dl>
    </section>
  );
}
