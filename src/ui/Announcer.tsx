import { useTrickStore } from '../store';

/**
 * The single polite live region. Store actions call `announce`; this only
 * renders. A trailing no-break space alternates with the nonce so a repeated
 * identical message still changes the DOM and is read again.
 */
export function Announcer() {
  const { message, nonce } = useTrickStore((s) => s.announcement);
  return (
    <div id="announcer" className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {message}
      {nonce % 2 === 1 ? ' ' : ''}
    </div>
  );
}
