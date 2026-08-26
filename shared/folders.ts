// Helpers thuần về cây thư mục — dùng ở CẢ extension host (GitService.listFolders)
// và webview (render cây trong sidebar). Không import gì — đúng luật shared/.
// Trả về MỌI thư mục tổ tiên (kể cả cấp trung gian), sort để webview dựng cây ổn định.

export function foldersFromPaths(filePaths: string[]): string[] {
  const folders = new Set<string>();
  for (const filePath of filePaths) {
    let end = filePath.lastIndexOf('/');
    // Thêm từng cấp tổ tiên: a/b/c.txt → a/b, a
    while (end > 0) {
      const dir = filePath.slice(0, end);
      if (folders.has(dir)) {
        break; // các cấp trên đã được thêm từ file trước cùng nhánh
      }
      folders.add(dir);
      end = dir.lastIndexOf('/');
    }
  }
  return [...folders].sort();
}

/** Thư mục con TRỰC TIẾP của `parent` (null = cấp gốc) — cho render cây lazy. */
export function childFolders(allFolders: string[], parent: string | null): string[] {
  const prefix = parent === null ? '' : `${parent}/`;
  return allFolders.filter((folder) => {
    if (!folder.startsWith(prefix) || folder === parent) {
      return false;
    }
    return !folder.slice(prefix.length).includes('/'); // đúng 1 cấp dưới parent
  });
}
