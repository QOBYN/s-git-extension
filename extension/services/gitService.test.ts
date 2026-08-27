import { describe, expect, it } from 'vitest';
import { GitError } from './gitRunner';
import { GitService } from './gitService';
import { LOG_FORMAT } from './logParser';
import { FakeGitRunner } from '../testing/fakes';

const F = '\x1f';
const R = '\x1e';

/** Sinh stdout giả của `git log` với n commit oid c1..cn. */
function fakeLogOutput(count: number): string {
  const records: string[] = [];
  for (let i = 1; i <= count; i++) {
    records.push(
      ['c' + i, i < count ? 'c' + (i + 1) : '', 'Alice', 'a@x.com', '2026-08-26T09:00:00+07:00', '', 'msg ' + i].join(F),
    );
  }
  return records.join(`${R}\n`) + R;
}

describe('GitService.getLog', () => {
  it('gửi đúng lệnh: pretty format, --all mặc định, max-count = limit + 1', async () => {
    const runner = new FakeGitRunner((args) =>
      args[0] === 'log' ? fakeLogOutput(2) : 'headoid\n',
    );
    const git = new GitService(runner, { logPageSize: 100 });

    await git.getLog('/repo');

    const logArgs = runner.callsOf('log')[0].args;
    expect(logArgs).toContain(`--pretty=format:${LOG_FORMAT}`);
    expect(logArgs).toContain('--all');
    expect(logArgs).toContain('--max-count=101');
    expect(logArgs).toContain('--date-order');
  });

  it('hasMore=true khi git trả nhiều hơn limit; trang trả về đúng limit commit', async () => {
    const runner = new FakeGitRunner((args) =>
      args[0] === 'log' ? fakeLogOutput(3) : 'headoid\n',
    );
    const git = new GitService(runner);

    const page = await git.getLog('/repo', { limit: 2 });

    expect(page.commits).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.headOid).toBe('headoid');
  });

  it('hasMore=false khi git trả đủ hoặc ít hơn limit', async () => {
    const runner = new FakeGitRunner((args) =>
      args[0] === 'log' ? fakeLogOutput(2) : 'headoid\n',
    );
    const page = await new GitService(runner).getLog('/repo', { limit: 2 });

    expect(page.commits).toHaveLength(2);
    expect(page.hasMore).toBe(false);
  });

  it('skip được truyền thành --skip cho trang "Load more"', async () => {
    const runner = new FakeGitRunner((args) =>
      args[0] === 'log' ? fakeLogOutput(1) : 'headoid\n',
    );
    await new GitService(runner).getLog('/repo', { limit: 10, skip: 20 });

    expect(runner.callsOf('log')[0].args).toContain('--skip=20');
  });

  it('repo trống (git log lỗi "does not have any commits") trả trang rỗng, không ném', async () => {
    const runner = new FakeGitRunner((args) => {
      if (args[0] === 'log') {
        return new GitError('log', 128, "fatal: your current branch 'main' does not have any commits yet");
      }
      return new GitError('rev-parse', 128, 'unknown revision');
    });

    const page = await new GitService(runner).getLog('/repo');

    expect(page).toEqual({ commits: [], hasMore: false, headOid: null });
  });

  it('lỗi git khác (không phải repo trống) được ném nguyên vẹn', async () => {
    const runner = new FakeGitRunner(() => new GitError('log', 128, 'fatal: not a git repository'));
    await expect(new GitService(runner).getLog('/repo')).rejects.toThrow('not a git repository');
  });
});

describe('GitService.getStatus', () => {
  it('dùng porcelain v2, -z, --branch và liệt kê từng file untracked', async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).getStatus('/repo');

    expect(runner.callsOf('status')[0].args).toEqual([
      'status',
      '--porcelain=v2',
      '-z',
      '--branch',
      '--untracked-files=all',
    ]);
  });
});

