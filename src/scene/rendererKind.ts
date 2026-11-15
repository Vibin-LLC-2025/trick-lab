// Which renderer a Canvas runs (ADR-50) and how to read its numbers, without
// importing either renderer: three's WebGLRenderer on Low, its WebGPURenderer
// (WebGPU, or its own WebGL2 backend where WebGPU is missing) on Medium and
// High. They count differently: WebGLRenderer's `info.render.calls` is the
// last frame's draw calls; WebGPURenderer's is every render call since it
// started, and its frame's draw calls are `info.render.drawCalls`.

interface RendererInfo {
  info: { render: { calls: number; triangles: number; drawCalls?: number }; memory: { geometries: number; textures: number }; reset?: () => void };
  isWebGPURenderer?: boolean;
}

/** True for a WebGPURenderer, on either of its backends. */
export const isNodeRenderer = (gl: unknown): boolean => (gl as RendererInfo | null)?.isWebGPURenderer === true;

/** The last frame's draw calls on either renderer. */
export const drawCallsOf = (gl: RendererInfo): number => (isNodeRenderer(gl) ? (gl.info.render.drawCalls ?? 0) : gl.info.render.calls);

interface TimedRenderer {
  backend?: { trackTimestamp?: boolean };
  hasFeature?: (name: string) => boolean;
  resolveTimestampsAsync?: (type: 'render') => Promise<number | undefined>;
}

/**
 * Whether the renderer times the GPU (ADR-109): a WebGPURenderer made with
 * `trackTimestamp` whose backend has timestamp queries (WebGPU's
 * `timestamp-query`, or EXT_disjoint_timer_query_webgl2 on its WebGL2
 * backend). Read once per Canvas; WebGLRenderer (Low) never does.
 */
export const timesGpu = (gl: unknown): boolean => {
  const r = gl as TimedRenderer | null;
  return isNodeRenderer(gl) && r?.backend?.trackTimestamp === true && r.hasFeature?.('timestamp-query') === true;
};

/** The GPU time of the last frame drawn, in ms, once its timestamp queries resolve (only where `timesGpu`). */
export const readGpuMs = (gl: unknown) => (gl as Required<TimedRenderer>).resolveTimestampsAsync('render');
