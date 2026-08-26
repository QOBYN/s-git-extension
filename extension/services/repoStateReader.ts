// Đọc trạng thái đặc biệt của repo (merging/rebasing/cherry-picking) từ thư mục .git/.
// Nguồn của banner trạng thái + commit message tự điền (spec mục 2.4, ui-analysis D2).

import * as path from 'node:path';
import type { RepoActivity } from '../../shared/types';
import type { FileSystemLike } from './interfaces';

export interface RepoActivityState {
  activity: RepoActivity;
  /** Nội dung .git/MERGE_MSG — commit message tự điền khi merging. */
  message?: string;
}

export class RepoStateReader {
  constructor(private readonly fs: FileSystemLike) {}

  /**
   * `gitDir` là đường dẫn tới thư mục .git đã resolve (worktree có .git dạng file
   * trỏ đi nơi khác — việc resolve là trách nhiệm của adapter/RepoManager).
   * Thứ tự kiểm tra khớp độ ưu tiên hiển thị: rebase đang dở cũng tạo MERGE_MSG
   * nên phải kiểm tra rebase TRƯỚC merge.
   */
  async read(gitDir: string): Promise<RepoActivityState> {
    // Rebase: git dùng 1 trong 2 thư mục tuỳ kiểu (merge-backend / apply-backend).
    const rebasing =
      (await this.fs.exists(path.join(gitDir, 'rebase-merge'))) ||
      (await this.fs.exists(path.join(gitDir, 'rebase-apply')));
    if (rebasing) {
      return { activity: 'rebasing', message: await this.readMessage(gitDir) };
    }

    if (await this.fs.exists(path.join(gitDir, 'MERGE_HEAD'))) {
      return { activity: 'merging', message: await this.readMessage(gitDir) };
    }

    if (await this.fs.exists(path.join(gitDir, 'CHERRY_PICK_HEAD'))) {
      return { activity: 'cherry-picking', message: await this.readMessage(gitDir) };
    }

    return { activity: 'none' };
  }

  private async readMessage(gitDir: string): Promise<string | undefined> {
    const raw = await this.fs.readFile(path.join(gitDir, 'MERGE_MSG'));
    return raw?.trim() || undefined;
  }
}
