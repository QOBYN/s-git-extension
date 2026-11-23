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

  it('ref là 1 chuỗi hoặc mảng nhiều ref — truyền hết vào args, không kèm --all', async () => {
    const runner = new FakeGitRunner((args) =>
      args[0] === 'log' ? fakeLogOutput(1) : 'headoid\n',
    );
    const git = new GitService(runner);

    await git.getLog('/repo', { ref: 'main' });
    await git.getLog('/repo', { ref: ['main', 'origin/dev', 'v1.0'] });

    const [single, multi] = runner.callsOf('log').map((c) => c.args);
    expect(single).toContain('main');
    expect(single).not.toContain('--all');
    expect(multi).toEqual(expect.arrayContaining(['main', 'origin/dev', 'v1.0']));
    expect(multi).not.toContain('--all');
  });

  it('ref mảng rỗng coi như không lọc — vẫn --all', async () => {
    const runner = new FakeGitRunner((args) =>
      args[0] === 'log' ? fakeLogOutput(1) : 'headoid\n',
    );
    await new GitService(runner).getLog('/repo', { ref: [] });

    expect(runner.callsOf('log')[0].args).toContain('--all');
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

  it("scope 'ignored' thêm --ignored=matching (gộp thư mục ignore thành 1 dòng)", async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).getStatus('/repo', 'ignored');

    expect(runner.callsOf('status')[0].args).toContain('--ignored=matching');
  });

  it("scope 'all' ghép thêm file tracked KHÔNG đổi từ ls-files (không trùng file đã có)", async () => {
    const runner = new FakeGitRunner((args) => {
      if (args[0] === 'status') {
        return '1 .M N... 100644 100644 100644 h1 h2 changed.ts\0';
      }
      if (args[0] === 'ls-files') {
        return 'changed.ts\0plain.ts\0';
      }
      return '';
    });

    const result = await new GitService(runner).getStatus('/repo', 'all');

    expect(result.files.map((f) => f.path)).toEqual(['changed.ts', 'plain.ts']);
    expect(result.files[1]).toMatchObject({ staged: null, unstaged: null, untracked: false });
  });

  it("scope 'changes' (mặc định) KHÔNG gọi ls-files", async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).getStatus('/repo');

    expect(runner.callsOf('ls-files')).toEqual([]);
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

  it('suggestBranchName: ưu tiên nhánh remote gần nhất, fallback nhánh local, không có → null', async () => {
    const byRefs = (args: string[]) => args.find((a) => a.startsWith('--refs='));
    const remoteOnly = new FakeGitRunner((args) =>
      byRefs(args) === '--refs=refs/remotes/*' ? 'remotes/origin/main~1\n' : 'main\n',
    );
    expect(await new GitService(remoteOnly).suggestBranchName('/repo', 'abc')).toBe('main');
    expect(remoteOnly.callsOf('name-rev')).toHaveLength(1); // trúng remote thì không hỏi local
    expect(remoteOnly.callsOf('name-rev')[0].args).toContain('--exclude=refs/remotes/*/HEAD');

    const localOnly = new FakeGitRunner((args) =>
      byRefs(args) === '--refs=refs/remotes/*' ? 'undefined\n' : 'dev~2\n',
    );
    expect(await new GitService(localOnly).suggestBranchName('/repo', 'abc')).toBe('dev');

    const none = new FakeGitRunner(() => 'undefined\n');
    expect(await new GitService(none).suggestBranchName('/repo', 'abc')).toBeNull();
  });

  it('checkout: --force chỉ thêm khi popup chọn discard', async () => {
    const runner = new FakeGitRunner(() => '');
    const git = new GitService(runner);

    await git.checkout('/repo', 'main');
    await git.checkout('/repo', 'main', { force: true });

    const [plain, forced] = runner.callsOf('checkout');
    expect(plain.args).toEqual(['checkout', 'main']);
    expect(forced.args).toEqual(['checkout', '--force', 'main']);
    expect(plain.opts.exclusive).toBe(true);
    // Repo không có submodule (config trả rỗng) → không chạy submodule update.
    expect(runner.callsOf('submodule')).toHaveLength(0);
  });

  it('checkout opts null (webview không truyền, postMessage JSON hoá undefined → null) không crash', async () => {
    const runner = new FakeGitRunner((args) => {
      if (args[0] === 'config') {
        return 'submodule.libsub.path\nlibsub\0'; // repo có submodule — nhánh đọc opts.force
      }
      return '';
    });
    const git = new GitService(runner);

    await git.checkout('/repo', 'main', null);

    expect(runner.callsOf('checkout')[0].args).toEqual(['checkout', 'main']);
    expect(runner.callsOf('submodule')[0].args).toEqual(['submodule', 'update', '--init']);
  });

  it('pull/push/stashPush nhận null như không truyền (cùng lý do JSON hoá)', async () => {
    const runner = new FakeGitRunner(() => '');
    const git = new GitService(runner);

    await git.pull('/repo', null);
    await git.push('/repo', null);
    await git.stashPush('/repo', null);

    expect(runner.callsOf('pull')[0].args).toEqual(['pull']);
    expect(runner.callsOf('push')[0].args).toEqual(['push']);
    expect(runner.callsOf('stash')[0].args).toEqual(['stash', 'push', '--include-untracked']);
  });

  it('checkout newBranch: tạo nhánh mới tại ref bằng -b (popup Checkout "Nhánh mới")', async () => {
    const runner = new FakeGitRunner(() => '');
    const git = new GitService(runner);

    await git.checkout('/repo', 'abc1234', { newBranch: 'feature/x' });
    await git.checkout('/repo', 'abc1234', { force: true, newBranch: 'feature/y' });

    const [plain, forced] = runner.callsOf('checkout');
    expect(plain.args).toEqual(['checkout', '-b', 'feature/x', 'abc1234']);
    expect(forced.args).toEqual(['checkout', '--force', '-b', 'feature/y', 'abc1234']);
  });

  describe('checkoutStashReapply (popup Checkout: Stash & re-apply, có submodule)', () => {
    const GITMODULES = 'submodule.shared.path\n4x-shared\0submodule.other.path\nlibs/other\0';
    const H = '160000 160000 160000 ' + 'a'.repeat(40) + ' ' + 'a'.repeat(40);
    const SAVED = 'Saved working directory and index state';

    it('submodule dirty (không lệch): stash bên trong repo con → checkout → update → pop cha rồi pop con', async () => {
      const runner = new FakeGitRunner((args) => {
        if (args[0] === 'config') return GITMODULES;
        if (args[0] === 'status') return `1 .M S.M. ${H} 4x-shared\0`;
        if (args[0] === 'stash' && args[1] === 'push') return SAVED;
        return '';
      });
      const git = new GitService(runner);

      const result = await git.checkoutStashReapply('/repo', 'feature', undefined, 'msg');

      expect(result).toEqual({ warnings: [] });
      const steps = runner.calls
        .filter((c) => ['stash', 'checkout', 'submodule'].includes(c.args[0]))
        .map((c) => `${c.cwd} ${c.args.join(' ')}`);
      expect(steps).toEqual([
        '/repo stash push --include-untracked -m msg',
        '/repo/4x-shared stash push --include-untracked -m msg',
        '/repo checkout feature',
        // libs/other không lệch con trỏ → cũng theo nhánh mới; không --force.
        '/repo submodule update --init -- 4x-shared libs/other',
        '/repo stash pop',
        '/repo/4x-shared stash pop',
      ]);
    });

    it('submodule lệch con trỏ, không dirty: không stash trong con, không update nó — giữ chỗ đứng', async () => {
      const runner = new FakeGitRunner((args) => {
        if (args[0] === 'config') return GITMODULES;
        if (args[0] === 'status') return `1 .M SC.. ${H} 4x-shared\0`;
        // repo cha không có gì cất được (stash không cất gitlink).
        if (args[0] === 'stash' && args[1] === 'push') return 'No local changes to save';
        return '';
      });
      const git = new GitService(runner);

      await git.checkoutStashReapply('/repo', 'feature', { newBranch: 'nb' });

      expect(runner.callsOf('checkout')[0].args).toEqual(['checkout', '-b', 'nb', 'feature']);
      expect(runner.callsOf('submodule')[0].args).toEqual([
        'submodule', 'update', '--init', '--', 'libs/other',
      ]);
      expect(runner.callsOf('stash').map((c) => c.args[1])).toEqual(['push']); // không pop
    });

    it('checkout hỏng → pop lại cha và từng submodule đã stash, rồi ném lỗi gốc', async () => {
      const runner = new FakeGitRunner((args) => {
        if (args[0] === 'config') return GITMODULES;
        if (args[0] === 'status') return `1 .M S..U ${H} 4x-shared\0`;
        if (args[0] === 'stash' && args[1] === 'push') return SAVED;
        if (args[0] === 'checkout') return new GitError('checkout', 1, 'pathspec did not match');
        return '';
      });
      const git = new GitService(runner);

      await expect(git.checkoutStashReapply('/repo', 'nope')).rejects.toThrow('pathspec');

      const pops = runner.callsOf('stash').filter((c) => c.args[1] === 'pop').map((c) => c.cwd);
      expect(pops).toEqual(['/repo', '/repo/4x-shared']);
      expect(runner.callsOf('submodule')).toHaveLength(0);
    });

    it('stash pop trong submodule conflict → checkout vẫn xong, trả warning kèm path', async () => {
      const runner = new FakeGitRunner((args, cwd) => {
        if (args[0] === 'config') return GITMODULES;
        if (args[0] === 'status') return `1 .M S.M. ${H} 4x-shared\0`;
        if (args[0] === 'stash' && args[1] === 'push') return SAVED;
        if (args[0] === 'stash' && args[1] === 'pop' && cwd === '/repo/4x-shared') {
          return new GitError('stash pop', 1, 'CONFLICT (content): f');
        }
        return '';
      });
      const git = new GitService(runner);

      const result = await git.checkoutStashReapply('/repo', 'feature');

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].path).toBe('4x-shared');
      expect(result.warnings[0].message).toContain('CONFLICT');
    });

    it('repo không submodule: stash → checkout → pop, không gọi status/submodule', async () => {
      const runner = new FakeGitRunner((args) =>
        args[0] === 'stash' && args[1] === 'push' ? SAVED : '',
      );
      const git = new GitService(runner);

      await git.checkoutStashReapply('/repo', 'main');

      expect(runner.callsOf('status')).toHaveLength(0);
      expect(runner.callsOf('submodule')).toHaveLength(0);
      expect(runner.callsOf('stash').map((c) => c.args[1])).toEqual(['push', 'pop']);
    });
  });

  it('checkout repo có submodule + sạch → submodule update --init SAU checkout', async () => {
    const runner = new FakeGitRunner((args) => {
      if (args[0] === 'config') {
        return 'submodule.libsub.path\nlibsub\0'; // repo có 1 submodule
      }
      return ''; // status sạch, checkout OK
    });

    await new GitService(runner).checkout('/repo', 'main');

    const update = runner.callsOf('submodule')[0];
    expect(update.args).toEqual(['submodule', 'update', '--init']);
    expect(update.opts.exclusive).toBe(true);
    // update phải chạy SAU checkout (đồng bộ theo con trỏ của commit mới).
    const order = runner.calls.map((c) => c.args[0]);
    expect(order.indexOf('checkout')).toBeLessThan(order.indexOf('submodule'));
  });

  it('checkout thường KHÔNG update khi submodule đang có thay đổi local (giữ cho user)', async () => {
    const runner = new FakeGitRunner((args) => {
      if (args[0] === 'config') {
        return 'submodule.libsub.path\nlibsub\0';
      }
      if (args[0] === 'status') {
        return '1 .M SC.. 160000 160000 160000 aaa bbb libsub\0'; // con trỏ lệch
      }
      return '';
    });

    await new GitService(runner).checkout('/repo', 'main');

    expect(runner.callsOf('submodule')).toHaveLength(0);
  });

  it('checkout --force (Discard) → submodule update --init --force, bỏ qua check status', async () => {
    const runner = new FakeGitRunner((args) => {
      if (args[0] === 'config') {
        return 'submodule.libsub.path\nlibsub\0';
      }
      return '';
    });

    await new GitService(runner).checkout('/repo', 'main', { force: true });

    expect(runner.callsOf('status')).toHaveLength(0); // force không cần biết trạng thái
    expect(runner.callsOf('submodule')[0].args).toEqual([
      'submodule',
      'update',
      '--init',
      '--force',
    ]);
  });

  it('stashPush gồm untracked (-u) + message; stashPop là stash pop — đều exclusive', async () => {
    const runner = new FakeGitRunner(() => 'Saved working directory and index state');
    const git = new GitService(runner);

    const stashed = await git.stashPush('/repo', 'auto-stash');
    await git.stashPop('/repo');

    expect(stashed).toBe(true);
    const [push, pop] = runner.callsOf('stash');
    expect(push.args).toEqual(['stash', 'push', '--include-untracked', '-m', 'auto-stash']);
    expect(pop.args).toEqual(['stash', 'pop']);
    expect(push.opts.exclusive).toBe(true);
    expect(pop.opts.exclusive).toBe(true);
  });

  it('stashPush trả false khi git không cất được gì (vd chỉ đổi con trỏ submodule)', async () => {
    const runner = new FakeGitRunner(() => 'No local changes to save\n');

    const stashed = await new GitService(runner).stashPush('/repo');

    expect(stashed).toBe(false);
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

  it('discard path submodule: dùng submodule update --force (restore không đụng gitlink)', async () => {
    const runner = new FakeGitRunner((args) =>
      args[0] === 'config' ? 'submodule.shared.path\n4x-shared\0' : '',
    );
    await new GitService(runner).discard('/repo', ['4x-shared', 'a.ts']);

    expect(runner.callsOf('restore')[0].args).toEqual(['restore', '--', 'a.ts']);
    const sub = runner.callsOf('submodule')[0];
    expect(sub.args).toEqual(['submodule', 'update', '--init', '--force', '--', '4x-shared']);
    expect(sub.opts.exclusive).toBe(true);
  });

  it('discard chỉ submodule: không gọi restore với danh sách rỗng', async () => {
    const runner = new FakeGitRunner((args) =>
      args[0] === 'config' ? 'submodule.shared.path\n4x-shared\0' : '',
    );
    await new GitService(runner).discard('/repo', ['4x-shared']);

    expect(runner.callsOf('restore')).toHaveLength(0);
    expect(runner.callsOf('submodule')).toHaveLength(1);
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

  it('deleteBranch force=true chuyển sang -D (sau khi user xác nhận popup)', async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).deleteBranch('/repo', 'feat/x', true);

    expect(runner.callsOf('branch')[0].args).toEqual(['branch', '-D', '--', 'feat/x']);
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

  it('pull map mode ra đúng cờ; không mode thì pull trần (theo config user)', async () => {
    const runner = new FakeGitRunner(() => '');
    const git = new GitService(runner);
    await git.pull('/repo');
    await git.pull('/repo', 'merge');
    await git.pull('/repo', 'rebase');
    await git.pull('/repo', 'ff-only');

    expect(runner.callsOf('pull').map((c) => c.args)).toEqual([
      ['pull'],
      ['pull', '--no-rebase'],
      ['pull', '--rebase'],
      ['pull', '--ff-only'],
    ]);
  });

  it('push to: đẩy HEAD lên refs/heads/<branch> của remote chỉ định, exclusive', async () => {
    const runner = new FakeGitRunner(() => '');
    await new GitService(runner).push('/repo', { remote: 'origin', branch: 'feat-x' });

    const call = runner.callsOf('push')[0];
    expect(call.args).toEqual(['push', '--', 'origin', 'HEAD:refs/heads/feat-x']);
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

  it('reset map mode ra đúng cờ --soft/--mixed/--hard, exclusive', async () => {
    const runner = new FakeGitRunner(() => '');
    const git = new GitService(runner);
    await git.reset('/repo', 'abc1234', 'soft');
    await git.reset('/repo', 'abc1234', 'mixed');
    await git.reset('/repo', 'abc1234', 'hard');

    expect(runner.callsOf('reset').map((c) => c.args)).toEqual([
      ['reset', '--soft', 'abc1234'],
      ['reset', '--mixed', 'abc1234'],
      ['reset', '--hard', 'abc1234'],
    ]);
    expect(runner.callsOf('reset').every((c) => c.opts.exclusive)).toBe(true);
  });
});

describe('GitService.getSubmoduleDiff', () => {
  const OLD = 'a'.repeat(40);
  const NEW = 'b'.repeat(40);

  /** 1 record log giả theo LOG_FORMAT của repo con. */
  const rec = (oid: string, subject: string, refs = ''): string =>
    [oid, '', 'Alice', 'a@x.com', '2026-08-26T09:00:00+07:00', refs, subject].join(F) + R;

  it('workingTree: con trỏ index ↔ con trỏ checkout thật + dirty + preview old..new', async () => {
    const runner = new FakeGitRunner((args) => {
      switch (args[0]) {
        case 'ls-files':
          return `160000 ${OLD} 0\tlibs/child\0`;
        case 'submodule':
          return `+${NEW} libs/child (heads/dev)\n`;
        case 'status':
          // Con trỏ lệch (c=C) + nội dung bên trong dirty (m=M).
          return `1 .M SCM. 160000 160000 160000 ${OLD} ${OLD} libs/child\0`;
        case 'log':
          if (args.at(-1) === `${OLD}..${NEW}`) {
            return rec('c2', 'feat: two') + '\n' + rec('c1', 'feat: one');
          }
          if (args.at(-1) === `${NEW}..${OLD}`) {
            return '';
          }
          // --max-count=1 <oid>: chi tiết commit từng phía.
          return args.at(-1) === OLD ? rec(OLD, 'old tip', 'tag: v1') : rec(NEW, 'new tip');
        default:
          return '';
      }
    });

    const info = await new GitService(runner).getSubmoduleDiff('/repo', {
      kind: 'workingTree',
      path: 'libs/child',
    });

    expect(info).not.toBeNull();
    expect(info!.oldOid).toBe(OLD);
    expect(info!.newOid).toBe(NEW);
    expect(info!.dirty).toBe(true);
    expect(info!.oldCommit).toMatchObject({ subject: 'old tip', refs: ['tag: v1'] });
    expect(info!.newCommit).toMatchObject({ subject: 'new tip' });
    expect(info!.ahead.map((c) => c.oid)).toEqual(['c2', 'c1']);
    expect(info!.behind).toEqual([]);
    expect(info!.aheadTruncated).toBe(false);
    // Lệnh đọc repo con phải chạy TRONG thư mục submodule.
    expect(runner.callsOf('log').every((c) => c.cwd === '/repo/libs/child')).toBe(true);
  });

  it('gitlink CONFLICT (index chỉ có stage 1/2/3): so OURS ↔ THEIRS + merge-base', async () => {
    const BASE = 'c'.repeat(40);
    const runner = new FakeGitRunner((args) => {
      switch (args[0]) {
        case 'ls-files':
          return (
            `160000 ${BASE} 1\tlibs/child\0` +
            `160000 ${OLD} 2\tlibs/child\0` +
            `160000 ${NEW} 3\tlibs/child\0`
          );
        case 'merge-base':
          return `${BASE}\n`;
        case 'log':
          if (args.at(-1) === `${OLD}..${NEW}`) {
            return rec('t1', 'theirs moved');
          }
          if (args.at(-1) === `${NEW}..${OLD}`) {
            return rec('o1', 'ours moved');
          }
          return rec('tip', 'tip');
        default:
          return '';
      }
    });

    const info = await new GitService(runner).getSubmoduleDiff('/repo', {
      kind: 'workingTree',
      path: 'libs/child',
    });

    expect(info).toMatchObject({ oldOid: OLD, newOid: NEW, baseOid: BASE });
    expect(info!.ahead.map((c) => c.oid)).toEqual(['t1']);
    expect(info!.behind.map((c) => c.oid)).toEqual(['o1']);
  });

  it('commit: đọc gitlink từ tree của oid^ và oid qua ls-tree', async () => {
    const runner = new FakeGitRunner((args) => {
      if (args[0] === 'ls-tree') {
        // args: ['ls-tree', '-z', <rev>, '--', <path>]
        const sha = args[2] === 'deadbeef^' ? OLD : NEW;
        return `160000 commit ${sha}\tlibs/child\0`;
      }
      if (args[0] === 'log') {
        if (args.at(-1) === `${OLD}..${NEW}`) {
          return rec('c1', 'between');
        }
        return args.at(-1) === `${NEW}..${OLD}` ? '' : rec('x', 'tip');
      }
      return '';
    });

    const info = await new GitService(runner).getSubmoduleDiff('/repo', {
      kind: 'commit',
      oid: 'deadbeef',
      path: 'libs/child',
    });

    expect(info).toMatchObject({ oldOid: OLD, newOid: NEW, dirty: false });
    expect(info!.ahead.map((c) => c.oid)).toEqual(['c1']);
    expect(runner.callsOf('ls-tree').map((c) => c.args[2])).toEqual(['deadbeef^', 'deadbeef']);
  });

  it('2 con trỏ PHÂN KỲ: trả merge-base làm gốc chung; fast-forward thì base null', async () => {
    const BASE = 'c'.repeat(40);
    const makeRunner = (mergeBase: string, behindLog: string) =>
      new FakeGitRunner((args) => {
        switch (args[0]) {
          case 'ls-files':
            return `160000 ${OLD} 0\tlibs/child\0`;
          case 'submodule':
            return ` ${NEW} libs/child (heads/main)\n`;
          case 'merge-base':
            return `${mergeBase}\n`;
          case 'log':
            if (args.at(-1) === `${OLD}..${NEW}`) {
              return rec('a1', 'ours');
            }
            if (args.at(-1) === `${NEW}..${OLD}`) {
              return behindLog;
            }
            return rec('tip', 'tip');
          default:
            return '';
        }
      });

    const diverged = await new GitService(makeRunner(BASE, rec('r1', 'theirs'))).getSubmoduleDiff(
      '/repo',
      { kind: 'workingTree', path: 'libs/child' },
    );
    expect(diverged).toMatchObject({ baseOid: BASE });
    expect(diverged!.behind.map((c) => c.oid)).toEqual(['r1']);

    // Fast-forward: merge-base chính là OLD → không có gốc riêng (view neo bằng OLD).
    const ff = await new GitService(makeRunner(OLD, '')).getSubmoduleDiff('/repo', {
      kind: 'workingTree',
      path: 'libs/child',
    });
    expect(ff).toMatchObject({ baseOid: null, baseCommit: null });
  });

  it('path KHÔNG phải gitlink trả null — caller ném lại lỗi gốc của git show', async () => {
    const runner = new FakeGitRunner((args) => {
      if (args[0] === 'ls-files') {
        return `100644 ${OLD} 0\tsrc/normal.ts\0`; // blob thường
      }
      if (args[0] === 'submodule') {
        return new GitError('submodule status', 1, 'not a submodule');
      }
      return '';
    });

    const info = await new GitService(runner).getSubmoduleDiff('/repo', {
      kind: 'workingTree',
      path: 'src/normal.ts',
    });

    expect(info).toBeNull();
  });

  it('repo git LỒNG untracked (add mới 1 git): nhận diện qua --show-prefix, trả trạng thái added', async () => {
    const runner = new FakeGitRunner((args, cwd) => {
      switch (args[0]) {
        case 'ls-files':
          return ''; // untracked — chưa có trong index
        case 'submodule':
          return new GitError('submodule status', 128, 'no submodule mapping found');
        case 'status':
          // Parent (porcelain=v2) không có record S; repo con (porcelain) có 1 file dirty.
          return args[1] === '--porcelain=v2' ? '' : 'M x.ts\0';
        case 'rev-parse':
          return args[1] === '--show-prefix' ? '\n' : `${NEW}\n`;
        case 'log':
          expect(cwd).toBe('/repo/libs/child');
          return rec('n2', 'second') + '\n' + rec('n1', 'first');
        default:
          return '';
      }
    });

    const info = await new GitService(runner).getSubmoduleDiff('/repo', {
      kind: 'workingTree',
      path: 'libs/child',
    });

    expect(info).toMatchObject({ oldOid: null, newOid: NEW, dirty: true });
    expect(info!.ahead.map((c) => c.oid)).toEqual(['n2', 'n1']); // "sẽ mang vào những commit nào"
  });

  it('thư mục thường (git leo lên repo cha, --show-prefix khác rỗng) KHÔNG bị nhận nhầm', async () => {
    const runner = new FakeGitRunner((args) => {
      switch (args[0]) {
        case 'ls-files':
          return '';
        case 'submodule':
          return new GitError('submodule status', 128, 'no submodule mapping found');
        case 'rev-parse':
          return args[1] === '--show-prefix' ? 'libs/plain-dir/\n' : 'SHOULD-NOT-BE-USED\n';
        default:
          return '';
      }
    });

    const info = await new GitService(runner).getSubmoduleDiff('/repo', {
      kind: 'workingTree',
      path: 'libs/plain-dir',
    });

    expect(info).toBeNull();
  });

  it('getSubmoduleLog: phân trang bằng --skip trong repo con, dư 1 commit → hasMore', async () => {
    const runner = new FakeGitRunner((args, cwd) => {
      expect(cwd).toBe('/repo/libs/child');
      expect(args).toContain('--skip=20');
      expect(args).toContain('--max-count=51');
      // Trả 51 record → trang 50 + hasMore.
      return Array.from({ length: 51 }, (_, i) => rec(`c${i}`, `msg ${i}`)).join('\n');
    });

    const page = await new GitService(runner).getSubmoduleLog(
      '/repo',
      'libs/child',
      `${OLD}..${NEW}`,
      20,
    );

    expect(page.commits).toHaveLength(50);
    expect(page.hasMore).toBe(true);
  });

  it('getSubmoduleLog: chặn range không phải oid/oid..oid (không cho lọt flag lạ)', async () => {
    const git = new GitService(new FakeGitRunner(() => ''));
    await expect(git.getSubmoduleLog('/repo', 'libs/child', '--all', 0)).rejects.toThrow(
      'Range không hợp lệ',
    );
  });

  it('submodule chưa init (prefix "-") và thiếu object: vẫn trả SHA, chi tiết null', async () => {
    const runner = new FakeGitRunner((args) => {
      switch (args[0]) {
        case 'ls-files':
          return `160000 ${OLD} 0\tlibs/child\0`;
        case 'submodule':
          return `-${OLD} libs/child\n`; // chưa init
        case 'log':
          return new GitError('log', 128, `fatal: bad object ${OLD}`);
        default:
          return '';
      }
    });

    const info = await new GitService(runner).getSubmoduleDiff('/repo', {
      kind: 'workingTree',
      path: 'libs/child',
    });

    expect(info).toMatchObject({ oldOid: OLD, newOid: null, oldCommit: null, ahead: [] });
  });
});
