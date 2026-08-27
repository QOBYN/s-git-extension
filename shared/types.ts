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
  /**
   * Chỉ lịch sử của các ref này (click nhánh ở sidebar B1, hoặc multi-select
   * từ dropdown lọc nhánh của màn History) — bỏ qua `all` khi có ít nhất 1 ref.
   */
  ref?: string | string[];
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

/** Remote đã khai báo (git remote) — sidebar tab Git, menu Add/Edit Remote. */
export interface RemoteInfo {
  name: string;
  /** URL fetch (URL push riêng là trường hợp hiếm — ngoài phạm vi). */
  url: string;
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
  /**
   * 'text' = chuỗi UTF-8 (diff Monaco);
   * 'base64' = nội dung nhị phân (ảnh/binary — webview render theo loại file).
   * Host quyết định: đuôi file nhị phân đã biết HOẶC có byte NUL trong nội dung.
   */
  encoding: 'text' | 'base64';
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

// ---- feedback (gửi góp ý về group Telegram) ----

export type FeedbackCategory = 'bug' | 'idea' | 'question' | 'other';

/**
 * 1 file/ảnh đính kèm. Đi qua RPC nên nội dung phải là chuỗi:
 * base64 THUẦN (không có tiền tố `data:...;base64,`).
 */
export interface FeedbackAttachment {
  name: string;
  /** MIME từ File.type của webview; rỗng khi trình duyệt không đoán được. */
  mimeType: string;
  /** Kích thước thật (byte) — dùng để chặn file quá lớn trước khi encode. */
  size: number;
  dataBase64: string;
}

/** Ngữ cảnh webview tự biết, đính vào cuối message để người nhận đỡ phải hỏi lại. */
export interface FeedbackContext {
  /** Màn hình đang mở lúc bấm Feedback. */
  screen: 'main' | 'sidebar' | 'file-log';
  repoName?: string | null;
  branch?: string | null;
}

export interface FeedbackPayload {
  category: FeedbackCategory;
  /** Tiêu đề ngắn — thành dòng đầu của message Telegram. */
  title: string;
  message: string;
  /** Cách liên hệ lại (tên/email/@telegram) — rỗng = ẩn danh. */
  contact: string;
  attachments: FeedbackAttachment[];
  context?: FeedbackContext;
}

/**
 * Kết quả gửi. KHÔNG dùng exception: Error qua postMessage bị JSON hoá thành `{}`
 * nên webview sẽ mất thông điệp — trả object để UI luôn hiện được lý do thất bại.
 */
export type FeedbackResult =
  | {
      ok: true;
      sentAttachments: number;
      /** File gửi hỏng nhưng message vẫn tới nơi — form cảnh báo, không coi là thất bại. */
      skippedAttachments: string[];
    }
  | { ok: false; error: string };
