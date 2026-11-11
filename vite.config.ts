import { configDefaults } from 'vitest/config';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * three's KTX2Loader imports a zstd decoder (about 17 KB gzipped) for KTX2
 * files with zstd supercompression. Every texture here is BasisLZ (ETC1S,
 * scripts/lib/build.ts), and npm run assets:check fails on a zstd one, so
 * the decoder is swapped for a stub that says why if it is ever reached.
 */
const ZSTD_STUB = '\0no-zstd';
function noZstd(): Plugin {
  return {
    name: 'trick-lab:no-zstd',
    enforce: 'pre',
    resolveId: (id) => (/[\\/]zstddec\.module\.js$/.test(id) ? ZSTD_STUB : null),
    load: (id) =>
      id === ZSTD_STUB
        ? "export class ZSTDDecoder { init() { return Promise.reject(new Error('zstd KTX2 textures are not supported: build them with BasisLZ (npm run assets)')); } decode() { throw new Error('No zstd decoder'); } }"
        : null,
  };
}

export default defineConfig({
  plugins: [react(), noZstd()],
  // three.js alone is most of the lazy TrickScene chunk; see docs/PERF-BUDGET.md.
  // The manifest lists every chunk and its imports for the download budget (npm run bundle:check).
  build: { chunkSizeWarningLimit: 1000, manifest: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // browser/ holds the Playwright checks (npm run test:browser), not unit tests.
    exclude: [...configDefaults.exclude, 'browser/**'],
    // The clearance and GLB-build suites take 1 to 3 s alone and 6 to 11 s when 20 workers run them
    // together, over the 5 s default (three timeouts in one run, 2026-11-05). 30 s still catches a hang.
    testTimeout: 30_000,
    // Only tokens.css is processed, for the --scene-bg check in artDirection.test.ts.
    css: { include: [/styles\/tokens\.css/] },
  },
});
