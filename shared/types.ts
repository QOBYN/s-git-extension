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
  /** Entry là submodule (field <sub> của porcelain v2 bắt đầu bằng 'S'). */
  submodule?: boolean;
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
  /**
   * Path là SUBMODULE (gitlink — `git show` không đọc được nội dung): original/
   * modified rỗng, webview render view so sánh con trỏ thay vì diff text.
   */
  submodule?: SubmoduleDiffInfo;
}

/**
 * So sánh con trỏ submodule giữa 2 phía của diff. Chi tiết commit (subject/
 * author/refs…) đọc từ REPO CON nên là best-effort: null/rỗng khi submodule
 * chưa init hoặc thiếu object — UI vẫn hiển thị được SHA.
 */
export interface SubmoduleDiffInfo {
  /** SHA con trỏ 2 phía; null = phía đó không có (mới thêm / đã xoá / chưa init). */
  oldOid: string | null;
  newOid: string | null;
  /** Chi tiết commit của từng con trỏ (kèm refs trỏ vào nó — nhánh/tag). */
  oldCommit: CommitInfo | null;
  newCommit: CommitInfo | null;
  /** Commit chỉ có ở phía mới (`old..new`, mới nhất trước) — preview history. */
  ahead: CommitInfo[];
  /** Commit chỉ có ở phía cũ (`new..old`) — con trỏ bị lùi. */
  behind: CommitInfo[];
  /**
   * Gốc chung (`merge-base old new`) khi 2 con trỏ PHÂN KỲ — điểm 2 đường ray
   * lịch sử gặp nhau trong view. null khi fast-forward thuần / không tính được.
   */
  baseOid: string | null;
  baseCommit: CommitInfo | null;
  /** ahead/behind bị cắt bớt (nhiều hơn giới hạn truy vấn) — load thêm qua getSubmoduleLog. */
  aheadTruncated: boolean;
  behindTruncated: boolean;
  /** Nội dung BÊN TRONG submodule có thay đổi chưa commit (chỉ kind workingTree). */
  dirty: boolean;
}

/** 1 trang log của repo con — nút "show more" trong view diff submodule. */
export interface SubmoduleLogPage {
  commits: CommitInfo[];
  hasMore: boolean;
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

/** Cách hoà remote vào local khi Pull (popup Pull — nhớ lựa chọn lần trước). */
export type PullMode = 'merge' | 'rebase' | 'ff-only';

/** Kiểu reset của dialog Reset tại commit (context menu History). */
export type ResetMode = 'soft' | 'mixed' | 'hard';

/** Tuỳ chọn checkout — force bỏ mọi thay đổi local (popup Checkout đã cảnh báo). */
export interface CheckoutOptions {
  force?: boolean;
  /**
   * Tạo nhánh mới tên này tại `ref` rồi đứng trên đó (`git checkout -b`) —
   * lựa chọn "Nhánh mới tại commit này" của popup Checkout, tránh detached HEAD.
   */
  newBranch?: string;
}

/**
 * Popup Checkout: cách xử lý thay đổi chưa commit trước khi checkout
 * (double-click dòng log / menu Check Out… — nhớ lựa chọn lần trước).
 */
export type CheckoutDirtyAction = 'stash-reapply' | 'bring' | 'discard';

/** Đích của "Push to…": đẩy HEAD lên nhánh chỉ định trên remote (tạo mới nếu chưa có). */
export interface PushTarget {
  remote: string;
  branch: string;
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
