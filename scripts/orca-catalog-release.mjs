// Ghi bản phát hành mới vào orca-catalog.json — chạy ở `postversion` của npm
// (sau khi `npm version` đã commit bản build + tạo tag vX.Y.Z, trước khi push).
//
// Vì sao cần: plugin nằm ở thư mục con (orca/plugin), nên danh mục Orca đọc
// orca-catalog.json ở gốc repo, mà mỗi release trong đó phải ghim đúng commit +
// contentHash. Catalog không thể ghim chính commit chứa nó, nên:
//   commit C1 (bump version + build, do npm tạo)  ← release entry ghim commit này
//   commit C2 (cập nhật orca-catalog.json)        ← tag vX.Y.Z dời sang đây
// Thư mục plugin giống hệt nhau ở C1 và C2 nên contentHash vẫn khớp.
//
// Release entry lấy từ chính Orca (`orca plugin release-entry --json`) để hash
// luôn đúng thuật toán của Orca. Đường dẫn CLI: biến ORCA_CLI, app Orca trên
// macOS, hoặc `orca` trong PATH.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PLUGIN_DIR = 'orca/plugin';
const CATALOG = 'orca-catalog.json';
/** Orca chỉ đọc tối đa 32 release mỗi plugin. */
const MAX_RELEASES = 32;

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

function findOrcaCli() {
  const candidates = [
    process.env.ORCA_CLI,
    '/Applications/Orca.app/Contents/Resources/bin/orca',
    'orca',
  ].filter(Boolean);
  for (const cli of candidates) {
    if (cli === 'orca' || existsSync(cli)) {
      try {
        execFileSync(cli, ['--version'], { stdio: 'ignore' });
        return cli;
      } catch {
        // thử ứng viên tiếp theo
      }
    }
  }
  throw new Error('Không tìm thấy Orca CLI — cài Orca hoặc đặt ORCA_CLI=<đường dẫn orca>.');
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (git('status', '--porcelain', '--', PLUGIN_DIR, CATALOG) !== '') {
  throw new Error(`${PLUGIN_DIR} hoặc ${CATALOG} còn thay đổi chưa commit — release entry sẽ sai.`);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const tag = `v${pkg.version}`;
const out = JSON.parse(
  execFileSync(findOrcaCli(), ['plugin', 'release-entry', PLUGIN_DIR, '--json'], {
    encoding: 'utf8',
  }),
);
if (!out.ok) {
  throw new Error(`orca plugin release-entry: ${JSON.stringify(out.error)}`);
}
const entry = out.result.entry;
if (entry.version !== pkg.version || entry.commit !== git('rev-parse', 'HEAD')) {
  throw new Error(`Release entry lệch: ${entry.version}@${entry.commit} ≠ ${pkg.version}@HEAD`);
}

const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
const plugin = catalog.plugins.find((p) => p.source?.path === PLUGIN_DIR);
if (!plugin) {
  throw new Error(`${CATALOG} không có plugin nào trỏ tới ${PLUGIN_DIR}.`);
}
plugin.releases = [entry, ...plugin.releases.filter((r) => r.version !== entry.version)].slice(
  0,
  MAX_RELEASES,
);
writeFileSync(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`);

git('add', CATALOG);
git('commit', '-m', `chore(orca): catalog ${pkg.version}`);
// Dời tag (chưa push) sang commit có catalog — danh mục Orca đọc catalog tại tag.
git('tag', '-f', '-a', tag, '-m', pkg.version);
console.log(`${CATALOG}: ${entry.version} @ ${entry.commit.slice(0, 10)} — tag ${tag} → HEAD`);
