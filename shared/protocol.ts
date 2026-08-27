// Contract RPC giữa extension host và webview (birpc).
// Đây là NGUỒN SỰ THẬT DUY NHẤT của giao tiếp 2 tầng — thêm/sửa hàm phải sửa ở đây trước.
// Quy ước:
//  - Tham số đầu tiên của mọi hàm thao tác repo là `repoRoot` (RepoInfo.root).
//  - Lỗi git được host ném dưới dạng GitErrorInfo (birpc serialize qua) — webview
//    hiển thị stderr, không tự diễn giải.

import type {
  CheckoutOptions,
  CommitFileChange,
  CommitOptions,
  DiffPayload,
  DiffTarget,
  FeedbackPayload,
  FeedbackResult,
  LogOptions,
  LogPage,
  MergeResult,
  MergeStrategy,
  PanelMode,
  PullMode,
  PushTarget,
  RefInfo,
  ResetMode,
  RemoteInfo,
  RepoDelta,
  RepoInfo,
  SubmoduleLogPage,
  WorkingTreeStatus,
} from './types';

/** Hàm webview gọi sang host. */
export interface HostFunctions {
  // ---- đọc (P0) ----
  listRepos(): Promise<RepoInfo[]>;
  getLog(repoRoot: string, opts?: LogOptions): Promise<LogPage>;
  getStatus(repoRoot: string): Promise<WorkingTreeStatus>;
  getDiff(repoRoot: string, target: DiffTarget): Promise<DiffPayload>;
  /**
   * Trang tiếp theo của history repo con — nút "show more" trong view diff
   * submodule khi preview ahead/behind bị cắt. `range` = "old..new" hoặc 1 oid.
   */
  getSubmoduleLog(
    repoRoot: string,
    path: string,
    range: string,
    skip: number,
  ): Promise<SubmoduleLogPage>;
  /** Toàn bộ refs cho sidebar nhánh (local/remote/tag — ui-analysis B1). */
  listRefs(repoRoot: string): Promise<RefInfo[]>;
  /** Danh sách file thay đổi của 1 commit (panel B6). */
  getCommitFiles(repoRoot: string, oid: string): Promise<CommitFileChange[]>;
  /** Message đầy đủ (subject + body) của 1 commit — panel chi tiết B5. */
  getCommitBody(repoRoot: string, oid: string): Promise<string>;

  /**
   * Danh sách thư mục của repo (tracked + untracked, bỏ ignored) — cây Directories
   * của sidebar tab Working Tree (ui-analysis A3, note.md "chọn view folder nào").
   */
  listFolders(repoRoot: string): Promise<string[]>;

  /**
   * Sidebar gọi để mở/reveal panel chính và điều hướng tới repo/chế độ/folder scope
   * chỉ định (null = giữ nguyên phần đó; folder null = cả repo).
   * Panel đang mở nhận qua WebviewFunctions.navigate.
   */
  openPanel(
    repoRoot: string | null,
    mode: PanelMode | null,
    folder?: string | null,
    /** Lọc History theo 1 ref (click nhánh ở sidebar) — null = mọi nhánh. */
    ref?: string | null,
    /** Tìm commit (message/tác giả/oid) — ô search nằm ở sidebar, kết quả hiện trong panel. */
    search?: string | null,
  ): Promise<void>;

  // ---- ghi (P1) ----
  stage(repoRoot: string, paths: string[]): Promise<void>;
  unstage(repoRoot: string, paths: string[]): Promise<void>;
  /** Stage 1 hunk: patch unified diff (webview dựng từ Monaco line changes), host chạy `git apply --cached`. */
  stageHunk(repoRoot: string, patch: string): Promise<void>;
  /** Unstage 1 hunk: patch dựng từ diff HEAD↔index, host chạy `git apply --cached --reverse`. */
  unstageHunk(repoRoot: string, patch: string): Promise<void>;
  /** Revert 1 hunk KHỎI WORKING TREE (bỏ thay đổi đó trên đĩa): `git apply --reverse`. */
  revertHunk(repoRoot: string, patch: string): Promise<void>;
  /**
   * Ghi nội dung sửa trực tiếp trong diff view xuống file working tree
   * (pane phải editable — map File Compare của SmartGit, ui-analysis D3).
   */
  saveWorkingFile(repoRoot: string, relPath: string, content: string): Promise<void>;
  discard(repoRoot: string, paths: string[]): Promise<void>;
  commit(repoRoot: string, message: string, opts?: CommitOptions): Promise<void>;
  /**
   * Checkout; repo có submodule thì tự `submodule update --init` sau đó để repo
   * con khớp con trỏ mới (bỏ qua khi submodule đang có thay đổi local, trừ force).
   */
  checkout(repoRoot: string, ref: string, opts?: CheckoutOptions): Promise<void>;
  /**
   * Popup Checkout khi working tree bẩn: tạm cất MỌI thay đổi (kể cả untracked)
   * trước khi checkout — `git stash push -u`. Trả về có tạo stash hay không:
   * false khi không có gì cất được (vd chỉ đổi con trỏ submodule) — webview
   * phải BỎ QUA bước stash pop.
   */
  stashPush(repoRoot: string, message?: string): Promise<boolean>;
  /** Re-apply stash mới nhất sau checkout (`git stash pop`) — conflict ném GitError nguyên văn. */
  stashPop(repoRoot: string): Promise<void>;
  /** Context menu commit (ui-analysis E): Add Branch… / Add Tag… tại commit. */
  createBranch(repoRoot: string, name: string, oid: string): Promise<void>;
  createTag(repoRoot: string, name: string, oid: string): Promise<void>;

