// Composition root — nơi DUY NHẤT khởi tạo và nối các service (architecture.md mục 1).
// File này chỉ wire dependency + đăng ký lệnh/view; không chứa logic nghiệp vụ.

import * as path from 'node:path';
import * as vscode from 'vscode';
import { EXTENSION_ID_PREFIX } from '../shared/constants';
import { readExtensionConfig } from './adapters/config';
import { FileStorage } from './adapters/fileStorage';
import { GitWatcher } from './adapters/gitWatcher';
import { NodeFileSystem } from './adapters/nodeFs';
import { VscodeWorkspaceReader } from './adapters/vscodeWorkspace';
import { createHostFunctions } from './rpc/hostFunctions';
import { RpcHub } from './rpc/rpcHub';
import { CacheIndex } from './services/cacheIndex';
import { GitService } from './services/gitService';
import { SpawnGitRunner } from './services/gitRunner';
import { RepoManager } from './services/repoManager';
import { RepoStateReader } from './services/repoStateReader';
import { FileLogPanel } from './views/fileLogPanel';
import { MainPanel } from './views/mainPanel';
import { SidebarViewProvider } from './views/sidebarView';

export function activate(context: vscode.ExtensionContext): void {
  const config = readExtensionConfig();

  // ---- services (thuần TS, nhận adapter qua constructor) ----
  const runner = new SpawnGitRunner({ gitPath: config.gitPath || undefined });
  const git = new GitService(runner, { logPageSize: config.logPageSize });
  const stateReader = new RepoStateReader(new NodeFileSystem());
  const repoManager = new RepoManager(new VscodeWorkspaceReader(), git, stateReader);
  const cache = new CacheIndex(new FileStorage(context.globalStorageUri.fsPath));

  const hub = new RpcHub();
  // panelOpener tham chiếu hostFunctions qua closure (gọi sau khi activate xong) —
  // phá vòng phụ thuộc hostFunctions ↔ MainPanel.
  const hostFunctions = createHostFunctions({
    repoManager,
    git,
    stateReader,
    runner,
    cache,
    panelOpener: {
      open: (repoRoot, mode, folder, ref) =>
        MainPanel.createOrShow(context, hostFunctions, hub, { repoRoot, mode, folder, ref }),
    },
    shell: {
      openFile: (repoRoot, relPath) =>
        void vscode.window.showTextDocument(vscode.Uri.file(path.join(repoRoot, relPath)), {
          preview: false,
        }),
      revealInOS: (repoRoot, relPath) =>
        void vscode.commands.executeCommand(
          'revealFileInOS',
          vscode.Uri.file(path.join(repoRoot, relPath)),
        ),
      openFileLog: (repoRoot, relPath) =>
        FileLogPanel.show(context, hostFunctions, hub, repoRoot, relPath),
    },
  });

  // ---- watcher .git/ → broadcast repoChanged (setup nền, không chặn activate) ----
  void (async () => {
    const repos = await repoManager.listRepos();
    // Resolve gitDir từng repo — submodule có .git dạng file (xem gitWatcher.ts).
    const watched = await Promise.all(
      repos.map(async (repo) => ({ root: repo.root, gitDir: await git.getGitDir(repo.root) })),
    );
    const watcher = new GitWatcher(watched, config.gitWatchDebounceMs, (repoRoot) =>
      hub.broadcastRepoChanged(repoRoot, { changed: ['log', 'status', 'refs'] }),
    );
    context.subscriptions.push(watcher);
  })();

  // ---- views + commands ----
  context.subscriptions.push(
    hub,
    vscode.window.registerWebviewViewProvider(
      SidebarViewProvider.viewType,
      new SidebarViewProvider(context, hostFunctions, hub),
    ),
    vscode.commands.registerCommand(`${EXTENSION_ID_PREFIX}.openPanel`, () =>
      MainPanel.createOrShow(context, hostFunctions, hub),
    ),
    // File Log: từ context menu Explorer/editor hoặc Command Palette (file đang mở).
    vscode.commands.registerCommand(`${EXTENSION_ID_PREFIX}.fileLog`, async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target || target.scheme !== 'file') {
        void vscode.window.showWarningMessage('SmartGit: không xác định được file để xem log.');
        return;
      }
      const repos = await repoManager.listRepos();
      // Repo chứa file, ưu tiên root DÀI nhất — file trong submodule thuộc submodule.
      const repo = repos
        .filter((r) => target.fsPath.startsWith(r.root + path.sep))
        .sort((a, b) => b.root.length - a.root.length)[0];
      if (!repo) {
        void vscode.window.showWarningMessage('SmartGit: file không thuộc repo nào trong workspace.');
        return;
      }
      const relPath = path.relative(repo.root, target.fsPath).split(path.sep).join('/');
      FileLogPanel.show(context, hostFunctions, hub, repo.root, relPath);
    }),
  );
}

export function deactivate(): void {
  // Tài nguyên đăng ký qua context.subscriptions được VSCode tự giải phóng.
}
