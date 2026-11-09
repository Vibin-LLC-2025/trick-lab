import { useEffect, useState } from 'react';
import { stillFile } from '../asset/stillSpec';
import { useTrickStore } from '../store';

/** Longer than the fade (`--dur-slow`), in case its transitionend never comes (a tab in the background). */
const GONE_AFTER_MS = 1000;

/**
 * The loading picture (ADR-56): a still of the real scene in the theme
 * (src/asset/stillSpec.ts) over the stage, from the first paint until the
 * scene first shows the tier's real models (`stageReady`), so the stage is
 * never a blank box or the stand-in board. Then it fades out (no fade under
 * reduced motion) and leaves the DOM. It lifts at once if the 3D view fails
 * (the stage's note shows instead) or a trick plays first (the student sees
 * the trick, on the stand-in board if the model is still coming), and it
 * never comes back. If the file cannot load, the stage is as before.
 *
 * Decorative: empty alt and aria-hidden, like the canvas; #scene-description
 * is the stage's text. No pointer events, so the orbit works through it.
 */
export function StageStill() {
  const theme = useTrickStore((s) => s.theme);
  const reducedMotion = useTrickStore((s) => s.reducedMotion);
  const lift = useTrickStore((s) => s.stageReady || s.sceneUnavailable || s.status !== 'idle');
  // Sticky: a reset back to idle before the scene is ready does not bring it back.
  const [lifted, setLifted] = useState(false);
  if (lift && !lifted) setLifted(true);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!lifted || gone) return;
    const id = setTimeout(() => setGone(true), GONE_AFTER_MS);
    return () => clearTimeout(id);
  }, [lifted, gone]);

  if (gone || (lifted && reducedMotion)) return null;
  return (
    <img
      className="app__still"
      data-lifted={lifted || undefined}
      src={`${import.meta.env.BASE_URL}${stillFile(theme)}`}
      alt=""
      aria-hidden="true"
      decoding="async"
      onTransitionEnd={() => setGone(true)}
      onError={() => setGone(true)}
    />
  );
}
