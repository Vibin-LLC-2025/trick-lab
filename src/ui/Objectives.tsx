import { OBJECTIVES } from '../sim/tricks';
import { useTrickStore } from '../store';
import { FoldPanel } from './Fold';

/** The seven objectives, a section that opens (ADR-47); the count shows on its button either way. */
export function Objectives() {
  const completed = useTrickStore((s) => s.completed);

  return (
    <FoldPanel fold="objectives" title="Objectives" count={`${completed.length} of ${OBJECTIVES.length}`}>
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
      <p className="panel__note">Bonus (not scored): land any preset at pop 0.20 m or lower by raising flick or scoop yourself.</p>
    </FoldPanel>
  );
}
