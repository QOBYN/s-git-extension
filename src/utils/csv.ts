// Parser 1 dòng CSV/TSV — đủ chuẩn RFC 4180 cơ bản: quote kép, escape "" trong
// quote, delimiter , hoặc tab (tự chọn theo đuôi file). Hàm thuần, test Vitest.

export function delimiterForPath(path: string): string {
  return path.toLowerCase().endsWith('.tsv') ? '\t' : ',';
}

export function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'; // "" trong quote = 1 dấu "
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"' && current === '') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}
