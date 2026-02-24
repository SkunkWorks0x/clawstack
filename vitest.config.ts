import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@clawstack/shared': resolve(__dirname, 'packages/shared/index.ts'),
      '@clawstack/clawforge': resolve(__dirname, 'packages/clawforge/src/index.ts'),
    },
  },
});
