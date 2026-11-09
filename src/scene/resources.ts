// Geometries and materials shared by every mesh in the scene. Created once at
// module load; static parts are merged so each material is one draw call.
// Each Canvas calls disposeSharedResources() when it unmounts (TrickScene's
// SharedResources), so a tier change frees them too; three.js re-uploads a
// disposed resource on next use, so a remount is safe. Disposing matters on
// every remount, not only at the end: each renderer that draws a material
// adds a dispose listener to it, which holds that renderer's programs until
// the material is disposed (found by the soak test, 2026-11-09).
//
// Two renderers (ADR-50): Low draws with three's WebGLRenderer, Medium and
// High with its WebGPURenderer. Every material here works on both except the
// two ShaderMaterials (GLSL), whose TSL twins live in nodeRenderer.ts and are
// registered here (setNodeMaterials) when that renderer starts; shaderMat()
// picks the one for the renderer in use. Both read the same `uniforms`, the
// values FlightDriver writes each frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildDeck } from '../asset/deck';
import { PLANE_BAYS } from '../asset/groundSpec';
import { footHalfWidth, footRingXs, lerpProfile, loftFacing } from '../asset/shoe';
import { FOOTPRINT } from '../asset/shoeSpec';
import { TRUCK, WHEEL } from '../asset/spec';
import { hexToRgb } from '../asset/textures';
import { LEG } from '../sim/legs';
import { ART } from './artDirection';

const B = ART.board;

