// Post-processing on the WebGPURenderer (ADR-51), part of the node renderer's
// chunk: Low never loads it. Numbers in ART.post (artDirection.ts).
//
// One scene pass writes colour, normals and, on High, per-object velocity in
// the same draw (multiple render targets), so the scene is drawn once. The
// ambient occlusion (three's GTAO) reads that pass's depth and normals. One
// composite pass then does the rest: motion blur along the velocity (only
// while a trick plays at normal speed), the occlusion, a glow round the
// brightest highlights, tone mapping and the colour space, then the grade
// and the vignette. That is two full-screen passes on top of the scene.
import { MaterialBlending, UnsignedByteType, type Camera, type Object3D } from 'three';
import { BlendMode, RenderPipeline, type WebGPURenderer } from 'three/webgpu';
import {
  clamp,
  dot,
  float,
  Fn,
  If,
  length,
  max,
  mix,
  mrt,
  normalView,
  output,
  packNormalToRGB,
  pass,
  renderOutput,
  sample,
  smoothstep,
  uniform,
  unpackRGBToNormal,
  uv,
  vec2,
  vec3,
  vec4,
  velocity,
  viewportSize,
} from 'three/tsl';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { ART } from './artDirection';

const P = ART.post;
type Tier = NonNullable<(typeof P.tiers)[keyof typeof P.tiers]>;

export interface Effects {
  /** Draws a frame through the effects; PerfProbe calls it instead of the renderer's own render. */
  render: () => void;
  /** Motion blur on or off (ADR-51: a trick at normal speed, with the switch on, on High). */
  setMotionBlur: (on: boolean) => void;
  /** The instant replay's fisheye on or off (ADR-72): ART.replay.bend, or none. */
  setBend: (on: boolean) => void;
  dispose: () => void;
}

/**
 * From the velocity target's NDC (y up, two units a screen) to the
 * composite's UV (y down, one unit a screen): three's full-screen quad
 * (QuadGeometry, which RenderPipeline draws with) puts uv.y = 0 at the top
 * of the screen and 1 at the bottom. effects.test.ts checks that convention
 * against three's own quad, so an upgrade that changes it fails there.
 */
export const NDC_TO_UV = [0.5, -0.5] as const;

/**
 * The motion blur's taps (review of Phase B, 2026-11-09): `n` positions along
 * the pixel's motion from -0.5 to 0.5 of it, centred on the pixel, with equal
 * weights that sum to 1, so a still picture keeps its brightness. three
 * r187's `motionBlur` helper adds one tap more than it divides by, which
 * brightened every still pixel while a trick played.
 */
export function blurTaps(n: number): { at: number; weight: number }[] {
  return Array.from({ length: n }, (_, i) => ({ at: n === 1 ? 0 : i / (n - 1) - 0.5, weight: 1 / n }));
}

/**
 * The fisheye (ADR-72): where on the scene picture a screen point samples. A
 * barrel distortion, r' = r (1 + k r^2) about the centre, in units where the
 * corner is at r = 1 so the bend is the same on any stage shape, scaled by
 * 1 / (1 + k) so the corners sample the picture's corners and nothing outside
 * it. k = 0 is the identity. The same formula as the composite's; tested.
 */
export function bendUv(u: number, v: number, k: number, aspect: number): [number, number] {
  const x = (u - 0.5) * aspect;
  const y = v - 0.5;
  const r2 = (x * x + y * y) / (aspect * aspect * 0.25 + 0.25);
  const s = (1 + k * r2) / (1 + k);
  return [0.5 + (u - 0.5) * s, 0.5 + y * s];
}

/** Rec. 709 luminance, for the glow's threshold and the grade. */
const luma = (c: Parameters<typeof dot>[0]) => dot(c, vec3(0.2126, 0.7152, 0.0722));

