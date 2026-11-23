// Composition root — nơi DUY NHẤT khởi tạo và nối các service (architecture.md mục 1).
// File này chỉ wire dependency + đăng ký lệnh/view; không chứa logic nghiệp vụ.

import { mkdtempSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { EXTENSION_ID_PREFIX } from '../shared/constants';
import { readExtensionConfig } from './adapters/config';
import { debounce } from './core/async';
import { FileStorage } from './adapters/fileStorage';
import { GitWatcher } from './adapters/gitWatcher';
import { NodeFileSystem } from './adapters/nodeFs';
import { VscodeWorkspaceReader } from './adapters/vscodeWorkspace';
import { createHostFunctions } from './rpc/hostFunctions';
import { RpcHub } from './rpc/rpcHub';
import { CacheIndex } from './services/cacheIndex';
import { countChangedFiles } from './services/changeBadge';
import { GitService } from './services/gitService';
import { SpawnGitRunner } from './services/gitRunner';
import { MediaExporter } from './services/mediaExporter';
import { RepoManager } from './services/repoManager';
import { RepoStateReader } from './services/repoStateReader';
import { FileLogPanel } from './views/fileLogPanel';
import { MainPanel } from './views/mainPanel';
import { SidebarViewProvider } from './views/sidebarView';
import { setExtraResourceRoots, toWebviewUri } from './views/webviewHost';

export function activate(context: vscode.ExtensionContext): void {
  const config = readExtensionConfig();

  // ---- services (thuần TS, nhận adapter qua constructor) ----
  const runner = new SpawnGitRunner({ gitPath: config.gitPath || undefined });
  const git = new GitService(runner, { logPageSize: config.logPageSize });
  const stateReader = new RepoStateReader(new NodeFileSystem());
  const repoManager = new RepoManager(new VscodeWorkspaceReader(), git, stateReader);
  const cache = new CacheIndex(new FileStorage(context.globalStorageUri.fsPath));
  // Thư mục tạm RIÊNG của session cho blob video xuất ra (diff video đọc qua
  // webview URI) — mkdtemp tránh 2 cửa sổ VSCode giẫm nhau; dispose xoá cả cụm.
  const mediaExporter = new MediaExporter(
    runner,
    mkdtempSync(path.join(os.tmpdir(), 's-git-media-')),
  );
  context.subscriptions.push({ dispose: () => void mediaExporter.dispose() });
  // Webview phải được phép đọc thư mục tạm này (localResourceRoots).
  setExtraResourceRoots([vscode.Uri.file(mediaExporter.dir)]);

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
      open: (repoRoot, mode, folder, ref, search) =>
        MainPanel.createOrShow(context, hostFunctions, hub, { repoRoot, mode, folder, ref, search }),
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
      openInTerminal: (repoRoot, relPath) =>
        void vscode.commands.executeCommand(
          'openInIntegratedTerminal',
          vscode.Uri.file(path.join(repoRoot, relPath)),
        ),
      findInFolder: (repoRoot, relPath) => {
        // Cùng đích với "Find in Folder…" của Explorer: mở Search view, giới hạn
        // files to include theo đường dẫn tương đối workspace; thư mục ngoài
        // workspace (asRelativePath trả absolute) thì tìm toàn workspace.
        const rel = vscode.workspace.asRelativePath(path.join(repoRoot, relPath), false);
        void vscode.commands.executeCommand('workbench.action.findInFiles', {
          filesToInclude: path.isAbsolute(rel) ? '' : `./${rel}`,
        });
      },
      renamePath: async (repoRoot, relPath, newName) => {
        const abs = path.join(repoRoot, relPath);
        await vscode.workspace.fs.rename(
          vscode.Uri.file(abs),
          vscode.Uri.file(path.join(path.dirname(abs), newName)),
        );
      },
      deletePath: async (repoRoot, relPath) => {
        const abs = path.join(repoRoot, relPath);
        const choice = await vscode.window.showWarningMessage(
          `Delete '${path.basename(abs)}'?`,
          { modal: true, detail: 'Sẽ chuyển vào Thùng rác — khôi phục được từ đó.' },
          'Move to Trash',
        );
        if (choice !== 'Move to Trash') {
          return false;
        }
        await vscode.workspace.fs.delete(vscode.Uri.file(abs), { recursive: true, useTrash: true });
        return true;
      },
      openExternal: (fsPath) => void vscode.env.openExternal(vscode.Uri.file(fsPath)),
    },
    mediaExporter,
    toWebviewUri,
  });

  const sidebar = new SidebarViewProvider(context, hostFunctions, hub);

  // ---- badge số file thay đổi trên icon Activity Bar ----
  // Watcher .git/ chỉ bắt stage/commit/checkout; sửa file working tree không chạm
  // .git nên phải nghe thêm save/tạo/xoá/đổi tên file trong workspace.
  const badge = debounce(() => {
    void countChangedFiles(repoManager, git).then((n) => sidebar.setBadge(n));
  }, config.gitWatchDebounceMs);
  context.subscriptions.push(
    badge,
    vscode.workspace.onDidSaveTextDocument(() => badge.call()),
    vscode.workspace.onDidCreateFiles(() => badge.call()),
    vscode.workspace.onDidDeleteFiles(() => badge.call()),
    vscode.workspace.onDidRenameFiles(() => badge.call()),
  );
  badge.call();

  // ---- watcher .git/ → broadcast repoChanged (setup nền, không chặn activate) ----
  void (async () => {
    const repos = await repoManager.listRepos();
    // Resolve gitDir từng repo — submodule có .git dạng file (xem gitWatcher.ts).
    const watched = await Promise.all(
      repos.map(async (repo) => ({ root: repo.root, gitDir: await git.getGitDir(repo.root) })),
    );
    const watcher = new GitWatcher(watched, config.gitWatchDebounceMs, (repoRoot) => {
      hub.broadcastRepoChanged(repoRoot, { changed: ['log', 'status', 'refs'] });
      badge.call();
    });
    context.subscriptions.push(watcher);
  })();

  // ---- views + commands ----
  context.subscriptions.push(
    hub,
    vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, sidebar),
    vscode.commands.registerCommand(`${EXTENSION_ID_PREFIX}.openPanel`, () =>
      MainPanel.createOrShow(context, hostFunctions, hub),
    ),
    // File Log: từ context menu Explorer/editor hoặc Command Palette (file đang mở).
    vscode.commands.registerCommand(`${EXTENSION_ID_PREFIX}.fileLog`, async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target || target.scheme !== 'file') {
        void vscode.window.showWarningMessage('S-Git: không xác định được file để xem log.');
        return;
      }
      const repos = await repoManager.listRepos();
      // Repo chứa file, ưu tiên root DÀI nhất — file trong submodule thuộc submodule.
      const repo = repos
        .filter((r) => target.fsPath.startsWith(r.root + path.sep))
        .sort((a, b) => b.root.length - a.root.length)[0];
      if (!repo) {
        void vscode.window.showWarningMessage('S-Git: file không thuộc repo nào trong workspace.');
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