/** Paints every vertex of a geometry one colour (sRGB hex, stored linear), so parts that share a material merge into one draw call. */
function painted(g: THREE.BufferGeometry, hex: string) {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

function mergedParts(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return merged;
}

/**
 * The primitive board's deck (ADR-54): the real deck mesh (deck.ts, the
 * Medium GLB's: the outline, the kicks and the concave), grip, wood and
 * graphic coloured per vertex. One draw call.
 */
function primitiveDeck() {
  const { groups } = buildDeck('medium');
  return mergedParts([painted(groups.grip, B.grip.color), painted(groups.wood, B.wood.color), painted(groups.graphic, B.graphic.color)]);
}

/**
 * The primitive board's trucks and wheels (ADR-54), at the GLB's own places
 * (spec.ts): per truck a baseplate, a yoke down to the axle and the axle
 * housing across, and four wheels, coloured per vertex. One draw call. Every
 * part sits inside the envelopes the feet's clearance test uses.
 */
function primitiveHardware() {
  const BP = TRUCK.baseplate;
  const AX = TRUCK.axleHousing;
  const parts: THREE.BufferGeometry[] = [];
  const box = (size: readonly [number, number, number], x: number, y: number, z: number, hex: string) => {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    g.translate(x, y, z);
    parts.push(painted(g, hex));
  };
  const plateBottom = BP.center[1] - BP.size[1] / 2;
  for (const s of [1, -1]) {
    box(BP.size, s * BP.center[0], BP.center[1], BP.center[2], B.trucks.color);
    box([AX.size[0], plateBottom - AX.center[1], AX.size[0] * B.primitive.yokeWidth], s * AX.center[0], (plateBottom + AX.center[1]) / 2, 0, B.trucks.color);
    box(AX.size, s * AX.center[0], AX.center[1], AX.center[2], B.trucks.color);
    for (const z of [WHEEL.centerZ, -WHEEL.centerZ]) {
      const w = new THREE.CylinderGeometry(WHEEL.radius, WHEEL.radius, WHEEL.width, B.wheels.segments);
      w.rotateX(Math.PI / 2);
      w.translate(s * WHEEL.centerX, WHEEL.centerY, z);
      parts.push(painted(w, B.wheels.color));
    }
  }
  return mergedParts(parts);
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
 * The values FlightDriver writes every frame (no allocation), read by the
 * GLSL materials below and by their TSL twins (nodeRenderer.ts, ADR-50): one
 * object per value, mutated, never replaced.
 * - `pathProgress`: the foot trails' playhead, 0 to 1.
 * - `board`: the board's ground footprint, centre x and z, cos and sin of its yaw.
 * - `boardSize`: its soft half extents (x y) and contact half extents (z w).
 * - `boardOpacity`: the soft and the contact opacity.
 */
export const uniforms = {
  pathProgress: { value: 0 },
  board: new THREE.Vector4(0, 0, 1, 0),
  boardSize: new THREE.Vector4(S.halfLength, S.halfWidth, S.halfLength, S.halfWidth),
  boardOpacity: new THREE.Vector2(0, 0),
};

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
      uBoard: { value: uniforms.board },
      uBoardSize: { value: uniforms.boardSize },
      uBoardOpacity: { value: uniforms.boardOpacity },
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
      uProgress: uniforms.pathProgress,
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
 * The primitive shoe (ADR-39; right foot, the left is mirrored by the Feet
 * component; Low, Medium and the High fallback): the GLB shoe's footprint,
 * centred across, as a light procedural silhouette. Toe at +X, sole bottom
 * on y = 0. Two geometries so sole and upper keep their own material: two
 * draw calls per shoe, as the slab and box were.
 */
const SL = FT.silhouette;
/** Footprint half width at x on one side, inset by d, shifted so the outline spans the width symmetrically. */
const SHIFT = (FOOTPRINT.toe.lateral - FOOTPRINT.toe.medial) / 2;
type P3 = [number, number, number];

/** One closed outline ring at inset d and height y: lateral side heel to toe, medial back. */
function shoeRing(d: number, y: number): P3[] {
  const xs = footRingXs(d, FT.sole.intervals);
  const n = xs.length;
  const lateral = xs.map((x): P3 => [x, y, footHalfWidth(x, 'lateral', d) - SHIFT]);
  const medial = xs
    .slice(1, n - 1)
    .reverse()
    .map((x): P3 => [x, y, -footHalfWidth(x, 'medial', d) - SHIFT]);
  return [...lateral, ...medial];
}

/** A flat cap over a ring (a fan from its centre), facing `up` (+1) or down (-1). */
function ringCap(ring: P3[], up: 1 | -1) {
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cz = ring.reduce((s, p) => s + p[2], 0) / ring.length;
  const centre: P3 = [cx, ring[0]![1], cz];
  const rows = [ring.map((p) => ({ position: p })), ring.map(() => ({ position: centre }))];
  return loftFacing(rows, { r: 0, p: 0, out: [0, up, 0] }, { closed: true }).geometry;
}

function primitiveSole() {
  const B = FT.sole.bevel;
  const S = FT.sole.step;
  const H = FT.sole.height;
  const rings = [shoeRing(B, 0), shoeRing(0, B), shoeRing(0, S.at), shoeRing(S.inset, S.at + S.inset), shoeRing(S.inset, H)];
  const wall = loftFacing(
    rings.map((r) => r.map((p) => ({ position: p }))),
    { r: 2, p: Math.floor(rings[2]!.length / 4), out: [0, 0, 1] },
    { closed: true },
  ).geometry;
  // The wall is one smooth surface; the caps keep their own normals, so the top and bottom edges stay crisp.
  return mergedParts([wall, ringCap(rings[0]!, -1), ringCap(rings[rings.length - 1]!, 1)]);
}

function primitiveUpper() {
  const N = SL.stations;
  const M = SL.sectionPoints;
  const base = FT.sole.height - SL.tuck;
  const rows = Array.from({ length: N + 1 }, (_, i) => {
    const t = (1 - Math.cos((Math.PI * i) / N)) / 2;
    const x = -FT.sole.length / 2 + t * FT.sole.length;
    const wl = footHalfWidth(x, 'lateral', SL.inset);
    const wm = footHalfWidth(x, 'medial', SL.inset);
    const a = (wl + wm) / 2;
    const zc = (wl - wm) / 2 - SHIFT;
    const h = lerpProfile(SL.height, t) + SL.tuck;
    const p = lerpProfile(SL.exponent, t);
    const valley = lerpProfile(SL.valley, t);
    return Array.from({ length: M }, (_, j) => {
      const phi = Math.PI * (1 - j / (M - 1));
      const c = Math.cos(phi);
      let y = base + h * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(c), p)), 1 / p);
      const u = Math.abs(phi - Math.PI / 2) / SL.valleyWidth;
      if (u < 1) y -= valley * (1 - u * u) ** 2;
      return { position: [x, y, zc + a * c] as P3 };
    });
  });
  const mid = Math.floor(N / 2);
  return loftFacing(rows, { r: mid, p: Math.floor(M / 2), out: [0, 1, 0] }).geometry;
}


const shoeSole = primitiveSole();
const shoeUpper = primitiveUpper();

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
 * One rigid leg segment for the skinned leg mesh (ADR-37): a tapered capsule
 * turned about +Y from the profile (y 0 at the proximal joint, increasing
 * toward the distal one), every vertex weighted 1 to `bone`, its colour and
 * alpha from its profile point, and `aCast` 1 where the segment casts a shadow
 * (the shanks) and 0 where it does not (the thighs, whose shadow would be the
 * whole thigh). Built once.
 */
