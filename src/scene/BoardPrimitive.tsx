import { ART } from './artDirection';
import { geo, mat } from './resources';

/**
 * The primitive skateboard (was Board.tsx before the realistic board pass,
 * 2026-11-04): wood core with raised nose and tail kicks, a black grip skin on
 * top and an orange graphic skin underneath, two trucks and four wheels. Five
 * draw calls, about 440 triangles, no textures.
 *
 * It is the Suspense fallback while the GLB streams, the error fallback if
 * the GLB cannot load, and the "Low" board detail level (the Chromebook escape
 * hatch). Its numbers are DESIGN.md section 2's, so it is lifted by
 * `primitiveLift` to put its wheels on the pad at the GLB rest height.
 */
export function BoardPrimitive() {
  return (
    <group position-y={ART.board.primitiveLift}>
      <mesh geometry={geo.deckWood} material={mat.wood} />
      <mesh geometry={geo.deckGrip} material={mat.grip} />
      <mesh geometry={geo.deckGraphic} material={mat.graphic} />
      <mesh geometry={geo.trucks} material={mat.trucks} />
      <mesh geometry={geo.wheels} material={mat.wheels} />
    </group>
  );
}
