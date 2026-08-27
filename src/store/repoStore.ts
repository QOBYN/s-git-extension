// Store zustand — state của webview là BẢN CHIẾU của extension host
// (architecture.md 2.4): mọi dữ liệu đến từ RPC, không optimistic update.
// Sau mỗi thao tác ghi (stage/commit/abort…) luôn refetch status từ host.

import { create } from 'zustand';
import type {
  CheckoutDirtyAction,
  CommitFileChange,
  CommitInfo,
  DiffPayload,
  FileChange,
  LogPage,
  MergeResult,
  MergeStrategy,
  PanelMode,
  PullMode,
  PushTarget,
  RefInfo,
  ResetMode,
  RemoteInfo,
  RepoInfo,
  WorkingTreeStatus,
} from '../../shared/types';
import { host, setNotificationHandlers } from '../rpc';
import { formatError, isDirtyWorkingTreeError } from '../utils/errors';
import { buildHunkPatch, type LineChange } from '../utils/patchBuilder';

/**
 * Popup Dirty Guard: git TỪ CHỐI 1 thao tác (pull/merge/rebase/checkout…) vì
 * working tree có thay đổi chưa commit — thay vì banner lỗi thô, popup cho user
 * biết và chọn cách xử lý ngay (stash & retry / đi commit / bỏ qua).
 */
export interface DirtyGuard {
  /** Nhãn thao tác bị chặn — "Pull (rebase)", "Merge 'dev'"… */
  opLabel: string;
  /** stderr nguyên văn của git. */
  message: string;
  /** Repo mà thao tác chạy trên đó (từ sidebar có thể khác repo active). */
  repoRoot: string;
  /** Chạy lại thao tác gốc (sau khi đã stash). */
  retry(): Promise<void>;
}

/** 2 màn hình của panel chính — toggle Local Files | History của SmartGit (A2). */
export type UiMode = PanelMode;

/** File đang xem diff ở Working Tree: khung nào quyết định so sánh gì (spec 2.1). */
export interface WorkingSelection {
  file: FileChange;
  /** unstaged: working ↔ index · staged: index ↔ HEAD. */
  area: 'unstaged' | 'staged';
}

interface RepoStoreState {
  repos: RepoInfo[];
  activeRepoRoot: string | null;
  uiMode: UiMode;

  // ---- History ----
  commits: CommitInfo[];
  hasMoreCommits: boolean;
  refs: RefInfo[];
  /** Refs theo từng repo — sidebar hiển thị nhánh của MỌI repo (không chỉ repo active). */
  refsByRepo: Record<string, RefInfo[]>;
  /** Remote đã khai báo theo repo — sidebar hiện cả remote chưa fetch (chưa có ref). */
  remotesByRepo: Record<string, RemoteInfo[]>;
  /**
   * Lọc graph theo các ref đã chọn (click nhánh — B1, hoặc multi-select từ
   * dropdown lọc nhánh của màn History); [] = mọi nhánh (--all).
   */
  historyRefs: string[];
  /** Màn File Log: log của riêng file này (--follow); null = graph thường. */
  fileLogPath: string | null;
  /** Tìm commit (từ ô search ở sidebar) — lọc client-side trang đã tải. */
  commitSearch: string | null;
  selectedOid: string | null;
  commitBody: string | null;
  commitFiles: CommitFileChange[];
  selectedFile: CommitFileChange | null;
  diff: DiffPayload | null;
  diffLoading: boolean;

  // ---- Working Tree ----
  status: WorkingTreeStatus | null;
  /** Scope thư mục: chỉ hiện change dưới folder này (null = cả repo) — A3. */
  folderScope: string | null;
  /** Cây thư mục theo repo — sidebar tab Working Tree. */
  foldersByRepo: Record<string, string[]>;
  /** Status từng repo — sidebar hiện badge số change per repo/folder. */
  statusByRepo: Record<string, FileChange[]>;
  /** Ô filter nhánh/tag của sidebar tab Git. */
  sidebarRefFilter: string;
  workingSelection: WorkingSelection | null;
  workingDiff: DiffPayload | null;
  workingDiffLoading: boolean;
  /** Ô commit — store giữ để tự điền message khi merging (ui-analysis D2). */
  commitMessage: string;

  statusMessage: string;
  loading: boolean;
  error: string | null;
  /** Popup "working tree bẩn" đang chờ user quyết — null = không có. */
  dirtyGuard: DirtyGuard | null;

  /** Popup Dirty Guard: Stash & Retry — stash → thao tác gốc → stash pop. */
  retryDirtyGuardWithStash(): Promise<void>;
  /** Đóng popup Dirty Guard; lỗi gốc chuyển về banner để không mất thông tin. */
  dismissDirtyGuard(): void;
  /** Popup Dirty Guard: "Commit trước" — đóng popup + đưa tới Working Tree. */
  dirtyGuardGoCommit(): void;

