import { useEffect, useState } from 'react';
import { useTrickStore } from '../store';

/** How long the celebration stays: the stamp, a hold, the fade (app.css). Tested. */
export const CELEBRATION_MS = 1800;

/**
 * A short celebration over the stage when the student lands a trick that
 * counts (ADR-57): the store's `celebration` (a landing in the lab, a set or
 * copy made in a game; never the computer's, never the welcome preview).
 * DOM over the stage, never inside the Canvas (rule 3): an orange sticker
 * stamps in with the trick's name under it, holds and fades. It shouts
 * "Clean!" for a clean landing and "Landed!" for a sketchy one (ADR-63). Under
 * reduced motion the calm version: the same stickers, still, shown and then
 * gone with no movement. One per landing (keyed on the nonce); one already
 * there when this mounts (a screen change) is not replayed. Decorative and
 * aria-hidden: the result's announcement already says the trick landed. No
 * pointer events, so the orbit works through it.
 */
export function Celebration() {
  const celebration = useTrickStore((s) => s.celebration);
  const calm = useTrickStore((s) => s.reducedMotion);
  const unavailable = useTrickStore((s) => s.sceneUnavailable);
  // The landing already celebrated when this mounted, and the last one played to its end.
  const [seen] = useState(() => useTrickStore.getState().celebration?.nonce ?? 0);
  const [ended, setEnded] = useState(0);
  const nonce = celebration?.nonce ?? 0;
  const active = celebration !== null && nonce > seen && nonce > ended && !unavailable;

  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => setEnded(nonce), CELEBRATION_MS);
    return () => clearTimeout(id);
  }, [active, nonce]);

  if (!active) return null;
  return (
    <div key={nonce} className="celebration" data-calm={calm || undefined} aria-hidden="true">
      <span className="celebration__shout">{celebration.clean ? 'Clean!' : 'Landed!'}</span>
      <span className="celebration__trick">{celebration.trick}</span>
    </div>
  );
}
