// Adapter KeyValueStorage trên file — mỗi key 1 file JSON trong globalStorage
// của extension. Chọn file thay vì Memento vì cache log 1.000 commit (~vài trăm KB)
// không nên nhét vào state DB của VSCode.

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { KeyValueStorage } from '../services/interfaces';

export class FileStorage implements KeyValueStorage {
  private dirReady: Promise<void> | undefined;

  /** `baseDir` = context.globalStorageUri.fsPath — do composition root truyền vào. */
  constructor(private readonly baseDir: string) {}

  async read(key: string): Promise<string | null> {
    try {
      return await readFile(this.fileOf(key), 'utf8');
    } catch {
      return null; // chưa tồn tại / không đọc được — với cache là như nhau
    }
  }

  async write(key: string, value: string): Promise<void> {
    await this.ensureDir();
    await writeFile(this.fileOf(key), value, 'utf8');
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.fileOf(key));
    } catch {
      // đã không tồn tại — mục tiêu đạt được
    }
  }

  private ensureDir(): Promise<void> {
    // mkdir 1 lần duy nhất, các lời gọi sau dùng chung promise.
    this.dirReady ??= mkdir(this.baseDir, { recursive: true }).then(() => undefined);
    return this.dirReady;
  }

  private fileOf(key: string): string {
    // encodeURIComponent: key chứa '/' hay ':' không phá cấu trúc thư mục.
    return path.join(this.baseDir, `${encodeURIComponent(key)}.json`);
  }
}
