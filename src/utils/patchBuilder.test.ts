import { describe, expect, it } from 'vitest';
import { buildHunkPatch } from './patchBuilder';

const lines = (...ls: string[]) => ls.join('\n') + '\n';

describe('buildHunkPatch', () => {
  it('hunk sửa 1 dòng giữa file: context 3 phía, header đúng số', () => {
    const patch = buildHunkPatch({
      path: 'src/a.ts',
      originalText: lines('l1', 'l2', 'l3', 'l4', 'OLD', 'l6', 'l7', 'l8', 'l9'),
      modifiedText: lines('l1', 'l2', 'l3', 'l4', 'NEW', 'l6', 'l7', 'l8', 'l9'),
      change: {
        originalStartLineNumber: 5,
        originalEndLineNumber: 5,
        modifiedStartLineNumber: 5,
        modifiedEndLineNumber: 5,
      },
    });

    expect(patch).toBe(
      [
        'diff --git a/src/a.ts b/src/a.ts',
        '--- a/src/a.ts',
        '+++ b/src/a.ts',
        '@@ -2,7 +2,7 @@',
        ' l2',
        ' l3',
        ' l4',
        '-OLD',
        '+NEW',
        ' l6',
        ' l7',
        ' l8',
        '',
      ].join('\n'),
    );
  });

  it('chèn thuần (originalEndLineNumber = 0): -N,0 tại dòng trước điểm chèn', () => {
    const patch = buildHunkPatch({
      path: 'a.txt',
      originalText: lines('l1', 'l2'),
      modifiedText: lines('l1', 'INSERTED', 'l2'),
      change: {
        originalStartLineNumber: 1,
        originalEndLineNumber: 0,
        modifiedStartLineNumber: 2,
        modifiedEndLineNumber: 2,
      },
    });

    expect(patch).toContain('@@ -1,2 +1,3 @@');
    expect(patch).toContain('+INSERTED');
    expect(patch).not.toContain('-l');
  });

  it('xoá thuần (modifiedEndLineNumber = 0)', () => {
    const patch = buildHunkPatch({
      path: 'a.txt',
      originalText: lines('l1', 'GONE', 'l2'),
      modifiedText: lines('l1', 'l2'),
      change: {
        originalStartLineNumber: 2,
        originalEndLineNumber: 2,
        modifiedStartLineNumber: 1,
        modifiedEndLineNumber: 0,
      },
    });

    expect(patch).toContain('@@ -1,3 +1,2 @@');
    expect(patch).toContain('-GONE');
    expect(patch).not.toContain('+l');
  });

  it('hunk đầu file: không context trước, header bắt đầu từ 1', () => {
    const patch = buildHunkPatch({
      path: 'a.txt',
      originalText: lines('OLD', 'l2', 'l3', 'l4', 'l5'),
      modifiedText: lines('NEW', 'l2', 'l3', 'l4', 'l5'),
      change: {
        originalStartLineNumber: 1,
        originalEndLineNumber: 1,
        modifiedStartLineNumber: 1,
        modifiedEndLineNumber: 1,
      },
    });

    expect(patch).toContain('@@ -1,4 +1,4 @@');
  });

  it('file không có newline cuối: chèn marker "\\ No newline" sau dòng cuối', () => {
    const patch = buildHunkPatch({
      path: 'a.txt',
      originalText: 'l1\nOLD', // không newline cuối
      modifiedText: 'l1\nNEW',
      change: {
        originalStartLineNumber: 2,
        originalEndLineNumber: 2,
        modifiedStartLineNumber: 2,
        modifiedEndLineNumber: 2,
      },
    });

    const lines = patch.split('\n');
    const oldIdx = lines.indexOf('-OLD');
    const newIdx = lines.indexOf('+NEW');
    expect(lines[oldIdx + 1]).toBe('\\ No newline at end of file');
    expect(lines[newIdx + 1]).toBe('\\ No newline at end of file');
  });

  it('sửa nhiều dòng thành số dòng khác nhau', () => {
    const patch = buildHunkPatch({
      path: 'a.txt',
      originalText: lines('l1', 'A', 'B', 'l4'),
      modifiedText: lines('l1', 'X', 'Y', 'Z', 'l4'),
      change: {
        originalStartLineNumber: 2,
        originalEndLineNumber: 3,
        modifiedStartLineNumber: 2,
        modifiedEndLineNumber: 4,
      },
    });

    expect(patch).toContain('@@ -1,4 +1,5 @@');
    expect(patch).toContain('-A');
    expect(patch).toContain('-B');
    expect(patch).toContain('+X');
    expect(patch).toContain('+Z');
  });
});
