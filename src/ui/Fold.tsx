import type { ReactNode } from 'react';
import { useTrickStore, type LabFold } from '../store';

/**
 * A heading whose button opens and closes a section of the lab (ADR-47,
 * DESIGN.md 13): the disclosure pattern, so heading navigation still finds
 * it and the button says expanded or collapsed. The body is rendered only
 * while open, so a closed section costs nothing.
 */
function FoldHeading({ fold, title, count, level }: { fold: LabFold; title: string; count?: ReactNode; level: 2 | 3 }) {
  const open = useTrickStore((s) => s.labFolds[fold]);
  const toggle = useTrickStore((s) => s.toggleLabFold);
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <H id={`fold-${fold}-heading`} className={level === 2 ? 'panel__title fold__heading' : 'fold__heading fold__heading--sub'}>
      <button type="button" className="fold__toggle" aria-expanded={open} aria-controls={`fold-${fold}`} onClick={() => toggle(fold)}>
        {title}
        {count !== undefined && (
          <>
            {' '}
            <span className="panel__count">{count}</span>
          </>
        )}
      </button>
    </H>
  );
}

function FoldBody({ fold, children }: { fold: LabFold; children: ReactNode }) {
  const open = useTrickStore((s) => s.labFolds[fold]);
  return (
    <div id={`fold-${fold}`} className="fold__body" hidden={!open}>
      {open && children}
    </div>
  );
}

/** A whole lab panel that opens and closes. `actions` (Download JSON, Reset view) sit in its header, open or not. */
export function FoldPanel({
  fold,
  title,
  count,
  actions,
  children,
}: {
  fold: LabFold;
  title: string;
  count?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel fold" aria-labelledby={`fold-${fold}-heading`}>
      <div className="panel__head">
        <FoldHeading fold={fold} title={title} count={count} level={2} />
        {actions}
      </div>
      <FoldBody fold={fold}>{children}</FoldBody>
    </section>
  );
}

/** A part of a panel that opens and closes, under an h3 (the flight numbers under the outcome). */
export function FoldPart({ fold, title, children }: { fold: LabFold; title: string; children: ReactNode }) {
  return (
    <div className="fold fold--part">
      <FoldHeading fold={fold} title={title} level={3} />
      <FoldBody fold={fold}>{children}</FoldBody>
    </div>
  );
}
