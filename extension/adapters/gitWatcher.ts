// Watcher .git/ — nguồn sự kiện của luồng refresh (architecture.md 2.4):
// .git đổi → debounce → callback → broadcast repoChanged → webview refetch.
//
// Watch trên GITDIR ĐÃ RESOLVE thay vì `<root>/.git`: submodule có .git là FILE
// trỏ tới `.git/modules/<name>` của repo cha — watch pattern thư mục trên file đó
// sẽ không bao giờ khớp. GitService.getGitDir đã resolve đúng cho cả hai trường hợp.
//
// Chỉ theo dõi các file/thư mục quyết định trạng thái, không watch cả gitDir
// (objects/ đổi liên tục khi git chạy, watch cả sẽ rất ồn).

import * as vscode from 'vscode';
import { debounce } from '../core/async';
import { DisposableStore, toDisposable } from '../core/disposable';

/** Các đường dẫn trong gitDir ảnh hưởng tới log/status/refs/banner trạng thái. */
const WATCH_GLOB = '{HEAD,index,packed-refs,MERGE_HEAD,REBASE_HEAD,CHERRY_PICK_HEAD,refs/**}';

export interface WatchedRepo {
  root: string;
  /** GitService.getGitDir(root) — thư mục .git thật sự. */
  gitDir: string;
}

export class GitWatcher extends DisposableStore {
  constructor(
    repos: WatchedRepo[],
    debounceMs: number,
    onRepoChanged: (repoRoot: string) => void,
  ) {
    super();
    for (const { root, gitDir } of repos) {
      const trigger = this.register(debounce(() => onRepoChanged(root), debounceMs));
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(gitDir), WATCH_GLOB),
      );
      watcher.onDidChange(() => trigger.call());
      watcher.onDidCreate(() => trigger.call());
      watcher.onDidDelete(() => trigger.call());
      this.register(toDisposable(() => watcher.dispose()));
    }
  }
}