describe('GitService — thao tác ghi', () => {
  it('stage dùng exclusive và chắn path bằng "--"', async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).stage('/repo', ['a.ts', '-weird-name.ts']);

    const call = runner.callsOf('add')[0];
    expect(call.args).toEqual(['add', '--', 'a.ts', '-weird-name.ts']);
    expect(call.opts.exclusive).toBe(true);
  });

  it('stage/unstage với danh sách rỗng không chạy git', async () => {
    const runner = new FakeGitRunner(() => '');
    const git = new GitService(runner);

    await git.stage('/repo', []);
    await git.unstage('/repo', []);

    expect(runner.calls).toHaveLength(0);
  });

  it('commit --amend chỉ thêm cờ khi được yêu cầu', async () => {
    const runner = new FakeGitRunner(() => '');
    const git = new GitService(runner);

    await git.commit('/repo', 'feat: normal');
    await git.commit('/repo', 'feat: amended', { amend: true });

    const [normal, amended] = runner.callsOf('commit');
    expect(normal.args).toEqual(['commit', '--message', 'feat: normal']);
    expect(amended.args).toContain('--amend');
    expect(normal.opts.exclusive).toBe(true);
  });
});

describe('GitService — log theo file (File Log, ui-analysis C)', () => {
  it('path → --follow, path sau "--", KHÔNG --all (không đi với --follow)', async () => {
    const runner = new FakeGitRunner((args) =>
      args[0] === 'log' ? fakeLogOutput(1) : 'headoid\n',
    );
    await new GitService(runner).getLog('/repo', { path: 'src/app.ts', limit: 10 });

    const args = runner.callsOf('log')[0].args;
    expect(args).toContain('--follow');
    expect(args).not.toContain('--all');
    expect(args.slice(-2)).toEqual(['--', 'src/app.ts']);
  });
});

describe('GitService — stage/unstage theo hunk (P1)', () => {
  it('stageHunk đẩy patch qua stdin, exclusive', async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).stageHunk('/repo', 'PATCH');

    const call = runner.callsOf('apply')[0];
    expect(call.args).toEqual(['apply', '--cached', '-']);
    expect(call.opts.stdin).toBe('PATCH');
    expect(call.opts.exclusive).toBe(true);
  });

  it('unstageHunk dùng --reverse', async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).unstageHunk('/repo', 'PATCH');

    expect(runner.callsOf('apply')[0].args).toEqual(['apply', '--cached', '--reverse', '-']);
  });

  it('revertHunk đảo patch trên working tree, KHÔNG --cached', async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).revertHunk('/repo', 'PATCH');

    const call = runner.callsOf('apply')[0];
    expect(call.args).toEqual(['apply', '--reverse', '-']);
    expect(call.opts.exclusive).toBe(true);
  });
});

describe('GitService — thao tác trạng thái (merge/rebase flow, spec 2.4)', () => {
  it('discard dùng restore từ index, exclusive, chắn path bằng "--"', async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).discard('/repo', ['a.ts']);

    const call = runner.callsOf('restore')[0];
    expect(call.args).toEqual(['restore', '--', 'a.ts']);
    expect(call.opts.exclusive).toBe(true);
  });

  it('abortOperation chọn đúng lệnh theo trạng thái', async () => {
    const runner = new FakeGitRunner(() => '');
    const git = new GitService(runner);

    await git.abortOperation('/repo', 'merging');
    await git.abortOperation('/repo', 'rebasing');
    await git.abortOperation('/repo', 'cherry-picking');

    expect(runner.calls.map((c) => c.args)).toEqual([
      ['merge', '--abort'],
      ['rebase', '--abort'],
      ['cherry-pick', '--abort'],
    ]);
    expect(runner.calls.every((c) => c.opts.exclusive)).toBe(true);
  });

  it('continueOperation chỉ cho rebase/cherry-pick', async () => {
    const runner = new FakeGitRunner(() => '');
    const git = new GitService(runner);

    await git.continueOperation('/repo', 'rebasing');
    await git.continueOperation('/repo', 'cherry-picking');

    expect(runner.calls.map((c) => c.args)).toEqual([
      ['rebase', '--continue'],
      ['cherry-pick', '--continue'],
    ]);
  });
});

