// Phát hiện và quản lý danh sách repo trong workspace — GỒM CẢ SUBMODULE:
// mỗi submodule đã init là 1 repo riêng, tên hiển thị "cha/đường-dẫn-sub"
// đúng kiểu tab của SmartGit (ui-analysis A1: "4x-root/4x-server").
// KHÔNG import 'vscode' — nhận WorkspaceReader qua constructor (DI).

import * as path from 'node:path';
import type { RepoInfo } from '../../shared/types';
import type { GitService } from './gitService';
import type { WorkspaceReader } from './interfaces';
import type { RepoStateReader } from './repoStateReader';

export class RepoManager {
  constructor(
    private readonly workspace: WorkspaceReader,
    private readonly git: GitService,
    private readonly stateReader: RepoStateReader,
  ) {}

  async listRepos(): Promise<RepoInfo[]> {
    const folders = this.workspace.getFolders();
    const nested = await Promise.all(
      folders.map(async (folder) => {
        const parent = await this.describeRepo(folder.fsPath, folder.name);
        if (parent === null) {
          return [];
        }
        // Submodule 1 cấp (đệ quy P2). Sub chưa `submodule update --init`
        // sẽ không phải repo → describeRepo trả null → bỏ qua.
        const subPaths = await this.git.listSubmodulePaths(folder.fsPath);
        const subs = await Promise.all(
          subPaths.map((subPath) =>
            this.describeRepo(path.join(folder.fsPath, subPath), `${folder.name}/${subPath}`),
          ),
        );
        return [parent, ...subs.filter((repo): repo is RepoInfo => repo !== null)];
      }),
    );
    return nested.flat();
  }

  private async describeRepo(root: string, name: string): Promise<RepoInfo | null> {
    if (!(await this.git.isRepo(root))) {
      return null;
    }
    const [branch, gitDir] = await Promise.all([
      this.git.getCurrentBranch(root),
      this.git.getGitDir(root),
    ]);
    const state = await this.stateReader.read(gitDir);
    return { root, name, branch, activity: state.activity };
  }
}
