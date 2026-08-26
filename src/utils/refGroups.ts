// Gom nhóm nhánh cho sidebar (ui-analysis B1): nhánh local có cùng prefix
// (feat/, fix/…) từ 2 nhánh trở lên đứng thành section riêng — chi tiết
// nhận diện SmartGit. Hàm thuần, test bằng Vitest.

import type { RefInfo } from '../../shared/types';

export interface RefGroup {
  /** null = nhóm "không prefix" (hiện đầu tiên, không có header). */
  label: string | null;
  refs: RefInfo[];
}

export function groupByPrefix(refs: RefInfo[]): RefGroup[] {
  const byPrefix = new Map<string, RefInfo[]>();
  const ungrouped: RefInfo[] = [];

  for (const ref of refs) {
    const slash = ref.name.indexOf('/');
    if (slash === -1) {
      ungrouped.push(ref);
    } else {
      const prefix = ref.name.slice(0, slash);
      const group = byPrefix.get(prefix);
      if (group) {
        group.push(ref);
      } else {
        byPrefix.set(prefix, [ref]);
      }
    }
  }

  const groups: RefGroup[] = [];
  // Prefix chỉ có 1 nhánh không đáng lập nhóm — trả về danh sách chung.
  for (const [prefix, members] of byPrefix) {
    if (members.length === 1) {
      ungrouped.push(members[0]);
    } else {
      groups.push({ label: `${prefix}/`, refs: members });
    }
  }

  groups.sort((a, b) => a.label!.localeCompare(b.label!));
  if (ungrouped.length > 0) {
    groups.unshift({ label: null, refs: ungrouped });
  }
  return groups;
}
