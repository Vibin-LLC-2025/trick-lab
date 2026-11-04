import { geo, mat } from './resources';

/** Concrete pad: slab, darker edge line, centre mark under the resting board. Static, 3 draw calls. */
export function Pad() {
  return (
    <group>
      <mesh geometry={geo.pad} material={mat.pad} />
      <lineSegments geometry={geo.padEdges} material={mat.padEdge} />
      <mesh geometry={geo.padMark} material={mat.padMark} />
    </group>
  );
}
