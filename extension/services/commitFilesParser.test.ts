import { describe, expect, it } from 'vitest';
import { parseCommitFiles } from './commitFilesParser';

const NUL = '\0';

describe('parseCommitFiles', () => {
  it('parse modified / added / deleted', () => {
    const out = ['M', 'src/app.ts', 'A', 'docs/new.md', 'D', 'old.txt', ''].join(NUL);

    expect(parseCommitFiles(out)).toEqual([
      { path: 'src/app.ts', kind: 'modified' },
      { path: 'docs/new.md', kind: 'added' },
      { path: 'old.txt', kind: 'deleted' },
    ]);
  });

  it('rename có score (R100) lấy đủ origPath và path mới', () => {
    const out = ['R100', 'src/old-name.ts', 'src/new-name.ts', ''].join(NUL);

    expect(parseCommitFiles(out)).toEqual([
      { path: 'src/new-name.ts', origPath: 'src/old-name.ts', kind: 'renamed' },
    ]);
  });

  it('path chứa khoảng trắng và unicode giữ nguyên (nhờ -z)', () => {
    const out = ['M', 'docs/ghi chú thiết kế.md', ''].join(NUL);
    expect(parseCommitFiles(out)[0].path).toBe('docs/ghi chú thiết kế.md');
  });

  it('output rỗng (commit trống) trả mảng rỗng', () => {
    expect(parseCommitFiles('')).toEqual([]);
  });
});
