import { describe, expect, it } from 'vitest';
import { parseNameRev, parseRefs } from './refParser';

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

describe('parseNameRev', () => {
  it('remote: bỏ tiền tố remotes/<remote>/ và hậu tố khoảng cách ~N / ^N', () => {
    expect(parseNameRev('remotes/origin/main~1\n', 'remote')).toBe('main');
    expect(parseNameRev('remotes/origin/dev', 'remote')).toBe('dev');
    expect(parseNameRev('origin/main~1^2', 'remote')).toBe('main');
    expect(parseNameRev('remotes/upstream/feature/x~12', 'remote')).toBe('feature/x');
  });

  it('local: giữ nguyên tên nhánh, bỏ hậu tố', () => {
    expect(parseNameRev('dev~2', 'local')).toBe('dev');
    expect(parseNameRev('main', 'local')).toBe('main');
  });

  it('undefined / rỗng / HEAD → null', () => {
    expect(parseNameRev('undefined\n', 'remote')).toBeNull();
    expect(parseNameRev('', 'remote')).toBeNull();
    expect(parseNameRev('remotes/origin/HEAD', 'remote')).toBeNull();
  });
});
