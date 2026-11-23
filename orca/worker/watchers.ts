// Watcher cho Orca bằng node:fs.watch (VSCode dùng createFileSystemWatcher —
// không có trong worker Orca). 2 nguồn:
//  1. gitDir: HEAD/index/refs/... đổi → log + status + refs (giống GitWatcher VSCode).
//  2. Working tree (chỉ repo của workspace đang focus): agent/editor sửa file →
//     status. VSCode nghe onDidSaveTextDocument; Orca không báo sự kiện lưu file
//     cho plugin nên phải watch thư mục. Chỉ bật trên macOS/Windows — Linux giả
//     lập recursive bằng 1 inotify mỗi thư mục con (node_modules…), dễ chạm trần.

import { watch, type FSWatcher } from 'node:fs';
import * as path from 'node:path';
import type { RepoDelta } from '../../shared/types';
import { debounce } from '../../extension/core/async';
import { DisposableStore, toDisposable } from '../../extension/core/disposable';

/** File/thư mục ở gốc gitDir quyết định log/status/banner trạng thái. */
const GIT_STATE_ENTRIES = new Set([
  'HEAD',
  'index',
  'packed-refs',
  'MERGE_HEAD',
  'REBASE_HEAD',
  'CHERRY_PICK_HEAD',
  'rebase-merge',
  'rebase-apply',
]);

/** Thư mục working tree đổi liên tục nhưng không ảnh hưởng git status của user. */
const IGNORED_TOP_DIRS = new Set(['.git', 'node_modules']);

export interface WatchedRepo {
  root: string;
  gitDir: string;
}

export function supportsWorkingTreeWatch(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'darwin' || platform === 'win32';
}

/** Sự kiện working tree có đáng refresh status không (bỏ .git/, node_modules/). */
export function isRelevantWorktreeEvent(filename: string | null): boolean {
  if (filename === null || filename === '') {
    return true; // OS không báo tên — cứ refresh cho chắc
  }
  const top = filename.split(/[\\/]/)[0];
  return !IGNORED_TOP_DIRS.has(top);
}

export class NodeRepoWatcher extends DisposableStore {
  constructor(
    repos: readonly WatchedRepo[],
    worktreeRoots: ReadonlySet<string>,
    debounceMs: number,
    onChange: (repoRoot: string, delta: RepoDelta) => void,
    log: (message: string) => void,
  ) {
    super();
    for (const { root, gitDir } of repos) {
      const gitTrigger = this.register(
        debounce(() => onChange(root, { changed: ['log', 'status', 'refs'] }), debounceMs),
      );
      this.tryWatch(gitDir, false, log, (name) => {
        if (name === null || GIT_STATE_ENTRIES.has(name)) {
          gitTrigger.call();
        }
      });
      // refs/ lồng nhiều cấp (refs/heads/feature/x) — cần recursive; nền tảng
      // không hỗ trợ thì watch refs/heads 1 cấp (packed-refs/HEAD vẫn bắt được).
      if (!this.tryWatch(path.join(gitDir, 'refs'), true, log, () => gitTrigger.call(), true)) {
        this.tryWatch(path.join(gitDir, 'refs', 'heads'), false, log, () => gitTrigger.call());
      }

      if (worktreeRoots.has(root) && supportsWorkingTreeWatch()) {
        const statusTrigger = this.register(
          debounce(() => onChange(root, { changed: ['status'] }), debounceMs),
        );
        this.tryWatch(root, true, log, (name) => {
          if (isRelevantWorktreeEvent(name)) {
            statusTrigger.call();
          }
        });
      }
    }
  }

  /** false khi không watch được (thư mục chưa có, nền tảng không hỗ trợ recursive). */
  private tryWatch(
    target: string,
    recursive: boolean,
    log: (message: string) => void,
    onEvent: (filename: string | null) => void,
    quiet = false,
  ): boolean {
    let watcher: FSWatcher;
    try {
      watcher = watch(target, { recursive, persistent: false }, (_event, filename) =>
        onEvent(filename === null ? null : filename.toString()),
      );
    } catch (error) {
      if (!quiet) {
        log(`watch ${target}: ${error instanceof Error ? error.message : String(error)}`);
      }
      return false;
    }
    // Thư mục bị xoá/đổi tên (worktree bị gỡ) → watcher báo lỗi; bỏ qua, lần
    // đồng bộ workspace sau sẽ dựng lại.
    watcher.on('error', () => watcher.close());
    this.register(toDisposable(() => watcher.close()));
    return true;
  }
}
