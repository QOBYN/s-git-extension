import { describe, expect, it } from 'vitest';
import { formatError, isDirtyWorkingTreeError } from './errors';

describe('isDirtyWorkingTreeError — nhận diện git từ chối vì working tree bẩn', () => {
  it('bắt được các câu từ chối thật của git (LC_ALL=C)', () => {
    const refusals = [
      // pull --rebase (case của user)
      'git pull --rebase (exit 128): error: cannot pull with rebase: You have unstaged changes.\nerror: Please commit or stash them.',
      // merge
      "error: Your local changes to the following files would be overwritten by merge:\n\tsrc/app.ts\nPlease commit your changes or stash them before you merge.",
      // checkout
      "error: Your local changes to the following files would be overwritten by checkout:\n\tsrc/app.ts\nPlease commit your changes or stash them before you switch branches.",
      // rebase với thay đổi đã stage
      'error: cannot rebase: Your index contains uncommitted changes.',
    ];
    for (const message of refusals) {
      expect(isDirtyWorkingTreeError(message), message).toBe(true);
    }
  });

  it('KHÔNG bắt nhầm lỗi khác (conflict giữa chừng, push bị reject…)', () => {
    const others = [
      'CONFLICT (content): Merge conflict in src/app.ts\nAutomatic merge failed; fix conflicts and then commit the result.',
      "error: failed to push some refs to 'origin'\nhint: Updates were rejected because the remote contains work that you do not have locally.",
      'fatal: not a git repository',
      "error: pathspec 'nosuchbranch' did not match any file(s) known to git",
    ];
    for (const message of others) {
      expect(isDirtyWorkingTreeError(message), message).toBe(false);
    }
  });
});

describe('formatError', () => {
  it('đọc message từ wire error (object thuần qua birpc), fallback String()', () => {
    expect(formatError({ message: 'git checkout (exit 1): boom' })).toBe(
      'git checkout (exit 1): boom',
    );
    expect(formatError('plain string')).toBe('plain string');
  });
});
