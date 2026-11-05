import { useEffect, useMemo } from 'react';
import { useTrickStore } from '../store';
import { buildMotionCues } from './motionCueGeometry';
import { mat } from './resources';

/**
 * Motion cues (ADR-26, DESIGN.md 8.7): flat arrows on the grip showing how
 * each shoe will move against the deck. A child of the Board's outer group,
 * so the cues ride with the deck. Before a pop they follow the sliders; with
 * a flight on screen they show that flight's inputs. Pop height does not
 * change where the feet go against the deck, so it is not a dependency. The
 * geometry is rebuilt only when flick, scoop, the flight or the stance
 * change, and disposed when replaced. No per-frame code: FlightDriver fades
 * the shared material.
 */
export function MotionCues() {
  const flight = useTrickStore((s) => s.flight);
  const flick = useTrickStore((s) => (s.flight ? 0 : s.flick));
  const scoop = useTrickStore((s) => (s.flight ? 0 : s.scoop));
  const stance = useTrickStore((s) => s.stance);

  const geometry = useMemo(
    () => buildMotionCues(flight?.inputs ?? { pop: 0, flick, scoop }, stance),
    [flight, flick, scoop, stance],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  return <mesh geometry={geometry} material={mat.motionCues} renderOrder={3} />;
}
