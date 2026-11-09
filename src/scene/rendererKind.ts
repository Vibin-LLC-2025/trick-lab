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
