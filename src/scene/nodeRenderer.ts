// The WebGPURenderer path (ADR-50), its own lazy chunk: Medium and High load
// it, Low never does. It makes the renderer, the TSL twins of the three GLSL
// materials in resources.ts, and the environment map, since three's WebGL
// PMREMGenerator cannot run on it, and the range fog (ADR-55). Where the
// browser has no WebGPU the renderer runs on its own WebGL2 backend, with the
// same materials.
import { Color, DoubleSide, Vector2, type Object3D, type Texture } from 'three';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, PMREMGenerator, WebGPURenderer } from 'three/webgpu';
import { abs, attribute, float, Fn, fog, If, length, max, mix, mrt, positionView, positionWorld, screenCoordinate, select, smoothstep, step, uniform, vec2, vec3, vec4 } from 'three/tsl';
import { ART, type QUALITY } from './artDirection';
import { setNodeFog } from './rangeFog';
import { legsCloth, setNodeMaterials, uniforms } from './resources';

// The effects ride in this chunk (ADR-51).
export { createEffects, type Effects } from './effects';

const S = ART.shadow;
const FP = ART.footPaths;
const LG = ART.legs;

/**
 * The foot trails (resources.ts footPathMaterial, ADR-50): vertex colour per
 * foot, opaque where the vertex's progress `aU` is behind the playhead, `ghost`
 * ahead of it, lifted toward white for `head.width` just behind it. Unlit, not
 * tone mapped, no fog, like the GLSL one. The playhead follows the shared
 * `uniforms.pathProgress` on every render.
 */
export function footPathNodeMaterial() {
  const progress = uniform(0).onRenderUpdate(() => uniforms.pathProgress.value);
  const u = attribute('aU', 'float');
  const done = step(u, progress.add(1e-4));
  const head = done.mul(smoothstep(0, FP.head.width, progress.sub(u)).oneMinus());
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, toneMapped: false, fog: false });
  m.colorNode = mix(attribute('color', 'vec3'), vec3(1), head.mul(FP.head.lighten));
  m.opacityNode = mix(float(FP.ghost), float(1), done);
  m.name = 'footPath (TSL)';
  return m;
}

/**
 * The Medium ground shadows (resources.ts shadowMaterial, ADR-38, ADR-50):
 * the shadow colour at the vertex alpha times the instance's opacity; a
 * foot's fragment draws only what it adds over the board's soft and contact
 * ellipses, so the pad shows max(board, foot). Tone mapped, no fog, like the
 * GLSL one. The board's footprint is the shared `uniforms` vectors, which
 * FlightDriver mutates.
 */
export function shadowNodeMaterial() {
  const board = uniform(uniforms.board);
  const size = uniform(uniforms.boardSize);
  const opacity = uniform(uniforms.boardOpacity);
  const core = float(S.core);
  const disc = (r: ReturnType<typeof length>) => select(r.lessThanEqual(core), float(1), r.oneMinus().div(core.oneMinus()).clamp(0, 1));
  const alpha = Fn(() => {
    const a = attribute('aAlpha', 'float').mul(attribute('aOpacity', 'float')).toVar();
    If(attribute('aFoot', 'float').greaterThan(0.5), () => {
      const d = positionWorld.xz.sub(board.xy);
      const l = vec2(d.x.mul(board.z).sub(d.y.mul(board.w)), d.x.mul(board.w).add(d.y.mul(board.z)));
      const soft = opacity.x.mul(disc(length(l.div(size.xy))));
      const contact = opacity.y.mul(disc(length(l.div(size.zw))));
      const b = soft.oneMinus().mul(contact.oneMinus()).oneMinus();
      a.assign(max(a.sub(b), 0).div(max(b.oneMinus(), 1e-4)));
    });
    return a;
  })();
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  m.colorNode = uniform(new Color(S.color));
  m.opacityNode = alpha;
  m.name = 'shadow (TSL)';
  return m;
}

