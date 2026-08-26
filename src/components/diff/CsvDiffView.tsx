// Diff CSV dạng BẢNG: gộp 2 phía thành 1 bảng, dòng thêm nền xanh (+),
// dòng xoá nền đỏ (−), dòng giữ nguyên bình thường. File quá lớn cho LCS
// → caller fallback về Monaco text diff.

import { useMemo } from 'react';
import type { DiffPayload } from '../../../shared/types';
import { delimiterForPath, parseCsvLine } from '../../utils/csv';
import { diffLines } from '../../utils/lineDiff';

export interface CsvTable {
  rows: Array<{ type: 'same' | 'added' | 'removed'; cells: string[] }>;
  columnCount: number;
}

/**
 * null khi không áp dụng (không phải CSV / diff nhị phân / file quá lớn cho LCS)
 * — DiffPanel fallback về Monaco. Hook gọi VÔ ĐIỀU KIỆN (diff nullable) để giữ
 * thứ tự hooks ổn định.
 */
export function useCsvTable(path: string, diff: DiffPayload | null): CsvTable | null {
  return useMemo(() => {
    if (diff === null || diff.encoding !== 'text') {
      return null;
    }
    const delimiter = delimiterForPath(path);
    const rows = diffLines(splitLines(diff.original), splitLines(diff.modified));
    if (rows === null) {
      return null;
    }
    const parsed = rows.map((row) => ({ type: row.type, cells: parseCsvLine(row.text, delimiter) }));
    const columnCount = parsed.reduce((max, row) => Math.max(max, row.cells.length), 0);
    return { rows: parsed, columnCount };
  }, [path, diff]);
}

export function CsvDiffView({ table }: { table: CsvTable }) {
  return (
    <div className="sg-csv-diff">
      <table>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} className={`csv-${row.type}`}>
              <td className="csv-marker">
                {row.type === 'added' ? '+' : row.type === 'removed' ? '−' : ''}
              </td>
              {Array.from({ length: table.columnCount }, (_, col) => (
                <td key={col}>{row.cells[col] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function splitLines(text: string): string[] {
  if (text === '') {
    return [];
  }
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}
