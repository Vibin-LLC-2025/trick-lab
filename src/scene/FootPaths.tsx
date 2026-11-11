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
  // The shown inputs: the flight's while there is one, else the sliders'. A
  // flight is computeFlight of its inputs alone, so the same numbers give the
  // same paths: popping the sliders' own values, or a clear stage bringing
  // them back, rebuilds nothing.
  const pop = useTrickStore((s) => (s.flight ? s.flight.inputs.pop : s.pop));
  const flick = useTrickStore((s) => (s.flight ? s.flight.inputs.flick : s.flick));
  const scoop = useTrickStore((s) => (s.flight ? s.flight.inputs.scoop : s.scoop));
  // Regular mirrors the feet along X (ADR-25), so the trails rebuild on a stance change.
  const stance = useTrickStore((s) => s.stance);
  // The GLSL material on WebGLRenderer, its TSL twin on WebGPURenderer (ADR-50).
  const nodeRenderer = useThree((s) => isNodeRenderer(s.gl));

  const geometry = useMemo(() => {
    const inputs = { pop, flick, scoop };
    return buildFootPaths(inputs, computeFlight(inputs), stance);
  }, [pop, flick, scoop, stance]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return <mesh geometry={geometry} material={shaderMat('footPath', nodeRenderer)} position={[0, REST_Y, 0]} renderOrder={2} />;
}
