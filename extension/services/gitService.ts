// Facade mọi thao tác git. Mỗi method = gọi GitRunner + parser tương ứng.
// KHÔNG import 'vscode'; KHÔNG tự spawn process; KHÔNG hardcode giá trị chỉnh được —
// nhận qua GitServiceOptions (adapter sẽ nối với VSCode settings).

import { createHash } from 'node:crypto';
import { DEFAULT_LOG_PAGE_SIZE } from '../../shared/constants';
import type { CommitFileChange, LogOptions, LogPage, RefInfo } from '../../shared/types';
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
    if (opts.ref) {
      args.push(opts.ref); // lọc theo 1 nhánh/tag (click nhánh ở sidebar B1)
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
