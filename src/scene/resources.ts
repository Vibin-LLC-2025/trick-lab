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

const G = ART.ground;

/**
 * The untextured ground (Low, and the Medium and High fallback while
 * ground.glb streams or if it fails): one quad on y = 0 the size of the
 * GLB's plane, facing up. Two triangles, one draw call.
 */
function groundPlane() {
  const g = new THREE.PlaneGeometry(G.size[0], G.size[1]);
  g.rotateX(-Math.PI / 2);
  return g;
}

const S = ART.shadow;

/**
 * Medium and Low ground shadow (DESIGN.md 2): a flat ellipse the size of the
 * board, long axis X, in the pad plane. A centre vertex and two rings: alpha 1
 * out to `core` of the radius, 0 at the rim, so the edge is soft. White
 * vertex colours with alpha; the material carries the colour and FlightDriver
 * the overall opacity.
 */
function shadowFootprint() {
  const n = S.segments;
  const pos = new Float32Array((1 + 2 * n) * 3);
  const col = new Float32Array((1 + 2 * n) * 4).fill(1);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * S.halfLength;
    const z = Math.sin(a) * S.halfWidth;
    const inner = 1 + i;
    const outer = 1 + n + i;
    pos.set([x * S.core, 0, z * S.core], inner * 3);
    pos.set([x, 0, z], outer * 3);
    col[outer * 4 + 3] = 0;
  }
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // Wound so the faces point up (+Y) when seen from above.
    index.push(0, 1 + j, 1 + i);
    index.push(1 + i, 1 + j, 1 + n + i, 1 + j, 1 + n + j, 1 + n + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  g.setIndex(index);
  return g;
}

const FT = ART.feet;
const FP = ART.footPaths;

/**
 * Foot paths (footPathGeometry.ts): vertex colour per foot, opaque where the
 * per-vertex progress `aU` is behind the playhead, `uGhost` ahead of it, and
 * lifted toward white for `uHead` just behind it.  * Unlit, not tone mapped.
 * FlightDriver writes `uProgress` each frame (a number, no allocation).
 * No fog (a ShaderMaterial's `fog` is false by default, and it stays so): the
 * trails stay within a metre of the board, well inside ART.fog.near.
 */
const footPathMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0 },
      uGhost: { value: FP.ghost },
      uHead: { value: FP.head.width },
      uLighten: { value: FP.head.lighten },
    },
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aU;
      varying float vU;
      varying vec3 vColor;
      void main() {
        vU = aU;
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uProgress;
      uniform float uGhost;
      uniform float uHead;
      uniform float uLighten;
      varying float vU;
      varying vec3 vColor;
      void main() {
        float done = step(vU, uProgress + 1e-4);
        float head = done * (1.0 - smoothstep(0.0, uHead, uProgress - vU));
        vec3 rgb = mix(vColor, vec3(1.0), head * uLighten);
        gl_FragColor = vec4(rgb, mix(uGhost, 1.0, done));
        #include <colorspace_fragment>
      }`,
  });
/**
 * One primitive shoe (right foot; the left is mirrored by the Feet component):
 * a sole slab with its bottom at y = 0 and an upper box on top, toe at +X.
 * Two geometries so sole and upper keep their own material.
 */
const shoeSole = mergedBoxes([{ size: [FT.sole.length, FT.sole.height, FT.sole.width], at: [0, FT.sole.height / 2, 0] }]);
const shoeUpper = mergedBoxes([
  {
    size: [FT.sole.length - FT.upper.lengthInset * 2, FT.upper.height, FT.sole.width - FT.upper.widthInset * 2],
    at: [-FT.upper.lengthInset, FT.sole.height + FT.upper.height / 2, 0],
  },
]);

export const geo = {
  shoeSole,
  shoeUpper,
  deckWood: mergedBoxes(deckSegments(D.thickness, D.width, 0, 0)),
  deckGrip: mergedBoxes(deckSegments(D.skin.thickness, skinWidth, D.skin.inset * 2, skinOffset)),
  deckGraphic: mergedBoxes(deckSegments(D.skin.thickness, skinWidth, D.skin.inset * 2, -skinOffset)),
  trucks: mergedBoxes([
    { size: T.size, at: [T.x, T.y, 0] },
    { size: T.size, at: [-T.x, T.y, 0] },
  ]),
  wheels: wheels(),
  ground: groundPlane(),
  shadow: shadowFootprint(),
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
  ground: std(G.color, G.roughness),
  shoeSole: std(FT.sole.color, FT.sole.roughness),
  shoeUpper: std(FT.upper.color, FT.upper.roughness),
  // uProgress is mutated by FlightDriver; never swapped.
  footPath: footPathMaterial(),
  // Opacity is mutated by FlightDriver as the board rises; never swapped.
  shadow: new THREE.MeshBasicMaterial({
    color: S.color,
    vertexColors: true,
    transparent: true,
    opacity: S.opacity.ground,
    depthWrite: false,
  }),
  // Motion cues (motionCueGeometry.ts, DESIGN.md 8.7): vertex colour per
  // foot, unlit and not tone mapped so they match the trails and the legend.
  // Pulled toward the camera in depth so they never z-fight the grip; no depth
  // writes, so the shoes and the board still hide them. FlightDriver mutates
  // the opacity to fade them in flight; never swapped.
  motionCues: new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: ART.motionCues.opacity,
    depthWrite: false,
    toneMapped: false,
    // Double-sided because a mirrored (regular) build flips the winding; one
    // pass, since a flat overlay needs no back-to-front split (one draw call).
    side: THREE.DoubleSide,
    forceSinglePass: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  }),
};

export function disposeSharedResources() {
  Object.values(geo).forEach((g) => g.dispose());
  Object.values(mat).forEach((m) => m.dispose());
}
