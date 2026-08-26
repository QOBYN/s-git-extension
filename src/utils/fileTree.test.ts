import { describe, expect, it } from 'vitest';
import { buildFileTreeRows, type FileTreeRow } from './fileTree';

const id = (p: string) => p;
const none = new Set<string>();

/** Rút gọn row thành chuỗi dễ so sánh: "d2:src/utils" / "f1:a.ts". */
const sketch = (rows: FileTreeRow<string>[]): string[] =>
  rows.map((r) =>
    r.kind === 'folder' ? `d${r.depth}:${r.name}${r.collapsed ? '!' : ''}` : `f${r.depth}:${r.item}`,
  );

describe('buildFileTreeRows', () => {
  it('file ở root không tạo folder, sắp theo tên', () => {
    expect(sketch(buildFileTreeRows(['b.ts', 'a.ts'], id, none))).toEqual(['f0:a.ts', 'f0:b.ts']);
  });

  it('folder trước file, nội dung thụt lề', () => {
    const rows = buildFileTreeRows(['readme.md', 'src/a.ts', 'src/b.ts'], id, none);
    expect(sketch(rows)).toEqual(['d0:src', 'f1:src/a.ts', 'f1:src/b.ts', 'f0:readme.md']);
  });

  it('gộp chuỗi folder đơn thành "a/b/c" với path là folder sâu nhất', () => {
    const rows = buildFileTreeRows(['src/utils/deep/x.ts'], id, none);
    expect(rows[0]).toMatchObject({
      kind: 'folder',
      name: 'src/utils/deep',
      path: 'src/utils/deep',
      fileCount: 1,
    });
    expect(sketch(rows)).toEqual(['d0:src/utils/deep', 'f1:src/utils/deep/x.ts']);
  });

  it('không gộp khi folder có file hoặc nhiều nhánh', () => {
    const rows = buildFileTreeRows(['src/index.ts', 'src/utils/x.ts', 'src/utils/y.ts'], id, none);
    expect(sketch(rows)).toEqual([
      'd0:src',
      'd1:utils',
      'f2:src/utils/x.ts',
      'f2:src/utils/y.ts',
      'f1:src/index.ts',
    ]);
  });

  it('folder collapsed ẩn hậu duệ nhưng vẫn đếm đủ fileCount', () => {
    const rows = buildFileTreeRows(
      ['src/a.ts', 'src/sub/b.ts', 'top.md'],
      id,
      new Set(['src']),
    );
    expect(sketch(rows)).toEqual(['d0:src!', 'f0:top.md']);
    expect(rows[0]).toMatchObject({ kind: 'folder', fileCount: 2 });
  });
});
