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
