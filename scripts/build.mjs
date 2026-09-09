import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
await build({
  entryPoints: ['src/overlay/index.ts'], bundle: true, format: 'iife',
  outfile: 'dist/overlay.js', target: 'es2022', minify: false, legalComments: 'none',
});
await build({
  entryPoints: ['src/server.ts'], bundle: true, platform: 'node', format: 'esm',
  outfile: 'dist/server.js', target: 'node20', banner: { js: '#!/usr/bin/env node' },
  packages: 'external',
});
console.error('build ok');
