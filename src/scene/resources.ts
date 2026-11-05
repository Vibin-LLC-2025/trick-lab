// Geometries and materials shared by every mesh in the scene. Created once at
// module load; static parts are merged so each material is one draw call.
// TrickScene calls disposeSharedResources() on unmount; three.js re-uploads a
// disposed resource on next use, so a remount is safe.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LEG } from '../sim/legs';
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

/** Instances in the ground shadow mesh (ADR-38): board soft, board contact, front foot, back foot. */
export const SHADOW_INSTANCES = 4;

/**
 * Medium and Low ground shadows (ADR-38, DESIGN.md 2): one unit soft disc in
 * the pad plane, scaled per instance into each footprint (FlightDriver writes
 * the instance matrices). A centre vertex and two rings: `aAlpha` 1 out to
 * `core` of the radius, 0 at the rim, so the edge is soft. `aOpacity` is
 * per instance, written by FlightDriver every frame (four numbers, no
 * allocation); the material carries the colour.
 */
function shadowFootprint() {
  const n = S.segments;
  const pos = new Float32Array((1 + 2 * n) * 3);
  const alpha = new Float32Array(1 + 2 * n).fill(1);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a);
    const z = Math.sin(a);
    const inner = 1 + i;
    const outer = 1 + n + i;
    pos.set([x * S.core, 0, z * S.core], inner * 3);
    pos.set([x, 0, z], outer * 3);
    alpha[outer] = 0;
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
  g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const opacity = new THREE.InstancedBufferAttribute(new Float32Array(SHADOW_INSTANCES), 1);
  opacity.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aOpacity', opacity);
  // Which instances are feet (2 and 3): their fragments draw only what they add over the board.
  g.setAttribute('aFoot', new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 1, 1]), 1));
  g.setIndex(index);
  return g;
}

/**
 * The ground shadows' material: the shadow colour at the vertex alpha times
 * the instance's opacity. Same blending as the old MeshBasicMaterial
 * (transparent, no depth write), tone mapped and converted to the output
 * colour space like it; no fog (the shadows stay under the board, well
 * inside ART.fog.near).
 * The union (ADR-38): a foot's fragment evaluates the board's soft and
 * contact ellipses at its ground point (uniforms FlightDriver writes each
 * frame: centre x z and cos, sin of the yaw; both half extents; both
 * opacities) and draws only (foot - board) / (1 - board), so blended over the
 * board the pad shows max(board, foot), never the two stacked.
 * groundShadow.ts mirrors this for the tests (footDrawnAlpha).
 */
const shadowMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(S.color) },
      uCore: { value: S.core },
      uBoard: { value: new THREE.Vector4(0, 0, 1, 0) },
      uBoardSize: { value: new THREE.Vector4(S.halfLength, S.halfWidth, S.halfLength, S.halfWidth) },
      uBoardOpacity: { value: new THREE.Vector2(0, 0) },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      attribute float aOpacity;
      attribute float aFoot;
      varying float vAlpha;
      varying float vFoot;
      varying vec2 vGround;
      void main() {
        vAlpha = aAlpha * aOpacity;
        vFoot = aFoot;
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        vGround = (modelMatrix * p).xz;
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uCore;
      uniform vec4 uBoard;
      uniform vec4 uBoardSize;
      uniform vec2 uBoardOpacity;
      varying float vAlpha;
      varying float vFoot;
      varying vec2 vGround;
      float disc(float r) {
        return r <= uCore ? 1.0 : clamp((1.0 - r) / (1.0 - uCore), 0.0, 1.0);
      }
      void main() {
        float a = vAlpha;
        if (vFoot > 0.5) {
          vec2 d = vGround - uBoard.xy;
          vec2 l = vec2(d.x * uBoard.z - d.y * uBoard.w, d.x * uBoard.w + d.y * uBoard.z);
          float soft = uBoardOpacity.x * disc(length(l / uBoardSize.xy));
          float contact = uBoardOpacity.y * disc(length(l / uBoardSize.zw));
          float b = 1.0 - (1.0 - soft) * (1.0 - contact);
          a = max(a - b, 0.0) / max(1.0 - b, 1e-4);
        }
        gl_FragColor = vec4(uColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

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

const LG = ART.legs;

/** A point of a leg segment's profile: radius at y along the segment, its colour and alpha. */
type ProfilePoint = { r: number; y: number; color: string; alpha: number };

/** A cap's quarter circle from the axis (y0 - r) out to radius r at y0 (`dir` -1), or from r at y0 to the axis at y0 + r (`dir` +1). */
function cap(r: number, y0: number, dir: 1 | -1, color: string, alpha: number): ProfilePoint[] {
  const n = LG.capSegments;
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (Math.PI / 2) * (dir < 0 ? i / n - 1 : i / n);
    return { r: r * Math.cos(a), y: y0 + r * Math.sin(a), color, alpha };
  });
}

/**
 * One rigid leg segment for the skinned leg meshes (ADR-37): a tapered
 * capsule turned about +Y from the profile (y 0 at the proximal joint,
 * increasing toward the distal one), every vertex weighted 1 to `bone`, the
 * colour (and alpha, with `alpha`) from its profile point. Built once.
 */
function legSegment(profile: ProfilePoint[], bone: number, alpha: boolean) {
  const g = new THREE.LatheGeometry(
    profile.map((p) => new THREE.Vector2(p.r, p.y)),
    LG.radialSegments,
  );
  const count = g.attributes.position!.count;
  const size = alpha ? 4 : 3;
  const colors = new Float32Array(count * size);
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const c = new THREE.Color();
  for (let v = 0; v < count; v++) {
    // LatheGeometry writes the profile once per radial step, in order.
    const p = profile[v % profile.length]!;
    c.set(p.color);
    colors[v * size] = c.r;
    colors[v * size + 1] = c.g;
    colors[v * size + 2] = c.b;
    if (alpha) colors[v * size + 3] = p.alpha;
    skinIndex[v * 4] = bone;
    skinWeight[v * 4] = 1;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, size));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  return g;
}

