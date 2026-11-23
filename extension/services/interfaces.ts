// Các cổng (port) mà services/ cần từ thế giới bên ngoài.
// Impl thật nằm ở extension/adapters/ (bọc VSCode API / node:fs);
// impl giả (Fake*) nằm trong test. Services CHỈ được phụ thuộc file này —
// đây chính là ranh giới Dependency Inversion của architecture.md mục 1.

/**
 * Danh sách folder đang mở — VSCode: workspace folders (đồng bộ); Orca: các
 * workspace local (phải hỏi host nên được phép trả Promise).
 */
export interface WorkspaceReader {
  getFolders():
    | ReadonlyArray<{ name: string; fsPath: string }>
    | Promise<ReadonlyArray<{ name: string; fsPath: string }>>;
}

/** Truy cập file hệ thống tối thiểu — đủ cho RepoStateReader đọc .git/. */
export interface FileSystemLike {
  exists(path: string): Promise<boolean>;
  /** Trả null nếu file không tồn tại/không đọc được (không ném). */
  readFile(path: string): Promise<string | null>;
}

/** Kho key-value cho cache (bọc vscode globalStorage). */
export interface KeyValueStorage {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
