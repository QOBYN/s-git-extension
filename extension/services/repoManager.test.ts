import { describe, expect, it } from 'vitest';
import { GitError } from './gitRunner';
import { GitService } from './gitService';
import { RepoManager } from './repoManager';
import { RepoStateReader } from './repoStateReader';
import { FakeFileSystem, FakeGitRunner } from '../testing/fakes';
import type { WorkspaceReader } from './interfaces';

function workspaceOf(...folders: Array<{ name: string; fsPath: string }>): WorkspaceReader {
  return { getFolders: () => folders };
}

/** Runner giả lập 2 thư mục: /repo là git repo trên nhánh main, /plain không phải repo. */
function runnerForRepoAndPlainDir(): FakeGitRunner {
  return new FakeGitRunner((args, cwd) => {
    if (cwd !== '/repo') {
      return new GitError(args.join(' '), 128, 'fatal: not a git repository');
    }
    switch (args[0]) {
      case 'rev-parse':
        return args[1] === '--absolute-git-dir' ? '/repo/.git\n' : 'true\n';
      case 'branch':
        return 'main\n';
      default:
        return '';
    }
  });
}

describe('RepoManager.listRepos', () => {
  it('chỉ trả folder là git repo, kèm branch và activity', async () => {
    const git = new GitService(runnerForRepoAndPlainDir());
    const stateReader = new RepoStateReader(new FakeFileSystem());
    const manager = new RepoManager(
      workspaceOf({ name: 'my-repo', fsPath: '/repo' }, { name: 'not-git', fsPath: '/plain' }),
      git,
      stateReader,
    );

    const repos = await manager.listRepos();

    expect(repos).toEqual([
      { root: '/repo', name: 'my-repo', branch: 'main', activity: 'none' },
    ]);
  });

  it('repo đang merge trả activity merging (nguồn của banner D2)', async () => {
    const git = new GitService(runnerForRepoAndPlainDir());
    const fs = new FakeFileSystem().set('/repo/.git/MERGE_HEAD', 'abc');
    const manager = new RepoManager(
      workspaceOf({ name: 'my-repo', fsPath: '/repo' }),
      git,
      new RepoStateReader(fs),
    );

    expect((await manager.listRepos())[0].activity).toBe('merging');
  });

  it('submodule đã init hiện thành repo riêng, tên "cha/đường-dẫn" (kiểu tab SmartGit)', async () => {
    const runner = new FakeGitRunner((args, cwd) => {
      const isRepo = cwd === '/repo' || cwd === '/repo/libs/core';
      if (!isRepo) {
        return new GitError(args.join(' '), 128, 'fatal: not a git repository');
      }
      switch (args[0]) {
        case 'rev-parse':
          return args[1] === '--absolute-git-dir'
            ? cwd === '/repo'
              ? '/repo/.git\n'
              : '/repo/.git/modules/libs/core\n' // submodule: gitDir nằm trong cha
            : 'true\n';
        case 'branch':
          return cwd === '/repo' ? 'main\n' : 'dev\n';
        case 'config':
          // chỉ repo cha có .gitmodules; submodule không có
          return cwd === '/repo'
            ? 'submodule.libs/core.path\nlibs/core\0'
            : new GitError('config', 1, '');
        default:
          return '';
      }
    });
    const manager = new RepoManager(
      workspaceOf({ name: 'my-repo', fsPath: '/repo' }),
      new GitService(runner),
      new RepoStateReader(new FakeFileSystem()),
    );

    const repos = await manager.listRepos();

    expect(repos.map((r) => ({ name: r.name, root: r.root, branch: r.branch }))).toEqual([
      { name: 'my-repo', root: '/repo', branch: 'main' },
      { name: 'my-repo/libs/core', root: '/repo/libs/core', branch: 'dev' },
    ]);
  });

  it('submodule khai báo nhưng chưa init (không phải repo) bị bỏ qua', async () => {
    const runner = new FakeGitRunner((args, cwd) => {
      if (cwd !== '/repo') {
        return new GitError(args.join(' '), 128, 'fatal: not a git repository');
      }
      switch (args[0]) {
        case 'rev-parse':
          return args[1] === '--absolute-git-dir' ? '/repo/.git\n' : 'true\n';
        case 'branch':
          return 'main\n';
        case 'config':
          return 'submodule.vendor.path\nvendor/sdk\0';
        default:
          return '';
      }
    });
    const manager = new RepoManager(
      workspaceOf({ name: 'my-repo', fsPath: '/repo' }),
      new GitService(runner),
      new RepoStateReader(new FakeFileSystem()),
    );

    expect((await manager.listRepos()).map((r) => r.name)).toEqual(['my-repo']);
  });

  it('workspace trống trả mảng rỗng', async () => {
    const git = new GitService(new FakeGitRunner(() => ''));
    const manager = new RepoManager(workspaceOf(), git, new RepoStateReader(new FakeFileSystem()));
    expect(await manager.listRepos()).toEqual([]);
  });
});
