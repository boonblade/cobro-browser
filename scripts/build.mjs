import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

// 두 번째 인자로 출력 디렉터리를 받는다(기본 'dist'). scripts/check-dist.mjs가
// 임시 디렉터리로 빌드해 dist/와 비교할 때 재사용한다.
const outDir = process.argv[2] ?? 'dist';
mkdirSync(outDir, { recursive: true });
await build({
  entryPoints: ['src/overlay/index.ts'], bundle: true, format: 'iife',
  outfile: `${outDir}/overlay.js`, target: 'es2022', minify: false, legalComments: 'none',
});
await build({
  entryPoints: ['src/server.ts'], bundle: true, platform: 'node', format: 'esm',
  outfile: `${outDir}/server.js`, target: 'node20', banner: { js: '#!/usr/bin/env node' },
  packages: 'external',
});
console.error('build ok');
