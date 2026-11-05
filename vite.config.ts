/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // three.js alone is most of the lazy TrickScene chunk; see docs/PERF-BUDGET.md.
  build: { chunkSizeWarningLimit: 1000 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // The clearance and GLB-build suites take 1 to 3 s alone and 6 to 11 s when 20 workers run them
    // together, over the 5 s default (three timeouts in one run, 2026-11-05). 30 s still catches a hang.
    testTimeout: 30_000,
    // Only tokens.css is processed, for the --scene-bg check in artDirection.test.ts.
    css: { include: [/styles\/tokens\.css/] },
  },
});
