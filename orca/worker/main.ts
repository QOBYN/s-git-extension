// Composition root của plugin Orca — tương đương extension/index.ts của VSCode.
// Orca gọi `activate(orca)` (default export) khi worker khởi động: worker là
// tiến trình Node riêng, chạy git bằng chính các service của bản VSCode; panel
// (src/, build bằng vite.orca.config.ts) nói chuyện với nó qua shared/orcaWire.

import { mkdtempSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ORCA_NOTIFY_EVENT, ORCA_REQUEST, type NotifyName } from '../../shared/orcaWire';
import type { WebviewFunctions } from '../../shared/protocol';
import { FileStorage } from '../../extension/adapters/fileStorage';
import { NodeFileSystem } from '../../extension/adapters/nodeFs';
import { debounce } from '../../extension/core/async';
import { DisposableStore, toDisposable, type IDisposable } from '../../extension/core/disposable';
import { createHostFunctions } from '../../extension/rpc/hostFunctions';
import { CacheIndex } from '../../extension/services/cacheIndex';
import { GitService } from '../../extension/services/gitService';
import { SpawnGitRunner } from '../../extension/services/gitRunner';
import { MediaExporter } from '../../extension/services/mediaExporter';
import { RepoManager } from '../../extension/services/repoManager';
import { RepoStateReader } from '../../extension/services/repoStateReader';
import { cacheDir, readSettings, type OrcaSettings } from './config';
import type { OrcaFocusContext, OrcaWorkerApi, OrcaWorkspace } from './orcaApi';
import { createRpcServer } from './rpcServer';
import { createOrcaShell } from './shell';
import { NodeRepoWatcher } from './watchers';
import { OrcaWorkspaces } from './workspaces';

/** Id status bar item — khớp `contributes.statusBarItems[].id` trong orca-plugin.json. */
const STATUS_ITEM_ID = 'changes';

let app: SgitOrcaApp | null = null;

export default async function activate(orca: OrcaWorkerApi): Promise<void> {
  app?.dispose();
  app = new SgitOrcaApp(orca, await readSettings(orca.host));
  app.start();
}

export async function deactivate(): Promise<void> {
  app?.dispose();
  app = null;
}

function isInside(root: string, parent: string): boolean {
  const a = path.resolve(root);
  const b = path.resolve(parent);
  return a === b || a.startsWith(b + path.sep);
}

class SgitOrcaApp extends DisposableStore {
  private readonly workspaces: OrcaWorkspaces;
  private readonly repoManager: RepoManager;
  private readonly git: GitService;
  private watcher: NodeRepoWatcher | null = null;
  /** Đồng bộ workspace chạy nối đuôi — sự kiện dồn dập không chạy chồng lên nhau. */
  private syncChain: Promise<void> = Promise.resolve();
  /** Trạng thái đã đồng bộ lần trước — chỉ báo panel khi thật sự đổi. */
  private last: { repoKey: string; focusId: string | null } | null = null;
  /** Repo thuộc workspace đang focus — nguồn số đếm trên status bar. */
  private focusedRepoRoots: string[] = [];
  private focusedName = '';
  /** Gom các lần đổi liên tiếp thành 1 lần đếm lại cho status bar. */
  private readonly badge: { call(): void } & IDisposable;
  private readonly debounceMs: number;

  constructor(
    private readonly orca: OrcaWorkerApi,
    settings: OrcaSettings,
  ) {
    super();
    const log = (message: string) => orca.log(message);
    const runner = new SpawnGitRunner({ gitPath: settings.gitPath || undefined });
    this.git = new GitService(runner, { logPageSize: settings.logPageSize });
    const stateReader = new RepoStateReader(new NodeFileSystem());
    this.workspaces = new OrcaWorkspaces(orca.host);
    this.repoManager = new RepoManager(this.workspaces, this.git, stateReader);
    const cache = new CacheIndex(new FileStorage(cacheDir()));
    // Thư mục tạm riêng của worker cho blob video (nút "Open with system player").
    const mediaExporter = new MediaExporter(
      runner,
      mkdtempSync(path.join(os.tmpdir(), 's-git-orca-media-')),
    );
    this.register(toDisposable(() => void mediaExporter.dispose()));

    const hostFunctions = createHostFunctions({
      repoManager: this.repoManager,
      git: this.git,
      stateReader,
      runner,
      cache,
      // Panel tự điều hướng tại chỗ (src/orcaBridge chặn openPanel/openFileLog);
      // đường qua worker chỉ là dự phòng.
      panelOpener: {
        open: (repoRoot, mode, folder, ref, search) =>
          this.notify('navigate', repoRoot, mode, folder, ref, search),
      },
      shell: createOrcaShell({
        host: orca.host,
        workspaces: this.workspaces,
        showFileLog: (repoRoot, relPath) => this.notify('showFileLog', repoRoot, relPath),
        log,
      }),
      mediaExporter,
      // Frame Orca chỉ tải được file trong thư mục plugin — không có URI cho file tạm.
      toWebviewUri: () => null,
    });

    const server = createRpcServer(hostFunctions);
    this.register(orca.panels.handle(ORCA_REQUEST.call, (input) => server.call(input)));
    this.register(orca.panels.handle(ORCA_REQUEST.upload, (input) => server.upload(input)));
    this.register(orca.panels.handle(ORCA_REQUEST.chunk, (input) => server.chunk(input)));

    this.badge = this.register(
      debounce(() => void this.updateStatusBar(), settings.gitWatchDebounceMs),
    );
    this.debounceMs = settings.gitWatchDebounceMs;
  }