describe('GitService — thao tác nhánh/tag từ sidebar', () => {
  it('deleteBranch dùng -d (an toàn) + chắn tên bằng "--"', async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).deleteBranch('/repo', 'feat/x');

    const call = runner.callsOf('branch')[0];
    expect(call.args).toEqual(['branch', '-d', '--', 'feat/x']);
    expect(call.opts.exclusive).toBe(true);
  });

  it('renameBranch dùng -m với đủ tên cũ/mới', async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).renameBranch('/repo', 'old', 'new');

    expect(runner.callsOf('branch')[0].args).toEqual(['branch', '-m', '--', 'old', 'new']);
  });

  it('deleteTag dùng tag -d', async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).deleteTag('/repo', 'v1.0');

    expect(runner.callsOf('tag')[0].args).toEqual(['tag', '-d', 'v1.0']);
  });
});

describe('GitService — quản lý remote (add/edit/list)', () => {
  it('listRemotes parse `remote -v`: chỉ lấy dòng (fetch), giữ URL có khoảng trắng phía trước dấu ngoặc', async () => {
    const runner = new FakeGitRunner(
      () =>
        'origin\thttps://github.com/a/b.git (fetch)\n' +
        'origin\thttps://github.com/a/b.git (push)\n' +
        'backup\tgit@gitlab.com:a/b.git (fetch)\n' +
        'backup\tgit@gitlab.com:a/b.git (push)\n',
    );
    expect(await new GitService(runner).listRemotes('/repo')).toEqual([
      { name: 'origin', url: 'https://github.com/a/b.git' },
      { name: 'backup', url: 'git@gitlab.com:a/b.git' },
    ]);
  });

  it('listRemotes trả rỗng khi repo không có remote', async () => {
    const runner = new FakeGitRunner(() => '\n');
    expect(await new GitService(runner).listRemotes('/repo')).toEqual([]);
  });

  it('addRemote chắn tên bằng "--", exclusive', async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).addRemote('/repo', 'origin', 'https://x/y.git');

    const call = runner.callsOf('remote')[0];
    expect(call.args).toEqual(['remote', 'add', '--', 'origin', 'https://x/y.git']);
    expect(call.opts.exclusive).toBe(true);
  });

  it('editRemote giữ tên: chỉ set-url, không rename', async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).editRemote('/repo', 'origin', 'origin', 'https://new/url.git');

    expect(runner.callsOf('remote').map((c) => c.args)).toEqual([
      ['remote', 'set-url', '--', 'origin', 'https://new/url.git'],
    ]);
  });

  it('editRemote đổi tên: rename trước rồi set-url theo TÊN MỚI', async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).editRemote('/repo', 'origin', 'upstream', 'https://new/url.git');

    expect(runner.callsOf('remote').map((c) => c.args)).toEqual([
      ['remote', 'rename', '--', 'origin', 'upstream'],
      ['remote', 'set-url', '--', 'upstream', 'https://new/url.git'],
    ]);
    expect(runner.callsOf('remote').every((c) => c.opts.exclusive)).toBe(true);
  });
});

describe('GitService — truy vấn phụ', () => {
  it('isRepo trả false khi rev-parse lỗi (thư mục thường)', async () => {
    const runner = new FakeGitRunner(() => new GitError('rev-parse', 128, 'not a git repository'));
    expect(await new GitService(runner).isRepo('/tmp')).toBe(false);
  });

  it('getCurrentBranch trả null khi detached HEAD (output rỗng)', async () => {
    const runner = new FakeGitRunner(() => '\n');
    expect(await new GitService(runner).getCurrentBranch('/repo')).toBeNull();
  });
});