/** The shank, knee (y 0) to ankle (y LEG.shank): trouser to the hem, then sock into the shoe. */
function shankProfile(): ProfilePoint[] {
  const S = LG.shank;
  const L = LEG.shank;
  const hem = L - LG.hemAbove;
  return [
    ...cap(S.knee, 0, -1, LG.trouser, 1),
    { r: S.calf, y: S.calfAt * L, color: LG.trouser, alpha: 1 },
    { r: S.hem, y: hem, color: LG.trouser, alpha: 1 },
    // The hem: a step in to the sock at the same height.
    { r: S.sock, y: hem, color: LG.sock, alpha: 1 },
    { r: S.ankle, y: L, color: LG.sock, alpha: 1 },
    ...cap(S.ankle, L, 1, LG.sock, 1).slice(1),
  ];
}

/** The thigh, hip (y 0) to knee (y LEG.thigh), clear at the hip and opaque toward the knee. */
function thighProfile(): ProfilePoint[] {
  const T = LG.thigh;
  const L = LEG.thigh;
  const alpha = (y: number) => THREE.MathUtils.smoothstep(y, LG.fade.from * L, LG.fade.to * L);
  const mid = [0.12, 0.3, 0.5, 0.75].map((k) => ({
    r: THREE.MathUtils.lerp(T.hip, T.knee, k),
    y: k * L,
    color: LG.trouser,
    alpha: alpha(k * L),
  }));
  return [...cap(T.hip, 0, -1, LG.trouser, 0), ...mid, ...cap(T.knee, L, 1, LG.trouser, 1)];
}

/** Bone order in the leg skeleton (Legs.tsx): front thigh, front shank, back thigh, back shank. */
export const LEG_BONES = { frontThigh: 0, frontShank: 1, backThigh: 2, backShank: 3 } as const;

function mergedLegs(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return merged;
}

export const geo = {
  shoeSole,
  shoeUpper,
  /** Both shanks, opaque, one draw call (plus one shadow draw on High). */
  legsSolid: mergedLegs([
    legSegment(shankProfile(), LEG_BONES.frontShank, false),
    legSegment(shankProfile(), LEG_BONES.backShank, false),
  ]),
  /** Both thighs, fading toward the hips, one draw call, no shadow. */
  legsFade: mergedLegs([
    legSegment(thighProfile(), LEG_BONES.frontThigh, true),
    legSegment(thighProfile(), LEG_BONES.backThigh, true),
  ]),
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
  // The legs (ADR-37): white times the vertex colours (trouser and sock).
  legsSolid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: LG.roughness }),
  // The thighs: vertex alpha fades them toward the hips. No depth write, so a
  // faded thigh never hides the board, the shoes or the other leg behind it.
  legsFade: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: LG.roughness, transparent: true, depthWrite: false }),
  // uProgress is mutated by FlightDriver; never swapped.
  footPath: footPathMaterial(),
  // The ground shadows (ADR-38); the per-instance opacity is on geo.shadow. Never swapped.
  shadow: shadowMaterial(),
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
