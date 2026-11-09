// The loading picture (ADR-56, 2026-11-09; step 10 of
// docs/PLAN-LOOK-FEEL-PERF.md): a still of the real scene per theme, from the
// welcome screen's camera and its still pose (SHOWCASE_STILL, what the
// welcome screen shows under reduced motion), on High. It covers the stage
// while the 3D view loads. Built in a browser, since the scene needs a GPU:
// scripts/still/capture.js renders and encodes it, scripts/still/write.ts
// checks and writes it under public/stills (docs/ASSET-PIPELINE.md); both
// are committed, and npm run assets:check holds them to this spec.
//
// 2:1, so on any stage from 0.9:1 to 2:1, where the welcome camera's fit is
// set by the height (cameraFit.ts), the picture cropped to the stage
// (object-fit: cover) frames the board as the live scene does.

export type StillTheme = 'light' | 'dark';

export const STILL_THEMES: readonly StillTheme[] = ['light', 'dark'];

export const STILL = {
  /** Under public/ (and the app's base path). */
  dir: 'stills',
  width: 1600,
  height: 800,
  /** WebP quality the browser encodes with (0 to 1). */
  quality: 0.8,
  /** Per file: it downloads beside the 3D code, so it stays small (assets:check). */
  maxBytes: 80 * 1024,
} as const;

/** A theme's picture, relative to the app's base path. */
export const stillFile = (theme: StillTheme) => `${STILL.dir}/welcome-${theme}.webp`;
