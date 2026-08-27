// Facade mọi thao tác git. Mỗi method = gọi GitRunner + parser tương ứng.
// KHÔNG import 'vscode'; KHÔNG tự spawn process; KHÔNG hardcode giá trị chỉnh được —
// nhận qua GitServiceOptions (adapter sẽ nối với VSCode settings).

import { createHash } from 'node:crypto';
import { DEFAULT_LOG_PAGE_SIZE } from '../../shared/constants';
import type {
  CommitFileChange,
  LogOptions,
  LogPage,
  MergeResult,
  MergeStrategy,
  RefInfo,
  RemoteInfo,
} from '../../shared/types';
import { parseCommitFiles } from './commitFilesParser';
import { foldersFromPaths } from '../../shared/folders';
import { GitError, type GitRunner } from './gitRunner';
import { parseSubmodulePaths } from './submoduleParser';
import { LOG_FORMAT, parseLog } from './logParser';
import { FOR_EACH_REF_ARGS, parseRefs } from './refParser';
import { parseStatusV2, type StatusResult } from './statusParser';

export interface GitServiceOptions {
  /** Số commit mỗi trang log; mặc định DEFAULT_LOG_PAGE_SIZE (spec 6.3). */
  logPageSize?: number;
}

export class GitService {
  private readonly logPageSize: number;

  constructor(
    private readonly runner: GitRunner,
    options: GitServiceOptions = {},
  ) {
    this.logPageSize = options.logPageSize ?? DEFAULT_LOG_PAGE_SIZE;
  }

  // ---- truy vấn (P0) ----

  async isRepo(root: string): Promise<boolean> {
    try {
      const out = await this.runner.run(root, ['rev-parse', '--is-inside-work-tree']);
      return out.trim() === 'true';
    } catch {
      return false;
    }
  }

  /** Đường dẫn thư mục .git đã resolve (xử lý cả worktree có .git dạng file). */
  async getGitDir(root: string): Promise<string> {
    const out = await this.runner.run(root, ['rev-parse', '--absolute-git-dir']);
    return out.trim();
  }

  /** null khi repo chưa có commit nào. */
  async getHeadOid(root: string): Promise<string | null> {
    try {
      const out = await this.runner.run(root, ['rev-parse', 'HEAD']);
      return out.trim();
    } catch (error) {
      if (isEmptyRepoError(error)) {
        return null;
      }
      throw error;
    }
  }

  async getCurrentBranch(root: string): Promise<string | null> {
    const out = await this.runner.run(root, ['branch', '--show-current']);
    const name = out.trim();
    return name === '' ? null : name; // rỗng = detached HEAD hoặc repo trống
  }

  async getLog(root: string, opts: LogOptions = {}): Promise<LogPage> {
    const limit = opts.limit ?? this.logPageSize;
    const args = [
      'log',
      '--date-order',
      `--pretty=format:${LOG_FORMAT}`,
      // Lấy dư 1 commit để biết còn trang sau không mà không cần đếm toàn bộ.
      `--max-count=${limit + 1}`,
    ];
    if (opts.path) {
      args.push('--follow'); // File Log: theo dấu file qua rename (ui-analysis C)
    }
    const refs = typeof opts.ref === 'string' ? [opts.ref] : opts.ref ?? [];
    if (refs.length > 0) {
      args.push(...refs); // lọc theo nhánh/tag đã chọn (sidebar B1 / dropdown History)
    } else if (!opts.path && (opts.all ?? true)) {
      args.push('--all'); // graph nhiều nhánh như SmartGit (ui-analysis B4)
    }
    if (opts.skip) {
      args.push(`--skip=${opts.skip}`);
    }
    if (opts.path) {
      args.push('--', opts.path);
    }

    let commits;
    try {
      commits = parseLog(await this.runner.run(root, args));
    } catch (error) {
      if (isEmptyRepoError(error)) {
        return { commits: [], hasMore: false, headOid: null };
      }
      throw error;
    }

    return {
      commits: commits.slice(0, limit),
      hasMore: commits.length > limit,
      headOid: await this.getHeadOid(root),
    };
  }

  async getStatus(root: string): Promise<StatusResult> {
    const out = await this.runner.run(root, [
      'status',
      '--porcelain=v2',
      '-z',
      '--branch',
      // Liệt kê từng file trong thư mục untracked thay vì gộp 1 dòng thư mục —
      // vùng Changed files cần path đầy đủ từng file (ui-analysis mục F).
      '--untracked-files=all',
    ]);
    return parseStatusV2(out);
  }

