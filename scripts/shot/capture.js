// The product shots (2026-11-22): the README's hero, the GitHub social card and
// the portfolio's pictures, rendered from the real scene. A single function for
// the global playwright-cli, like scripts/still/capture.js, which it follows:
//
//   npm run build && npx tsx scripts/measure/serve.ts dist 4173
//   playwright-cli -s=shot open --headed "http://localhost:4173/"
//   playwright-cli -s=shot --raw run-code --filename=scripts/shot/capture.js > shots.json
//   playwright-cli -s=shot close
//   npx tsx scripts/shot/write.ts shots.json <out dir>
//
// Options from the query of the page the session is on (all optional):
//   set    final   which list to draw: `final` (SHOTS below), or a sweep to
//                  choose from, `angles` or `moments` (see SWEEPS)
//   only   a comma list of shot names from the set (default: all)
//   scale  2       render size over the shot's size (x2 is kept as `@2x`)
//   sheet  (flag)  return one contact sheet of every shot, labelled, instead
//                  of the files: the quick way to compare a sweep
//   base   /       the app's base path
//
// What it draws: the welcome screen on High, the stage alone filling the
// window, under reduced motion so the rider holds one pose, the pose chosen
// per shot with the debug-only `pose` parameter (src/scene/showcase.ts
// checkPose) and, with `spot: true`, the skate spot behind it (SHOT_SPOT).
// The camera is placed per shot through `?debug`'s window.__trickLab. Shots
// that share a page (pose, theme, spot, size) reuse it and only move the
// camera. Use a headed browser: headless Chromium may draw without the GPU,
// and High's renderer path then differs (the script reports which renderer
// drew). Nothing here changes the app; the page's storage is set per page.
async (page) => {
  // elevation: degrees above the target's height; azimuth: degrees round from
  // the heel side (+Z, the rider's back, the skate spot beyond the board) toward
  // +X (the goofy nose); 180 is the toe side, the rider's front. distance in
  // metres from the target, target the height looked at, fov the vertical lens
  // in degrees. shift (optional) moves the rider right by that fraction of the
  // width, leaving room for a title on the left (a view offset, so the
  // perspective does not change).
  const SHOTS = [
    // Low and long into the low sun, the spot behind (chosen from the sweeps, 2026-11-22).
    { name: 'hero-kickflip', w: 1600, h: 900, theme: 'dark', spot: true, pose: 'kickflip@0.55', azimuth: 55, elevation: -3, distance: 4.6, target: 0.85, fov: 22 },
    // Toward the sun's glow (2026-11-22): the rider against the bright haze, the rail and kerb in front of it.
    { name: 'hero-glow', w: 1600, h: 900, theme: 'dark', spot: true, pose: 'kickflip@0.55', azimuth: 305, elevation: -3, distance: 4.6, target: 0.85, fov: 22 },
    { name: 'hero-glow-360', w: 1600, h: 900, theme: 'dark', spot: true, pose: '360-flip@0.25', azimuth: 287, elevation: -3, distance: 4.6, target: 0.85, fov: 22 },
    { name: 'hero-glow-light', w: 1600, h: 900, theme: 'light', spot: true, pose: 'kickflip@0.55', azimuth: 305, elevation: -3, distance: 4.6, target: 0.85, fov: 22 },
    { name: 'hero-heelflip', w: 1600, h: 900, theme: 'dark', spot: true, pose: 'heelflip@0.25', azimuth: 55, elevation: -3, distance: 4.6, target: 0.85, fov: 22 },
    { name: 'hero-varial', w: 1600, h: 900, theme: 'dark', spot: true, pose: 'varial-flip@0.55', azimuth: 55, elevation: -3, distance: 4.6, target: 0.85, fov: 22 },
    { name: 'hero-light', w: 1600, h: 900, theme: 'light', spot: true, pose: 'kickflip@0.55', azimuth: 55, elevation: -3, distance: 4.6, target: 0.85, fov: 22 },
    { name: 'card', w: 1280, h: 640, theme: 'dark', spot: true, pose: 'kickflip@0.55', azimuth: 55, elevation: -3, distance: 5.2, target: 0.85, fov: 22, shift: 0.2, title: true },
    { name: 'card-plain', w: 1280, h: 640, theme: 'dark', spot: true, pose: 'kickflip@0.55', azimuth: 55, elevation: -3, distance: 5.2, target: 0.85, fov: 22, shift: 0.2 },
  ];
  // Sweeps to choose from: one thing varied, the rest held, small and quick.
  const look = { w: 800, h: 450, theme: 'dark', spot: true, target: 0.9 };
  const SWEEPS = {
    angles: [
      [20, 3, 4.2, 30], [45, 3, 4.2, 30], [70, 3, 4.2, 30], [95, 3, 4.2, 30],
      [30, -3, 5.5, 22], [55, -3, 5.5, 22], [80, -3, 5.5, 22], [120, 2, 4.2, 30],
      [55, 10, 4.2, 30], [55, 0, 2.8, 45], [150, 3, 4.2, 30], [270, 3, 4.2, 30],
    ].map(([azimuth, elevation, distance, fov]) => ({
      ...look, name: `a${azimuth} e${elevation} d${distance} f${fov}`, pose: '360-flip@0.5', azimuth, elevation, distance, fov,
    })),
    // Where the low sun sits behind the rider: the hero's lens, angle against distance.
    sun: [4.6, 5.5].flatMap((distance) =>
      [35, 45, 55, 65].map((azimuth) => ({
        ...look, name: `a${azimuth} d${distance}`, pose: 'kickflip@0.55', azimuth, elevation: -3, distance, target: 0.85, fov: 22,
      })),
    ),
    // Toward the sun's glow on the horizon (sky.ts sunAzimuth, about 107 degrees): the camera opposite it, near 287.
    glow: [
      [55, 'kickflip@0.55'], [250, 'kickflip@0.55'], [270, 'kickflip@0.55'], [287, 'kickflip@0.55'],
      [305, 'kickflip@0.55'], [270, 'heelflip@0.25'], [287, 'varial-flip@0.55'], [287, '360-flip@0.25'],
    ].map(([azimuth, pose]) => ({
      ...look, name: `a${azimuth} ${pose}`, pose, azimuth, elevation: -3, distance: 4.6, target: 0.85, fov: 22,
    })),
    moments: ['360-flip', 'kickflip', 'varial-flip', 'heelflip'].flatMap((trick) =>
      [0.25, 0.4, 0.55, 0.7].map((p) => ({
        ...look, name: `${trick} ${p}`, pose: `${trick}@${p}`, azimuth: 55, elevation: -3, distance: 5.5, fov: 22,
      })),
    ),
  };
  const MODELS = ['Deck_Grip', 'Shoe_Sole', 'Ground_Concrete', 'Rider_Body'];

  const opts = new URL(page.url()).searchParams;
  const set = opts.get('set') ?? 'final';
  const list = set === 'final' ? SHOTS : SWEEPS[set];
  if (!list) throw new Error(`Unknown set ${set}: final, ${Object.keys(SWEEPS).join(', ')}`);
  const only = opts.get('only') ? opts.get('only').split(',') : null;
  const scale = Number(opts.get('scale') ?? 2);
  const sheet = opts.has('sheet');
  const base = opts.get('base') ?? '/';
  const origin = new URL(page.url()).origin;

  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The stage alone, the whole window, no border; its overlays and the loading picture hidden.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = `
        html, body { overflow: hidden !important; }
        .app__stage { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
          border: 0 !important; border-radius: 0 !important; z-index: 1000 !important; }
        .app__still, .preview-toggle, .perf-badge { display: none !important; }`;
      document.head.append(style);
    });
  });

  const files = {};
  const meta = { when: new Date().toISOString(), set, ua: await page.evaluate(() => navigator.userAgent) };
  let loaded = '';
  for (const shot of list) {
    if (only && !only.includes(shot.name)) continue;
    const W = Math.round(shot.w * scale);
    const H = Math.round(shot.h * scale);
    const key = `${shot.pose} ${shot.theme} ${shot.spot ? 'spot' : ''} ${W}x${H}`;
    if (key !== loaded) {
      await page.setViewportSize({ width: W, height: H });
      await page.goto(`${origin}${base}?debug`);
      await page.evaluate((t) => {
        localStorage.clear();
        localStorage.setItem('trick-lab.quality', 'high');
        localStorage.setItem('trick-lab.theme', t);
      }, shot.theme);
      // A new URL, so the page loads again with that storage and the shot's pose.
      await page.goto(`${origin}${base}?debug&pose=${encodeURIComponent(shot.pose)}${shot.spot ? '&spot' : ''}`);
      await page.waitForFunction(
        (names) => {
          const s = window.__trickLab && window.__trickLab.get();
          const content = s && s.scene.getObjectByName('scene-content');
          return !!(content && content.visible && names.every((n) => s.scene.getObjectByName(n)));
        },
        shot.spot ? [...MODELS, 'Spot_Concrete'] : MODELS,
        { timeout: 60000 },
      );
      // Let the welcome camera settle first, then place the shot's camera over it.
      await page.waitForTimeout(500);
      loaded = key;
    }
    await page.evaluate(
      ([c, W, H]) => {
        const s = window.__trickLab.get();
        const cam = s.camera;
        const e = (c.elevation * Math.PI) / 180;
        const a = (c.azimuth * Math.PI) / 180;
        cam.clearViewOffset();
        if (c.shift) cam.setViewOffset(W, H, -c.shift * W, 0, W, H);
        cam.fov = c.fov;
        // The app's far plane (30 m) clips the far side of the sky dome once a shot's camera stands more than about
        // 5 m out, leaving a faceted hole of the clear colour in the sky; the shots stand further back than any view.
        cam.far = 100;
        cam.position.set(
          c.distance * Math.cos(e) * Math.sin(a),
          c.target + c.distance * Math.sin(e),
          c.distance * Math.cos(e) * Math.cos(a),
        );
        if (s.controls) s.controls.target.set(0, c.target, 0);
        cam.lookAt(0, c.target, 0);
        cam.updateProjectionMatrix();
      },
      [shot, W, H],
    );
    // A few frames with everything in (the first compiles the models' programs).
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.__trickLab.get().invalidate());
      await page.waitForTimeout(300);
    }
    const info = await page.evaluate(() => {
      const s = window.__trickLab.get();
      return { renderer: s.gl.isWebGPURenderer ? 'WebGPU' : 'WebGL', size: `${s.size.width} x ${s.size.height}`, dpr: s.viewport.dpr };
    });
    let png = (await page.locator('.app__stage canvas').screenshot()).toString('base64');
    if (shot.title) {
      // The title on the open sky to the left, set like the welcome screen's h1: the display face with an offset
      // print in the brand orange (DESIGN.md, ADR-57), in grip-tape ink, which reads on the light sky. Measured in
      // the card's 1280 px and scaled with the render. The face is the app's own, already declared by its CSS.
      png = await page.evaluate(
        async ([b64, W]) => {
          await document.fonts.load('100px Bungee');
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0);
          const k = img.width / W;
          const x = 76 * k;
          const sans = '"Segoe UI", system-ui, sans-serif';
          g.textBaseline = 'alphabetic';
          g.fillStyle = '#a83612';
          g.font = `700 ${21 * k}px ${sans}`;
          g.letterSpacing = `${2.5 * k}px`;
          g.fillText('A SKATEBOARD PHYSICS LAB', x, 104 * k);
          g.letterSpacing = '0px';
          g.font = `${112 * k}px Bungee`;
          const off = 0.06 * 112 * k;
          g.fillStyle = '#ea5a30';
          g.fillText('TRICK LAB', x + off, 218 * k + off);
          g.fillStyle = '#121416';
          g.fillText('TRICK LAB', x, 218 * k);
          g.font = `500 ${27 * k}px ${sans}`;
          g.fillStyle = '#1c1e21';
          g.fillText('Pop, flick and scoop a skateboard,', x, 280 * k);
          g.fillText('then take on the computer at SKATE.', x, 318 * k);
          return c.toDataURL('image/png').split(',')[1];
        },
        [png, shot.w],
      );
    }
    const x1 =
      scale === 1
        ? png
        : await page.evaluate(
            async ([b64, w, h]) => {
              const img = new Image();
              img.src = `data:image/png;base64,${b64}`;
              await img.decode();
              const c = document.createElement('canvas');
              c.width = w;
              c.height = h;
              const g = c.getContext('2d');
              g.imageSmoothingQuality = 'high';
              g.drawImage(img, 0, 0, w, h);
              return c.toDataURL('image/png').split(',')[1];
            },
            [png, shot.w, shot.h],
          );
    files[shot.name] = scale === 2 ? { x1, x2: png } : { x1 };
    meta[shot.name] = { ...info, pose: shot.pose, theme: shot.theme };
  }

  if (sheet) {
    // Every shot at its own size, four across, its name under it.
    const shots = Object.entries(files).map(([name, f]) => ({ name, b64: f.x1 }));
    const b64 = await page.evaluate(async (shots) => {
      const imgs = await Promise.all(
        shots.map(async (s) => {
          const img = new Image();
          img.src = `data:image/png;base64,${s.b64}`;
          await img.decode();
          return { name: s.name, img };
        }),
      );
      const cols = Math.min(4, imgs.length);
      const tw = 480;
      const th = Math.round((tw * imgs[0].img.height) / imgs[0].img.width);
      const label = 28;
      const c = document.createElement('canvas');
      c.width = cols * tw;
      c.height = Math.ceil(imgs.length / cols) * (th + label);
      const g = c.getContext('2d');
      g.fillStyle = '#111';
      g.fillRect(0, 0, c.width, c.height);
      g.imageSmoothingQuality = 'high';
      g.font = '16px sans-serif';
      imgs.forEach(({ name, img }, i) => {
        const x = (i % cols) * tw;
        const y = Math.floor(i / cols) * (th + label);
        g.drawImage(img, x, y, tw, th);
        g.fillStyle = '#eee';
        g.fillText(`${i + 1}. ${name}`, x + 8, y + th + 20);
      });
      return c.toDataURL('image/png').split(',')[1];
    }, shots);
    return { meta, files: { [`sheet-${set}`]: { x1: b64 } } };
  }
  return { meta, files };
}
