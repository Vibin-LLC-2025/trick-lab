# Roadmap

Where Trick Lab goes next (written 2026-11-04). Trick Lab is a portfolio piece, so the next work goes into visual quality and new tricks on a typical laptop. Running well on Chromebooks and other low-end devices stays supported as a lower quality level, planned step by step below, and is not the thing that holds the design back.

The ground rule for both lists: **every new visual feature gets an off switch, and the Low setting uses it.** The look can then grow without shutting out weak devices.

## Where things stand

**Update 2026-11-09.** The look, feel and performance plan (`docs/PLAN-LOOK-FEEL-PERF.md`, ADR-48 to ADR-59) finished the items marked done below: KTX2 textures, the WebGPU renderer with post-processing on High and Medium, a sky, a designed Low, the loading picture, the skate style, sound, the automatic step-down, and the before-and-after tables (`docs/PERF-BUDGET.md`, step 14). The notes below are from 2026-11-04.

- Drawing a frame is already cheap: about 0.2 ms per frame, 11 draw calls, and no frames at all while idle (see `docs/PERF-BUDGET.md`).
- The only real cost is the first second, when the 3D view starts up. The longest task that freezes the page while it loads was roughly halved on 2026-11-04 by splitting shader compilation into separate tasks (Lighthouse mobile, production build: 95 to 96).
- There are already two quality levels (Board detail High and Low), and the 3D code loads separately, after the rest of the page.
- Measure with `npm run build && npm run preview`, not `npm run dev`. The dev server scores 55 to 60 on Lighthouse because it serves unbundled, unminified code.

## Next: showcase quality

In order of payoff:

1. **Deploy it** (Vercel, Netlify or GitHub Pages), put the live link at the top of the README, and quote the Lighthouse score of the deployed site. Deployed to GitHub Pages with the live link in the README (`.github/workflows/deploy.yml`); the deployed site's Lighthouse score is still to quote.
2. **Turn edge smoothing (antialiasing) back on** for High. It is off for speed, so the board's edges look jagged. It is the most visible quality gap right now. Done: MSAA on High since the quality tiers (ADR-16), and on Low too since ADR-54.
3. **Show a still image while the 3D loads**, then fade to the live scene, so the first second looks finished. Done 2026-11-09 (ADR-56).
4. **Use pre-made studio lighting** instead of the built-in procedural room. It gives a better look you choose yourself, and it removes the biggest startup cost left. It changes the look, so record the decision in `docs/DECISIONS.md`. Superseded: the room became a procedural outdoor sky (ADR-31, ADR-52) with nothing downloaded, and Low builds no lighting map at all (ADR-54).
5. **Polish the motion:** ghost copies of the board along its flight path, a flight-path line, and replay with slow motion and an easing camera.
6. **Add more tricks.** Done 2026-11-04 (ADR-30): signed flick and scoop, directional recognition and 15 named tricks; the hardflip was then removed on purpose (ADR-41). The rest of this item is the original note. Today the app counts flips and spins but not their direction. Letting flick and scoop go negative unlocks heelflip, varial heelflip, laser flip, frontside shove-it, hardflip and inward heelflip. That means letting the sliders go negative (`INPUT_LIMITS` in `src/sim/tricks.ts`), teaching the recognizer about direction, and adding the new names and tests in the same file (the flight math in `src/sim/flight.ts` already handles negative rates). Rendering costs nothing extra.
7. **Add a README GIF** of a 360 flip landing in slow motion. Done 2026-11-09 (`docs/screenshots/360-flip-slow-motion.gif`).

**Avoid locking the design into choices that are hard to undo:** live shadows, a look that depends on post-processing, a physics engine, or large uncompressed textures. If the design comes to depend on one of these, the low-end version becomes a different-looking app instead of a lighter version of the same one. (Since 2026-11-09 High and Medium add post-processing on top of a look that stands without it, and Low has its own designed flat style, ADR-51 and ADR-54.)

## Later: Chromebooks and other low-end devices

1. **Measure on a real device.** Test the production build on a cheap Chromebook (4 GB RAM, Celeron or MediaTek) for load time, frame time during a trick and memory after 30 tricks. Until then, the closest stand-in is Chrome DevTools with the CPU slowed 6x.
2. **Pick the quality level automatically.** Start on Low when the device has few CPU cores, little memory or a weak graphics chip, then adjust after timing the first few tricks. drei's `PerformanceMonitor` does this. Done: the pick since ADR-16, and since 2026-11-09 the step-down after the first few tricks (ADR-59, our own, judged per landing).
3. **Lower the resolution on Low.** Render at the normal screen resolution instead of 1.5x. On a weak graphics chip this is usually the biggest single win. Done 2026-11-09 (ADR-54: DPR 1, with MSAA).
4. **Use simpler surfaces on Low.** Swap the realistic metal and lighting for flat or pre-lit materials, and skip building the lighting map. Make Low look like a deliberate flat style, not a broken version of High. Done 2026-11-09 (ADR-54: toon shading, no environment map).
5. **Turn off showcase effects on Low:** edge smoothing, ghost trails and any glow or depth of field.
6. **Use compressed textures (KTX2).** They use about 4x less graphics memory. Bundle the decoder with the app, because school networks block CDNs. Making them needs a texture tool (`toktx`), so ask before installing it. Done 2026-11-09 (ADR-49: encoded in Node with `ktx2-encoder`, no system tool; three's transcoder served from this site).
7. **Lighten startup further.** Wait to start the 3D until the page is idle, keep the Low setting from downloading the detailed board, and preload the 3D code. Partly done 2026-11-09: Low downloads no model and no WebGPU code, and each tier's models start downloading as soon as the 3D code arrives (ADR-48).
8. **Set budgets for each quality level and enforce them in `npm run verify`:** draw calls, triangles, texture memory and startup blocking time, like the board's existing size budget (`npm run assets:check`).
9. **Run a soak test:** 50 tricks in a row while switching between High and Low, checking that memory stays flat.
10. **Write up the results** as a before-and-after table for each step in `docs/PERF-BUDGET.md`. Done 2026-11-09 for the plan's steps (step 14 there); a real Chromebook (item 1) is still to measure.
