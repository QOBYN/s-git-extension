import { describe, expect, it } from 'vitest';
import { parseRefs } from './refParser';

const F = '\x1f';

describe('parseRefs', () => {
  it('parse local/remote/tag với tên ngắn đúng namespace', () => {
    const out = [
      `*${F}refs/heads/main${F}oid1`,
      ` ${F}refs/heads/feat/vip${F}oid2`,
      ` ${F}refs/remotes/origin/main${F}oid3`,
      ` ${F}refs/tags/v1.0${F}oid4`,
    ].join('\n');

    const refs = parseRefs(out);

    expect(refs).toEqual([
      { name: 'main', fullName: 'refs/heads/main', kind: 'local', oid: 'oid1', isHead: true },
      { name: 'feat/vip', fullName: 'refs/heads/feat/vip', kind: 'local', oid: 'oid2', isHead: false },
      { name: 'origin/main', fullName: 'refs/remotes/origin/main', kind: 'remote', oid: 'oid3', isHead: false },
      { name: 'v1.0', fullName: 'refs/tags/v1.0', kind: 'tag', oid: 'oid4', isHead: false },
    ]);
  });

  it('bỏ qua con trỏ origin/HEAD (không phải nhánh thật)', () => {
    const out = ` ${F}refs/remotes/origin/HEAD${F}oid`;
    expect(parseRefs(out)).toEqual([]);
  });

  it('output rỗng trả mảng rỗng', () => {
    expect(parseRefs('')).toEqual([]);
  });
});