  init(): Promise<void>;
  initSidebar(): Promise<void>;
  /** Sidebar: nạp refs của tất cả repo vào refsByRepo. */
  loadAllRefs(): Promise<void>;
  /** Sidebar: nạp danh sách remote của tất cả repo. */
  loadAllRemotes(): Promise<void>;
  setMode(mode: UiMode): void;
  selectRepo(root: string): Promise<void>;
  selectCommit(oid: string): Promise<void>;
  /** Đặt lọc graph về ĐÚNG 1 ref (null = mọi nhánh) — sidebar click dùng đường này. */
  setHistoryRef(ref: string | null): Promise<void>;
  /** Bật/tắt 1 ref trong bộ lọc graph (multi-select của dropdown History). */
  toggleHistoryRef(ref: string): Promise<void>;
  /** Bỏ hết lọc — quay về mọi nhánh (--all). */
  clearHistoryRefs(): Promise<void>;
  /**
   * Checkout từ popup Checkout (double-click dòng log / menu Check Out… của
   * History, hoặc double-click nhánh ở sidebar — nên nhận repoRoot tường minh):
   * `dirty` là cách xử lý thay đổi chưa commit — stash & re-apply / mang theo /
   * discard (--force). Working tree sạch thì dirty nào cũng như 'bring'.
   */
  checkoutCommit(repoRoot: string, ref: string, dirty: CheckoutDirtyAction): Promise<void>;
  /** Refetch status repo active — popup Checkout gọi lúc mở để đếm change chính xác. */
  refreshStatus(): Promise<void>;
  /** Context menu commit (E): Add Branch/Tag tại commit; refs refresh sau khi tạo. */
  createBranchAt(name: string, oid: string): Promise<void>;
  createTagAt(name: string, oid: string): Promise<void>;
  /** "Use Message for Commit" — đổ message vào ô commit của Working Tree. */
  useCommitMessage(message: string): void;
  /** Context menu file (G) — hành động phía VSCode/OS. */
  openFileInEditor(path: string): void;
  revealFileInOS(path: string): void;
  openFileLogFor(path: string): void;
  selectFile(file: CommitFileChange): Promise<void>;
  loadMore(): Promise<void>;

  selectWorkingFile(selection: WorkingSelection): Promise<void>;
  setFolderScope(folder: string | null): void;
  /** Sidebar: nạp cây thư mục của tất cả repo. */
  loadAllFolders(): Promise<void>;
  /** Sidebar: nạp status mọi repo (badge số change). */
  loadAllStatuses(): Promise<void>;
  /** Sidebar: chạy 1 thao tác git bất kỳ + refresh refs/status/repos. */
  sidebarGitOp(op: () => Promise<void>, successMessage: string): Promise<void>;
  setCommitSearch(search: string | null): void;
  setSidebarRefFilter(filter: string): void;
  setCommitMessage(message: string): void;
  stageFiles(paths: string[]): Promise<void>;
  unstageFiles(paths: string[]): Promise<void>;
  /** Stage/unstage ĐÚNG 1 hunk của file đang xem diff (spec 2.1 — chức năng đinh). */
  stageCurrentHunk(change: LineChange): Promise<void>;
  unstageCurrentHunk(change: LineChange): Promise<void>;
  /** Bỏ 1 hunk khỏi working tree (File Compare — D3); mất thay đổi của hunk đó. */
  revertCurrentHunk(change: LineChange): Promise<void>;
  /** Ghi buffer sửa trực tiếp trong diff xuống file working tree. */
  saveWorkingEdit(content: string): Promise<void>;
  discardFiles(paths: string[]): Promise<void>;
  commitNow(opts: { amend: boolean }): Promise<void>;
  abortOperation(): Promise<void>;
  continueOperation(): Promise<void>;

  // ---- remote + merge/rebase (P2) ----
  /**
   * Toolbar: fetch/pull/push trên repo active của panel chính.
   * `pullMode` từ popup Pull; `pushTo` từ menu "Push to…" của nút Push.
   */
  remoteOp(
    kind: 'fetch' | 'pull' | 'push',
    opts?: { pullMode?: PullMode; pushTo?: PushTarget },
  ): Promise<void>;
  /** Context menu History: reset nhánh hiện tại về commit (dialog chọn soft/mixed/hard). */
  resetToCommit(oid: string, mode: ResetMode): Promise<void>;
  /**
   * Merge `target` vào nhánh hiện tại của `repoRoot` (dialog D1). Nhận repoRoot
   * tường minh vì gọi được từ cả panel chính (repo active) lẫn sidebar (repo bất kỳ).
   */
  mergeBranch(repoRoot: string, target: string, strategy: MergeStrategy): Promise<void>;
  rebaseBranch(repoRoot: string, onto: string): Promise<void>;
}

