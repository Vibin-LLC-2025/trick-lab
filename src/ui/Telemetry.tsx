import { deg, outcomeCard, seconds } from '../sim/format';
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

function Row({ k, v, tone }: { k: string; v: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="telemetry__row">
      <dt className="telemetry__k">{k}</dt>
      <dd className={`telemetry__v${tone ? ` telemetry__v--${tone}` : ''}`}>{v}</dd>
    </div>
  );
}

export function Telemetry() {
  const r = useTrickStore((s) => s.result);

  return (
    <section className="panel" aria-labelledby="telemetry-heading">
      <h2 id="telemetry-heading" className="panel__title">
        Telemetry
      </h2>
      <OutcomeCard />
      <dl className="telemetry">
        <Row k="Airtime" v={r ? `${seconds(r.airtime)} s` : NONE} />
        <Row k="Peak height" v={r ? `${r.peak.toFixed(2)} m` : NONE} />
        <Row k="Flip rotation" v={r ? `${deg(r.rollTotal)}°` : NONE} />
        <Row k="Shove rotation" v={r ? `${deg(r.yawTotal)}°` : NONE} />
        <Row
          k="Outcome"
          v={r ? (r.landed ? 'landed' : `${r.outcome} ${r.failedAxis}`) : NONE}
          tone={r ? (r.landed ? 'good' : 'bad') : undefined}
        />
        <Row k="Trick" v={r ? r.name : NONE} />
      </dl>
    </section>
  );
}
