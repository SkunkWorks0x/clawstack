"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
const path_1 = require("path");
exports.default = (0, config_1.defineConfig)({
    resolve: {
        alias: {
            '@clawstack/shared': (0, path_1.resolve)(__dirname, 'packages/shared/index.ts'),
            '@clawstack/clawforge': (0, path_1.resolve)(__dirname, 'packages/clawforge/src/index.ts'),
            '@clawstack/clawguard': (0, path_1.resolve)(__dirname, 'packages/clawguard/src/index.ts'),
            '@clawstack/clawbudget': (0, path_1.resolve)(__dirname, 'packages/clawbudget/src/index.ts'),
            '@clawstack/clawpipe': (0, path_1.resolve)(__dirname, 'packages/clawpipe/src/index.ts'),
            '@clawstack/clawmemory': (0, path_1.resolve)(__dirname, 'packages/clawmemory/src/index.ts'),
        },
    },
});
//# sourceMappingURL=vitest.config.js.map