export const useRepoStore = create<RepoStoreState>((set, get) => {
  // Nhận notification từ host: watcher .git/ phát hiện thay đổi → refetch.
  setNotificationHandlers({
    repoChanged: (repoRoot, delta) => {
      // Webview sidebar không chọn repo active — refresh danh sách repo + refs.
      if (get().activeRepoRoot === null) {
        void host.listRepos().then((repos) => set({ repos }));
        void get().loadAllRefs();
        void get().loadAllStatuses();
        void get().loadAllFolders();
        return;
      }
      if (repoRoot !== get().activeRepoRoot) {
        return;
      }
      if (delta.changed.includes('log') || delta.changed.includes('refs')) {
        void fetchLog(repoRoot, false);
        void fetchRefs(repoRoot);
      }
      if (delta.changed.includes('status')) {
        void fetchStatus(repoRoot);
      }
    },
    operationProgress: (message) => set({ statusMessage: message }),
    // Sidebar click → host reveal panel + gửi navigate tới webview panel này.
    navigate: (repoRoot, mode, folder, ref, search) => {
      if (mode !== null) {
        get().setMode(mode);
      }
      if (folder !== undefined) {
        get().setFolderScope(folder);
      }
      if (ref !== undefined) {
        // Sidebar điều hướng theo 1 nhánh → thay cả bộ lọc multi đang có.
        set({ historyRefs: ref === null ? [] : [ref] });
      }
      if (search !== undefined) {
        set({ commitSearch: search });
      }
      if (repoRoot !== null && repoRoot !== get().activeRepoRoot) {
        void get().selectRepo(repoRoot);
      } else if (ref !== undefined && get().activeRepoRoot !== null) {
        void fetchLog(get().activeRepoRoot!, false);
      }
    },
  });

  async function fetchLog(root: string, append: boolean): Promise<void> {
    set({ loading: true, error: null });
    try {
      const page: LogPage = await host.getLog(root, {
        skip: append ? get().commits.length : 0,
        ref: get().historyRefs.length > 0 ? get().historyRefs : undefined,
        path: get().fileLogPath ?? undefined,
      });
      set((state) => ({
        commits: append ? [...state.commits, ...page.commits] : page.commits,
        hasMoreCommits: page.hasMore,
        loading: false,
        statusMessage: 'Ready',
      }));
    } catch (error) {
      set({ loading: false, error: formatError(error) });
    }
  }

  async function fetchRefs(root: string): Promise<void> {
    try {
      set({ refs: await host.listRefs(root) });
    } catch (error) {
      set({ error: formatError(error) });
    }
  }

  async function fetchStatus(root: string): Promise<void> {
    try {
      const status = await host.getStatus(root);
      set({ status });
      // Merge/cherry-pick đang dở: tự điền message nếu user chưa gõ gì (D2).
      if (status.activityMessage && get().commitMessage.trim() === '') {
        set({ commitMessage: status.activityMessage });
      }
    } catch (error) {
      set({ error: formatError(error) });
    }
  }

  /** Chạy 1 thao tác ghi rồi refetch status — khuôn chung cho stage/commit/abort… */
  async function mutate(action: () => Promise<void>, successMessage: string): Promise<void> {
    const root = get().activeRepoRoot;
    if (root === null) {
      return;
    }
    set({ error: null });
    try {
      await action();
      set({ statusMessage: successMessage });
    } catch (error) {
      set({ error: formatError(error) });
    }
    // Watcher .git cũng sẽ bắn repoChanged, nhưng refetch ngay cho phản hồi tức thì.
    await fetchStatus(root);
  }

  return {
    repos: [],
    activeRepoRoot: null,
    uiMode: 'history',

    commits: [],
    hasMoreCommits: false,
    refs: [],
    refsByRepo: {},
    remotesByRepo: {},
    historyRefs: window.__SMARTGIT_INIT__?.ref ? [window.__SMARTGIT_INIT__.ref] : [],
    fileLogPath: window.__SMARTGIT_INIT__?.filePath ?? null,
    commitSearch: window.__SMARTGIT_INIT__?.search ?? null,
    selectedOid: null,
    commitBody: null,
    commitFiles: [],
    selectedFile: null,
    diff: null,
    diffLoading: false,

    status: null,
    folderScope: window.__SMARTGIT_INIT__?.folder ?? null,
    foldersByRepo: {},
    statusByRepo: {},
    sidebarRefFilter: '',
    workingSelection: null,
    workingDiff: null,
    workingDiffLoading: false,
    commitMessage: '',

    statusMessage: 'Loading…',
    loading: false,
    error: null,
    dirtyGuard: null,

    async retryDirtyGuardWithStash() {
      const guard = get().dirtyGuard;
      if (guard === null || get().loading) {
        return;
      }
      const { repoRoot: root, opLabel, retry } = guard;
      set({ dirtyGuard: null, error: null, loading: true, statusMessage: `Stash & retry ${opLabel}…` });
      /** Re-apply stash bị conflict — thao tác VẪN thành công, chỉ cảnh báo thêm. */
      let popConflict: string | null = null;
      /** Retry hỏng nhưng KHÔNG dám pop (repo có thể đang dở conflict) — nhắc user stash còn đó. */
      let stashNote: string | null = null;
      try {
        const stashed = await host.stashPush(root, `s-git: auto-stash before ${opLabel}`);
        try {
          await retry();
        } catch (error) {
          if (stashed) {
            if (isDirtyWorkingTreeError(formatError(error))) {
              // Lệnh lại bị TỪ CHỐI ngay (chưa chạy gì — vd chỉ còn thay đổi con
              // trỏ submodule, stash không cất được) → pop trả working tree như cũ.
              await host.stashPop(root).catch(() => undefined);
            } else {
              // Lệnh có thể dừng GIỮA CHỪNG (pull --rebase conflict…) — pop ngay
              // sẽ trộn stash vào cây đang conflict. Giữ stash và nói rõ.
              stashNote = `${opLabel} failed — thay đổi của bạn đang nằm trong stash ('git stash pop' để lấy lại).`;
            }
          }
          throw error;
        }
        if (stashed) {
          try {
            await host.stashPop(root);
          } catch (error) {
            popConflict = formatError(error);
          }
        }
        // Refresh TRƯỚC rồi mới set message chốt — fetchLog thành công set 'Ready' đè lên.
        await refreshRepoData(root);
        if (popConflict !== null) {
          set({
            error: popConflict,
            statusMessage: `${opLabel} done — re-apply gặp conflict, thay đổi vẫn nằm trong stash.`,
          });
        } else {
          set({ statusMessage: `${opLabel} completed.` });
        }
      } catch (error) {
        await refreshRepoData(root);
        set({
          error: formatError(error),
          ...(stashNote !== null ? { statusMessage: stashNote } : {}),
        });
      }
      set({ loading: false });
    },

    dismissDirtyGuard() {
      const guard = get().dirtyGuard;
      if (guard !== null) {
        set({ dirtyGuard: null, error: guard.message });
      }
    },

    dirtyGuardGoCommit() {
      const guard = get().dirtyGuard;
      if (guard !== null) {
        set({ dirtyGuard: null, error: guard.message });
        focusWorkingTree(guard.repoRoot); // sidebar không có Working Tree → mở panel chính
      }
    },

    async init() {
      set({ loading: true, error: null });
      // Điều hướng ban đầu do host inject (mở từ sidebar) — ưu tiên hơn mặc định.
      const initial = window.__SMARTGIT_INIT__;
      if (initial?.mode) {
        set({ uiMode: initial.mode });
      }
      try {
        const repos = await host.listRepos();
        set({ repos, loading: false });
        // Repo chỉ định từ sidebar, không có thì repo đầu tiên (ui-analysis A1).
        const target =
          repos.find((r) => r.root === initial?.repoRoot) ?? repos[0] ?? null;
        if (target) {
          await get().selectRepo(target.root);
        } else {
          set({ statusMessage: 'No git repository in workspace' });
        }
      } catch (error) {
        set({ loading: false, error: formatError(error) });
      }
    },

    /** Init nhẹ cho sidebar: KHÔNG tải log (selectRepo) — chỉ repos + refs + folders. */
    async initSidebar() {
      set({ loading: true, error: null });
      try {
        const repos = await host.listRepos();
        set({ repos, loading: false, statusMessage: 'Ready' });
        await Promise.all([
          get().loadAllRefs(),
          get().loadAllRemotes(),
          get().loadAllFolders(),
          get().loadAllStatuses(),
        ]);
      } catch (error) {
        set({ loading: false, error: formatError(error) });
      }
    },

    async loadAllRefs() {
      const entries = await Promise.all(
        get().repos.map(async (repo): Promise<[string, RefInfo[]]> => {
          try {
            return [repo.root, await host.listRefs(repo.root)];
          } catch {
            return [repo.root, []]; // repo lỗi không chặn các repo khác
          }
        }),
      );
      set({ refsByRepo: Object.fromEntries(entries) });
    },

    async loadAllRemotes() {
      const entries = await Promise.all(
        get().repos.map(async (repo): Promise<[string, RemoteInfo[]]> => {
          try {
            return [repo.root, await host.listRemotes(repo.root)];
          } catch {
            return [repo.root, []];
          }
        }),
      );
      set({ remotesByRepo: Object.fromEntries(entries) });
    },

    async loadAllFolders() {
      const entries = await Promise.all(
        get().repos.map(async (repo): Promise<[string, string[]]> => {
          try {
            return [repo.root, await host.listFolders(repo.root)];
          } catch {
            return [repo.root, []];
          }
        }),
      );
      set({ foldersByRepo: Object.fromEntries(entries) });
    },

    async loadAllStatuses() {
      const entries = await Promise.all(
        get().repos.map(async (repo): Promise<[string, FileChange[]]> => {
          try {
            return [repo.root, (await host.getStatus(repo.root)).files];
          } catch {
            return [repo.root, []];
          }
        }),
      );
      set({ statusByRepo: Object.fromEntries(entries) });
    },

    /** Khuôn chung cho thao tác git từ sidebar: chạy → báo lỗi/thành công → refresh. */
    async sidebarGitOp(op, successMessage) {
      set({ error: null });
      try {
        await op();
        set({ statusMessage: successMessage });
      } catch (error) {
        set({ error: formatError(error) });
      }
      await Promise.all([get().loadAllRefs(), get().loadAllRemotes(), get().loadAllStatuses()]);
      // Danh sách repo cũng có thể đổi (tên nhánh trên header).
      set({ repos: await host.listRepos() });
    },

    setCommitSearch(search) {
      set({ commitSearch: search });
    },

    setSidebarRefFilter(filter) {
      set({ sidebarRefFilter: filter });
    },

    setFolderScope(folder) {
      // Đổi scope thì file đang xem diff có thể ngoài scope — bỏ chọn cho nhất quán.
      set({ folderScope: folder, workingSelection: null, workingDiff: null });
    },

    setMode(mode) {
      set({ uiMode: mode });
      const root = get().activeRepoRoot;
      if (mode === 'workingTree' && root !== null) {
        void fetchStatus(root);
      }
    },

    async selectRepo(root) {
      set({
        activeRepoRoot: root,
        selectedOid: null,
        commitBody: null,
        commitFiles: [],
        selectedFile: null,
        diff: null,
        status: null,
        workingSelection: null,
        workingDiff: null,
        commitMessage: '',
      });
      // Status tải cùng lúc để badge số file trên toggle luôn đúng (A2).
      await Promise.all([fetchLog(root, false), fetchRefs(root), fetchStatus(root)]);
    },

    async selectCommit(oid) {
      const root = get().activeRepoRoot;
      if (root === null || oid === get().selectedOid) {
        return;
      }
      set({ selectedOid: oid, commitBody: null, commitFiles: [], selectedFile: null, diff: null });
      try {
        const [body, files] = await Promise.all([
          host.getCommitBody(root, oid),
          host.getCommitFiles(root, oid),
        ]);
        // Người dùng có thể đã chọn commit khác trong lúc chờ — chỉ nhận kết quả mới nhất.
        if (get().selectedOid === oid) {
          set({ commitBody: body, commitFiles: files });
        }
      } catch (error) {
        set({ error: formatError(error) });
      }
    },

    async selectFile(file) {
      const root = get().activeRepoRoot;
      const oid = get().selectedOid;
      if (root === null || oid === null) {
        return;
      }
      set({ selectedFile: file, diffLoading: true, diff: null });
      try {
        const diff = await host.getDiff(root, { kind: 'commit', oid, path: file.path });
        if (get().selectedFile === file) {
          set({ diff, diffLoading: false });
        }
      } catch (error) {
        set({ diffLoading: false, error: formatError(error) });
      }
    },

    async loadMore() {
      const root = get().activeRepoRoot;
      if (root && get().hasMoreCommits && !get().loading) {
        await fetchLog(root, true);
      }
    },

    async setHistoryRef(ref) {
      await applyHistoryRefs(ref === null ? [] : [ref]);
    },

    async toggleHistoryRef(ref) {
      const current = get().historyRefs;
      await applyHistoryRefs(
        current.includes(ref) ? current.filter((r) => r !== ref) : [...current, ref],
      );
    },

    async clearHistoryRefs() {
      await applyHistoryRefs([]);
    },

    async checkoutCommit(repoRoot, ref, dirty) {
      const root = repoRoot;
      if (get().loading) {
        return;
      }
      // oid đầy đủ hiển thị rút gọn; tên nhánh giữ nguyên.
      const short = /^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref;
      set({ error: null, loading: true, statusMessage: `Checking out '${short}'…` });
      /** Re-apply stash bị conflict — checkout VẪN thành công, chỉ cảnh báo thêm. */
      let popConflict: string | null = null;
      try {
        if (dirty === 'stash-reapply') {
          // stashed=false: không có gì cất được (vd chỉ đổi con trỏ submodule —
          // stash không xử lý gitlink) → checkout thẳng, TUYỆT ĐỐI không pop
          // kẻo "No stash entries found" làm cả thao tác trông như thất bại.
          const stashed = await host.stashPush(
            root,
            `s-git: auto-stash before checkout '${short}'`,
          );
          try {
            await host.checkout(root, ref);
          } catch (error) {
            // Checkout hỏng → pop lại ngay để trả working tree về như cũ.
            if (stashed) {
              await host.stashPop(root).catch(() => undefined); // pop hỏng nữa: stash vẫn còn đó
            }
            throw error;
          }
          if (stashed) {
            try {
              await host.stashPop(root);
            } catch (error) {
              popConflict = formatError(error);
            }
          }
        } else {
          await host.checkout(root, ref, dirty === 'discard' ? { force: true } : undefined);
        }
        // Refresh TRƯỚC rồi mới set message chốt (như remoteOp) — fetchLog set
        // 'Ready' đè lên. refreshRepoData tự lo cả trường hợp sidebar (per-repo).
        await refreshRepoData(root);
        if (popConflict !== null) {
          set({
            error: popConflict,
            statusMessage: `Checked out '${short}' — re-apply gặp conflict, thay đổi vẫn nằm trong stash.`,
          });
        } else {
          set({ statusMessage: `Checked out '${short}'.` });
        }
      } catch (error) {
        // "Mang theo" đụng file bị checkout ghi đè → popup Dirty Guard xử lý tiếp.
        if (!guardDirtyError(root, `Checkout '${short}'`, error, () => host.checkout(root, ref))) {
          set({ error: formatError(error) });
        }
        await refreshRepoData(root);
      }
      set({ loading: false });
    },

    async refreshStatus() {
      const root = get().activeRepoRoot;
      if (root !== null) {
        await fetchStatus(root);
      }
    },

    async createBranchAt(name, oid) {
      await mutate(() => host.createBranch(get().activeRepoRoot!, name, oid), `Branch '${name}' created.`);
      const root = get().activeRepoRoot;
      if (root !== null) {
        await fetchRefs(root);
      }
    },

    async createTagAt(name, oid) {
      await mutate(() => host.createTag(get().activeRepoRoot!, name, oid), `Tag '${name}' created.`);
      const root = get().activeRepoRoot;
      if (root !== null) {
        await fetchRefs(root);
      }
    },

    useCommitMessage(message) {
      set({ commitMessage: message, uiMode: 'workingTree', statusMessage: 'Message copied to commit box.' });
    },

    openFileInEditor(path) {
      const root = get().activeRepoRoot;
      if (root !== null) {
        void host.openFile(root, path);
      }
    },

    revealFileInOS(path) {
      const root = get().activeRepoRoot;
      if (root !== null) {
        void host.revealInOS(root, path);
      }
    },

    openFileLogFor(path) {
      const root = get().activeRepoRoot;
      if (root !== null) {
        void host.openFileLog(root, path);
      }
    },

    async selectWorkingFile(selection) {
      const root = get().activeRepoRoot;
      if (root === null) {
        return;
      }
      set({ workingSelection: selection, workingDiffLoading: true, workingDiff: null });
      try {
        const diff = await host.getDiff(root, {
          kind: selection.area === 'staged' ? 'index' : 'workingTree',
          path: selection.file.path,
        });
        if (get().workingSelection === selection) {
          set({ workingDiff: diff, workingDiffLoading: false });
        }
      } catch (error) {
        set({ workingDiffLoading: false, error: formatError(error) });
      }
    },

    setCommitMessage(message) {
      set({ commitMessage: message });
    },

    stageFiles: (paths) =>
      mutate(() => host.stage(get().activeRepoRoot!, paths), 'Staged'),

    unstageFiles: (paths) =>
      mutate(() => host.unstage(get().activeRepoRoot!, paths), 'Unstaged'),

    discardFiles: (paths) =>
      mutate(() => host.discard(get().activeRepoRoot!, paths), 'Discarded'),

    async stageCurrentHunk(change) {
      const selection = get().workingSelection;
      const diff = get().workingDiff;
      if (selection === null || diff === null || diff.encoding !== 'text') {
        return; // hunk chỉ có nghĩa với diff text (UI cũng đã ẩn nút)
      }
      const patch = buildHunkPatch({
        path: selection.file.path,
        originalText: diff.original,
        modifiedText: diff.modified,
        change,
      });
      await mutate(() => host.stageHunk(get().activeRepoRoot!, patch), 'Hunk staged.');
      // Diff unstaged của file đã đổi (hunk vừa rời sang index) — tải lại.
      await get().selectWorkingFile(selection);
    },

    async revertCurrentHunk(change) {
      const selection = get().workingSelection;
      const diff = get().workingDiff;
      if (selection === null || diff === null || diff.encoding !== 'text') {
        return;
      }
      // Diff unstaged là index↔working; reverse-apply lên WORKING TREE xoá hunk đó.
      const patch = buildHunkPatch({
        path: selection.file.path,
        originalText: diff.original,
        modifiedText: diff.modified,
        change,
      });
      await mutate(() => host.revertHunk(get().activeRepoRoot!, patch), 'Hunk reverted.');
      await get().selectWorkingFile(selection); // file trên đĩa đã đổi — tải lại diff
    },

    async saveWorkingEdit(content) {
      const selection = get().workingSelection;
      if (selection === null || get().workingDiff?.encoding !== 'text') {
        return; // không ghi đè file nhị phân bằng buffer text
      }
      await mutate(
        () => host.saveWorkingFile(get().activeRepoRoot!, selection.file.path, content),
        'Saved.',
      );
      // KHÔNG refetch diff: buffer trong editor chính là nội dung mới trên đĩa;
      // refetch sẽ reset con trỏ/scroll của user đang sửa. Status đã refresh qua mutate.
    },

    async unstageCurrentHunk(change) {
      const selection = get().workingSelection;
      const diff = get().workingDiff;
      if (selection === null || diff === null || diff.encoding !== 'text') {
        return;
      }
      // Diff staged là HEAD↔index; reverse-apply patch này gỡ hunk khỏi index.
      const patch = buildHunkPatch({
        path: selection.file.path,
        originalText: diff.original,
        modifiedText: diff.modified,
        change,
      });
      await mutate(() => host.unstageHunk(get().activeRepoRoot!, patch), 'Hunk unstaged.');
      await get().selectWorkingFile(selection);
    },

    async commitNow({ amend }) {
      const message = get().commitMessage.trim();
      if (message === '') {
        return;
      }
      await mutate(
        () => host.commit(get().activeRepoRoot!, message, { amend }),
        'Commit succeeded.',
      );
      if (get().error === null) {
        set({ commitMessage: '', workingSelection: null, workingDiff: null });
      }
    },

    abortOperation: () =>
      mutate(() => host.abortOperation(get().activeRepoRoot!), 'Operation aborted.'),

    continueOperation: () =>
      mutate(() => host.continueOperation(get().activeRepoRoot!), 'Continued.'),

    // ---- remote + merge/rebase (P2) ----

    async remoteOp(kind, opts) {
      const root = get().activeRepoRoot;
      if (root === null || get().loading) {
        return; // đang có thao tác khác — toolbar cũng disable, đây là chốt chặn cuối
      }
      const pushLabel = opts?.pushTo ? ` to ${opts.pushTo.remote}/${opts.pushTo.branch}` : '';
      const labels = {
        fetch: ['Fetching…', 'Fetch completed.'],
        pull: [
          opts?.pullMode === 'rebase' ? 'Pulling (rebase)…' : 'Pulling…',
          'Pull completed.',
        ],
        push: [`Pushing${pushLabel}…`, `Push${pushLabel} completed.`],
      }[kind];
      set({ error: null, loading: true, statusMessage: labels[0] });
      const run = {
        fetch: () => host.fetch(root),
        pull: () => host.pull(root, opts?.pullMode),
        push: () => host.push(root, opts?.pushTo),
      }[kind];
      try {
        await run();
        // Refresh TRƯỚC rồi mới set message chốt — fetchLog thành công sẽ set 'Ready' đè lên.
        await Promise.all([fetchLog(root, false), fetchRefs(root), fetchStatus(root)]);
        set({ statusMessage: labels[1] });
      } catch (error) {
        // Pull bị từ chối vì working tree bẩn ("cannot pull with rebase: You have
        // unstaged changes"…) → popup Dirty Guard thay vì banner thô.
        const opLabel =
          kind === 'pull' && opts?.pullMode ? `Pull (${opts.pullMode})` : capitalizeOp(kind);
        if (!guardDirtyError(root, opLabel, error, run)) {
          set({ error: formatError(error) });
        }
      }
      set({ loading: false });
    },

    async mergeBranch(repoRoot, target, strategy) {
      set({ error: null, loading: true, statusMessage: `Merging '${target}'…` });
      try {
        const result = await host.merge(repoRoot, target, strategy);
        await refreshRepoData(repoRoot);
        set({ statusMessage: mergeMessage(target, strategy, result) });
        // Conflict hoặc merge dừng trước commit (--no-commit/squash) → user phải
        // xử lý tiếp trong Working Tree — đưa tới đó luôn.
        if (result.status === 'conflicts' || (result.status === 'clean' && strategy !== 'fast-forward' && strategy !== 'merge-commit')) {
          focusWorkingTree(repoRoot);
        }
      } catch (error) {
        if (!guardDirtyError(repoRoot, `Merge '${target}'`, error, async () => {
          await host.merge(repoRoot, target, strategy);
        })) {
          set({ error: formatError(error) });
        }
        await refreshRepoData(repoRoot);
      }
      set({ loading: false });
    },

    async rebaseBranch(repoRoot, onto) {
      set({ error: null, loading: true, statusMessage: `Rebasing onto '${onto}'…` });
      try {
        const result = await host.rebase(repoRoot, onto);
        await refreshRepoData(repoRoot);
        if (result.status === 'conflicts') {
          set({
            statusMessage: `Rebase onto '${onto}' hit conflicts (${result.conflictedPaths.length} files) — resolve, then Continue.`,
          });
          focusWorkingTree(repoRoot); // banner D2 có nút Continue/Abort
        } else {
          set({
            statusMessage:
              result.status === 'up-to-date' ? 'Already up to date.' : `Rebased onto '${onto}'.`,
          });
        }
      } catch (error) {
        if (!guardDirtyError(repoRoot, `Rebase onto '${onto}'`, error, async () => {
          await host.rebase(repoRoot, onto);
        })) {
          set({ error: formatError(error) });
        }
        await refreshRepoData(repoRoot);
      }
      set({ loading: false });
    },

    async resetToCommit(oid, mode) {
      const root = get().activeRepoRoot;
      if (root === null || get().loading) {
        return;
      }
      const short = oid.slice(0, 7);
      set({ error: null, loading: true, statusMessage: `Resetting (--${mode}) to ${short}…` });
      try {
        await host.reset(root, oid, mode);
        // Refresh TRƯỚC rồi mới set message chốt (như remoteOp) — log/refs/status đều đổi.
        await Promise.all([fetchLog(root, false), fetchRefs(root), fetchStatus(root)]);
        set({ statusMessage: `Reset (--${mode}) to ${short}.` });
      } catch (error) {
        set({ error: formatError(error) });
      }
      set({ loading: false });
    },
  };

  /** Đổi bộ lọc ref của graph: reset selection (commit có thể ngoài lọc) + tải lại log. */
  async function applyHistoryRefs(refs: string[]): Promise<void> {
    set({
      historyRefs: refs,
      selectedOid: null,
      commitFiles: [],
      commitBody: null,
      selectedFile: null,
      diff: null,
    });
    const root = get().activeRepoRoot;
    if (root !== null) {
      await fetchLog(root, false);
    }
  }

  /**
   * Lỗi thuộc nhóm "git từ chối vì working tree bẩn" → mở popup Dirty Guard
   * (user chọn stash & retry / đi commit) thay cho banner lỗi thô.
   * Trả true = đã xử lý, caller đừng set error nữa.
   */
  function guardDirtyError(
    repoRoot: string,
    opLabel: string,
    error: unknown,
    retry: () => Promise<void>,
  ): boolean {
    const message = formatError(error);
    if (!isDirtyWorkingTreeError(message)) {
      return false;
    }
    set({ dirtyGuard: { opLabel, message, repoRoot, retry } });
    return true;
  }

  /** Merge/rebase xong: panel chính refresh repo active, sidebar refresh mọi repo. */
  async function refreshRepoData(root: string): Promise<void> {
    if (get().activeRepoRoot !== null) {
      await Promise.all([fetchLog(root, false), fetchRefs(root), fetchStatus(root)]);
    } else {
      // Webview sidebar (không có repo active) — refresh dữ liệu dạng per-repo.
      await Promise.all([get().loadAllRefs(), get().loadAllStatuses()]);
      set({ repos: await host.listRepos() });
    }
  }

  /** Kết quả cần user xử lý tiếp (conflict/commit dở) → đưa tới Working Tree. */
  function focusWorkingTree(repoRoot: string): void {
    if (get().activeRepoRoot !== null) {
      set({ uiMode: 'workingTree' });
    } else {
      // Sidebar không có màn Working Tree — mở/reveal panel chính đúng chỗ.
      void host.openPanel(repoRoot, 'workingTree', null, null, null);
    }
  }
});

/** 'fetch' → 'Fetch' — nhãn thao tác cho popup Dirty Guard/status bar. */
const capitalizeOp = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Thông điệp status bar sau merge — nói rõ bước tiếp theo khi merge dừng giữa chừng. */
function mergeMessage(target: string, strategy: MergeStrategy, result: MergeResult): string {
  if (result.status === 'conflicts') {
    return `Merge of '${target}' has conflicts (${result.conflictedPaths.length} files) — resolve them, then commit.`;
  }
  if (result.status === 'up-to-date') {
    return 'Already up to date.';
  }
  switch (strategy) {
    case 'merge-to-working-tree':
      return `Merged '${target}' into working tree — review changes and commit.`;
    case 'squash':
      return `Squashed '${target}' — review changes and commit.`;
    default:
      return `Merged '${target}'.`;
  }
}
