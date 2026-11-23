// Parser cho `git for-each-ref` — nguồn dữ liệu sidebar nhánh (ui-analysis B1).
// Hàm thuần, test bằng Vitest.

import type { RefInfo, RefKind } from '../../shared/types';

const FIELD_SEP = '\x1f';

/**
 * %(HEAD) = '*' nếu là nhánh đang checkout; %(refname) đầy đủ; %(objectname) oid.
 * Giới hạn namespace ngay trong lệnh (refs/heads, refs/remotes, refs/tags)
 * để không phải lọc notes/stash ở đây.
 */
export const FOR_EACH_REF_FORMAT = ['%(HEAD)', '%(refname)', '%(objectname)'].join(FIELD_SEP);

export const FOR_EACH_REF_ARGS = [
  'for-each-ref',
  `--format=${FOR_EACH_REF_FORMAT}`,
  'refs/heads',
  'refs/remotes',
  'refs/tags',
];

const NAMESPACES: ReadonlyArray<{ prefix: string; kind: RefKind }> = [
  { prefix: 'refs/heads/', kind: 'local' },
  { prefix: 'refs/remotes/', kind: 'remote' },
  { prefix: 'refs/tags/', kind: 'tag' },
];

export function parseRefs(stdout: string): RefInfo[] {
  const refs: RefInfo[] = [];
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const [headMarker, fullName, oid] = line.split(FIELD_SEP);
    if (fullName === undefined || oid === undefined) {
      continue; // dòng hỏng — bỏ qua, không phá cả danh sách
    }
    const namespace = NAMESPACES.find((ns) => fullName.startsWith(ns.prefix));
    if (namespace === undefined) {
      continue;
    }
    const name = fullName.slice(namespace.prefix.length);
    // `origin/HEAD` là con trỏ tượng trưng, không phải nhánh thật — không hiển thị.
    if (namespace.kind === 'remote' && name.endsWith('/HEAD')) {
      continue;
    }
    refs.push({
      name,
      fullName,
      kind: namespace.kind,
      oid,
      isHead: headMarker === '*',
    });
  }
  return refs;
}

/**
 * Tên nhánh từ output `git name-rev --name-only --refs=<namespace>/*` — nhánh GẦN
 * NHẤT chứa commit, dạng `remotes/origin/dev~3`, `origin/dev^2~1`, `dev` (trúng tip
 * thì không có hậu tố). Trả tên nhánh không kèm remote (`dev`); null khi git in
 * `undefined` (không nhánh nào trong namespace chứa commit) hoặc rỗng (oid lạ).
 */
export function parseNameRev(stdout: string, kind: 'remote' | 'local'): string | null {
  let name = stdout.trim().split('\n')[0] ?? '';
  if (name === '' || name === 'undefined') {
    return null;
  }
  // Bỏ hậu tố khoảng cách: `~N` / `^N` (có thể nối tiếp nhau).
  const cut = name.search(/[~^]/);
  if (cut !== -1) {
    name = name.slice(0, cut);
  }
  if (kind === 'remote') {
    name = name.replace(/^remotes\//, '');
    const slash = name.indexOf('/');
    if (slash === -1) {
      return null; // không có phần remote — output lạ
    }
    name = name.slice(slash + 1);
  } else {
    name = name.replace(/^heads\//, '');
  }
  return name === '' || name === 'HEAD' ? null : name;
}
