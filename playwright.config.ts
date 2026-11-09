// The browser checks (PLAN-PLAY-POLISH-REACH step 5): `npm run test:browser`,
// after a production build (`npm run verify` ends with one). Chromium only,
// headless, with SwiftShader so they run the same without a GPU (CI has
// none): the WebGPURenderer runs on its WebGL2 backend there, and the checks
// assert it. Not part of `verify`, which stays quick and needs no browser.
import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'browser',
  // SwiftShader draws on the CPU: one test at a time, with room for slow frames.
  workers: 1,
  timeout: 120_000,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    viewport: { width: 1280, height: 800 },
    browserName: 'chromium',
    launchOptions: {
      // SwiftShader WebGL2 (no GPU); `gc()` for the soak test's samples.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'],
    },
  },
  // The build served the way GitHub Pages sends it (gzip), as the measurement does.
  webServer: {
    command: `npx tsx scripts/measure/serve.ts dist ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