  // ---- context menu nhánh/tag ở sidebar ----
  /** `git branch -d` — git tự chặn nhánh chưa merge / nhánh hiện tại (an toàn có sẵn). */
  deleteBranch(repoRoot: string, name: string): Promise<void>;
  renameBranch(repoRoot: string, oldName: string, newName: string): Promise<void>;
  deleteTag(repoRoot: string, name: string): Promise<void>;

  // ---- context menu file (ui-analysis G) — hành động phía VSCode ----
  /** Mở file bằng editor VSCode thường ("Open in Editor" — đảo chiều "Open in VSCode" của SmartGit). */
  openFile(repoRoot: string, relPath: string): Promise<void>;
  /** Reveal in Finder/Explorer của hệ điều hành. */
  revealInOS(repoRoot: string, relPath: string): Promise<void>;
  /** Mở tab File Log cho 1 file (menu "File Log" — đường vào màn hình C). */
  openFileLog(repoRoot: string, relPath: string): Promise<void>;

  // ---- quản lý remote (context menu sidebar tab Git) ----
  /** Remote đã khai báo (tên + URL fetch) — hiện cả remote chưa fetch lần nào. */
  listRemotes(repoRoot: string): Promise<RemoteInfo[]>;
  addRemote(repoRoot: string, name: string, url: string): Promise<void>;
  /** Đổi tên (nếu khác) rồi set-url — dialog Edit Remote sửa được cả hai. */
  editRemote(repoRoot: string, oldName: string, newName: string, url: string): Promise<void>;

  // ---- remote (P2) — toolbar Fetch / Pull / Push ----
  /** `git fetch --all --prune`. */
  fetch(repoRoot: string): Promise<void>;
  /**
   * `git pull` theo mode từ popup Pull (merge/rebase/ff-only); không truyền mode
   * thì theo config của user (pull.rebase…).
   */
  pull(repoRoot: string, mode?: PullMode): Promise<void>;
  /**
   * `git push`; nhánh chưa có upstream + đúng 1 remote thì tự `push -u`.
   * Có `to` ("Push to…"): đẩy HEAD lên nhánh chỉ định trên remote đó.
   */
  push(repoRoot: string, to?: PushTarget): Promise<void>;
  /** `git reset --<mode> <oid>` — dialog Reset từ context menu History. */
  reset(repoRoot: string, oid: string, mode: ResetMode): Promise<void>;

  // ---- merge / rebase (P2) — spec mục 2.4: rebase dùng chung luồng conflict với merge ----
  merge(repoRoot: string, target: string, strategy: MergeStrategy): Promise<MergeResult>;
  rebase(repoRoot: string, onto: string): Promise<MergeResult>;
  abortOperation(repoRoot: string): Promise<void>;
  continueOperation(repoRoot: string): Promise<void>;

  // ---- feedback — form góp ý gửi thẳng vào group Telegram ----
  /**
   * Bản build này có gắn sẵn bot token + chat id không (đích Telegram nằm trong
   * bundle — extension/feedbackTarget.ts, người dùng không đổi được).
   */
  isFeedbackConfigured(): Promise<boolean>;
  /**
   * Gửi góp ý: đính kèm (ảnh/file) đi TRƯỚC, message đi SAU — để trong group
   * phần chữ nằm ngay dưới các file của nó. Không ném lỗi: mọi thất bại trả về
   * trong FeedbackResult.
   */
  sendFeedback(payload: FeedbackPayload): Promise<FeedbackResult>;
}

/** Hàm host gọi ngược sang webview (thông báo — không cần trả lời). */
export interface WebviewFunctions {
  /** Repo thay đổi (watcher .git/ phát hiện) — webview refetch phần nêu trong delta. */
  repoChanged(repoRoot: string, delta: RepoDelta): void;
  /** Dòng trạng thái kiểu "Command succeeded." của SmartGit (ui-analysis mục D2). */
  operationProgress(message: string): void;
  /** Panel chính nhận điều hướng từ sidebar (null = giữ nguyên phần đó). */
  navigate(
    repoRoot: string | null,
    mode: PanelMode | null,
    folder?: string | null,
    ref?: string | null,
    search?: string | null,
  ): void;
}
