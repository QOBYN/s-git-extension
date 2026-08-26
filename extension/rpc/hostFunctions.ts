// Hiện thực HostFunctions (shared/protocol.ts) — cầu nối RPC → services.
// File này KHÔNG chứa logic git; chỉ điều phối và chuyển đổi dữ liệu cho webview.

import type { HostFunctions } from '../../shared/protocol';
import type {
  DiffPayload,
  DiffTarget,
  LogPage,
  PanelMode,
  WorkingTreeStatus,
} from '../../shared/types';
import { hasBinaryContent, isKnownBinaryExtension } from '../services/binaryDetect';
import type { CacheIndex } from '../services/cacheIndex';
import type { FeedbackService } from '../services/feedbackService';
import type { GitService } from '../services/gitService';
import type { RepoManager } from '../services/repoManager';
import type { RepoStateReader } from '../services/repoStateReader';
import { GitError, type GitRunner } from '../services/gitRunner';

/** Cổng mở panel chính — composition root nối với MainPanel (tránh import vòng views). */
export interface PanelOpener {
  open(
    repoRoot: string | null,
    mode: PanelMode | null,
    folder: string | null,
    ref: string | null,
    search: string | null,
  ): void;
}

/** Hành động phía VSCode/OS cho context menu file (G) — impl ở composition root. */
export interface ShellPort {
  openFile(repoRoot: string, relPath: string): void;
  revealInOS(repoRoot: string, relPath: string): void;
  openFileLog(repoRoot: string, relPath: string): void;
}

export interface HostFunctionDeps {
  repoManager: RepoManager;
  git: GitService;
  stateReader: RepoStateReader;
  runner: GitRunner;
  cache: CacheIndex;
  panelOpener: PanelOpener;
  shell: ShellPort;
  feedback: FeedbackService;
}

