// Đếm tổng số file thay đổi (staged/unstaged/untracked/conflict) của mọi repo
// trong workspace — nguồn số liệu cho badge trên icon Activity Bar. Hàm thuần,
// nhận dependency qua tham số để test bằng Vitest.

import type { StatusResult } from './statusParser';

interface RepoLister {
  listRepos(): Promise<Array<{ root: string }>>;
}

interface StatusReader {
  getStatus(root: string): Promise<StatusResult>;
}

export async function countChangedFiles(repos: RepoLister, git: StatusReader): Promise<number> {
  const list = await repos.listRepos();
  // Repo lỗi (đang gc, thư mục vừa xoá…) tính 0 — badge không được làm hỏng activate.
  const counts = await Promise.all(
    list.map((repo) =>
      git.getStatus(repo.root).then(
        (status) => status.files.length,
        () => 0,
      ),
    ),
  );
  return counts.reduce((sum, n) => sum + n, 0);
}
