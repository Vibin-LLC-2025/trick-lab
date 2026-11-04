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
    // Only tokens.css is processed, for the --scene-bg check in artDirection.test.ts.
    css: { include: [/styles\/tokens\.css/] },
  },
});
