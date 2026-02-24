import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@clawstack/shared': resolve(__dirname, 'packages/shared/index.ts'),
      '@clawstack/clawforge': resolve(__dirname, 'packages/clawforge/src/index.ts'),
      '@clawstack/clawguard': resolve(__dirname, 'packages/clawguard/src/index.ts'),
      '@clawstack/clawbudget': resolve(__dirname, 'packages/clawbudget/src/index.ts'),
      '@clawstack/clawpipe': resolve(__dirname, 'packages/clawpipe/src/index.ts'),
      '@clawstack/clawmemory': resolve(__dirname, 'packages/clawmemory/src/index.ts'),
    },
  },
});
