// Build plugin Orca vào orca/plugin/ — thư mục này là TOÀN BỘ plugin Orca cài
// (orca-catalog.json → source.path) và ĐƯỢC commit: Orca cài từ commit, không build.
//   1. panel  — vite (vite.orca.config.ts) → orca/plugin/panel/
//   2. worker — esbuild bundle orca/worker/main.ts → orca/plugin/worker.mjs (Node ESM)
//   3. chép icon + LICENSE vào plugin; đồng bộ "version" của manifest theo package.json
// Chạy: npm run build:orca (tự chạy trong `npm version` — xem package.json).

import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { build as viteBuild } from 'vite';

const PLUGIN_DIR = 'orca/plugin';
const MANIFEST = `${PLUGIN_DIR}/orca-plugin.json`;

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

await viteBuild({ configFile: 'vite.orca.config.ts', logLevel: 'warn' });

await esbuild.build({
  entryPoints: ['orca/worker/main.ts'],
  outfile: `${PLUGIN_DIR}/worker.mjs`,
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

// Plugin chỉ thấy file trong thư mục của nó — icon (manifest "icon") và giấy
// phép (PolyForm buộc bản phân phối kèm nguyên văn điều khoản) phải chép vào.
await copyFile('media/icon.png', `${PLUGIN_DIR}/icon.png`);
await copyFile('LICENSE.md', `${PLUGIN_DIR}/LICENSE.md`);

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${MANIFEST} version → ${pkg.version}`);
}
console.log(`Orca plugin built → ${PLUGIN_DIR}/`);
