import { useEffect, useRef } from 'react';

/**
 * A question before something is lost (DESIGN.md 11 and 12.4): leaving a game
 * in play (ADR-46), clearing the records (ADR-64). A native modal dialog, so
 * focus is trapped, Esc keeps things as they are, and focus returns to the
 * opener. The keeping choice comes first, so showModal focuses it: the safe
 * choice is the default.
 */
export function ConfirmDialog({
  id,
  open,
  title,
  text,
  keep,
  go,
  onKeep,
  onGo,
}: {
  /** Prefix for the title's and the text's ids. */
  id: string;
  open: boolean;
  title: string;
  text: string;
  /** The safe choice's label, and what Esc does. */
  keep: string;
  /** The choice that loses something. */
  go: string;
  onKeep: () => void;
  onGo: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // jsdom lacks showModal/close; fall back to the open attribute.
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog ref={ref} className="confirm" aria-labelledby={`${id}-title`} aria-describedby={`${id}-text`} onClose={onKeep}>
      <h2 id={`${id}-title`} className="confirm__title">
        {title}
      </h2>
      <p id={`${id}-text`} className="confirm__text">
        {text}
      </p>
      <div className="confirm__actions">
        <button type="button" className="btn btn--primary" onClick={onKeep}>
          {keep}
        </button>
        <button type="button" className="btn btn--danger" onClick={onGo}>
          {go}
        </button>
      </div>
    </dialog>
  );
}