export function createEffects(renderer: WebGPURenderer, scene: Object3D, camera: Camera, tier: Tier): Effects {
  const scenePass = pass(scene as never, camera as never);
  const targets: Record<string, unknown> = { output, normal: packNormalToRGB(normalView) };
  if (tier.motionBlur) targets.velocity = velocity;
  // The normals follow each material's own blending: an opaque material writes
  // them as before, and a see-through one can leave them alone by writing them
  // with no alpha (the dust, ADR-74: a disc facing the camera has nothing to
  // do with the ground behind it, and the occlusion would shade its shape).
  scenePass.setMRT(mrt(targets as never).setBlendMode('normal', new BlendMode(MaterialBlending)));
  // Packed normals fit in 8 bits a channel: half the bandwidth of the default half-float target.
  scenePass.getTexture('normal').type = UnsignedByteType;
  const color = scenePass.getTextureNode('output');
  const normals = scenePass.getTextureNode('normal');

  // The occlusion, at the tier's resolution, from the same pass.
  let occlusion: ReturnType<typeof ao> | null = null;
  if (tier.ao !== null) {
    occlusion = ao(scenePass.getTextureNode('depth'), sample((at) => unpackRGBToNormal(normals.sample(at))), camera as never);
    occlusion.resolutionScale = tier.ao;
    occlusion.radius.value = P.ao.radius;
    occlusion.thickness.value = P.ao.thickness;
    occlusion.distanceExponent.value = P.ao.distanceExponent;
    occlusion.scale.value = P.ao.scale;
    occlusion.samples.value = P.ao.samples;
  }
  const aoTexture = occlusion?.getTextureNode() ?? null;

  const blur = uniform(0);
  const bend = uniform(0);
  const G = P.grade;
  const composite = Fn(() => {
    // Where this pixel samples the scene: straight through, or bent for the replay (bendUv).
    const aspect = viewportSize.x.div(viewportSize.y);
    const centred = uv().sub(0.5);
    const r2 = dot(centred.mul(vec2(aspect, 1)), centred.mul(vec2(aspect, 1))).div(aspect.mul(aspect).mul(0.25).add(0.25));
    const at = centred.mul(bend.mul(r2).add(1).div(bend.add(1))).add(0.5).toVar();
    const c = vec4(color.sample(at)).toVar();
    if (tier.motionBlur) {
      If(blur.greaterThan(0), () => {
        // This frame's motion of the pixel in UV, times the shutter.
        const v = scenePass.getTextureNode('velocity').sample(at).xy.mul(vec2(...NDC_TO_UV)).mul(blur).toVar();
        const sum = vec4(0).toVar();
        for (const t of blurTaps(P.motionBlur.samples)) sum.addAssign(color.sample(at.add(v.mul(t.at))).mul(t.weight));
        c.assign(sum);
      });
    }
    if (aoTexture) c.rgb.mulAssign(mix(float(1), aoTexture.sample(at).r, P.ao.strength));
    if (tier.glow) {
      // Two rings of taps round the pixel; only what is brighter than the threshold spreads.
      const glow = vec3(0).toVar();
      for (const [ring, r] of P.glow.radius.entries()) {
        for (let i = 0; i < P.glow.taps; i++) {
          const a = ((i + ring * 0.5) / P.glow.taps) * Math.PI * 2;
          const tap = color.sample(at.add(vec2(Math.cos(a) * r, Math.sin(a) * r).div(vec2(aspect, 1)))).rgb;
          glow.addAssign(tap.mul(max(luma(tap).sub(P.glow.threshold), 0)));
        }
      }
      c.rgb.addAssign(glow.mul(P.glow.strength / (P.glow.taps * P.glow.radius.length)));
    }
    // Tone mapping and the colour space, then the grade in display space.
    const shown = renderOutput(c).rgb.toVar();
    shown.assign(shown.sub(0.5).mul(G.contrast).add(0.5));
    const y = luma(shown);
    shown.assign(mix(vec3(y), shown, G.saturation));
    shown.mulAssign(mix(vec3(...G.shadowTint), vec3(...G.highlightTint), smoothstep(0.2, 0.8, y)));
    const d = length(uv().sub(0.5).mul(vec2(viewportSize.x.div(viewportSize.y), 1))).div(length(vec2(viewportSize.x.div(viewportSize.y), 1).mul(0.5)));
    shown.mulAssign(float(1).sub(smoothstep(G.vignette.start, G.vignette.end, d).mul(G.vignette.strength)));
    return vec4(clamp(shown, 0, 1), 1);
  })();

  const pipeline = new RenderPipeline(renderer);
  // The composite tone maps and converts the colour space itself, before the grade.
  pipeline.outputColorTransform = false;
  pipeline.outputNode = composite;

  return {
    render: () => pipeline.render(),
    setMotionBlur: (on) => {
      blur.value = on ? P.motionBlur.shutter : 0;
    },
    setBend: (on) => {
      bend.value = on ? ART.replay.bend : 0;
    },
    dispose: () => {
      occlusion?.dispose();
      scenePass.dispose();
      pipeline.dispose();
    },
  };
}
