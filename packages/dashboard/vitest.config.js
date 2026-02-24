import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
    },
    resolve: {
        alias: {
            '@clawstack/shared': path.resolve(__dirname, '../shared/index.ts'),
        },
    },
});
//# sourceMappingURL=vitest.config.js.map