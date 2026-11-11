// The repeatable measurement (ADR-48, docs/PERF-BUDGET.md "How to measure").
// A single function for the global playwright-cli, not a Node script:
//
//   npm run build && npx tsx scripts/measure/serve.ts dist 4173   (gzip like GitHub Pages)
//   playwright-cli -s=measure open "http://localhost:4173/?tiers=high,medium,low&nets=full,10,3"
//   playwright-cli -s=measure --raw run-code --filename=scripts/measure/measure.js > measure.json
//   playwright-cli -s=measure close
//
// Options come from the query of the page the session is on (all optional):
//   tiers    high,medium,low      which quality tiers
//   nets     full,10,3            full speed, or Mbps with 60 ms latency (Chromium only)
//   visits   cold,http,sw         how each load is made (below)
//   screens  home,lab,skate       where draw calls are counted (full speed only)
//   switches all | none           every switch combination's draw calls, or only the defaults
//   feet     on | off             the Feet switch for the loads and screens (default on, the app's default)
//   legs     on | off             the Legs switch (default: the app's own default)
//   theme    dark | light         default dark
//   w, h     1440, 900            the viewport
//   trick    1                    the lab preset key popped for the frame times (1 is the kickflip)
//   spin     7                    the preset popped for the switch combinations' draw calls (7 is the 360 flip)
//   pops     4                    tricks timed in the lab, after one untimed pop that warms the GPU up
//   loop     3                    seconds of the welcome preview timed where it loops (Medium, High)
//   game     on | off             a whole game of SKATE played and timed on the game screen (below)
//   gos      60                   the most goes that game may take
//   base     /                    the app's base path (/trick-lab/ for a Pages build)
//   cpu      1                    CPU slowdown for the loads (4 is a rough Chromebook stand-in; Chromium only)
//   warm     on | off             one unmeasured load of each tier first (below)
//
// Visits (PLAN-PLAY-POLISH-REACH step 1):
// - cold: a fresh browser context with the HTTP cache off;
// - http: the same context, cache on, loaded once to fill the cache, then measured;
// - sw:   the same context after the service worker is active (once a build
//         has one: `sw.js` at the base), loaded without `?nosw`, then measured.
//         A build without a worker reports it as unavailable.
// The cold and http loads carry `?nosw`, so a build with a worker registers
// none and bootstraps nothing during them.
//
// Warm-up: the browser's GPU process keeps compiled shaders across contexts,
// so the first load of a tier in a run is slower than every later one (High
// at full speed: 1.5 to 1.7 s against 1.05 s, measured 2026-11-09). By default
// each tier is loaded once, unmeasured, before its measured loads, as the
// earlier tables were (their session's page was the app). warm=off shows a
// browser's very first load instead.
//
// What it records, per tier:
// - loading, per network and visit: first contentful paint (the UI), when the
//   loading picture arrived and when it lifted (ADR-56), the first frame of
//   the lit 3D scene, the frame where every model of the tier is on screen,
//   when each GLB finished, every request by its pathname (so `?v=` versions
//   and hashed names still count) with its bytes, and the bytes by kind;
// - per screen at full speed: draw calls and triangles (the most over half a
//   second of frames, after a forced frame), and the tier's renderer;
// - with switches=all, the draw calls of every switch combination: on the
//   welcome screen over half a second (feet, legs; its preview has no trails
//   or cues), in the lab over a `spin` trick (feet, legs, foot trails, motion
//   cues; the legs need the feet). The most seen is the ledger's number
//   (PLAN-PLAY-POLISH-REACH, "Draw-call ledger");
// - in the lab, over `pops` tricks at the current speed, per frame: the render
//   CPU time, the frame's whole work on the main thread (`workMs`, from R3F's
//   before-effect to the end of the draw; builds before ADR-62 do not report
//   it), the interval from the frame before, and, where the browser exposes
//   it, GPU time; each as median, p95 and the longest. Then the landing's
//   frames, by the store (below). Where the welcome preview loops, the same
//   times over a few seconds of it.
//
// A whole game (PLAN-PLAY-POLISH-REACH step 20): on the game screen, with
// exact pops and the computer waiting for a key, a game is played to its end
// (or `gos` goes): the student sets a trick they land, then one they bail,
// and bails every copy, so the game has clean landings, bails, the computer's
// own goes and the instant replay, and ends with the student spelling SKATE.
// Every go is a real Space press. Frames run from the push-off to the board
// coming to rest, so a game is thousands of frames against a lab trick's
// sixty. Reported apart: the first go of the visit (what a first pop costs
// while the graphics card prepares anything new) and the rest of the game,
// each with the same times as the lab's tricks and the count of frame
// intervals over 20 ms (a missed refresh at 60 Hz) and over 34 ms (two).
//
// Targets (ADR-62, docs/PERF-BUDGET.md "Targets"): the last table checks each
// tier's tricks against its frame-time targets and its draw-call cap, and
// `pass` says whether every one held. The longest interval is a dropped-frame
// check: the target is no frame longer than 16.7 ms (one refresh at 60 Hz),
// and the gate is under 20 ms to leave room for the timer's jitter. At 60 Hz
// any missed refresh (33.3 ms) fails; at 120 Hz one missed refresh (16.7 ms)
// passes and two (25 ms) fail.
//
// Landings are read from the store (`window.__trickLabStore` under ?debug),
// not from the frameloop. The endpoint frame is the one that draws the
// landing: the store resolves inside FlightDriver's frame, before PerfProbe
// renders it. Counted: the frames from the endpoint to the point where R3F
// reports no pending frame (the frameloop is demand and `internal.frames` is
// 0), which may be at most the one the landing's own write queued, then the
// frames after that point over 1.5 s, which must be 0. A remount of the Canvas
// (`__trickLabPerf.root` changed) drops the sample. Builds without the store
// fall back to the frameloop: frames counted over 1.5 s from 300 ms after it
// returned to demand.
//
// A Canvas is measured once it is ready: `__trickLabPerf.ready` for the
// current `__trickLabPerf.root` (rootReadiness.ts), which counts every startup
// write; builds without it fall back to the first lit frame and the models.
//
// Portable: draw calls, frames, the store's flags, and bytes from resource
// timing. Chromium only: network throttling, CPU slowdown and the HTTP cache
// switch (CDP), and the GPU timer queries. Elsewhere (Firefox, WebKit) those
// are reported as unavailable, never guessed.
//
// Nothing here changes the app; the page's storage is set from the query of
// each load by an init script (m-* parameters, below) and cleared first.
async (page) => {
  const opts = new URL(page.url()).searchParams;
  const list = (k, d) => (opts.get(k) ?? d).split(',').filter(Boolean);
  const tiers = list('tiers', 'high,medium,low');
  const nets = list('nets', 'full,10,3');
  const visits = list('visits', 'cold,http,sw');
  const screens = list('screens', 'home,lab,skate');
  const switches = opts.get('switches') ?? 'all';
  const feet = opts.get('feet') ?? 'on';
  const legs = opts.get('legs');
  const theme = opts.get('theme') ?? 'dark';
  const width = Number(opts.get('w') ?? 1440);
  const height = Number(opts.get('h') ?? 900);
  const trick = opts.get('trick') ?? '1';
  const spin = opts.get('spin') ?? '7';
  const pops = Number(opts.get('pops') ?? 4);
  const loopSeconds = Number(opts.get('loop') ?? 3);
  const game = (opts.get('game') ?? 'on') === 'on';
  const gos = Number(opts.get('gos') ?? 60);
  const base = opts.get('base') ?? '/';
  const cpu = Number(opts.get('cpu') ?? 1);
  const warm = (opts.get('warm') ?? 'on') === 'on';
  const origin = new URL(page.url()).origin;
  const HASH = { home: '', lab: '#/lab', skate: '#/skate' };
  // The GLB meshes are named after their nodes (BoardModel, ShoesModel, GroundModel).
  const MODELS = { high: ['Deck_Grip', 'Ground_Concrete', 'Shoe_Sole'], medium: ['Deck_Grip', 'Ground_Concrete'], low: [] };
  const browser = page.context().browser();
  const engine = browser ? browser.browserType().name() : 'chromium';
  const chromium = engine === 'chromium';

  // Runs before the app on every load: applies the m-* storage parameters,
  // then watches each animation frame for the first lit frame and for the
  // frame where the tier's models are all drawn.
  const init = () => {
    if (window.__measure) return;
    const q = new URLSearchParams(location.search);
    try {
      if (q.has('m-clear')) localStorage.clear();
      for (const [k, v] of q) if (k.startsWith('m-') && k !== 'm-clear' && k !== 'm-models') localStorage.setItem(`trick-lab.${k.slice(2)}`, v);
    } catch {
      // Blocked storage: the app's defaults apply.
    }
    const want = (q.get('m-models') ?? '').split(',').filter(Boolean);
    const m = (window.__measure = { firstFrame: null, models: want.length ? null : 'none', lifted: null, seen: {} });
    // The loading picture lifts (ADR-56): marked lifted to fade, or removed at once under reduced motion.
    new MutationObserver(() => {
      if (m.lifted !== null) return;
      const still = document.querySelector('.app__still');
      if (still) m.seen.still = true;
      if ((still && still.hasAttribute('data-lifted')) || (!still && m.seen.still)) m.lifted = performance.now();
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-lifted'] });
    let previous = -1;
    const watch = () => {
      const lab = window.__trickLab;
      if (lab) {
        const s = lab.get();
        const frame = window.__trickLabPerf ? window.__trickLabPerf.frames : s.gl.info.render.frame;
        // A frame drawn since the last tick may already show what this tick first sees: on a demand
        // loop (Low, an idle screen) no later frame may come for a long time, so it counts.
        const drawn = previous >= 0 && frame > previous;
        previous = frame;
        // Builds before ADR-48 did not name the group: it is the scene's one group with meshes in it.
        const content =
          s.scene.getObjectByName('scene-content') ??
          s.scene.children.find((o) => o.isGroup && o.children.some((c) => c.isMesh || c.isGroup));
        if (m.firstFrame === null && content && content.visible) {
          if (m.seen.content === undefined) {
            m.seen.content = frame;
            if (drawn) m.firstFrame = performance.now();
          } else if (frame > m.seen.content) m.firstFrame = performance.now();
        }
        if (m.models === null && content && content.visible && want.every((n) => s.scene.getObjectByName(n))) {
          if (m.seen.models === undefined) {
            m.seen.models = frame;
            if (drawn) m.models = performance.now();
          } else if (frame > m.seen.models) m.models = performance.now();
        }
      }
      if (m.firstFrame === null || m.models === null) requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  };

  /** A fresh browser context (an empty cache, no worker, no storage), or this one cleared where the session has no browser handle. */
  const freshContext = async () => {
    if (browser) return { ctx: await browser.newContext({ viewport: { width, height } }), own: true };
    const ctx = page.context();
    if (chromium) {
      const c = await ctx.newCDPSession(page);
      await c.send('Network.clearBrowserCache');
      await c.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
      await c.detach();
    }
    return { ctx, own: false };
  };

  const openPage = async (ctx) => {
    const p = await ctx.newPage();
    await p.setViewportSize({ width, height });
    await p.addInitScript(init);
    let cdp = null;
    if (chromium) {
      cdp = await ctx.newCDPSession(p);
      await cdp.send('Network.enable');
    }
    return { p, cdp };
  };

  const throttle = async (cdp, net) => {
    if (!cdp) return;
    const full = net === 'full';
    const bps = full ? -1 : (Number(net) * 1e6) / 8;
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: full ? 0 : 60,
      downloadThroughput: bps,
      uploadThroughput: bps,
    });
  };

  const urlFor = (tier, screen, prefs = {}, nosw = true) => {
    const q = new URLSearchParams({ debug: '', 'm-clear': '', 'm-quality': tier, 'm-theme': theme });
    if (nosw) q.set('nosw', '');
    const f = prefs.feet ?? feet;
    q.set('m-feet', f);
    const l = prefs.legs ?? legs;
    if (l) q.set('m-legs', l);
    if (prefs.trails) q.set('m-foot-trails', prefs.trails);
    if (prefs.cues) q.set('m-motion-cues', prefs.cues);
    // The game screen: past the first game's walk-through, exact pops, and the computer waits for a key.
    if (screen === 'skate') {
      q.set('m-skate-taught', 'yes');
      q.set('m-pop-mode', 'exact');
      q.set('m-skate-auto', 'off');
    }
    const models = f === 'off' ? MODELS[tier].filter((n) => !n.startsWith('Shoe')) : MODELS[tier];
    q.set('m-models', models.join(','));
    return `${origin}${base}?${q.toString().replace(/=(&|$)/g, '$1')}${HASH[screen]}`;
  };

  // Done when the lit scene and the models are in and, if there was a loading picture, it lifted.
  const settle = (p, timeout) =>
    p.waitForFunction(
      () => {
        const m = window.__measure;
        return m && m.firstFrame !== null && m.models !== null && (m.lifted !== null || !m.seen.still);
      },
      null,
      { timeout, polling: 200 },
    );

  /** The current Canvas has finished starting up (rootReadiness.ts); older builds: the settle above. */
  const ready = async (p, timeout) => {
    await settle(p, timeout);
    await p.waitForFunction(() => {
      const perf = window.__trickLabPerf;
      return !perf || !('ready' in perf) || perf.ready;
    }, null, { timeout, polling: 'raf' });
  };

  const kb = (b) => Math.round(b / 102.4) / 10;

  /** Reads one load's numbers from the page. */
  const readLoad = (p, meta) =>
    p.evaluate((meta) => {
      const m = window.__measure;
      const res = performance.getEntriesByType('resource');
      const nav = performance.getEntriesByType('navigation')[0];
      const bytes = { html: nav ? nav.transferSize : 0, js: 0, css: 0, models: 0, wasm: 0, other: 0 };
      const glb = {};
      const requests = [];
      for (const r of res) {
        // By pathname, not the whole URL, so a ?v= version or a query still counts.
        const path = new URL(r.name).pathname;
        const kind = path.endsWith('.js') ? 'js' : path.endsWith('.css') ? 'css' : path.endsWith('.glb') ? 'models' : path.endsWith('.wasm') ? 'wasm' : 'other';
        bytes[kind] += r.transferSize;
        requests.push({ path, kind, bytes: r.transferSize, status: r.responseStatus ?? null });
        if (kind === 'models') glb[path.split('/').pop()] = { start: Math.round(r.startTime), end: Math.round(r.responseEnd), bytes: r.transferSize };
      }
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      const still = res.find((r) => new URL(r.name).pathname.includes('/stills/') && r.responseStatus !== 404);
      return {
        ...meta,
        fcp: fcp ? Math.round(fcp.startTime) : null,
        picture: still ? { loaded: Math.round(still.responseEnd), lifted: m.lifted === null ? null : Math.round(m.lifted), bytes: still.transferSize } : null,
        firstFrame: m.firstFrame === null ? null : Math.round(m.firstFrame),
        models: typeof m.models === 'number' ? Math.round(m.models) : m.models,
        glb,
        bytes,
        requests,
      };
    }, meta);

  /** One measured navigation: throttled, timed, read. */
  const timedLoad = async (p, cdp, url, meta) => {
    await throttle(cdp, meta.net);
    if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await p.goto(url, { waitUntil: 'commit' });
    let timedOut = false;
    await settle(p, 120_000).catch(() => (timedOut = true));
    if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    return readLoad(p, { ...meta, timedOut });
  };

  /** The loads of one tier on one network: cold, then the HTTP cache, then the service worker, in one context. */
  const loading = async (tier, net) => {
    const rows = [];
    if (!chromium && net !== 'full') return visits.map((visit) => ({ tier, net, visit, unavailable: `throttling is Chromium only (${engine})` }));
    const { ctx, own } = await freshContext();
    const { p, cdp } = await openPage(ctx);
    try {
      for (const visit of visits) {
        if (visit === 'cold') {
          if (cdp) await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
          rows.push(await timedLoad(p, cdp, urlFor(tier, 'home'), { tier, net, visit }));
        } else if (visit === 'http') {
          if (!cdp) {
            rows.push({ tier, net, visit, unavailable: `the cache switch is Chromium only (${engine})` });
            continue;
          }
          // Filled at full speed, unmeasured, then measured on the network.
          await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
          await throttle(cdp, 'full');
          await p.goto(urlFor(tier, 'home'), { waitUntil: 'commit' });
          await settle(p, 60_000).catch(() => {});
          rows.push(await timedLoad(p, cdp, urlFor(tier, 'home'), { tier, net, visit }));
        } else if (visit === 'sw') {
          await throttle(cdp, 'full');
          const has = await p.evaluate(async (u) => {
            if (!('serviceWorker' in navigator)) return 'no service worker in this browser';
            const r = await fetch(u, { cache: 'no-store' }).catch(() => null);
            return r && r.ok ? true : 'no sw.js in this build';
          }, `${origin}${base}sw.js`);
          if (has !== true) {
            rows.push({ tier, net, visit, unavailable: has });
            continue;
          }
          if (cdp) await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
          // First a load that registers the worker and hands it what the page used, then the measured one.
          await p.goto(urlFor(tier, 'home', {}, false), { waitUntil: 'commit' });
          await settle(p, 60_000).catch(() => {});
          const active = await p
            .evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 10_000))]))
            .catch(() => false);
          if (!active) {
            rows.push({ tier, net, visit, unavailable: 'the worker never became active' });
            continue;
          }
          await p.waitForTimeout(1000);
          rows.push(await timedLoad(p, cdp, urlFor(tier, 'home', {}, false), { tier, net, visit }));
        }
      }
    } finally {
      await throttle(cdp, 'full');
      await p.close();
      if (own) await ctx.close();
    }
    return rows;
  };

  /** Draw calls and triangles: the most over `ms` of frames, after a forced one. */
  const counts = (p, ms = 500) =>
    p.evaluate(async (ms) => {
      const s = window.__trickLab.get();
      s.invalidate();
      let calls = 0;
      let triangles = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        await new Promise((r) => requestAnimationFrame(r));
        const perf = window.__trickLabPerf;
        calls = Math.max(calls, perf ? perf.drawCalls : s.gl.info.render.calls);
        triangles = Math.max(triangles, perf ? perf.triangles : s.gl.info.render.triangles);
      }
      return {
        calls,
        triangles,
        renderer: s.gl.isWebGPURenderer ? (s.gl.backend && s.gl.backend.isWebGPUBackend ? 'WebGPU' : 'WebGPU on WebGL2') : 'WebGL',
        frameloop: s.frameloop,
        dpr: s.viewport.dpr,
        antialias: s.gl.getContextAttributes ? s.gl.getContextAttributes().antialias : null,
        geometries: s.gl.info.memory.geometries,
        textures: s.gl.info.memory.textures,
      };
    }, ms);

  /** The most draw calls over a `spin` trick in the lab, counted from just before the pop. */
  const trickCalls = async (p) => {
    await p.keyboard.press(spin);
    await p.waitForTimeout(300);
    const result = p.evaluate(async () => {
      let calls = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 1400) {
        await new Promise((r) => requestAnimationFrame(r));
        calls = Math.max(calls, window.__trickLabPerf.drawCalls);
      }
      return calls;
    });
    await p.waitForTimeout(50);
    await p.keyboard.press('Space');
    const calls = await result;
    await p.waitForTimeout(600);
    return calls;
  };

  /** Wraps the render once per page: CPU time and, where the browser has it, a GPU timer query per frame. */
  const instrument = (p) =>
    p.evaluate(() => {
      const s = window.__trickLab.get();
      const gl = s.gl;
      // Per drawn frame, on either renderer: the frame's whole work, and the interval from the frame
      // before when the two came on consecutive animation frames (a run of frames, not a wake-up).
      const frames = { work: [], interval: [] };
      if (!gl.__measured) {
        const perf = window.__trickLabPerf;
        let seenFrame = perf.frames;
        let lastDrew = false;
        let lastAt = 0;
        const tick = (now) => {
          const drew = perf.frames !== seenFrame;
          seenFrame = perf.frames;
          if (drew) {
            if (typeof perf.workMs === 'number') window.__times.work.push(perf.workMs);
            if (lastDrew) window.__times.interval.push(now - lastAt);
          }
          lastDrew = drew;
          lastAt = now;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
      if (gl.isWebGPURenderer) {
        // Timestamp queries, resolved once per frame PerfProbe drew (the resolve sums every pass of it).
        const timed = gl.backend && gl.backend.trackTimestamp && gl.hasFeature('timestamp-query');
        window.__times = { cpu: [], gpu: [], pending: [], ext: timed, ...frames };
        if (gl.__measured) return;
        gl.__measured = true;
        // A frame can be several render calls (the effects' passes, ADR-51): PerfProbe times the whole frame.
        let seen = window.__trickLabPerf.frames;
        const poll = async () => {
          const f = window.__trickLabPerf.frames;
          if (f !== seen) {
            seen = f;
            window.__times.cpu.push(window.__trickLabPerf.renderMs);
            if (timed) {
              const ms = await gl.resolveTimestampsAsync('render');
              if (typeof ms === 'number' && ms > 0) window.__times.gpu.push(ms);
            }
          }
          requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
        return;
      }
      const ctx = gl.getContext();
      const ext = ctx.getExtension && ctx.getExtension('EXT_disjoint_timer_query_webgl2');
      window.__times = { cpu: [], gpu: [], pending: [], ext: !!ext, ...frames };
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

  const clearTimes = (p) =>
    p.evaluate(() => {
      window.__times.cpu.length = 0;
      window.__times.gpu.length = 0;
      window.__times.work.length = 0;
      window.__times.interval.length = 0;
    });

  const readTimes = (p) =>
    p.evaluate(() => {
      const w = window.__times;
      const stat = (xs) => {
        if (!xs.length) return null;
        const s = [...xs].sort((a, b) => a - b);
        const at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
        const r = (x) => Math.round(x * 100) / 100;
        return { n: s.length, median: r(at(0.5)), p95: r(at(0.95)), max: r(s[s.length - 1]) };
      };
      return { cpu: stat(w.cpu), gpu: w.ext ? stat(w.gpu) : 'unavailable', work: stat(w.work) ?? 'unavailable', interval: stat(w.interval) };
    });

  /**
   * Pops (a real Space press) and waits for the landing by the store; with a
   * window, returns the landing's frames (header). Builds without the store:
   * waits by the frameloop and returns null.
   */
  const popAndLand = async (p, windowMs = 0) => {
    const armed = await p.evaluate(() => {
      const store = window.__trickLabStore;
      const perf = window.__trickLabPerf;
      if (!store) return false;
      const l = (window.__landing = { root: perf.root, endpoint: null, stop: null });
      l.stop = store.subscribe((s, prev) => {
        // The landing's write runs inside FlightDriver's frame, before PerfProbe draws it: that frame is the endpoint.
        if (l.endpoint === null && prev.status === 'playing' && s.status !== 'playing') l.endpoint = perf.frames + 1;
      });
      return true;
    });
    await p.keyboard.press('Space');
    if (!armed) {
      await p.waitForFunction(() => window.__trickLab.get().frameloop === 'always', null, { timeout: 10_000, polling: 'raf' });
      await p.waitForFunction(() => window.__trickLab.get().frameloop === 'demand', null, { timeout: 30_000, polling: 'raf' });
      return null;
    }
    return p.evaluate(async (windowMs) => {
      const l = window.__landing;
      const perf = window.__trickLabPerf;
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      const until = async (test, ms) => {
        const t0 = performance.now();
        while (!test()) {
          if (performance.now() - t0 > ms) throw new Error('timed out');
          await raf();
        }
      };
      try {
        await until(() => l.endpoint !== null, 30_000);
      } finally {
        l.stop();
      }
      if (!windowMs) return null;
      // R3F reports no pending frame: the loop is on demand and nothing is queued.
      const idle = () => {
        const s = window.__trickLab.get();
        return s.frameloop === 'demand' && s.internal.frames === 0 && perf.frames >= l.endpoint;
      };
      await until(idle, 5_000);
      const atIdle = perf.frames;
      const t0 = performance.now();
      while (performance.now() - t0 < windowMs) await raf();
      if (perf.root !== l.root) return { dropped: 'the Canvas remounted' };
      return { toIdle: atIdle - l.endpoint, afterIdle: perf.frames - atIdle };
    }, windowMs);
  };

  /** Tricks in the lab: per-frame render CPU and GPU time over `pops` tricks, then the landing's frames. */
  const trickTimes = async (p) => {
    await instrument(p);
    await p.keyboard.press(trick);
    await popAndLand(p);
    await clearTimes(p);
    for (let i = 0; i < pops; i++) await popAndLand(p);
    const times = await readTimes(p);
    let landing = await popAndLand(p, 1500);
    if (landing === null) {
      // Builds without the store: the landing itself asks for one frame (the store changed); then nothing may draw.
      await p.waitForTimeout(300);
      const framesNow = () => (window.__trickLabPerf ? window.__trickLabPerf.frames : window.__trickLab.get().gl.info.render.frame);
      const frames0 = await p.evaluate(framesNow);
      await p.waitForTimeout(1500);
      landing = { toIdle: null, afterIdle: (await p.evaluate(framesNow)) - frames0 };
    }
    return { ...times, landing };
  };

  /** The welcome preview where it loops: the same times over `loopSeconds`, after a second to warm up. */
  const loopTimes = async (p) => {
    await instrument(p);
    await p.waitForTimeout(1000);
    await clearTimes(p);
    await p.waitForTimeout(loopSeconds * 1000);
    await p.waitForTimeout(200);
    return readTimes(p);
  };

  /** The frame intervals so far that missed a refresh at 60 Hz, and two. */
  const longFrames = (p) =>
    p.evaluate(() => ({ over20: window.__times.interval.filter((x) => x > 20).length, over34: window.__times.interval.filter((x) => x > 34).length }));

  /**
   * A whole game of SKATE on the game screen (header): the first go's times,
   * then the rest of the game's. Each go: set the student's inputs if it is
   * theirs, press Space, wait for the flight and for everything to come to
   * rest (the roll, the landing's motion, the instant replay).
   */
  const gameTimes = async (p) => {
    await instrument(p);
    await p.evaluate(() => {
      const st = window.__trickLabStore;
      st.getState().startSkate();
      window.__game = { yours: 0, grades: { clean: 0, sketchy: 0, bail: 0 }, replays: 0 };
      st.subscribe((s, prev) => {
        if (s.result && !prev.result) window.__game.grades[s.result.grade] += 1;
        if (s.replay === 'plays' && prev.replay !== 'plays') window.__game.replays += 1;
      });
    });
    await p.waitForTimeout(300);
    const go = async () => {
      const before = await p.evaluate(() => {
        const st = window.__trickLabStore;
        // Past the notice over the stage (the coin flip, each go's result, ADR-80): a Space press there only continues.
        st.getState().continueSkate();
        const g = st.getState().skate;
        if (g.phase === 'off' || g.phase === 'over') return null;
        if (g.phase === 'you-set' || g.phase === 'you-copy') {
          const G = window.__game;
          // Sets: one landed, one bailed, in turn. Copies: all bailed, so the game ends.
          const good = g.phase === 'you-set' && G.yours % 2 === 0;
          if (g.phase === 'you-set') {
            G.yours += 1;
            const open = ['kickflip', 'heelflip', 'pop-shove-it', 'frontside-pop-shove-it', '360-flip', '360-shove-it', 'double-kickflip', 'double-heelflip'].filter((id) => !g.used.includes(id));
            st.getState().callSkateTrick(open[0]);
          }
          const call = st.getState().skate.call;
          const k = good ? 1 : 0.5;
          st.getState().setInput('pop', 0.35);
          st.getState().setInput('flick', 1.9 * call.flips * k);
          st.getState().setInput('scoop', 0.9 * call.halfShoves * k);
        }
        return st.getState().flightId;
      });
      if (before === null) return false;
      await p.keyboard.press('Space');
      await p.waitForFunction(
        (before) => {
          const s = window.__trickLabStore.getState();
          return s.flightId !== before && s.status !== 'playing' && s.roll === 'still' && s.landing !== 'plays' && s.replay === 'none';
        },
        before,
        { timeout: 60_000, polling: 'raf' },
      );
      await p.waitForTimeout(150);
      return true;
    };
    await clearTimes(p);
    await go();
    const first = { ...(await readTimes(p)), ...(await longFrames(p)) };
    await clearTimes(p);
    let played = 1;
    while (played < gos && (await go())) played += 1;
    const rest = { ...(await readTimes(p)), ...(await longFrames(p)) };
    const end = await p.evaluate(() => {
      const s = window.__trickLabStore.getState();
      return { phase: s.skate.phase, letters: s.skate.letters, grades: window.__game.grades, replays: window.__game.replays };
    });
    return { gos: played, first, rest, ...end };
  };

  // The switch combinations: the welcome screen shows feet and legs only; the lab adds trails and cues. Legs need the feet.
  const combos = (screen) => {
    const out = [];
    for (const f of ['off', 'on'])
      for (const l of f === 'on' ? ['off', 'on'] : ['off'])
        if (screen === 'home') out.push({ feet: f, legs: l });
        else for (const t of ['off', 'on']) for (const c of ['off', 'on']) out.push({ feet: f, legs: l, trails: t, cues: c });
    return out;
  };
  const comboName = (c) => ['feet', 'legs', 'trails', 'cues'].filter((k) => c[k] === 'on').join('+') || 'none';

  const out = {
    when: new Date().toISOString(),
    engine,
    viewport: `${width} x ${height}`,
    feet,
    legs: legs ?? 'default',
    theme,
    ua: await page.evaluate(() => navigator.userAgent),
    rows: [],
  };
  out.gpu = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    const i = c && c.getExtension('WEBGL_debug_renderer_info');
    return c ? c.getParameter(i ? i.UNMASKED_RENDERER_WEBGL : c.RENDERER) : 'no WebGL2';
  });

  for (const tier of tiers) {
    const row = { tier, loading: [], screens: {}, switches: {} };
    if (warm) {
      const { ctx, own } = await freshContext();
      const { p } = await openPage(ctx);
      await p.goto(urlFor(tier, 'home'), { waitUntil: 'commit' });
      await ready(p, 60_000).catch(() => {});
      await p.close();
      if (own) await ctx.close();
    }
    for (const net of nets) row.loading.push(...(await loading(tier, net)));
    const { ctx, own } = await freshContext();
    const { p, cdp } = await openPage(ctx);
    try {
      for (const screen of screens) {
        await p.goto(urlFor(tier, screen), { waitUntil: 'commit' });
        await ready(p, 60_000).catch(() => {});
        await p.waitForTimeout(300);
        const c = await counts(p);
        if (screen === 'lab') c.trick = await trickTimes(p);
        if (screen === 'home' && c.frameloop === 'always') c.trick = await loopTimes(p);
        if (screen === 'skate' && game) c.game = await gameTimes(p);
        row.screens[screen] = c;
      }
      if (switches === 'all')
        for (const screen of ['home', 'lab'])
          for (const combo of combos(screen)) {
            await p.goto(urlFor(tier, screen, combo), { waitUntil: 'commit' });
            await ready(p, 60_000).catch(() => {});
            await p.waitForTimeout(300);
            row.switches[`${screen}/${comboName(combo)}`] = screen === 'lab' ? await trickCalls(p) : (await counts(p)).calls;
          }
    } finally {
      await throttle(cdp, 'full');
      await p.close();
      if (own) await ctx.close();
    }
    out.rows.push(row);
  }

  // A table per section, ready for PERF-BUDGET.md.
  const md = [];
  md.push(`Measured ${out.when.slice(0, 10)} in ${engine}, ${out.viewport}, ${out.gpu}, feet ${feet}, legs ${out.legs}, ${theme} theme${cpu > 1 ? `, loads at ${cpu}x CPU` : ''}.`);
  md.push('', '| Tier | Network | Visit | UI (FCP) | Loading picture | First 3D frame | All models on screen | Picture lifts | JS | Models |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of out.rows)
    for (const l of r.loading) {
      const net = l.net === 'full' ? 'full speed' : `${l.net} Mbps`;
      if (l.unavailable) {
        md.push(`| ${r.tier} | ${net} | ${l.visit} | unavailable: ${l.unavailable} | | | | | | |`);
        continue;
      }
      const s = (ms) => (ms === null || ms === 'none' ? (ms === 'none' ? 'none' : 'timed out') : `${(ms / 1000).toFixed(2)} s`);
      const pic = (k) => (l.picture ? s(l.picture[k]) : 'none');
      md.push(`| ${r.tier} | ${net} | ${l.visit} | ${s(l.fcp)} | ${pic('loaded')} | ${s(l.firstFrame)} | ${s(l.models)} | ${pic('lifted')} | ${kb(l.bytes.js)} KB | ${kb(l.bytes.models)} KB |`);
    }
  md.push(
    '',
    '| Tier | Screen | Renderer | Draw calls | Triangles | Frameloop | Textures | Render CPU, median / p95 / longest | GPU, median / p95 / longest | Frame work, median / p95 / longest | Frame interval, median / p95 / longest | Landing: frames to idle / after idle |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  // Times: the lab's are over the timed tricks, the welcome screen's over its looping preview.
  for (const r of out.rows)
    for (const [screen, c] of Object.entries(r.screens)) {
      const t = c.trick;
      const ms = (x) => (x && typeof x === 'object' ? `${x.median} / ${x.p95} / ${x.max} ms` : x ?? '');
      const l = t && t.landing;
      const landing = !l ? '' : l.dropped ? `dropped (${l.dropped})` : `${l.toIdle ?? 'n/a'} / ${l.afterIdle}`;
      md.push(`| ${r.tier} | ${screen} | ${c.renderer} | ${c.calls} | ${c.triangles.toLocaleString('en-US')} | ${c.frameloop} | ${c.textures} | ${t ? ms(t.cpu) : ''} | ${t ? ms(t.gpu) : ''} | ${t ? ms(t.work) : ''} | ${t ? ms(t.interval) : ''} | ${landing} |`);
    }
  // A whole game (step 20): the first go of the visit, then the rest of the game.
  if (out.rows.some((r) => r.screens.skate && r.screens.skate.game)) {
    md.push(
      '',
      '| Tier | Part of the game | Frames | Render CPU, median / p95 / longest | GPU, median / p95 / longest | Frame work, median / p95 / longest | Frame interval, median / p95 / longest | Intervals over 20 ms / over 34 ms |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
    );
    const ms = (x) => (x && typeof x === 'object' ? `${x.median} / ${x.p95} / ${x.max} ms` : x ?? '');
    for (const r of out.rows) {
      const g = r.screens.skate && r.screens.skate.game;
      if (!g) continue;
      const what = `${g.gos} goes (${g.grades.clean} clean, ${g.grades.sketchy} sketchy, ${g.grades.bail} bails, ${g.replays} replays), ${g.phase === 'over' ? 'played to the end' : 'stopped at the limit'}`;
      for (const [name, t] of [['the first go', g.first], [`the rest: ${what}`, g.rest]])
        md.push(`| ${r.tier} | ${name} | ${t.interval ? t.interval.n : 0} | ${ms(t.cpu)} | ${ms(t.gpu)} | ${ms(t.work)} | ${ms(t.interval)} | ${t.over20} / ${t.over34} |`);
    }
  }
  if (switches === 'all') {
    const names = Object.keys(out.rows[0]?.switches ?? {});
    md.push('', `| Tier | ${names.join(' | ')} | Most |`, `| --- | ${names.map(() => '---').join(' | ')} | --- |`);
    for (const r of out.rows) {
      const v = names.map((n) => r.switches[n]);
      md.push(`| ${r.tier} | ${v.join(' | ')} | ${Math.max(...v)} |`);
    }
  }
  // The targets (ADR-62), over the lab's timed tricks: a tier passes when every number it could measure is inside its target.
  const TARGETS = {
    high: { gpu: 4, work: 4, interval: 20, calls: 60 },
    medium: { gpu: 3, work: 4, interval: 20, calls: 40 },
    low: { gpu: 2, work: 4, interval: 20, calls: 20 },
  };
  out.targets = [];
  for (const r of out.rows) {
    const T = TARGETS[r.tier];
    const t = r.screens.lab && r.screens.lab.trick;
    if (!T || !t) continue;
    const check = (x, key, limit) => (x && typeof x === 'object' ? { value: x[key], limit, pass: x[key] < limit } : { value: null, limit, pass: null });
    const most = switches === 'all' ? Math.max(...Object.values(r.switches)) : r.screens.lab.calls;
    // A whole game, where one was played: its frames after the first go (the target's "after the first second").
    const g = r.screens.skate && r.screens.skate.game ? r.screens.skate.game.rest : null;
    out.targets.push({
      tier: r.tier,
      gpu: check(t.gpu, 'p95', T.gpu),
      work: check(t.work, 'p95', T.work),
      longest: check(t.interval, 'max', T.interval),
      calls: { value: most, limit: T.calls, pass: most < T.calls },
      game: g ? { gpu: check(g.gpu, 'p95', T.gpu), work: check(g.work, 'p95', T.work), longest: check(g.interval, 'max', T.interval) } : null,
    });
  }
  const checksOf = (t) => [t.gpu, t.work, t.longest, t.calls, ...(t.game ? [t.game.gpu, t.game.work, t.game.longest] : [])];
  out.pass = out.targets.length > 0 && out.targets.every((t) => checksOf(t).every((c) => c.pass !== false));
  if (out.targets.length) {
    const cell = (c, unit) => (c.pass === null ? `not measured (under ${c.limit}${unit})` : `${c.value}${unit} of under ${c.limit}${unit}: ${c.pass ? 'pass' : 'FAIL'}`);
    md.push(
      '',
      `| Tier | Over | Graphics time per frame, p95 | The app's own work per frame, p95 | Longest frame interval | Draw calls, ${switches === 'all' ? 'every switch on' : 'as loaded'} | Targets |`,
      '| --- | --- | --- | --- | --- | --- | --- |',
    );
    for (const t of out.targets) {
      const ok = [t.gpu, t.work, t.longest, t.calls].every((c) => c.pass !== false);
      md.push(`| ${t.tier} | the lab's tricks | ${cell(t.gpu, ' ms')} | ${cell(t.work, ' ms')} | ${cell(t.longest, ' ms')} | ${cell(t.calls, '')} | ${ok ? 'pass' : 'FAIL'} |`);
      if (t.game) {
        const okGame = [t.game.gpu, t.game.work, t.game.longest].every((c) => c.pass !== false);
        md.push(`| ${t.tier} | a whole game, after its first go | ${cell(t.game.gpu, ' ms')} | ${cell(t.game.work, ' ms')} | ${cell(t.game.longest, ' ms')} | | ${okGame ? 'pass' : 'FAIL'} |`);
      }
    }
  }
  out.markdown = md.join('\n');
  return out;
}
