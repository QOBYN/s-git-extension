import { describe, expect, it } from 'vitest';
import { groupByPrefix } from './refGroups';
import type { RefInfo } from '../../shared/types';

function ref(name: string): RefInfo {
  return { name, fullName: `refs/heads/${name}`, kind: 'local', oid: 'x', isHead: false };
}

describe('groupByPrefix', () => {
  it('prefix có ≥2 nhánh thành nhóm riêng, sort theo tên nhóm', () => {
    const groups = groupByPrefix([
      ref('main'),
      ref('fix/login'),
      ref('feat/vip'),
      ref('feat/city'),
      ref('fix/token'),
    ]);

    expect(groups.map((g) => g.label)).toEqual([null, 'feat/', 'fix/']);
    expect(groups[1].refs.map((r) => r.name)).toEqual(['feat/vip', 'feat/city']);
  });

  it('prefix chỉ có 1 nhánh không lập nhóm — về danh sách chung', () => {
    const groups = groupByPrefix([ref('main'), ref('research/db_x')]);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBeNull();
    expect(groups[0].refs.map((r) => r.name)).toEqual(['main', 'research/db_x']);
  });

  it('danh sách rỗng trả mảng rỗng', () => {
    expect(groupByPrefix([])).toEqual([]);
  });
});
