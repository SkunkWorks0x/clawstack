#!/usr/bin/env node

/**
 * ClawForge CLI bootstrap
 * Loads the compiled CLI from dist/cli.js
 */

const { resolve } = require('path');
const cliPath = resolve(__dirname, '..', 'dist', 'cli.js');

try {
  require(cliPath);
} catch (err) {
  if (err.code === 'MODULE_NOT_FOUND') {
    console.error('ClawForge: Compiled CLI not found. Run `npm run build` first.');
    process.exit(1);
  }
  throw err;
}
