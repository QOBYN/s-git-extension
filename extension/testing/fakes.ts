// Impl giả của các cổng trong services/interfaces.ts + GitRunner — chỉ dùng trong test.
// Nhờ luật "services chỉ phụ thuộc interface", test không cần mock module hay VSCode API.

import type { GitRunner, GitRunOptions } from '../services/gitRunner';
import { GitError } from '../services/gitRunner';
import type { FileSystemLike, KeyValueStorage } from '../services/interfaces';

export interface RecordedCall {
  cwd: string;
  args: string[];
  opts: GitRunOptions;
}

/**
 * GitRunner giả: handler nhận args và trả stdout (string) hoặc GitError (sẽ bị ném).
 * Mọi lời gọi được ghi lại trong `calls` để assert đúng lệnh, đúng thứ tự.
 */
export class FakeGitRunner implements GitRunner {
  readonly calls: RecordedCall[] = [];

  constructor(private readonly handler: (args: string[], cwd: string) => string | GitError) {}

  async run(cwd: string, args: string[], opts: GitRunOptions = {}): Promise<string> {
    this.calls.push({ cwd, args, opts });
    const result = this.handler(args, cwd);
    if (result instanceof GitError) {
      throw result;
    }
    return result;
  }

  /** Args của lần gọi có phần tử đầu là `command` — tiện assert 1 lệnh cụ thể. */
  callsOf(command: string): RecordedCall[] {
    return this.calls.filter((c) => c.args[0] === command);
  }
}

/** FileSystem giả: khai báo trước file nào tồn tại với nội dung gì. */
export class FakeFileSystem implements FileSystemLike {
  private readonly files = new Map<string, string>();

  set(path: string, content = ''): this {
    this.files.set(path, content);
    return this;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async readFile(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }
}

/** Storage giả trên Map — kèm khả năng tiêm dữ liệu hỏng để test khả năng chịu lỗi. */
export class FakeStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();

  async read(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async write(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}