  start(): void {
    this.register(
      this.orca.events.on('workspace.changed', (payload) => {
        this.workspaces.setFocusContext(
          ((payload as { context?: OrcaFocusContext } | null)?.context ?? null) as OrcaFocusContext,
        );
        this.queueSync();
      }),
    );
    this.register(this.orca.events.on('workspace.created', () => this.queueSync()));
    this.register(this.orca.events.on('workspace.removed', () => this.queueSync()));
    this.register(toDisposable(() => this.watcher?.dispose()));
    this.queueSync();
  }

  private notify<N extends NotifyName>(name: N, ...args: Parameters<WebviewFunctions[N]>): void {
    try {
      this.orca.panels.post(ORCA_NOTIFY_EVENT, { name, args });
    } catch (error) {
      this.orca.log(`post ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private queueSync(): void {
    this.syncChain = this.syncChain
      .then(() => this.sync())
      .catch((error: unknown) =>
        this.orca.log(`sync: ${error instanceof Error ? error.message : String(error)}`),
      );
  }

  /** Đọc lại workspace của Orca → dựng lại watcher, báo panel khi repo/focus đổi. */
  private async sync(): Promise<void> {
    if (this.disposed) {
      return;
    }
    const rows = await this.workspaces.list();
    const focused: OrcaWorkspace | null = await this.workspaces.focused(rows);
    const repos = await this.repoManager.listRepos();
    const repoKey = repos.map((repo) => repo.root).join('\n');
    const focusId = focused?.id ?? null;
    const previous = this.last;
    this.last = { repoKey, focusId };

    this.focusedRepoRoots =
      focused === null ? [] : repos.map((r) => r.root).filter((root) => isInside(root, focused.path));
    this.focusedName = focused?.name ?? '';

    if (previous === null || previous.repoKey !== repoKey || previous.focusId !== focusId) {
      await this.rebuildWatcher(repos.map((repo) => repo.root));
    }
    // Lần đầu (worker vừa khởi động) không báo: panel tự nạp, và worker Orca có
    // thể dừng khi rảnh rồi chạy lại — báo lúc đó sẽ kéo panel khỏi repo user đang xem.
    if (previous !== null) {
      if (previous.focusId !== focusId) {
        const focusRoot =
          focused !== null && repos.some((repo) => repo.root === focused.path) ? focused.path : null;
        this.notify('reposChanged', focusRoot);
      } else if (previous.repoKey !== repoKey) {
        this.notify('reposChanged', null);
      }
    }
    this.badge.call();
  }

  private async rebuildWatcher(roots: string[]): Promise<void> {
    const watched = await Promise.all(
      roots.map(async (root) => ({ root, gitDir: await this.git.getGitDir(root) })),
    );
    this.watcher?.dispose();
    if (this.disposed) {
      return;
    }
    this.watcher = new NodeRepoWatcher(
      watched,
      new Set(this.focusedRepoRoots),
      this.debounceMs,
      (repoRoot, delta) => {
        this.notify('repoChanged', repoRoot, delta);
        if (this.focusedRepoRoots.includes(repoRoot)) {
          this.badge.call();
        }
      },
      (message) => this.orca.log(message),
    );
  }

  /** Status bar Orca: số file thay đổi của workspace đang focus (badge activity bar của VSCode). */
  private async updateStatusBar(): Promise<void> {
    if (this.disposed || !this.orca.host.has('statusBar.update')) {
      return;
    }
    const counts = await Promise.all(
      this.focusedRepoRoots.map((root) =>
        this.git.getStatus(root).then(
          (status) => status.files.length,
          () => 0,
        ),
      ),
    );
    const total = counts.reduce((sum, n) => sum + n, 0);
    const where = this.focusedName === '' ? 'this workspace' : this.focusedName;
    await this.orca.host
      .call('statusBar.update', {
        id: STATUS_ITEM_ID,
        text: total > 0 ? `S-Git ${total}` : 'S-Git',
        tone: total > 0 ? 'accent' : 'neutral',
        tooltip:
          total > 0
            ? `S-Git: ${total} changed file${total === 1 ? '' : 's'} in ${where}`
            : `S-Git: no changes in ${where}`,
      })
      .catch((error: unknown) =>
        this.orca.log(`statusBar.update: ${error instanceof Error ? error.message : String(error)}`),
      );
  }
}
