import { describe, expect, it } from 'vitest';
import { diffLines, MAX_LINES } from './lineDiff';

describe('diffLines', () => {
  it('dòng sửa = removed cũ + added mới, dòng giữ nguyên = same', () => {
    const result = diffLines(['a', 'b', 'c'], ['a', 'B', 'c'])!;

    expect(result).toEqual([
      { type: 'same', text: 'a' },
      { type: 'removed', text: 'b' },
      { type: 'added', text: 'B' },
      { type: 'same', text: 'c' },
    ]);
  });

  it('thêm dòng cuối / xoá dòng đầu', () => {
    expect(diffLines(['a'], ['a', 'b'])).toEqual([
      { type: 'same', text: 'a' },
      { type: 'added', text: 'b' },
    ]);
    expect(diffLines(['x', 'a'], ['a'])).toEqual([
      { type: 'removed', text: 'x' },
      { type: 'same', text: 'a' },
    ]);
  });

  it('2 phía rỗng trả rỗng; quá MAX_LINES trả null (fallback Monaco)', () => {
    expect(diffLines([], [])).toEqual([]);
    expect(diffLines(new Array(MAX_LINES + 1).fill('x'), ['x'])).toBeNull();
  });
});
