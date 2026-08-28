import { describe, expect, it } from 'vitest';
import { countChangedFiles } from './changeBadge';
import type { StatusResult } from './statusParser';

function status(fileCount: number): StatusResult {
  return {
    branch: 'main',
    upstream: null,
    ahead: 0,
    behind: 0,
    files: Array.from({ length: fileCount }, (_, i) => ({
      path: `f${i}.ts`,
      staged: null,
      unstaged: 'modified' as const,
      untracked: false,
      conflicted: false,
    })),
  };
}

describe('countChangedFiles', () => {
  it('cộng tổng file thay đổi của mọi repo', async () => {
    const repos = { listRepos: async () => [{ root: '/a' }, { root: '/b' }] };
    const git = {
      getStatus: async (root: string) => status(root === '/a' ? 2 : 3),
    };
    expect(await countChangedFiles(repos, git)).toBe(5);
  });

  it('repo lỗi tính 0, không làm reject toàn bộ', async () => {
    const repos = { listRepos: async () => [{ root: '/a' }, { root: '/hong' }] };
    const git = {
      getStatus: async (root: string) => {
        if (root === '/hong') {
          throw new Error('not a repo');
        }
        return status(4);
      },
    };
    expect(await countChangedFiles(repos, git)).toBe(4);
  });

  it('không có repo → 0', async () => {
    const repos = { listRepos: async () => [] };
    const git = {
      getStatus: async () => status(9),
    };
    expect(await countChangedFiles(repos, git)).toBe(0);
  });
});
