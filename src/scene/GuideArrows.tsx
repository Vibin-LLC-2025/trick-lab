import { useEffect, useMemo } from 'react';
import { guidesShown, useTrickStore } from '../store';
import { buildGuideArrows } from './guideArrowGeometry';
import { mat } from './resources';

/** The arrows themselves, rebuilt only when a slider or the stance changes, and disposed when replaced. */
function Arrows() {
  const pop = useTrickStore((s) => s.pop);
  const flick = useTrickStore((s) => s.flick);
  const scoop = useTrickStore((s) => s.scoop);
  const stance = useTrickStore((s) => s.stance);
  const geometry = useMemo(() => buildGuideArrows({ pop, flick, scoop }, stance), [pop, flick, scoop, stance]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={mat.guides} />;
}

/**
 * The slider guides (ADR-82, DESIGN.md 11.5): three arrows round the board at
 * rest that show what pop, flick and scoop will do, following the sliders.
 * Only on the player's turn in a game, before the pop, on Medium and High
 * (`guidesShown`). In world space beside the board, never under the groups
 * FlightDriver moves; no per-frame code. One draw call while shown.
 * Decorative: the sliders' own value text says the same.
 */
export function GuideArrows() {
  const shown = useTrickStore(guidesShown);
  return shown ? <Arrows /> : null;
}
