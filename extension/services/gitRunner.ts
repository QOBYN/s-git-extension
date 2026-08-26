// Cổng duy nhất để chạy lệnh git. Mọi service khác KHÔNG được tự spawn process.

import { spawn } from 'node:child_process';
import { DEFAULT_GIT_MAX_OUTPUT_BYTES } from '../../shared/constants';
import type { GitErrorInfo } from '../../shared/types';
import { KeyedMutex } from '../core/async';

export interface GitRunOptions {
  /**
   * Lệnh GHI (commit, merge, checkout…) đặt exclusive=true: serialize theo repo
   * để 2 lệnh ghi không giẫm lock của nhau. Lệnh đọc để mặc định —
   * chạy song song với nhau nhưng vẫn chờ lệnh ghi đang dở.
   */
  exclusive?: boolean;
  /** Ghi vào stdin (vd: patch cho `git apply --cached`). */
  stdin?: string;
  /** Chặn output quá lớn; mặc định DEFAULT_GIT_MAX_OUTPUT_BYTES. */
  maxOutputBytes?: number;
  /** 'base64' cho output nhị phân (git show file ảnh…); mặc định utf8. */
  encoding?: 'utf8' | 'base64';
}

export interface GitRunner {
  run(cwd: string, args: string[], opts?: GitRunOptions): Promise<string>;
}

/** Lỗi git có cấu trúc — giữ nguyên stderr để UI hiển thị đúng thông điệp của git. */
export class GitError extends Error {
  constructor(
    readonly command: string,
    readonly code: number,
    readonly stderr: string,
  ) {
    super(`git ${command} (exit ${code}): ${stderr.trim()}`);
    this.name = 'GitError';
  }

  /** Dạng serializable để gửi qua RPC (shared/types.GitErrorInfo). */
  toInfo(): GitErrorInfo {
    return { command: this.command, code: this.code, stderr: this.stderr };
  }
}

export interface SpawnGitRunnerOptions {
  /** Đường dẫn binary git — nối vào setting `smartgit.git.path` ở tầng adapter. */
  gitPath?: string;
  maxOutputBytes?: number;
}

export class SpawnGitRunner implements GitRunner {
  private readonly mutex = new KeyedMutex();
  private readonly gitPath: string;
  private readonly maxOutputBytes: number;

  constructor(options: SpawnGitRunnerOptions = {}) {
    this.gitPath = options.gitPath ?? 'git';
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_GIT_MAX_OUTPUT_BYTES;
  }

  async run(cwd: string, args: string[], opts: GitRunOptions = {}): Promise<string> {
    if (opts.exclusive) {
      return this.mutex.runExclusive(cwd, () => this.spawnGit(cwd, args, opts));
    }
    // Lệnh đọc: chờ lệnh ghi đang dở của repo này xong để thấy trạng thái mới nhất,
    // nhưng không xếp hàng lẫn nhau.
    await this.mutex.pending(cwd);
    return this.spawnGit(cwd, args, opts);
  }

  private spawnGit(cwd: string, args: string[], opts: GitRunOptions): Promise<string> {
    const maxBytes = opts.maxOutputBytes ?? this.maxOutputBytes;
    return new Promise<string>((resolve, reject) => {
      const child = spawn(this.gitPath, args, {
        cwd,
        env: {
          ...process.env,
          // Không giữ optional lock — tránh chặn git của user chạy song song ngoài terminal.
          GIT_OPTIONAL_LOCKS: '0',
          // Thông điệp lỗi tiếng Anh ổn định để phát hiện các case như "empty repository".
          LC_ALL: 'C',
          // Lệnh cần editor (rebase --continue…) không được treo chờ editor:
          // 'true' = chấp nhận message mặc định.
          GIT_EDITOR: 'true',
          // Lệnh network (fetch/pull/push) không được treo chờ nhập credentials
          // trong process nền — fail ngay với thông điệp rõ (user dùng ssh-agent/
          // credential helper như các git GUI khác).
          GIT_TERMINAL_PROMPT: '0',
        },
      });

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputSize = 0;
      let settled = false;

      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          child.kill();
          reject(error);
        }
      };

      child.stdout.on('data', (chunk: Buffer) => {
        outputSize += chunk.length;
        if (outputSize > maxBytes) {
          fail(new GitError(args.join(' '), -1, `output exceeded ${maxBytes} bytes`));
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.on('error', fail); // spawn thất bại (không tìm thấy git…)
      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        if (code === 0) {
          resolve(Buffer.concat(stdout).toString(opts.encoding ?? 'utf8'));
        } else {
          reject(new GitError(args.join(' '), code ?? -1, Buffer.concat(stderr).toString('utf8')));
        }
      });

      child.stdin.end(opts.stdin ?? '');
    });
  }
}
