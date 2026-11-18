// The adaptive resolution's one controller (ADR-109, adaptiveResolution.ts),
// apart from perfStats.ts so the DOM's PerfBadge does not pull the scene's
// numbers into the main script.
import { newAdaptive } from './adaptiveResolution';
import { ART } from './artDirection';

/**
 * The adaptive resolution's controller (ADR-109, adaptiveResolution.ts):
 * stepped by PerfProbe on frames it draws, reset when a Canvas (a tier)
 * mounts, its scale read by TrickScene for the Canvas's pixel ratio. Made once.
 */
export const adaptive = newAdaptive(ART.adaptive);

const scaleListeners = new Set<() => void>();
/** TrickScene's subscription to the scale (useSyncExternalStore): told only when it changes. */
export const subscribeScale = (listener: () => void) => {
  scaleListeners.add(listener);
  return () => {
    scaleListeners.delete(listener);
  };
};
/** Tells TrickScene the scale changed (a rare event, never per frame). */
export const scaleChanged = () => {
  for (const listener of scaleListeners) listener();
};
