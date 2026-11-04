import { OBJECTIVES } from '../sim/tricks';
import { useTrickStore } from '../store';

export function Objectives() {
  const completed = useTrickStore((s) => s.completed);

  return (
    <section className="panel" aria-labelledby="objectives-heading">
      <h2 id="objectives-heading" className="panel__title">
        Objectives {completed.length} of {OBJECTIVES.length}
      </h2>
      <ol className="objectives">
        {OBJECTIVES.map((o) => {
          const done = completed.includes(o.id);
          return (
            <li key={o.id} className={`objective${done ? ' objective--done' : ''}`}>
              <span className="objective__check" aria-hidden="true">
                {done ? '✓' : ''}
              </span>
              <span className="objective__text">{o.label}</span>
              <span className="visually-hidden">{done ? ', done' : ', not done'}</span>
            </li>
          );
        })}
      </ol>
      <p>Bonus (not scored): land any preset at pop 0.20 m or lower by raising flick or scoop yourself.</p>
    </section>
  );
}
