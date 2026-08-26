// Adapter: FileSystemLike trên node:fs — dùng cho RepoStateReader đọc .git/.
// (Không dùng vscode.workspace.fs vì .git/ nằm ngoài phạm vi file workspace
// và cần cả kiểm tra thư mục lẫn file với chi phí thấp nhất.)

import { access, readFile } from 'node:fs/promises';
import type { FileSystemLike } from '../services/interfaces';

export class NodeFileSystem implements FileSystemLike {
  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async readFile(path: string): Promise<string | null> {
    try {
      return await readFile(path, 'utf8');
    } catch {
      return null;
    }
  }
}