function legSegment(profile: ProfilePoint[], bone: number, cast: boolean) {
  const g = new THREE.LatheGeometry(
    profile.map((p) => new THREE.Vector2(p.r, p.y)),
    LG.radialSegments,
  );
  const count = g.attributes.position!.count;
  const colors = new Float32Array(count * 4);
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const c = new THREE.Color();
  for (let v = 0; v < count; v++) {
    // LatheGeometry writes the profile once per radial step, in order.
    const p = profile[v % profile.length]!;
    c.set(p.color);
    colors[v * 4] = c.r;
    colors[v * 4 + 1] = c.g;
    colors[v * 4 + 2] = c.b;
    colors[v * 4 + 3] = p.alpha;
    skinIndex[v * 4] = bone;
    skinWeight[v * 4] = 1;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  g.setAttribute('aCast', new THREE.BufferAttribute(new Float32Array(count).fill(cast ? 1 : 0), 1));
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
  /**
   * Both legs in one geometry (ADR-60): the opaque shanks and the thighs,
   * which fade toward the hips by a screen-door dither (mat.legs), so the
   * whole rig is one draw call (plus one shadow draw on High, the shanks only).
   */
  legs: mergedLegs([
    legSegment(shankProfile(), LEG_BONES.frontShank, true),
    legSegment(shankProfile(), LEG_BONES.backShank, true),
    legSegment(thighProfile(), LEG_BONES.frontThigh, false),
    legSegment(thighProfile(), LEG_BONES.backThigh, false),
  ]),
  /** The primitive board (fallback, Low; ADR-54): the deck, and the trucks with the wheels. Two draw calls. */
  boardDeck: primitiveDeck(),
  boardHardware: primitiveHardware(),
  ground: groundPlane(),
  shadow: shadowFootprint(),
};

const std = (color: string, roughness: number, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

const LOW = ART.low;

/** Low's light, in `ART.low.gradient`'s steps (a toon material reads it nearest, so the steps stay hard). */
function toonGradient() {
  const steps = LOW.gradient;
  const t = new THREE.DataTexture(new Uint8Array(steps.map((v) => Math.round(v * 255))), steps.length, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/**
 * Low's ground (ADR-54): the slab colour with a dark joint along each edge,
 * half a joint on each side, so repeated once per bay (ground.ts's bays) the
 * joints fall between bays and a bay is centred under the board.
 */
function jointTexture() {
  const n = LOW.ground.texture;
  const half = Math.max(1, Math.round((LOW.ground.joint.width * n) / 2));
  // sRGB bytes straight from the design's hex: the texture is marked sRGB below.
  const slab = hexToRgb(LOW.ground.color);
  const joint = hexToRgb(LOW.ground.joint.color);
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const c = x < half || x >= n - half || y < half || y >= n - half ? joint : slab;
      data.set([c[0]!, c[1]!, c[2]!, 255], (y * n + x) * 4);
    }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(PLANE_BAYS.x, PLANE_BAYS.z);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = ART.quality.low.groundAnisotropy;
  t.needsUpdate = true;
  return t;
}

/**
 * The legs' screen-door threshold (ADR-60): a 4 x 4 ordered (Bayer) dither of
 * the pixel, in (0, 1). A fragment whose alpha is at or below it is not drawn.
 * Written here in GLSL; the TSL twin (nodeRenderer.ts) and the JavaScript one
 * the tests read (`ditherThreshold`) follow the same formula: two levels of
 * the 2 x 2 matrix (2|x - y| + y), the low bits weighted 4.
 */
export const DITHER_GLSL = /* glsl */ `
float legsDither(vec2 frag) {
  vec2 q = mod(floor(frag), 4.0);
  vec2 lo = mod(q, 2.0);
  vec2 hi = floor(q / 2.0);
  float b = 4.0 * (2.0 * abs(lo.x - lo.y) + lo.y) + (2.0 * abs(hi.x - hi.y) + hi.y);
  return (b + 0.5) / 16.0;
}
`;

/** The same threshold in JavaScript, for the tests. */
export function ditherThreshold(x: number, y: number) {
  const qx = Math.floor(x) % 4;
  const qy = Math.floor(y) % 4;
  const b2 = (a: number, c: number) => 2 * Math.abs(a - c) + c;
  return (4 * b2(qx % 2, qy % 2) + b2(Math.floor(qx / 2), Math.floor(qy / 2)) + 0.5) / 16;
}

/** The legs on WebGLRenderer: a standard material whose alpha test is the dither, so it stays opaque (depth written, no sorting). */
function legsMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: LG.roughness });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${DITHER_GLSL}\nvoid main() {`)
      .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\n\tif ( diffuseColor.a <= legsDither( gl_FragCoord.xy ) ) discard;');
  };
  m.customProgramCacheKey = () => 'trick-lab-legs-dither';
  return m;
}

/** The legs' shadow depth on WebGLRenderer: only where `aCast` is set (the shanks). */
function legsDepthMaterial() {
  const m = new THREE.MeshDepthMaterial();
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('void main() {', 'attribute float aCast;\nvarying float vCast;\nvoid main() {\n\tvCast = aCast;');
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'varying float vCast;\nvoid main() {\n\tif ( vCast < 0.5 ) discard;');
  };
  m.customProgramCacheKey = () => 'trick-lab-legs-depth';
  return m;
}

/** Textures the materials below hold, freed with them. */
const tex = { toon: toonGradient(), joints: jointTexture() };

export const mat = {
  /** The primitive board on the fallback (Medium, High while a GLB streams or if it fails): one standard material, per-vertex colour. */
  boardPrimitive: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: B.primitive.roughness, metalness: B.primitive.metalness }),
  // Low (ADR-54): toon shaded, flat clean colours.
  toonBoard: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: tex.toon }),
  toonSole: new THREE.MeshToonMaterial({ color: ART.feet.sole.color, gradientMap: tex.toon }),
  toonUpper: new THREE.MeshToonMaterial({ color: ART.feet.upper.color, gradientMap: tex.toon }),
  toonGround: new THREE.MeshToonMaterial({ map: tex.joints, gradientMap: tex.toon }),
  ground: std(G.color, G.roughness),
  shoeSole: std(FT.sole.color, FT.sole.roughness),
  shoeUpper: std(FT.upper.color, FT.upper.roughness),
  // The legs (ADR-37, ADR-60): white times the vertex colours (trouser and
  // sock), opaque, with the vertex alpha (the thighs' fade toward the hips)
  // drawn as a screen-door dither, so solid and fading parts are one draw.
  // Never swapped; its TSL twin is nodeRenderer.ts legsNodeMaterial.
  legs: legsMaterial(),
  // The legs' shadow on WebGLRenderer (High's fallback): the shanks only, as before.
  legsDepth: legsDepthMaterial(),
  // uProgress is mutated by FlightDriver; never swapped.
  footPath: footPathMaterial(),
  // The ground shadows (ADR-38); the per-instance opacity is on geo.shadow. Never swapped.
  shadow: shadowMaterial(),
  // The sky dome (skyDome.ts, ADR-52): vertex colours, both faces (the
  // winding is not worth tracking for a backdrop), no fog (it is the
  // backdrop the fog fades into), no depth writes and drawn first, so
  // everything else draws over it. Tone mapped like the fogged ground, so
  // the two meet at the horizon.
  sky: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false }),
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

/** The materials written as shaders: a GLSL one in `mat` (a ShaderMaterial, or the legs' patched standard material), a TSL twin for the WebGPURenderer. */
export type ShaderKey = 'footPath' | 'shadow' | 'legs';

/** The TSL twins (ADR-50), registered by nodeRenderer.ts when a WebGPURenderer starts; null until then. */
const nodeMat: Record<ShaderKey, THREE.Material | null> = { footPath: null, shadow: null, legs: null };

/** The renderer the registered TSL twins belong to. */
let nodeOwner: object | null = null;

/** nodeRenderer.ts hands over a fresh set for each WebGPURenderer it makes (`owner`); the last set is freed. */
export function setNodeMaterials(m: Record<ShaderKey, THREE.Material>, owner: object) {
  for (const key of Object.keys(nodeMat) as ShaderKey[]) {
    if (nodeMat[key] !== m[key]) nodeMat[key]?.dispose();
    nodeMat[key] = m[key];
  }
  nodeOwner = owner;
}

/** The shader material for the renderer in use: the TSL twin on a WebGPURenderer, the GLSL one otherwise. */
export const shaderMat = (key: ShaderKey, nodeRenderer: boolean): THREE.Material => (nodeRenderer ? (nodeMat[key] ?? mat[key]) : mat[key]);

/**
 * Frees the shared geometries, materials and textures (each re-uploads on
 * next use), when a Canvas unmounts. The TSL twins go too, but only if
 * `renderer` registered them: a tier change can start the next Canvas's
 * WebGPURenderer before the old Canvas has finished unmounting, and its twins
 * must stay.
 */
export function disposeSharedResources(renderer: object | null = null) {
  Object.values(geo).forEach((g) => g.dispose());
  Object.values(mat).forEach((m) => m.dispose());
  Object.values(tex).forEach((t) => t.dispose());
  if (renderer !== null && renderer !== nodeOwner) return;
  for (const key of Object.keys(nodeMat) as ShaderKey[]) {
    nodeMat[key]?.dispose();
    nodeMat[key] = null;
  }
  nodeOwner = null;
}
