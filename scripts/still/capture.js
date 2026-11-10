// The loading picture (ADR-56): renders the real scene in a browser and
// encodes one WebP per theme. A single function for the global playwright-cli
// (like scripts/measure/measure.js), not a Node script:
//
//   npm run build && npx tsx scripts/measure/serve.ts dist 4173
//   playwright-cli -s=still open "http://localhost:4173/"
//   playwright-cli -s=still --raw run-code --filename=scripts/still/capture.js > stills.json
//   playwright-cli -s=still close
//   npx tsx scripts/still/write.ts stills.json      (checks each file, writes public/stills)
//
// Options from the query of the page the session is on (all optional):
//   w, h   1600, 800   the picture's size (src/asset/stillSpec.ts STILL; write.ts checks it)
//   q      0.6         WebP quality
//   base   /           the app's base path
//
// What it draws: the welcome screen on High at the picture's size, the stage
// alone filling the window (the rest of the page hidden), under reduced
// motion, so the preview holds its still pose (SHOWCASE_STILL) instead of
// looping; feet and legs on (the defaults on High since ADR-70). It waits until the lit scene
// shows every High model, lets a few more frames draw, screenshots the
// canvas, and has the browser encode the WebP (no encoder to install).
// Nothing here changes the app; the page's storage is set per theme.
async (page) => {
  const opts = new URL(page.url()).searchParams;
  const width = Number(opts.get('w') ?? 1600);
  const height = Number(opts.get('h') ?? 800);
  const quality = Number(opts.get('q') ?? 0.6);
  const base = opts.get('base') ?? '/';
  const origin = new URL(page.url()).origin;
  const MODELS = ['Deck_Grip', 'Shoe_Sole', 'Ground_Concrete'];

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width, height });
  // The stage alone, the whole window, no border; its overlays and the old picture hidden.
  await page.addInitScript(
    ([w, h]) => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = `
          .app__stage { position: fixed !important; inset: 0 !important; width: ${w}px !important; height: ${h}px !important;
            border: 0 !important; border-radius: 0 !important; z-index: 1000 !important; }
          .app__still, .preview-toggle, .perf-badge { display: none !important; }`;
        document.head.append(style);
      });
    },
    [width, height],
  );

  const files = {};
  const meta = { when: new Date().toISOString(), size: `${width} x ${height}`, quality, ua: await page.evaluate(() => navigator.userAgent) };
  for (const theme of ['light', 'dark']) {
    await page.goto(`${origin}${base}?debug`);
    await page.evaluate((t) => {
      localStorage.clear();
      localStorage.setItem('trick-lab.quality', 'high');
      localStorage.setItem('trick-lab.theme', t);
    }, theme);
    // A new URL, so the page loads again with that storage.
    await page.goto(`${origin}${base}?debug&still=${theme}`);
    await page.waitForFunction(
      (names) => {
        const s = window.__trickLab && window.__trickLab.get();
        const content = s && s.scene.getObjectByName('scene-content');
        return !!(content && content.visible && names.every((n) => s.scene.getObjectByName(n)));
      },
      MODELS,
      { timeout: 60000 },
    );
    // A few frames with everything in (the first compiles the models' programs).
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.__trickLab.get().invalidate());
      await page.waitForTimeout(250);
    }
    const info = await page.evaluate(() => {
      const s = window.__trickLab.get();
      return { renderer: s.gl.isWebGPURenderer ? 'WebGPU' : 'WebGL', size: `${s.size.width} x ${s.size.height}`, dpr: s.viewport.dpr };
    });
    const png = await page.locator('.app__stage canvas').screenshot();
    files[theme] = await page.evaluate(
      async ([b64, w, h, q]) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        return c.toDataURL('image/webp', q).split(',')[1];
      },
      [png.toString('base64'), width, height, quality],
    );
    meta[theme] = info;
  }
  return { meta, files };
}
