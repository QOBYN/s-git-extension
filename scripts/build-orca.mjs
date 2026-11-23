// Build plugin Orca vào orca/out/ (thư mục này ĐƯỢC commit: Orca cài plugin
// thẳng từ commit của tag vX.Y.Z, không chạy build):
//   1. panel  — vite (vite.orca.config.ts) → orca/out/panel/
//   2. worker — esbuild bundle orca/worker/main.ts → orca/out/worker.mjs (Node ESM)
//   3. đồng bộ "version" của orca-plugin.json theo package.json
// Chạy: npm run build:orca (tự chạy trong `npm version` — xem package.json).

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { build as viteBuild } from 'vite';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

await viteBuild({ configFile: 'vite.orca.config.ts', logLevel: 'warn' });

await esbuild.build({
  entryPoints: ['orca/worker/main.ts'],
  outfile: 'orca/out/worker.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // Không minify: chính sách Orca cấm code khó đọc; bundle thường là đủ.
  minify: false,
  legalComments: 'inline',
  banner: { js: '// Generated from orca/worker/main.ts by scripts/build-orca.mjs — do not edit.' },
  logLevel: 'warning',
});

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const manifestText = await readFile('orca-plugin.json', 'utf8');
const manifest = JSON.parse(manifestText);
if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  await writeFile('orca-plugin.json', `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`orca-plugin.json version → ${pkg.version}`);
}
console.log('Orca plugin built → orca/out/');
