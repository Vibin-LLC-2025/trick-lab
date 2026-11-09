// Quality tiers (ADR-16, 2026-11-04). The default target is a desktop with a
// real GPU; Medium is a mid-range laptop; Low is the Chromebook fallback. The
// first visit picks a tier from what the browser will say about the device;
// the student can override it in the View panel and the choice is persisted.
import type { Quality, TrickState } from './types';

export const QUALITIES: readonly Quality[] = ['high', 'medium', 'low'];

export const isQuality = (v: unknown): v is Quality => QUALITIES.includes(v as Quality);

/** The lower of a tier and a cap (ADR-59: the device's pick, after an automatic step-down on an earlier visit). */
export const capQuality = (q: Quality, cap: unknown): Quality => (isQuality(cap) && QUALITIES.indexOf(cap) > QUALITIES.indexOf(q) ? cap : q);

/**
 * The tier the scene actually runs (ADR-15): Low once a model failed to
 * load, whatever was saved; otherwise the saved or auto-picked tier. Every
 * consumer of the tier (View panel, renderer settings, board, feet, ground)
 * reads this, so the control, the renderer and the models never disagree.
 * The saved `quality` itself is left alone, so the choice returns on reload.
 */
export const effectiveQuality = (s: Pick<TrickState, 'quality' | 'boardAssetFailed'>): Quality =>
  s.boardAssetFailed ? 'low' : s.quality;

/** What the browser offers; every field is optional because every one is. */
export interface DeviceHints {
  /** navigator.deviceMemory, GB, Chromium only. */
  memoryGb?: number;
  /** navigator.hardwareConcurrency. */
  cores?: number;
  /** WEBGL_debug_renderer_info UNMASKED_RENDERER_WEBGL, or the plain RENDERER string. */
  renderer?: string;
  userAgent?: string;
}

const SOFTWARE_GPU = /SwiftShader|llvmpipe|softpipe|Software/i;
const STRONG_GPU = /GeForce|RTX|GTX|Quadro|Radeon (RX|Pro|VII)|Apple (M\d|GPU)|Intel\(R\)? Arc|\bArc\b/i;
const CHROMEBOOK = /\bCrOS\b/;
const HANDHELD = /Android|iPhone|iPad|iPod/;

/**
 * Pure tier choice. Conservative on purpose: anything that smells like a
 * Chromebook, a software renderer or a small machine gets Low, a known desktop
 * GPU or a big machine gets High, everything else Medium.
 */
export function pickQuality(h: DeviceHints): Quality {
  const renderer = h.renderer ?? '';
  const ua = h.userAgent ?? '';
  if (SOFTWARE_GPU.test(renderer)) return 'low';
  if (CHROMEBOOK.test(ua)) return 'low';
  if (h.memoryGb !== undefined && h.memoryGb <= 4) return 'low';
  if (h.cores !== undefined && h.cores <= 2) return 'low';
  if (HANDHELD.test(ua)) return 'medium';
  if (STRONG_GPU.test(renderer)) return 'high';
  if (h.memoryGb !== undefined && h.memoryGb >= 8 && h.cores !== undefined && h.cores >= 8) return 'high';
  return 'medium';
}

/** The renderer string from a throwaway WebGL context; empty where WebGL is missing (jsdom, blocked). */
export function probeRenderer(): string {
  if (typeof document === 'undefined' || typeof WebGLRenderingContext === 'undefined') return '';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return '';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return typeof name === 'string' ? name : '';
  } catch {
    return '';
  }
}

/** Reads the hints the browser exposes. Runs once, at store creation. */
export function detectQuality(): Quality {
  if (typeof navigator === 'undefined') return 'medium';
  const n = navigator as Navigator & { deviceMemory?: number };
  return pickQuality({
    memoryGb: n.deviceMemory,
    cores: n.hardwareConcurrency,
    renderer: probeRenderer(),
    userAgent: n.userAgent,
  });
}
