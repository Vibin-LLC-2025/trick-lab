import { expect, test, type Page } from '@playwright/test';
import { open, type DebugWindow } from './helpers';

// A real lost graphics context (the 2026-11-13 review, C-04), made with WEBGL_lose_context: on Low's WebGLRenderer and
// on the WebGPURenderer's WebGL2 backend (Medium and High here, as the checks hide WebGPU). The view gives way to its
// note, the go in the air scores once, and the go's notice comes up with its Continue focused.

test.use({ viewport: { width: 1440, height: 900 } });

type Store = {
  getState: () => {
    startSkate: () => void;
    quitSkate: () => void;
    continueSkate: () => void;
    callSkateTrick: (id: string) => void;
    popTrick: () => void;
    skate: { phase: string };
    status: string;
    sceneUnavailable: boolean;
    events: { type: string }[];
  };
};
async function toMyGo(page: Page) {
  await page.evaluate(() => {
    const st = (window as unknown as { __trickLabStore: Store }).__trickLabStore;
    for (let i = 0; i < 40; i++) {
      st.getState().startSkate();
      if (st.getState().skate.phase === 'you-set') break;
      st.getState().quitSkate();
    }
    st.getState().continueSkate();
    st.getState().callSkateTrick('kickflip');
  });
}

/** Loses the Canvas's own context: WebGLRenderer's, or the WebGPURenderer's WebGL2 backend's. */
const loseContext = (page: Page) =>
  page.evaluate(() => {
    const gl = (window as unknown as DebugWindow).__trickLab.get().gl as unknown as {
      backend?: { gl?: WebGL2RenderingContext };
      getContext?: () => WebGL2RenderingContext;
    };
    const ctx = gl.backend?.gl ?? gl.getContext!();
    const ext = ctx.getExtension('WEBGL_lose_context');
    if (!ext) throw new Error('no WEBGL_lose_context');
    ext.loseContext();
  });

for (const tier of ['low', 'medium'] as const)
  test(`on ${tier}, a lost context mid-flight gives way to the note and the go scores once`, async ({ page }) => {
    const errors = await open(page, tier, 'skate', { 'skate-taught': 'yes', 'skate-auto': 'off', 'pop-mode': 'exact', 'instant-replay': 'on' });
    await toMyGo(page);
    await page.evaluate(() => (window as unknown as { __trickLabStore: Store }).__trickLabStore.getState().popTrick());
    expect(await page.evaluate(() => (window as unknown as { __trickLabStore: Store }).__trickLabStore.getState().status)).toBe('playing');
    await loseContext(page);
    await expect(page.getByRole('note', { name: '3D view unavailable' })).toBeVisible({ timeout: 10_000 });
    const s = await page.evaluate(() => {
      const g = (window as unknown as { __trickLabStore: Store }).__trickLabStore.getState();
      return { gone: g.sceneUnavailable, resolved: g.events.filter((e) => e.type === 'trick.resolved').length, status: g.status };
    });
    expect(s).toEqual({ gone: true, resolved: 1, status: 'done' });
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('skate-notice-continue');
    // The game goes on without the view: Continue, and the next go resolves at once.
    await page.keyboard.press('Enter');
    // three's own handler, kept first (contextLoss.ts), logs the loss we made; nothing else may.
    expect(errors.filter((e) => !/context lost|device lost|CONTEXT_LOST/i.test(e))).toEqual([]);
  });