  async listRefs(root: string): Promise<RefInfo[]> {
    return parseRefs(await this.runner.run(root, [...FOR_EACH_REF_ARGS]));
  }

  /**
   * Chữ ký toàn bộ refs — cache log chỉ hợp lệ khi CẢ headOid lẫn chữ ký này
   * không đổi (tạo nhánh/tag mới đổi graph dù HEAD đứng yên — architecture.md mục 4).
   */
  async getRefsSignature(root: string): Promise<string> {
    const out = await this.runner.run(root, [...FOR_EACH_REF_ARGS]);
    return createHash('sha1').update(out).digest('hex');
  }

  /** Danh sách file thay đổi của 1 commit (panel B6); -M để phát hiện rename. */
  async getCommitFiles(root: string, oid: string): Promise<CommitFileChange[]> {
    const out = await this.runner.run(root, [
      'show',
      '--format=', // chỉ cần phần name-status, không in header commit
      '--name-status',
      '-z',
      '-M',
      oid,
    ]);
    return parseCommitFiles(out);
  }

  /** Message đầy đủ (subject + body) của 1 commit — panel chi tiết B5. */
  async getCommitBody(root: string, oid: string): Promise<string> {
    const out = await this.runner.run(root, ['show', '--no-patch', '--format=%B', oid]);
    return out.trimEnd();
  }

  /**
   * Danh sách path submodule khai báo trong .gitmodules (1 cấp — đệ quy là P2).
   * Repo không có submodule → git config exit 1 → trả rỗng, không phải lỗi.
   */
  async listSubmodulePaths(root: string): Promise<string[]> {
    try {
      const out = await this.runner.run(root, [
        'config',
        '-z',
        '--file',
        '.gitmodules',
        '--get-regexp',
        '^submodule\\..*\\.path$',
      ]);
      return parseSubmodulePaths(out);
    } catch (error) {
      if (error instanceof GitError) {
        return []; // không có .gitmodules / không match — repo không có submodule
      }
      throw error;
    }
  }

  /** Cây thư mục repo (tracked + untracked, bỏ ignored) — sidebar tab Working Tree. */
  async listFolders(root: string): Promise<string[]> {
    const out = await this.runner.run(root, [
      'ls-files',
      '-z',
      '--cached',
      '--others', // gồm cả file untracked — thư mục mới chưa add vẫn hiện
      '--exclude-standard',
    ]);
    return foldersFromPaths(out.split('\0').filter((p) => p !== ''));
  }

  // ---- thao tác ghi (P1 — thêm dần theo lộ trình, mọi lệnh ghi đều exclusive) ----

  async stage(root: string, paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    // `--` chặn path bắt đầu bằng "-" bị hiểu nhầm thành flag.
    await this.runner.run(root, ['add', '--', ...paths], { exclusive: true });
  }

  async unstage(root: string, paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    await this.runner.run(root, ['restore', '--staged', '--', ...paths], { exclusive: true });
  }

  async commit(root: string, message: string, opts: { amend?: boolean } = {}): Promise<void> {
    const args = ['commit', '--message', message];
    if (opts.amend) {
      args.push('--amend');
    }
    await this.runner.run(root, args, { exclusive: true });
  }

  /**
   * Discard = bỏ thay đổi CHƯA stage: khôi phục working tree từ index
   * (đúng ngữ nghĩa Discard của SmartGit — ui-analysis G: Discard ≠ Remove ≠ Delete).
   * File untracked không bị đụng tới (xoá file thật là hành động Delete riêng, P2).
   */
  async discard(root: string, paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    await this.runner.run(root, ['restore', '--', ...paths], { exclusive: true });
  }

  async checkout(root: string, ref: string): Promise<void> {
    await this.runner.run(root, ['checkout', ref], { exclusive: true });
  }

  /** Add Branch tại 1 commit (context menu E) — không checkout sang nhánh mới. */
  async createBranch(root: string, name: string, startPoint: string): Promise<void> {
    await this.runner.run(root, ['branch', name, startPoint], { exclusive: true });
  }

  /** Add Tag (lightweight) tại 1 commit (context menu E). */
  async createTag(root: string, name: string, oid: string): Promise<void> {
    await this.runner.run(root, ['tag', name, oid], { exclusive: true });
  }

