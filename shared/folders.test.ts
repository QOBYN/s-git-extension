import { describe, expect, it } from 'vitest';
import { childFolders, foldersFromPaths } from './folders';

describe('foldersFromPaths', () => {
  it('suy đủ mọi cấp thư mục tổ tiên, sort, không trùng', () => {
    const folders = foldersFromPaths([
      'src/engine/graphLayout.ts',
      'src/engine/colors.ts',
      'src/App.tsx',
      'README.md',
    ]);

    expect(folders).toEqual(['src', 'src/engine']);
  });

  it('file ở gốc repo không sinh thư mục nào', () => {
    expect(foldersFromPaths(['a.txt', 'b.txt'])).toEqual([]);
  });

  it('path unicode/khoảng trắng giữ nguyên', () => {
    expect(foldersFromPaths(['docs/ghi chú/note.md'])).toEqual(['docs', 'docs/ghi chú']);
  });
});

describe('childFolders', () => {
  const all = ['docs', 'src', 'src/engine', 'src/engine/deep', 'src/utils'];

  it('cấp gốc trả thư mục không chứa "/"', () => {
    expect(childFolders(all, null)).toEqual(['docs', 'src']);
  });

  it('con trực tiếp của 1 thư mục — không lấy cháu', () => {
    expect(childFolders(all, 'src')).toEqual(['src/engine', 'src/utils']);
    expect(childFolders(all, 'src/engine')).toEqual(['src/engine/deep']);
  });

  it('thư mục lá trả rỗng', () => {
    expect(childFolders(all, 'docs')).toEqual([]);
  });
});
