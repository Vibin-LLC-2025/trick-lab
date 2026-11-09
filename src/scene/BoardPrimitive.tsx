import { useTrickStore } from '../store';
import { geo, mat } from './resources';
import { sceneTier } from './sceneTier';

/**
 * The primitive skateboard (ADR-54, 2026-11-09): the real deck mesh (the
 * Medium GLB's outline, kicks and concave) and the trucks and wheels at the
 * GLB's own places, coloured per vertex, so two draw calls and no textures
 * (was five draw calls of boxes and cylinders). Built at the GLB's
 * coordinates, so it rests on the pad at the same height with no lift.
 *
 * It is Low's board, toon shaded (ART.low), and on Medium and High the
 * Suspense fallback while the GLB streams and the error fallback if it
 * cannot load, with one standard material.
 */
export function BoardPrimitive() {
  const low = useTrickStore(sceneTier) === 'low';
  const material = low ? mat.toonBoard : mat.boardPrimitive;
  return (
    <group>
      <mesh geometry={geo.boardDeck} material={material} />
      <mesh geometry={geo.boardHardware} material={material} />
    </group>
  );
}