  /** Xoá nhánh AN TOÀN (-d): git tự từ chối nhánh chưa merge / đang checkout. */
  async deleteBranch(root: string, name: string): Promise<void> {
    await this.runner.run(root, ['branch', '-d', '--', name], { exclusive: true });
  }

  async renameBranch(root: string, oldName: string, newName: string): Promise<void> {
    await this.runner.run(root, ['branch', '-m', '--', oldName, newName], { exclusive: true });
  }

  async deleteTag(root: string, name: string): Promise<void> {
    await this.runner.run(root, ['tag', '-d', name], { exclusive: true });
  }

  /** Stage 1 hunk: patch unified diff qua stdin — chức năng đinh của P1 (spec 2.1). */
  async stageHunk(root: string, patch: string): Promise<void> {
    await this.runner.run(root, ['apply', '--cached', '-'], { stdin: patch, exclusive: true });
  }

  /** Unstage 1 hunk: đảo patch đã stage (patch dựng từ diff HEAD↔index). */
  async unstageHunk(root: string, patch: string): Promise<void> {
    await this.runner.run(root, ['apply', '--cached', '--reverse', '-'], {
      stdin: patch,
      exclusive: true,
    });
  }

  /** Revert 1 hunk khỏi WORKING TREE (không đụng index) — patch từ diff index↔working. */
  async revertHunk(root: string, patch: string): Promise<void> {
    await this.runner.run(root, ['apply', '--reverse', '-'], { stdin: patch, exclusive: true });
  }

  // ---- quản lý remote (context menu sidebar tab Git) ----

  /** Remote đã khai báo (tên + URL fetch) — nguồn cho sidebar và dialog Edit Remote. */
  async listRemotes(root: string): Promise<RemoteInfo[]> {
    // `git remote -v` in mỗi remote 2 dòng "<tên>\t<url> (fetch|push)" — chỉ lấy fetch.
    const out = await this.runner.run(root, ['remote', '-v']);
    const remotes: RemoteInfo[] = [];
    for (const line of out.split('\n')) {
      const match = /^(\S+)\t(.*) \(fetch\)$/.exec(line);
      if (match) {
        remotes.push({ name: match[1]!, url: match[2]! });
      }
    }
    return remotes;
  }

  async addRemote(root: string, name: string, url: string): Promise<void> {
    await this.runner.run(root, ['remote', 'add', '--', name, url], { exclusive: true });
  }

  /** Đổi tên (nếu khác) rồi set-url — git tự chặn tên trùng/không hợp lệ. */
  async editRemote(root: string, oldName: string, newName: string, url: string): Promise<void> {
    if (newName !== oldName) {
      await this.runner.run(root, ['remote', 'rename', '--', oldName, newName], {
        exclusive: true,
      });
    }
    await this.runner.run(root, ['remote', 'set-url', '--', newName, url], { exclusive: true });
  }

  // ---- remote (P2): fetch / pull / push — đều exclusive vì có thể đổi refs/working tree ----

  /** Fetch mọi remote, dọn nhánh remote đã xoá (--prune) — nút toolbar Fetch. */
  async fetch(root: string): Promise<void> {
    await this.runner.run(root, ['fetch', '--all', '--prune'], { exclusive: true });
  }

  /**
   * Pull theo config của user (pull.rebase/pull.ff…) — không áp đặt chiến lược.
   * Nhánh phân kỳ mà chưa cấu hình cách hoà: git tự từ chối với hint rõ ràng,
   * UI hiển thị nguyên stderr đó.
   */
  async pull(root: string): Promise<void> {
    await this.runner.run(root, ['pull'], { exclusive: true });
  }

  /**
   * Push nhánh hiện tại. Nhánh chưa có upstream: nếu repo có ĐÚNG 1 remote thì
   * tự `push -u <remote> HEAD` (hành vi của các git GUI); nhiều remote thì giữ
   * nguyên lỗi của git để user tự quyết — không đoán bừa remote.
   */
  async push(root: string): Promise<void> {
    try {
      await this.runner.run(root, ['push'], { exclusive: true });
    } catch (error) {
      if (!(error instanceof GitError) || !error.stderr.includes('no upstream branch')) {
        throw error;
      }
      const remotes = (await this.runner.run(root, ['remote']))
        .split('\n')
        .filter((r) => r !== '');
      if (remotes.length !== 1) {
        throw error;
      }
      await this.runner.run(root, ['push', '--set-upstream', remotes[0]!, 'HEAD'], {
        exclusive: true,
      });
    }
  }

