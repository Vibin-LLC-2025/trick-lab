import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { computeFlight } from '../sim/flight';
import { useTrickStore } from '../store';
import { ART } from './artDirection';
import { buildFootPaths } from './footPathGeometry';
import { isNodeRenderer } from './rendererKind';
import { shaderMat } from './resources';

const REST_Y = ART.board.restY;

/**
 * The route of each shoe through the trick (DESIGN.md 8.5). Before the first
 * pop it shows the flight the current inputs would make, so the planned path
 * moves with the sliders; after a pop it shows that flight. The geometry is
 * rebuilt only when that changes and disposed when replaced. No per-frame
 * code: FlightDriver moves the material's playhead.
 */
export function FootPaths() {
  const flight = useTrickStore((s) => s.flight);
  // With a flight in hand the inputs do not matter (the feet follow the
  // flight's own inputs), so they drop out of the dependencies.
  const pop = useTrickStore((s) => (s.flight ? 0 : s.pop));
  const flick = useTrickStore((s) => (s.flight ? 0 : s.flick));
  const scoop = useTrickStore((s) => (s.flight ? 0 : s.scoop));
  // Regular mirrors the feet along X (ADR-25), so the trails rebuild on a stance change.
  const stance = useTrickStore((s) => s.stance);
  // The GLSL material on WebGLRenderer, its TSL twin on WebGPURenderer (ADR-50).
  const nodeRenderer = useThree((s) => isNodeRenderer(s.gl));

  const geometry = useMemo(() => {
    const inputs = flight?.inputs ?? { pop, flick, scoop };
    return buildFootPaths(inputs, flight ?? computeFlight(inputs), stance);
  }, [flight, pop, flick, scoop, stance]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return <mesh geometry={geometry} material={shaderMat('footPath', nodeRenderer)} position={[0, REST_Y, 0]} renderOrder={2} />;
}
