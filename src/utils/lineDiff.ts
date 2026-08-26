// Diff theo dòng (LCS) cho bảng CSV — hàm thuần, test bằng Vitest.
// Không dùng cho file lớn: quá MAX_LINES trả null để caller fallback về Monaco.

export interface DiffedLine {
  type: 'same' | 'added' | 'removed';
  text: string;
}

/** Trên ngưỡng này DP LCS (O(n·m)) không đáng — dùng Monaco text diff. */
export const MAX_LINES = 2000;

export function diffLines(original: string[], modified: string[]): DiffedLine[] | null {
  if (original.length > MAX_LINES || modified.length > MAX_LINES) {
    return null;
  }

  // Bảng LCS cổ điển — kích thước đã chặn bởi MAX_LINES.
  const n = original.length;
  const m = modified.length;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        original[i] === modified[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const result: DiffedLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (original[i] === modified[j]) {
      result.push({ type: 'same', text: original[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ type: 'removed', text: original[i] });
      i++;
    } else {
      result.push({ type: 'added', text: modified[j] });
      j++;
    }
  }
  for (; i < n; i++) {
    result.push({ type: 'removed', text: original[i] });
  }
  for (; j < m; j++) {
    result.push({ type: 'added', text: modified[j] });
  }
  return result;
}
