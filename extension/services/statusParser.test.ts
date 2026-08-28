import { describe, expect, it } from 'vitest';
import { parseStatusV2 } from './statusParser';

const NUL = '\0';

/** Ghép các record thành output -z (mỗi record kết thúc bằng NUL). */
function porcelain(...records: string[]): string {
  return records.map((r) => r + NUL).join('');
}

describe('parseStatusV2', () => {
  it('parse header branch: tên nhánh, upstream, ahead/behind', () => {
    const out = porcelain(
      '# branch.oid abc123',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -1',
    );

    const result = parseStatusV2(out);

    expect(result.branch).toBe('main');
    expect(result.upstream).toBe('origin/main');
    expect(result.ahead).toBe(2);
    expect(result.behind).toBe(1);
  });

  it('detached HEAD trả branch null', () => {
    expect(parseStatusV2(porcelain('# branch.head (detached)')).branch).toBeNull();
  });

  it('phân biệt staged (cột X) và unstaged (cột Y) — nền tảng 2 khung của ui-analysis F', () => {
    const out = porcelain(
      '1 .M N... 100644 100644 100644 h1 h2 unstaged-only.ts',
      '1 M. N... 100644 100644 100644 h1 h2 staged-only.ts',
      '1 MM N... 100644 100644 100644 h1 h2 both.ts',
      '1 A. N... 000000 100644 100644 0000 h2 added.ts',
      '1 .D N... 100644 100644 000000 h1 h2 deleted.ts',
    );

    const files = parseStatusV2(out).files;

    expect(files[0]).toMatchObject({ path: 'unstaged-only.ts', staged: null, unstaged: 'modified' });
    expect(files[1]).toMatchObject({ path: 'staged-only.ts', staged: 'modified', unstaged: null });
    expect(files[2]).toMatchObject({ staged: 'modified', unstaged: 'modified' });
    expect(files[3]).toMatchObject({ staged: 'added', unstaged: null });
    expect(files[4]).toMatchObject({ staged: null, unstaged: 'deleted' });
  });

  it('path chứa khoảng trắng không bị cắt', () => {
    const out = porcelain('1 .M N... 100644 100644 100644 h1 h2 docs/note about design.md');
    expect(parseStatusV2(out).files[0].path).toBe('docs/note about design.md');
  });

  it('rename (record "2") lấy được cả path mới và origPath từ token kế tiếp', () => {
    const out = porcelain(
      '2 R. N... 100644 100644 100644 h1 h2 R100 src/new-name.ts',
      'src/old-name.ts',
    );

    const files = parseStatusV2(out).files;

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      path: 'src/new-name.ts',
      origPath: 'src/old-name.ts',
      staged: 'renamed',
    });
  });

  it('file conflict (record "u") đánh dấu conflicted', () => {
    const out = porcelain('u UU N... 100644 100644 100644 100644 h1 h2 h3 src/conflict.ts');
    expect(parseStatusV2(out).files[0]).toMatchObject({
      path: 'src/conflict.ts',
      conflicted: true,
    });
  });

  it('file untracked (record "?") đánh dấu untracked', () => {
    const out = porcelain('? docs/new-file.md');
    expect(parseStatusV2(out).files[0]).toMatchObject({
      path: 'docs/new-file.md',
      untracked: true,
      staged: null,
      unstaged: null,
    });
  });

  it('entry ignored (record "!") đánh dấu ignored, bỏ "/" cuối của thư mục gộp', () => {
    const out = porcelain('! node_modules/', '! s-git.vsix');
    const files = parseStatusV2(out).files;
    expect(files[0]).toMatchObject({ path: 'node_modules', ignored: true, untracked: false });
    expect(files[1]).toMatchObject({ path: 's-git.vsix', ignored: true });
  });

  it('output rỗng (working tree sạch, không --branch header) không lỗi', () => {
    const result = parseStatusV2('');
    expect(result.files).toEqual([]);
    expect(result.branch).toBeNull();
  });

  it('field <sub> bắt đầu bằng S đánh dấu submodule (file thường thì không)', () => {
    const out = porcelain(
      '1 .M SC.. 160000 160000 160000 h1 h2 libs/child',
      '1 .M N... 100644 100644 100644 h1 h2 normal.ts',
      'u UU S... 160000 160000 160000 160000 h1 h2 h3 libs/conflicted',
    );

    const files = parseStatusV2(out).files;

    expect(files[0]).toMatchObject({ path: 'libs/child', submodule: true });
    expect(files[1].submodule).toBeUndefined();
    expect(files[2]).toMatchObject({ path: 'libs/conflicted', conflicted: true, submodule: true });
  });
});
