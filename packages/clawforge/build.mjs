import { build } from 'esbuild';
import { writeFileSync, readFileSync, chmodSync } from 'fs';

const shared = {
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  bundle: true,
  sourcemap: true,
  // Bundle @clawstack/shared into the output. Keep native modules external.
  external: ['better-sqlite3'],
};

// CLI entry — the runnable binary
await build({
  ...shared,
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
});

// Library entry — for programmatic usage
await build({
  ...shared,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
});

// Generate a minimal type declaration stub so "types" field resolves
const dts = `export * from '../src/index.js';\n`;
writeFileSync('dist/index.d.ts', dts);

// Make CLI executable
chmodSync('dist/cli.js', 0o755);

console.log('ClawForge build complete.');
