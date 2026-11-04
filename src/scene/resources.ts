// Geometries and materials shared by every mesh in the scene. Created once at
// module load; static parts are merged so each material is one draw call.
// TrickScene calls disposeSharedResources() on unmount; three.js re-uploads a
// disposed resource on next use, so a remount is safe.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ART } from './artDirection';

type Box = { size: readonly [number, number, number]; at: readonly [number, number, number]; rotZ?: number };

/** Several static boxes baked into one geometry: one draw call instead of N. */
function mergedBoxes(boxes: Box[]) {
  const parts = boxes.map(({ size, at, rotZ = 0 }) => {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    g.rotateZ(rotZ);
    g.translate(at[0], at[1], at[2]);
    return g;
  });
  const merged = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return merged;
}

const D = ART.board.deck;

/**
 * The deck as three segments (tail kick, flat middle, nose kick), each a box
 * tilted about Z. `offset` pushes a segment along its own normal, which is how
 * the grip (+) and graphic (-) skins sit on the faces of the wood core.
 */
function deckSegments(thickness: number, width: number, lengthTrim: number, offset: number): Box[] {
  const half = D.flatLength / 2;
  const k = D.kick;
  const seg = (cx: number, cy: number, angle: number, length: number): Box => ({
    size: [length - lengthTrim, thickness, width],
    at: [cx - Math.sin(angle) * offset, cy + Math.cos(angle) * offset, 0],
    rotZ: angle,
  });
  const kx = half + (Math.cos(k.angle) * k.length) / 2;
  const ky = (Math.sin(k.angle) * k.length) / 2;
  return [seg(-kx, ky, -k.angle, k.length), seg(0, 0, 0, D.flatLength), seg(kx, ky, k.angle, k.length)];
}

const skinOffset = D.thickness / 2 + D.skin.thickness / 2;
const skinWidth = D.width - D.skin.inset * 2;

const T = ART.board.trucks;
const W = ART.board.wheels;

function wheels() {
  const parts = [
    [W.x, W.z],
    [W.x, -W.z],
    [-W.x, W.z],
    [-W.x, -W.z],
  ].map(([x, z]) => {
    const g = new THREE.CylinderGeometry(W.radius, W.radius, W.width, 16);
    g.rotateX(Math.PI / 2); // axle along Z
    g.translate(x!, W.y, z!);
    return g;
  });
  const merged = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return merged;
}

const P = ART.pad;
const padBox = new THREE.BoxGeometry(P.size[0], P.size[1], P.size[2]);
padBox.translate(P.center[0], P.center[1], P.center[2]);

const S = ART.shadow;
const shadowDisc = new THREE.CircleGeometry(S.radius, S.segments);
shadowDisc.rotateX(-Math.PI / 2);

export const geo = {
  deckWood: mergedBoxes(deckSegments(D.thickness, D.width, 0, 0)),
  deckGrip: mergedBoxes(deckSegments(D.skin.thickness, skinWidth, D.skin.inset * 2, skinOffset)),
  deckGraphic: mergedBoxes(deckSegments(D.skin.thickness, skinWidth, D.skin.inset * 2, -skinOffset)),
  trucks: mergedBoxes([
    { size: T.size, at: [T.x, T.y, 0] },
    { size: T.size, at: [-T.x, T.y, 0] },
  ]),
  wheels: wheels(),
  pad: padBox,
  padEdges: new THREE.EdgesGeometry(padBox),
  padMark: mergedBoxes([{ size: P.mark.size, at: [0, P.mark.y, 0] }]),
  shadow: shadowDisc,
};

const B = ART.board;
const std = (color: string, roughness: number, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

export const mat = {
  grip: std(B.grip.color, B.grip.roughness),
  graphic: std(B.graphic.color, B.graphic.roughness),
  wood: std(B.wood.color, B.wood.roughness),
  trucks: std(T.color, T.roughness, T.metalness),
  wheels: std(W.color, W.roughness),
  pad: std(P.color, P.roughness),
  padMark: std(P.mark.color, 1),
  padEdge: new THREE.LineBasicMaterial({ color: P.edge }),
  // Opacity is mutated by FlightDriver as the board rises; never swapped.
  shadow: new THREE.MeshBasicMaterial({
    color: S.color,
    transparent: true,
    opacity: S.opacity.ground,
    depthWrite: false,
  }),
};

export function disposeSharedResources() {
  Object.values(geo).forEach((g) => g.dispose());
  Object.values(mat).forEach((m) => m.dispose());
}
