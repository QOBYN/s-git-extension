// Kiểu dữ liệu dùng chung giữa extension host và webview.
// Mọi type ở đây phải serializable qua postMessage: không class, không Date (dùng ISO string).

// ---- repo ----

export type RepoActivity = 'none' | 'merging' | 'rebasing' | 'cherry-picking';

/** 2 chế độ của panel chính — toggle Local Files | History của SmartGit (A2). */
export type PanelMode = 'workingTree' | 'history';

export interface RepoInfo {
  /** Đường dẫn tuyệt đối tới thư mục gốc của repo. Dùng làm id trong toàn bộ RPC. */
  root: string;
  name: string;
  branch: string | null;
  activity: RepoActivity;
}

// ---- log / commit ----

export interface CommitInfo {
  oid: string;
  parents: string[];
  author: string;
  email: string;
  /** ISO 8601 (%aI) */
  date: string;
  /** Ref decorations nguyên văn từ %D: "HEAD -> main", "origin/main", "tag: v1.0" */
  refs: string[];
  subject: string;
}

export interface LogOptions {
  /** Mặc định 1000 (spec: trang đầu + Load more). */
  limit?: number;
  skip?: number;
  /** Mặc định true — graph nhiều nhánh như SmartGit. */
  all?: boolean;
  /** Chỉ lịch sử của 1 ref (click nhánh ở sidebar B1) — bỏ qua `all` khi đặt. */
  ref?: string;
  /**
   * Log của riêng 1 file (màn File Log — ui-analysis C): dùng --follow để theo
   * dấu qua rename. Khi đặt, `all` bị bỏ qua (--follow không đi với --all).
   */
  path?: string;
}

export interface LogPage {
  commits: CommitInfo[];
  hasMore: boolean;
  headOid: string | null;
}

// ---- refs (sidebar nhánh — ui-analysis B1) ----

export type RefKind = 'local' | 'remote' | 'tag';

export interface RefInfo {
  /** Tên ngắn hiển thị: `main`, `origin/main`, `v1.0`. */
  name: string;
  /** Tên đầy đủ: `refs/heads/main`… — id ổn định cho thao tác. */
  fullName: string;
  kind: RefKind;
  oid: string;
  /** Nhánh đang checkout (in đậm + ▶ trong sidebar). */
  isHead: boolean;
}

// ---- files trong 1 commit (panel B6) ----

export interface CommitFileChange {
  path: string;
  /** Path cũ khi renamed/copied. */
  origPath?: string;
  kind: ChangeKind;
}

// ---- working tree status ----

export type ChangeKind =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'typechange';

export interface FileChange {
  path: string;
  /** Đường dẫn cũ khi renamed/copied. */
  origPath?: string;
  /** Thay đổi đã stage (cột X của porcelain v2); null = không có. */
  staged: ChangeKind | null;
  /** Thay đổi chưa stage (cột Y); null = không có. */
  unstaged: ChangeKind | null;
  untracked: boolean;
  conflicted: boolean;
}

export interface WorkingTreeStatus {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: FileChange[];
  activity: RepoActivity;
  /** Message tự điền khi merging (từ .git/MERGE_MSG) — spec mục 2.4. */
  activityMessage?: string;
}

// ---- diff ----

export interface DiffTarget {
  path: string;
  /** So sánh gì: working tree ↔ index, index ↔ HEAD, hay nội dung 1 commit. */
  kind: 'workingTree' | 'index' | 'commit';
  /** Bắt buộc khi kind === 'commit'. */
  oid?: string;
}

export interface DiffPayload {
  original: string;
  modified: string;
  /** Gợi ý ngôn ngữ cho Monaco, suy từ đuôi file. */
  language?: string;
}

// ---- thao tác ghi ----

export type MergeStrategy =
  | 'fast-forward'
  | 'merge-commit'
  | 'merge-to-working-tree'
  | 'squash';

export interface MergeResult {
  status: 'clean' | 'conflicts' | 'up-to-date';
  conflictedPaths: string[];
}

export interface CommitOptions {
  amend?: boolean;
  pushAfter?: boolean;
}

// ---- sự kiện host → webview ----

export interface RepoDelta {
  /** Những phần đã thay đổi — webview chỉ refetch phần liên quan. */
  changed: Array<'log' | 'status' | 'refs'>;
}

export interface GitErrorInfo {
  command: string;
  code: number;
  stderr: string;
}