  // ---- merge / rebase (P2 — spec 2.4: conflict dùng chung luồng với banner D2) ----

  /**
   * Merge `target` vào nhánh hiện tại theo chiến lược của dialog D1.
   * Exit ≠ 0 kèm file conflict → trả 'conflicts' (không phải lỗi — user xử lý
   * tiếp trong Working Tree); lỗi khác ném nguyên GitError.
   */
  async merge(root: string, target: string, strategy: MergeStrategy): Promise<MergeResult> {
    const args: Record<MergeStrategy, string[]> = {
      'fast-forward': ['merge', '--ff-only', target],
      'merge-commit': ['merge', '--no-ff', target],
      // "Merge to Working Tree" của SmartGit: hoà vào working tree + index,
      // DỪNG trước commit để user xem lại (ui-analysis D1).
      'merge-to-working-tree': ['merge', '--no-ff', '--no-commit', target],
      squash: ['merge', '--squash', target],
    };
    try {
      const out = await this.runner.run(root, args[strategy], { exclusive: true });
      return {
        status: out.includes('Already up to date') ? 'up-to-date' : 'clean',
        conflictedPaths: [],
      };
    } catch (error) {
      return { status: 'conflicts', conflictedPaths: await this.conflictsOrRethrow(root, error) };
    }
  }

  /** Rebase nhánh hiện tại lên `onto` — conflict xử lý như merge (spec 2.4). */
  async rebase(root: string, onto: string): Promise<MergeResult> {
    try {
      const out = await this.runner.run(root, ['rebase', onto], { exclusive: true });
      return {
        status: out.includes('is up to date') ? 'up-to-date' : 'clean',
        conflictedPaths: [],
      };
    } catch (error) {
      return { status: 'conflicts', conflictedPaths: await this.conflictsOrRethrow(root, error) };
    }
  }

  /** Danh sách file đang conflict (unmerged) trong working tree. */
  async listConflictedPaths(root: string): Promise<string[]> {
    const out = await this.runner.run(root, ['diff', '--name-only', '--diff-filter=U', '-z']);
    return out.split('\0').filter((p) => p !== '');
  }

  /**
   * Merge/rebase exit ≠ 0 có 2 khả năng: conflict (bình thường — trả danh sách
   * file) hoặc lỗi thật (ff-only không ff được, ref sai…) — ném lại nguyên vẹn.
   */
  private async conflictsOrRethrow(root: string, error: unknown): Promise<string[]> {
    if (!(error instanceof GitError)) {
      throw error;
    }
    const conflicted = await this.listConflictedPaths(root);
    if (conflicted.length === 0) {
      throw error;
    }
    return conflicted;
  }

  /** Abort thao tác đang dở — lệnh tuỳ trạng thái (spec 2.4: merge/rebase dùng chung luồng). */
  async abortOperation(root: string, activity: 'merging' | 'rebasing' | 'cherry-picking'): Promise<void> {
    const command = {
      merging: ['merge', '--abort'],
      rebasing: ['rebase', '--abort'],
      'cherry-picking': ['cherry-pick', '--abort'],
    }[activity];
    await this.runner.run(root, command, { exclusive: true });
  }

  /**
   * Continue cho rebase/cherry-pick (đi từng commit — spec 2.4).
   * Merge không có continue: hoàn tất bằng Commit (message đã điền sẵn).
   */
  async continueOperation(root: string, activity: 'rebasing' | 'cherry-picking'): Promise<void> {
    const command = {
      rebasing: ['rebase', '--continue'],
      'cherry-picking': ['cherry-pick', '--continue'],
    }[activity];
    await this.runner.run(root, command, { exclusive: true });
  }
}

/**
 * `git log`/`rev-parse HEAD` trên repo chưa có commit trả lỗi thay vì rỗng.
 * LC_ALL=C trong SpawnGitRunner đảm bảo message ổn định để nhận diện.
 */
function isEmptyRepoError(error: unknown): boolean {
  return (
    error instanceof GitError &&
    (error.stderr.includes('does not have any commits yet') ||
      error.stderr.includes('bad default revision') ||
      error.stderr.includes('unknown revision'))
  );
}
