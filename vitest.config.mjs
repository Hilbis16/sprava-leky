import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

// Nastavit před spuštěním workerů, aby test skutečně pokryl český přechod času.
process.env.TZ = 'Europe/Prague';

export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