describe('GitService — remote (fetch/pull/push)', () => {
  it('fetch dùng --all --prune, exclusive', async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).fetch('/repo');

    const call = runner.callsOf('fetch')[0];
    expect(call.args).toEqual(['fetch', '--all', '--prune']);
    expect(call.opts.exclusive).toBe(true);
  });

  it('push thành công không gọi thêm lệnh nào', async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).push('/repo');

    expect(runner.calls).toHaveLength(1);
  });

  it('push chưa có upstream + đúng 1 remote → tự push -u <remote> HEAD', async () => {
    const runner = new FakeGitRunner((args) => {
      if (args[0] === 'push' && !args.includes('--set-upstream')) {
        return new GitError('push', 128, 'fatal: The current branch feat has no upstream branch.');
      }
      return args[0] === 'remote' ? 'origin\n' : '';
    });
    await new GitService(runner).push('/repo');

    expect(runner.callsOf('push')[1].args).toEqual(['push', '--set-upstream', 'origin', 'HEAD']);
  });

  it('push chưa có upstream + nhiều remote → giữ nguyên lỗi git (không đoán remote)', async () => {
    const runner = new FakeGitRunner((args) => {
      if (args[0] === 'push') {
        return new GitError('push', 128, 'fatal: The current branch feat has no upstream branch.');
      }
      return 'origin\nupstream\n';
    });
    await expect(new GitService(runner).push('/repo')).rejects.toThrow('no upstream branch');
  });
});

describe('GitService.merge / rebase', () => {
  it('map chiến lược ra đúng cờ git', async () => {
    const runner = new FakeGitRunner(() => '');
    const git = new GitService(runner);
    await git.merge('/repo', 'feat', 'fast-forward');
    await git.merge('/repo', 'feat', 'merge-commit');
    await git.merge('/repo', 'feat', 'merge-to-working-tree');
    await git.merge('/repo', 'feat', 'squash');

    expect(runner.callsOf('merge').map((c) => c.args)).toEqual([
      ['merge', '--ff-only', 'feat'],
      ['merge', '--no-ff', 'feat'],
      ['merge', '--no-ff', '--no-commit', 'feat'],
      ['merge', '--squash', 'feat'],
    ]);
    expect(runner.callsOf('merge').every((c) => c.opts.exclusive)).toBe(true);
  });

  it('"Already up to date" → status up-to-date', async () => {
    const runner = new FakeGitRunner(() => 'Already up to date.\n');
    const result = await new GitService(runner).merge('/repo', 'feat', 'merge-commit');
    expect(result.status).toBe('up-to-date');
  });

  it('exit ≠ 0 kèm file unmerged → status conflicts + danh sách path', async () => {
    const runner = new FakeGitRunner((args) => {
      if (args[0] === 'merge') {
        return new GitError('merge', 1, 'Automatic merge failed; fix conflicts.');
      }
      return 'a.ts\0dir/b.ts\0'; // diff --diff-filter=U
    });
    const result = await new GitService(runner).merge('/repo', 'feat', 'merge-commit');
    expect(result).toEqual({ status: 'conflicts', conflictedPaths: ['a.ts', 'dir/b.ts'] });
  });

  it('exit ≠ 0 KHÔNG có file unmerged (vd ff-only thất bại) → ném nguyên GitError', async () => {
    const runner = new FakeGitRunner((args) => {
      if (args[0] === 'merge') {
        return new GitError('merge', 128, 'fatal: Not possible to fast-forward, aborting.');
      }
      return ''; // không có conflict
    });
    await expect(
      new GitService(runner).merge('/repo', 'feat', 'fast-forward'),
    ).rejects.toThrow('Not possible to fast-forward');
  });

  it('rebase conflict cũng trả conflicts như merge (spec 2.4)', async () => {
    const runner = new FakeGitRunner((args) => {
      if (args[0] === 'rebase') {
        return new GitError('rebase', 1, 'CONFLICT: could not apply abc123');
      }
      return 'x.ts\0';
    });
    const result = await new GitService(runner).rebase('/repo', 'main');
    expect(result).toEqual({ status: 'conflicts', conflictedPaths: ['x.ts'] });
  });
});
