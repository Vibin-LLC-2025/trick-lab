// Adaptive resolution (ADR-109, 2026-11-15): on the game screen, on High and
// Medium, the drawing buffer's pixel ratio lowers itself in small steps when
// the graphics card falls behind the tier's graphics target and rises again
// when there is room, never below `floor` of the tier's cap. Silent: no
// announcement, no UI, not saved, never logged or exported. The lab, the
// welcome screen and Low always draw at the full cap.
//
// Pure: no React, no three, no store. The numbers come in as `AdaptiveConfig`
// (ART.adaptive in artDirection.ts); PerfProbe feeds the samples and steps it
// on frames it already draws, and TrickScene turns the scale into the
// Canvas's pixel ratio (scaledDpr). No allocation after newAdaptive.

/** The tiers it may act on; the others always draw at their cap. */
export type AdaptiveTier = 'high' | 'medium';

/** Which signal fills the window: GPU time per frame where the renderer can read it, the frame interval otherwise. */
export type AdaptiveSource = 'gpu' | 'interval';

export interface AdaptiveConfig {
  /** Each tier's graphics target per frame in ms (ADR-62): the GPU signal is judged against it. */
  targetMs: Readonly<Record<AdaptiveTier, number>>;
  /** The lowest scale on the tier's pixel-ratio cap. */
  floor: number;
  /** One step of the scale. */
  step: number;
  /** Samples in the rolling window; the newest replace the oldest. */
  window: number;
  /** Samples since the last change (or since it became active) before it judges at all. */
  minSamples: number;
  /** Which quantile of the window is the signal (0.9 is the p90). */
  quantile: number;
  /** Lower one step while the signal is over `lowerAbove` times the target. */
  lowerAbove: number;
  /**
   * Raise one step while the signal, scaled by the next step's pixel count
   * (the square of the scales' ratio), would be under `raiseBelow` times the
   * target. Under `lowerAbove`, so a signal at the threshold never goes back
   * and forth.
   */
  raiseBelow: number;
  /** The least time between two changes, and after it becomes active before the first. */
  minGapMs: number;
  /** Without GPU timing: lower while the frame interval's signal is over this (a missed refresh at 60 Hz); never raise. */
  intervalLowerOverMs: number;
}

export interface AdaptiveState {
  /** The steps taken down from the cap: 0 is the full cap. */
  level: number;
  /** The scale on the tier's pixel ratio now: 1 at the cap, `floor` at the least. */
  scale: number;
  /** The tier the scale is for; a scale never outlives its tier (null before the first frame). */
  tier: string | null;
  source: AdaptiveSource;
  /** The rolling window of samples in ms (a ring), and a scratch copy sorted for the quantile; both made once. */
  samples: Float32Array;
  sorted: Float32Array;
  count: number;
  next: number;
  /** Whether a sample came since the last judgement: judging sorts the window, so only then. */
  fresh: boolean;
  /** Whether it was active at the last step. */
  active: boolean;
  /** When the scale last changed, or it last became active (ms, the caller's clock). */
  changedAt: number;
}

/** A controller at the full cap, judging by `source`. */
export const newAdaptive = (cfg: Pick<AdaptiveConfig, 'window'>, source: AdaptiveSource = 'gpu'): AdaptiveState => ({
  level: 0,
  scale: 1,
  tier: null,
  source,
  samples: new Float32Array(cfg.window),
  sorted: new Float32Array(cfg.window),
  count: 0,
  next: 0,
  fresh: false,
  active: false,
  changedAt: 0,
});

const clearWindow = (st: AdaptiveState) => {
  st.count = 0;
  st.next = 0;
  st.fresh = false;
};

/** Back to the full cap with an empty window: a new Canvas (a tier change), judging by `source` for `tier`. */
export function resetAdaptive(st: AdaptiveState, tier: string | null, source: AdaptiveSource) {
  st.level = 0;
  st.scale = 1;
  st.tier = tier;
  st.source = source;
  st.active = false;
  st.changedAt = 0;
  clearWindow(st);
}

/** Where it acts (ADR-109): the game screen, on High and Medium. The lab, the welcome screen and Low draw at the full cap. */
export const adaptiveOn = (screen: string, tier: string): tier is AdaptiveTier => screen === 'skate' && (tier === 'high' || tier === 'medium');

