import { describe, expect, it } from 'vitest';
import { delimiterForPath, parseCsvLine } from './csv';

describe('parseCsvLine', () => {
  it('tách cell thường theo dấu phẩy', () => {
    expect(parseCsvLine('a,b,c', ',')).toEqual(['a', 'b', 'c']);
  });

  it('cell trong quote giữ dấu phẩy và escape ""', () => {
    expect(parseCsvLine('"x, y",z', ',')).toEqual(['x, y', 'z']);
    expect(parseCsvLine('"nói ""chào""",ok', ',')).toEqual(['nói "chào"', 'ok']);
  });

  it('cell rỗng và dòng rỗng', () => {
    expect(parseCsvLine('a,,c', ',')).toEqual(['a', '', 'c']);
    expect(parseCsvLine('', ',')).toEqual(['']);
  });

  it('tsv dùng tab', () => {
    expect(delimiterForPath('data.tsv')).toBe('\t');
    expect(delimiterForPath('data.csv')).toBe(',');
    expect(parseCsvLine('a\tb', '\t')).toEqual(['a', 'b']);
  });
});
