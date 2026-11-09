// The repeatable measurement (ADR-48, docs/PERF-BUDGET.md "How to measure").
// A single function for the global playwright-cli, not a Node script:
//
//   npm run build && node scripts/measure/serve.mjs dist 4173   (gzip like GitHub Pages)
//   playwright-cli -s=measure open "http://localhost:4173/?tiers=high,medium,low&nets=full,10,3"
//   playwright-cli -s=measure --raw run-code --filename=scripts/measure/measure.js > measure.json
//   playwright-cli -s=measure close
//
// Options come from the query of the page the session is on (all optional):
//   tiers   high,medium,low       which quality tiers
//   nets    full,10,3             full speed, or Mbps with 60 ms latency; the cache is always off
//   screens home,lab,skate        where draw calls are counted (full speed only)
//   feet    on | off              the Feet switch (default on, the app's default)
//   legs    on | off              the Legs switch (default: the app's own default)
//   theme   dark | light          default dark
//   w, h    1440, 900             the viewport
//   trick   1                     the lab preset key popped for the frame times (1 is the kickflip)
//   pops    4                     tricks timed in the lab, after one untimed pop that warms the GPU up
//   loop    3                     seconds of the welcome preview timed where it loops (Medium, High)
//   base    /                     the app's base path (/trick-lab/ for a Pages build)
//
// What it records, per tier:
// - loading, per network: first contentful paint (the UI), the first frame of
//   the lit 3D scene, the frame where every model of the tier is on screen,
//   when each GLB finished, and the bytes transferred by kind;
// - per screen at full speed: draw calls and triangles (the most seen over
//   half a second of frames, after a forced frame), and the tier's renderer;
// - in the lab, one trick at the current speed: gl.render CPU time and, where
//   the browser exposes EXT_disjoint_timer_query_webgl2, GPU time per frame
//   (median and p95), and the frames drawn in the 1.5 s that follow the
//   landing's own frame (must be 0). Where the welcome preview loops, the same
//   times over a few seconds of it: the GPU's clocks settle there, so its
//   numbers vary less from run to run than a single trick's.
// It reads the renderer through ?debug (window.__trickLab, TrickScene.tsx).
// Nothing here changes the app; the page's storage is set from the query of
// each load by an init script (m-* parameters, below) and cleared first.
async (page) => {
  const opts = new URL(page.url()).searchParams;
  const list = (k, d) => (opts.get(k) ?? d).split(',').filter(Boolean);
  const tiers = list('tiers', 'high,medium,low');
  const nets = list('nets', 'full,10,3');
  const screens = list('screens', 'home,lab,skate');
  const feet = opts.get('feet') ?? 'on';
  const legs = opts.get('legs');
  const theme = opts.get('theme') ?? 'dark';
  const width = Number(opts.get('w') ?? 1440);
  const height = Number(opts.get('h') ?? 900);
  const trick = opts.get('trick') ?? '1';
  const pops = Number(opts.get('pops') ?? 4);
  const loopSeconds = Number(opts.get('loop') ?? 3);
  const base = opts.get('base') ?? '/';
  const origin = new URL(page.url()).origin;
  const HASH = { home: '', lab: '#/lab', skate: '#/skate' };
  // The GLB meshes are named after their nodes (BoardModel, ShoesModel, GroundModel).
  const MODELS = { high: ['Deck_Grip', 'Ground_Concrete', 'Shoe_Sole'], medium: ['Deck_Grip', 'Ground_Concrete'], low: [] };

  await page.setViewportSize({ width, height });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

  // Runs before the app on every load: applies the m-* storage parameters,
  // then watches each animation frame for the first lit frame and for the
  // frame where the tier's models are all drawn.
  await page.addInitScript(() => {
    if (window.__measure) return;
    const q = new URLSearchParams(location.search);
    try {
      if (q.has('m-clear')) localStorage.clear();
      for (const [k, v] of q) if (k.startsWith('m-') && k !== 'm-clear' && k !== 'm-models') localStorage.setItem(`trick-lab.${k.slice(2)}`, v);
    } catch {
      // Blocked storage: the app's defaults apply.
    }
    const want = (q.get('m-models') ?? '').split(',').filter(Boolean);
    const m = (window.__measure = { firstFrame: null, models: want.length ? null : 'none', seen: {} });
    const watch = () => {
      const lab = window.__trickLab;
      if (lab) {
        const s = lab.get();
        const frame = s.gl.info.render.frame;
        // Builds before ADR-48 did not name the group: it is the scene's one group with meshes in it.
        const content =
          s.scene.getObjectByName('scene-content') ??
          s.scene.children.find((o) => o.isGroup && o.children.some((c) => c.isMesh || c.isGroup));
        if (m.firstFrame === null && content && content.visible) {
          if (m.seen.content === undefined) m.seen.content = frame;
          else if (frame > m.seen.content) m.firstFrame = performance.now();
        }
        if (m.models === null && content && content.visible && want.every((n) => s.scene.getObjectByName(n))) {
          if (m.seen.models === undefined) m.seen.models = frame;
          else if (frame > m.seen.models) m.models = performance.now();
        }
      }
      if (m.firstFrame === null || m.models === null) requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });

  const throttle = async (net) => {
    const full = net === 'full';
    const bps = full ? -1 : (Number(net) * 1e6) / 8;
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: full ? 0 : 60,
      downloadThroughput: bps,
      uploadThroughput: bps,
    });
  };

  const urlFor = (tier, screen) => {
    const q = new URLSearchParams({ debug: '', 'm-clear': '', 'm-quality': tier, 'm-feet': feet, 'm-theme': theme });
    if (legs) q.set('m-legs', legs);
    const models = feet === 'off' ? MODELS[tier].filter((n) => !n.startsWith('Shoe')) : MODELS[tier];
    q.set('m-models', models.join(','));
    return `${origin}${base}?${q.toString().replace(/=(&|$)/g, '$1')}${HASH[screen]}`;
  };

  const settle = (timeout) =>
    page.waitForFunction(() => window.__measure && window.__measure.firstFrame !== null && window.__measure.models !== null, null, {
      timeout,
      polling: 200,
    });

  const kb = (b) => Math.round(b / 102.4) / 10;

  const loading = async (tier, net) => {
    await throttle(net);
    await page.goto(urlFor(tier, 'home'), { waitUntil: 'commit' });
    let timedOut = false;
    await settle(120_000).catch(() => (timedOut = true));
    return page.evaluate(
      ({ tier, net, timedOut }) => {
        const m = window.__measure;
        const res = performance.getEntriesByType('resource');
        const nav = performance.getEntriesByType('navigation')[0];
        const bytes = { html: nav ? nav.transferSize : 0, js: 0, css: 0, models: 0, other: 0 };
        const glb = {};
        for (const r of res) {
          const kind = r.name.endsWith('.js') ? 'js' : r.name.endsWith('.css') ? 'css' : r.name.endsWith('.glb') ? 'models' : 'other';
          bytes[kind] += r.transferSize;
          if (kind === 'models') glb[r.name.split('/').pop()] = { start: Math.round(r.startTime), end: Math.round(r.responseEnd), bytes: r.transferSize };
        }
        const fcp = performance.getEntriesByName('first-contentful-paint')[0];
        return {
          tier,
          net,
          timedOut,
          fcp: fcp ? Math.round(fcp.startTime) : null,
          firstFrame: m.firstFrame === null ? null : Math.round(m.firstFrame),
          models: typeof m.models === 'number' ? Math.round(m.models) : m.models,
          glb,
          bytes,
        };
      },
      { tier, net, timedOut },
    );
  };

  /** Draw calls and triangles: the most over half a second of frames, after a forced one. */
  const counts = () =>
    page.evaluate(async () => {
      const s = window.__trickLab.get();
      s.invalidate();
      let calls = 0;
      let triangles = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 500) {
        await new Promise((r) => requestAnimationFrame(r));
        calls = Math.max(calls, s.gl.info.render.calls);
        triangles = Math.max(triangles, s.gl.info.render.triangles);
      }
      return {
        calls,
        triangles,
        frameloop: s.frameloop,
        dpr: s.viewport.dpr,
        antialias: s.gl.getContextAttributes ? s.gl.getContextAttributes().antialias : null,
        geometries: s.gl.info.memory.geometries,
        textures: s.gl.info.memory.textures,
      };
    });

  /** Wraps gl.render once per page: CPU time and, where the extension exists, a GPU timer query per frame. */
  const instrument = () =>
    page.evaluate(() => {
      const s = window.__trickLab.get();
      const gl = s.gl;
      const ctx = gl.getContext();
      const ext = ctx.getExtension && ctx.getExtension('EXT_disjoint_timer_query_webgl2');
      window.__times = { cpu: [], gpu: [], pending: [], ext: !!ext };
      if (gl.__measured) return;
      gl.__measured = true;
      const render = gl.render.bind(gl);
      gl.render = (scene, camera) => {
        const q = ext ? ctx.createQuery() : null;
        if (q) ctx.beginQuery(ext.TIME_ELAPSED_EXT, q);
        const c0 = performance.now();
        render(scene, camera);
        window.__times.cpu.push(performance.now() - c0);
        if (q) {
          ctx.endQuery(ext.TIME_ELAPSED_EXT);
          window.__times.pending.push(q);
        }
      };
      const poll = () => {
        const w = window.__times;
        while (w.pending.length) {
          const q = w.pending[0];
          if (!ctx.getQueryParameter(q, ctx.QUERY_RESULT_AVAILABLE)) break;
          if (!ctx.getParameter(ext.GPU_DISJOINT_EXT)) w.gpu.push(ctx.getQueryParameter(q, ctx.QUERY_RESULT) / 1e6);
          ctx.deleteQuery(q);
          w.pending.shift();
        }
        requestAnimationFrame(poll);
      };
      if (ext) requestAnimationFrame(poll);
    });

  const clearTimes = () =>
    page.evaluate(() => {
      window.__times.cpu.length = 0;
      window.__times.gpu.length = 0;
    });

  const readTimes = () =>
    page.evaluate(() => {
      const w = window.__times;
      const stat = (xs) => {
        if (!xs.length) return null;
        const s = [...xs].sort((a, b) => a - b);
        const at = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
        return { n: s.length, median: Math.round(at(0.5) * 100) / 100, p95: Math.round(at(0.95) * 100) / 100 };
      };
      return { cpu: stat(w.cpu), gpu: w.ext ? stat(w.gpu) : 'unavailable' };
    });

  const popAndLand = async () => {
    await page.keyboard.press('Space');
    // The loop runs while the board is in the air and stops at the landing.
    await page.waitForFunction(() => window.__trickLab.get().frameloop === 'always', null, { timeout: 10_000, polling: 'raf' });
    await page.waitForFunction(() => window.__trickLab.get().frameloop === 'demand', null, { timeout: 30_000, polling: 'raf' });
  };

  /** Tricks in the lab: per-frame gl.render CPU and GPU time over `pops` tricks, then the frames after the last landing. */
  const trickTimes = async () => {
    await instrument();
    await page.keyboard.press(trick);
    await popAndLand();
    await clearTimes();
    for (let i = 0; i < pops; i++) await popAndLand();
    const times = await readTimes();
    // The landing itself asks for one frame (the store changed); then nothing may draw.
    await page.waitForTimeout(300);
    const frames0 = await page.evaluate(() => window.__trickLab.get().gl.info.render.frame);
    await page.waitForTimeout(1500);
    const idleFrames = await page.evaluate((f0) => window.__trickLab.get().gl.info.render.frame - f0, frames0);
    return { ...times, idleFrames };
  };

  /** The welcome preview where it loops: the same times over `loopSeconds`, after a second to warm up. */
  const loopTimes = async () => {
    await instrument();
    await page.waitForTimeout(1000);
    await clearTimes();
    await page.waitForTimeout(loopSeconds * 1000);
    await page.waitForTimeout(200);
    return readTimes();
  };

  const out = { when: new Date().toISOString(), viewport: `${width} x ${height}`, feet, legs: legs ?? 'default', theme, ua: await page.evaluate(() => navigator.userAgent), rows: [] };
  const renderer = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    const i = c && c.getExtension('WEBGL_debug_renderer_info');
    return c ? c.getParameter(i ? i.UNMASKED_RENDERER_WEBGL : c.RENDERER) : 'no WebGL2';
  });
  out.gpu = renderer;

  for (const tier of tiers) {
    const row = { tier, loading: [], screens: {} };
    for (const net of nets) row.loading.push(await loading(tier, net));
    await throttle('full');
    for (const screen of screens) {
      await page.goto(urlFor(tier, screen), { waitUntil: 'commit' });
      await settle(60_000).catch(() => {});
      await page.waitForTimeout(300);
      const c = await counts();
      if (screen === 'lab') c.trick = await trickTimes();
      if (screen === 'home' && c.frameloop === 'always') c.trick = await loopTimes();
      row.screens[screen] = c;
    }
    out.rows.push(row);
  }
  await throttle('full');

  // A table per section, ready for PERF-BUDGET.md.
  const md = [];
  md.push(`Measured ${out.when.slice(0, 10)}, ${out.viewport}, ${out.gpu}, feet ${feet}, legs ${out.legs}, ${theme} theme, cache off.`);
  md.push('', '| Tier | Network | UI (FCP) | First 3D frame | All models on screen | JS | Models |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const r of out.rows)
    for (const l of r.loading) {
      const s = (ms) => (ms === null || ms === 'none' ? (ms === 'none' ? 'none' : 'timed out') : `${(ms / 1000).toFixed(2)} s`);
      md.push(`| ${r.tier} | ${l.net === 'full' ? 'full speed' : `${l.net} Mbps`} | ${s(l.fcp)} | ${s(l.firstFrame)} | ${s(l.models)} | ${kb(l.bytes.js)} KB | ${kb(l.bytes.models)} KB |`);
    }
  md.push('', '| Tier | Screen | Draw calls | Triangles | Frameloop | Textures | gl.render CPU, median / p95 | GPU, median / p95 | Idle frames after the landing |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  // Times: the lab's are over the timed tricks, the welcome screen's over its looping preview.
  for (const r of out.rows)
    for (const [screen, c] of Object.entries(r.screens)) {
      const t = c.trick;
      const ms = (x) => (x && typeof x === 'object' ? `${x.median} / ${x.p95} ms` : x ?? '');
      md.push(`| ${r.tier} | ${screen} | ${c.calls} | ${c.triangles.toLocaleString('en-US')} | ${c.frameloop} | ${c.textures} | ${t ? ms(t.cpu) : ''} | ${t ? ms(t.gpu) : ''} | ${t && t.idleFrames !== undefined ? t.idleFrames : ''} |`);
    }
  out.markdown = md.join('\n');
  return out;
}