/** The scale for `tier`: the controller's while it is that tier's, the full cap otherwise. */
export const scaleFor = (st: Pick<AdaptiveState, 'scale' | 'tier'>, tier: string) => (st.tier === tier ? st.scale : 1);

/**
 * The pixel ratio to draw at: the tier's cap as R3F resolves it (the device's
 * ratio inside [min, max]) times the scale, so never above the device's own
 * ratio or the cap, and never under `floor` of them.
 */
export const scaledDpr = (cap: readonly [number, number], device: number, scale: number) => Math.min(Math.max(cap[0], device), cap[1]) * scale;

/** Adds one sample (ms) to the window; samples that are not a time (0, negative, not a number) are left out. */
export function noteAdaptiveSample(st: AdaptiveState, ms: number) {
  if (!(ms > 0) || !Number.isFinite(ms)) return;
  const n = st.samples.length;
  st.samples[st.next] = ms;
  st.next = (st.next + 1) % n;
  if (st.count < n) st.count += 1;
  st.fresh = true;
}

/** The window's `q` quantile (nearest rank, as the measurement's p95), sorted in the scratch array: no allocation. */
export function windowQuantile(st: AdaptiveState, q: number) {
  const n = st.count;
  if (n === 0) return 0;
  const len = st.sorted.length;
  // The unfilled places sort last, so the whole array sorts in place (a subarray would be a new view).
  for (let i = 0; i < len; i++) st.sorted[i] = i < n ? st.samples[i]! : Infinity;
  st.sorted.sort();
  return st.sorted[Math.min(n - 1, Math.floor(q * n))]!;
}

const levels = (cfg: AdaptiveConfig) => Math.floor((1 - cfg.floor) / cfg.step + 1e-9);
const scaleAt = (cfg: AdaptiveConfig, level: number) => Math.max(cfg.floor, Math.round((1 - level * cfg.step) * 1e6) / 1e6);

/**
 * One step of the controller, on a frame that is being drawn anyway; true
 * when the scale changed (the caller then redraws at it). It acts only where
 * `adaptiveOn`, and changes the scale only at a `quiet` moment (no flight
 * playing, no replay) at least `minGapMs` after the last change, once the
 * window has `minSamples` taken since then. A signal over `choppyMs` is left
 * to the tier's step-down (ADR-59): it neither lowers nor raises, so a lowered
 * resolution never answers frames that slow, and the step-down still sees them.
 */
export function stepAdaptive(
  st: AdaptiveState,
  cfg: AdaptiveConfig,
  now: number,
  screen: string,
  tier: string,
  quiet: boolean,
  choppyMs: number,
): boolean {
  let changed = false;
  if (st.tier !== tier) {
    changed = st.scale !== 1;
    resetAdaptive(st, tier, st.source);
  }
  if (!adaptiveOn(screen, tier)) {
    // Outside the game the window is not this one's evidence; the scale is kept for the next game on this tier.
    if (st.active) clearWindow(st);
    st.active = false;
    return changed;
  }
  if (!st.active) {
    st.active = true;
    st.changedAt = now;
    clearWindow(st);
    return changed;
  }
  if (!quiet || !st.fresh || st.count < cfg.minSamples || now - st.changedAt < cfg.minGapMs) return changed;
  st.fresh = false;
  const signal = windowQuantile(st, cfg.quantile);
  if (signal > choppyMs) return changed;
  let level = st.level;
  if (st.source === 'gpu') {
    const target = cfg.targetMs[tier];
    if (signal > target * cfg.lowerAbove) level = Math.min(levels(cfg), level + 1);
    else if (level > 0) {
      const ratio = scaleAt(cfg, level - 1) / st.scale;
      if (signal * ratio * ratio < target * cfg.raiseBelow) level -= 1;
    }
  } else if (signal > cfg.intervalLowerOverMs) level = Math.min(levels(cfg), level + 1);
  if (level === st.level) return changed;
  st.level = level;
  st.scale = scaleAt(cfg, level);
  st.changedAt = now;
  clearWindow(st);
  return true;
}
