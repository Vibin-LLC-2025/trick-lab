// A lost graphics context reaches the fallback (the 2026-11-13 review, C-04). These drive the watcher with the two
// paths three uses; the real losses (WEBGL_lose_context on both renderers) are browser/contextLoss.spec.ts's.
import { describe, expect, it, vi } from 'vitest';
import { watchContextLoss, type LossSource } from './contextLoss';

describe('the context-loss watcher', () => {
  it("on the WebGPURenderer, runs three's own handler and then ours, once, for a loss three reports", () => {
    const order: string[] = [];
    const gl: LossSource = {
      domElement: document.createElement('canvas'),
      isWebGPURenderer: true,
      onDeviceLost: () => order.push('three'),
    };
    const lost = vi.fn(() => order.push('ours'));
    watchContextLoss(gl, lost);
    // What three passes for a native device lost (reason "unknown"; it never calls for its own destroy()).
    gl.onDeviceLost!({ api: 'WebGPU', message: 'GPU reset', reason: 'unknown' });
    gl.onDeviceLost!({ api: 'WebGL', message: 'lost again', reason: null });
    expect(order).toEqual(['three', 'ours', 'three']);
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it("on WebGLRenderer, follows the canvas's webglcontextlost", () => {
    const canvas = document.createElement('canvas');
    const lost = vi.fn();
    watchContextLoss({ domElement: canvas }, lost);
    canvas.dispatchEvent(new Event('webglcontextlost'));
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it('once detached (the Canvas unmounted, as a tier change does), hears nothing and gives three its handler back', () => {
    const own = vi.fn();
    const gl: LossSource = { domElement: document.createElement('canvas'), isWebGPURenderer: true, onDeviceLost: own };
    const lost = vi.fn();
    const detach = watchContextLoss(gl, lost);
    detach();
    expect(gl.onDeviceLost).toBe(own);
    gl.onDeviceLost!({ reason: 'unknown' });
    expect(lost).not.toHaveBeenCalled();
    const canvas = document.createElement('canvas');
    const lost2 = vi.fn();
    watchContextLoss({ domElement: canvas }, lost2)();
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(lost2).not.toHaveBeenCalled();
  });
});