export function createHostFunctions(deps: HostFunctionDeps): HostFunctions {
  const { repoManager, git, stateReader, runner, cache, panelOpener, shell, feedback } = deps;

  /**
   * Trang đầu của log đi qua cache (architecture.md mục 4): nếu headOid VÀ
   * refsSignature không đổi thì trả cache ngay (mở panel tức thì trên repo lớn);
   * lệch thì quét git thật rồi cập nhật cache. Trang "Load more" (skip>0)
   * không cache — luôn quét.
   */
  async function getLogCached(repoRoot: string, opts?: Parameters<GitService['getLog']>[1]): Promise<LogPage> {
    // Trang "Load more", log lọc theo ref, và log theo file không cache —
    // chỉ cache trang đầu mặc định của graph.
    if (opts?.skip || opts?.ref || opts?.path) {
      return git.getLog(repoRoot, opts);
    }
    const [headOid, refsSignature] = await Promise.all([
      git.getHeadOid(repoRoot),
      git.getRefsSignature(repoRoot),
    ]);
    const cached = await cache.load(repoRoot);
    if (cached !== null && cached.headOid === headOid && cached.refsSignature === refsSignature) {
      return { commits: cached.commits, hasMore: cached.hasMore, headOid };
    }
    const page = await git.getLog(repoRoot, opts);
    await cache.save(repoRoot, {
      headOid: page.headOid,
      refsSignature,
      hasMore: page.hasMore,
      commits: page.commits,
    });
    return page;
  }

  return {
    // ---- đọc (P0) ----
    listRepos: () => repoManager.listRepos(),

    getLog: (repoRoot, opts) => getLogCached(repoRoot, opts),

    listRefs: (repoRoot) => git.listRefs(repoRoot),
    getCommitFiles: (repoRoot, oid) => git.getCommitFiles(repoRoot, oid),
    getCommitBody: (repoRoot, oid) => git.getCommitBody(repoRoot, oid),

    listFolders: (repoRoot) => git.listFolders(repoRoot),

    async openPanel(repoRoot, mode, folder, ref, search) {
      panelOpener.open(repoRoot, mode, folder ?? null, ref ?? null, search ?? null);
    },

    async getStatus(repoRoot): Promise<WorkingTreeStatus> {
      const [status, gitDir] = await Promise.all([git.getStatus(repoRoot), git.getGitDir(repoRoot)]);
      const state = await stateReader.read(gitDir);
      return {
        ...status,
        activity: state.activity,
        activityMessage: state.message,
      };
    },

    async getDiff(repoRoot, target): Promise<DiffPayload> {
      // Đọc base64 thống nhất rồi mới quyết định text/binary — tránh đọc 2 lần.
      const [originalB64, modifiedB64] = await Promise.all([
        readSide(repoRoot, target, 'original'),
        readSide(repoRoot, target, 'modified'),
      ]);
      const originalBuffer = Buffer.from(originalB64, 'base64');
      const modifiedBuffer = Buffer.from(modifiedB64, 'base64');
      const binary =
        isKnownBinaryExtension(target.path) ||
        hasBinaryContent(originalBuffer) ||
        hasBinaryContent(modifiedBuffer);
      if (binary) {
        return { original: originalB64, modified: modifiedB64, encoding: 'base64' };
      }
      return {
        original: originalBuffer.toString('utf8'),
        modified: modifiedBuffer.toString('utf8'),
        encoding: 'text',
      };
    },

    // ---- ghi (P1) ----
    stage: (repoRoot, paths) => git.stage(repoRoot, paths),
    unstage: (repoRoot, paths) => git.unstage(repoRoot, paths),
    commit: (repoRoot, message, opts) => git.commit(repoRoot, message, opts),

    discard: (repoRoot, paths) => git.discard(repoRoot, paths),
    checkout: (repoRoot, ref) => git.checkout(repoRoot, ref),
    createBranch: (repoRoot, name, oid) => git.createBranch(repoRoot, name, oid),
    createTag: (repoRoot, name, oid) => git.createTag(repoRoot, name, oid),
    deleteBranch: (repoRoot, name) => git.deleteBranch(repoRoot, name),
    renameBranch: (repoRoot, oldName, newName) => git.renameBranch(repoRoot, oldName, newName),
    deleteTag: (repoRoot, name) => git.deleteTag(repoRoot, name),

    async openFile(repoRoot, relPath) {
      shell.openFile(repoRoot, relPath);
    },
    async revealInOS(repoRoot, relPath) {
      shell.revealInOS(repoRoot, relPath);
    },
    async openFileLog(repoRoot, relPath) {
      shell.openFileLog(repoRoot, relPath);
    },

    stageHunk: (repoRoot, patch) => git.stageHunk(repoRoot, patch),
    unstageHunk: (repoRoot, patch) => git.unstageHunk(repoRoot, patch),
    revertHunk: (repoRoot, patch) => git.revertHunk(repoRoot, patch),

    async saveWorkingFile(repoRoot, relPath, content) {
      const { writeFile } = await import('node:fs/promises');
      const { resolve, sep } = await import('node:path');
      // Chặn path traversal: file ghi ra phải nằm TRONG repo.
      const absPath = resolve(repoRoot, relPath);
      if (!absPath.startsWith(resolve(repoRoot) + sep)) {
        throw new Error(`Đường dẫn ngoài repo: ${relPath}`);
      }
      await writeFile(absPath, content, 'utf8');
    },

    // ---- remote (P2) ----
    fetch: (repoRoot) => git.fetch(repoRoot),
    pull: (repoRoot) => git.pull(repoRoot),
    push: (repoRoot) => git.push(repoRoot),

    // ---- merge / rebase (P2) ----
    merge: (repoRoot, target, strategy) => git.merge(repoRoot, target, strategy),
    rebase: (repoRoot, onto) => git.rebase(repoRoot, onto),

    async abortOperation(repoRoot) {
      const activity = await currentActivity(repoRoot);
      if (activity === 'none') {
        throw new Error('Không có thao tác nào đang dở để abort');
      }
      await git.abortOperation(repoRoot, activity);
    },

    async continueOperation(repoRoot) {
      const activity = await currentActivity(repoRoot);
      if (activity !== 'rebasing' && activity !== 'cherry-picking') {
        // Merge không có continue — hoàn tất bằng Commit (spec 2.4).
        throw new Error('Continue chỉ áp dụng cho rebase/cherry-pick đang dở');
      }
      await git.continueOperation(repoRoot, activity);
    },

    // ---- feedback ----
    async isFeedbackConfigured() {
      return feedback.isConfigured();
    },
    // Chốt chặn cuối: FeedbackService đã tự bắt lỗi, nhưng nếu có gì ngoài dự
    // kiến ném ra (payload lạ, service đổi sau này) thì cũng phải thành
    // FeedbackResult — Error đi qua birpc bị JSON hoá thành {} nên webview sẽ
    // treo ở trạng thái "Đang gửi…" mà không biết vì sao.
    async sendFeedback(payload) {
      try {
        return await feedback.send(payload);
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };

  async function currentActivity(repoRoot: string) {
    const gitDir = await git.getGitDir(repoRoot);
    return (await stateReader.read(gitDir)).activity;
  }

  /**
   * Lấy nội dung 1 phía của diff qua `git show`:
   *  - workingTree: index (`:path`) ↔ file trên đĩa (git show không đọc được
   *    working tree nên dùng `cat-file` không được — đọc qua diff của git ở P0
   *    là chưa cần; tạm so index ↔ HEAD khi chưa có adapter đọc file, TODO P0-5).
   *  - index:      HEAD (`HEAD:path`) ↔ index (`:path`)
   *  - commit:     parent (`oid^:path`) ↔ commit (`oid:path`)
   * File không tồn tại ở 1 phía (added/deleted) trả chuỗi rỗng — Monaco render
   * thành diff toàn thêm/toàn xoá, đúng ngữ nghĩa.
   */
  /** Trả BASE64 (an toàn nhị phân); getDiff quyết định decode utf8 hay giữ nguyên. */
  async function readSide(
    repoRoot: string,
    target: DiffTarget,
    side: 'original' | 'modified',
  ): Promise<string> {
    const spec = showSpec(target, side);
    if (spec === null) {
      return readWorkingFile(repoRoot, target.path);
    }
    try {
      return await runner.run(repoRoot, ['show', spec], { encoding: 'base64' });
    } catch (error) {
      if (error instanceof GitError && isMissingPathError(error)) {
        return '';
      }
      throw error;
    }
  }

  /** null = phía này là file working tree (đọc từ đĩa, không qua git show). */
  function showSpec(target: DiffTarget, side: 'original' | 'modified'): string | null {
    switch (target.kind) {
      case 'workingTree':
        return side === 'original' ? `:${target.path}` : null;
      case 'index':
        return side === 'original' ? `HEAD:${target.path}` : `:${target.path}`;
      case 'commit':
        // `oid` bắt buộc theo contract DiffTarget — thiếu là bug ở caller.
        if (!target.oid) {
          throw new Error('DiffTarget.oid là bắt buộc khi kind === "commit"');
        }
        return side === 'original' ? `${target.oid}^:${target.path}` : `${target.oid}:${target.path}`;
      default:
        throw new Error(`DiffTarget.kind không hợp lệ: ${(target as DiffTarget).kind}`);
    }
  }

  async function readWorkingFile(repoRoot: string, relPath: string): Promise<string> {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    try {
      return await readFile(join(repoRoot, relPath), 'base64');
    } catch {
      return ''; // file đã xoá khỏi working tree
    }
  }
}

/** git show báo path không tồn tại ở revision đó (file added/deleted/commit gốc). */
function isMissingPathError(error: GitError): boolean {
  return (
    error.stderr.includes('does not exist') ||
    error.stderr.includes('exists on disk, but not in') ||
    error.stderr.includes('bad revision')
  );
}
