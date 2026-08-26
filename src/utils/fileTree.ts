// Dựng cây thư mục kiểu EXPLORER từ danh sách path phẳng (dùng cho các danh
// sách changed files khi user chọn chế độ Tree). Thuần TS — không React — để
// test được bằng vitest node env.
//
// Quy ước giống VSCode Explorer:
//  - Folder trước, file sau; cùng loại sắp theo tên (localeCompare).
//  - Chuỗi folder chỉ có đúng 1 folder con (không có file) được GỘP thành
//    "a/b/c" (compact folders) — key collapse là path của folder SÂU NHẤT.
//  - Folder nằm trong tập `collapsed` thì ẩn toàn bộ hậu duệ.

export type FileTreeRow<T> =
  | {
      kind: 'folder';
      /** Path đầy đủ của folder (sau khi gộp chuỗi đơn) — dùng làm key collapse. */
      path: string;
      /** Nhãn hiển thị, có thể là "a/b/c" khi đã gộp. */
      name: string;
      depth: number;
      collapsed: boolean;
      /** Tổng số file hậu duệ — hiện badge đếm khi folder đang đóng. */
      fileCount: number;
    }
  | { kind: 'file'; item: T; depth: number };

interface FolderNode<T> {
  name: string;
  path: string;
  folders: Map<string, FolderNode<T>>;
  files: T[];
}

/**
 * Trả về danh sách hàng ĐÃ PHẲNG HOÁ theo thứ tự render (folder row rồi tới
 * nội dung), kèm depth để component thụt lề. Caller giữ tập collapsed.
 */
export function buildFileTreeRows<T>(
  items: readonly T[],
  getPath: (item: T) => string,
  collapsed: ReadonlySet<string>,
): FileTreeRow<T>[] {
  const root: FolderNode<T> = { name: '', path: '', folders: new Map(), files: [] };

  for (const item of items) {
    const segments = getPath(item).split('/');
    let node = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const name = segments[i]!;
      let child = node.folders.get(name);
      if (child === undefined) {
        child = {
          name,
          path: node.path === '' ? name : `${node.path}/${name}`,
          folders: new Map(),
          files: [],
        };
        node.folders.set(name, child);
      }
      node = child;
    }
    node.files.push(item);
  }

  const out: FileTreeRow<T>[] = [];
  flattenInto(root, 0, getPath, collapsed, out);
  return out;
}

function flattenInto<T>(
  node: FolderNode<T>,
  depth: number,
  getPath: (item: T) => string,
  collapsed: ReadonlySet<string>,
  out: FileTreeRow<T>[],
): void {
  const folders = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const folder of folders) {
    // Gộp chuỗi folder đơn: a → b → c (không file xen giữa) thành "a/b/c".
    let name = folder.name;
    let deepest = folder;
    while (deepest.folders.size === 1 && deepest.files.length === 0) {
      const only = deepest.folders.values().next().value as FolderNode<T>;
      name = `${name}/${only.name}`;
      deepest = only;
    }
    const isCollapsed = collapsed.has(deepest.path);
    out.push({
      kind: 'folder',
      path: deepest.path,
      name,
      depth,
      collapsed: isCollapsed,
      fileCount: countFiles(deepest),
    });
    if (!isCollapsed) {
      flattenInto(deepest, depth + 1, getPath, collapsed, out);
    }
  }

  const files = [...node.files].sort((a, b) => baseName(getPath(a)).localeCompare(baseName(getPath(b))));
  for (const item of files) {
    out.push({ kind: 'file', item, depth });
  }
}

function countFiles<T>(node: FolderNode<T>): number {
  let total = node.files.length;
  for (const child of node.folders.values()) {
    total += countFiles(child);
  }
  return total;
}

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
