// Xuất blob git (video…) ra thư mục tạm để webview đọc trực tiếp qua URI —
// nội dung lớn KHÔNG đi qua RPC/base64 (tránh giới hạn DEFAULT_GIT_MAX_OUTPUT_BYTES).

import { access, mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { GitRunner } from './gitRunner';

export class MediaExporter {
  /** Chống xuất trùng khi 2 request cùng blob tới song song (double-click…). */
  private readonly inflight = new Map<string, Promise<string>>();

  constructor(
    private readonly runner: GitRunner,
    /** Thư mục tạm riêng của session (composition root tạo, dispose xoá cả cụm). */
    readonly dir: string,
  ) {}

  /**
   * Xuất blob tại `spec` (dạng `oid:path` / `:path` — như tham số của git show)
   * ra file `<oid-blob><ext>` trong thư mục tạm; cache theo oid blob nên cùng
   * nội dung chỉ xuất 1 lần. Trả đường dẫn tuyệt đối của file.
   */
  async exportBlob(repoRoot: string, spec: string, ext: string): Promise<string> {
    const oid = (await this.runner.run(repoRoot, ['rev-parse', spec])).trim();
    const outFile = join(this.dir, oid + ext);
    const running = this.inflight.get(outFile);
    if (running !== undefined) {
      return running;
    }
    const task = this.materialize(repoRoot, oid, outFile).finally(() =>
      this.inflight.delete(outFile),
    );
    this.inflight.set(outFile, task);
    return task;
  }

  private async materialize(repoRoot: string, oid: string, outFile: string): Promise<string> {
    try {
      await access(outFile);
      return outFile; // đã xuất trước đó — nội dung bất biến theo oid
    } catch {
      // chưa có — xuất bên dưới
    }
    await mkdir(this.dir, { recursive: true });
    // Ghi ra file .part rồi rename: file đích chỉ xuất hiện khi ĐÃ đầy đủ,
    // <video> không bao giờ đọc phải file đang ghi dở.
    const partFile = `${outFile}.part`;
    await this.runner.runToFile(repoRoot, ['cat-file', 'blob', oid], partFile);
    await rename(partFile, outFile);
    return outFile;
  }

  /** Xoá toàn bộ thư mục tạm — gọi khi extension deactivate. */
  async dispose(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