/**
 * The legs (resources.ts legsMaterial, ADR-60): a standard material with the
 * vertex colours, opaque, its alpha test the 4 x 4 screen-door threshold of
 * resources.ts DITHER_GLSL (the same formula), so the thighs fade toward the
 * hips in the same draw as the shanks. In the shadow pass only `aCast` (the
 * shanks) draws, as on WebGLRenderer.
 */
export function legsNodeMaterial() {
  const q = screenCoordinate.xy.floor().mod(4);
  const lo = q.mod(2);
  const hi = q.div(2).floor();
  const b2 = (v: typeof q) => abs(v.x.sub(v.y)).mul(2).add(v.y);
  const s = LG.cloth.strength;
  // The twill cloth (ADR-70), the same texture and strength as the GLSL material.
  const m = new MeshStandardNodeMaterial({ vertexColors: true, roughness: LG.roughness, normalMap: legsCloth, normalScale: new Vector2(s, s) });
  m.alphaTestNode = b2(lo).mul(4).add(b2(hi)).add(0.5).div(16);
  m.maskShadowNode = attribute('aCast', 'float').greaterThan(0.5);
  m.name = 'legs (TSL)';
  return m;
}

/**
 * The dust (resources.ts mat.dust, ADR-74): the same plain material, and one
 * thing more. The effects' scene pass also writes each fragment's normal for
 * the occlusion (effects.ts); a puff writes none (no alpha, so what is behind
 * it stays), or the occlusion would shade every disc's outline onto the ground.
 */
export function dustNodeMaterial() {
  const m = new MeshBasicNodeMaterial({ color: ART.dust.color, vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, forceSinglePass: true });
  m.mrtNode = mrt({ normal: vec4(0) });
  m.name = 'dust (TSL)';
  return m;
}

type Tier = (typeof QUALITY)[keyof typeof QUALITY];

/**
 * A WebGPURenderer for a tier's settings, initialised (R3F needs the factory
 * to have awaited init) and with the TSL materials registered. `timestamps`
 * turns on GPU timestamp queries for scripts/measure (?debug). Throws if the
 * renderer cannot start at all; TrickScene then falls back to WebGLRenderer.
 */
export async function createNodeRenderer(canvas: HTMLCanvasElement, Q: Tier, timestamps: boolean) {
  const renderer = new WebGPURenderer({ canvas, antialias: Q.antialias, powerPreference: Q.powerPreference, trackTimestamp: timestamps });
  await renderer.init();
  renderer.toneMappingExposure = ART.renderer.exposure;
  setNodeMaterials({ footPath: footPathNodeMaterial(), shadow: shadowNodeMaterial(), legs: legsNodeMaterial(), dust: dustNodeMaterial() }, renderer);
  setNodeFog(rangeFogNode());
  return renderer;
}

/**
 * Range fog (ADR-55): the scene's Fog colour, near and far, faded by the
 * fragment's distance from the camera instead of three's view depth. One
 * callback per render copies the rendered scene's Fog (TrickScene's <fog>),
 * so a theme change is a uniform write, not a new node and a recompile.
 */
export function rangeFogNode() {
  const color = uniform(new Color());
  const near = uniform(0);
  const far = uniform(1);
  color.onRenderUpdate(({ scene }) => {
    const f = scene?.fog;
    if (!f || !('near' in f)) return;
    color.value.copy(f.color);
    near.value = f.near;
    far.value = f.far;
  });
  return fog(color, smoothstep(near, far, positionView.length()));
}

/** The environment map on a WebGPURenderer: the node PMREMGenerator, the same blur as the WebGL path. */
export function prefilterEnvironment(renderer: unknown, scene: Object3D, blur: number): { texture: Texture; dispose: () => void } {
  const pmrem = new PMREMGenerator(renderer as WebGPURenderer);
  const target = pmrem.fromScene(scene as never, blur);
  pmrem.dispose();
  return target;
}

