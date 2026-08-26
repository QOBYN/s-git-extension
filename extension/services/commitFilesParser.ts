// Parser cho `git show --format= --name-status -z -M <oid>` — danh sách file
// thay đổi của 1 commit (panel B6). Hàm thuần, test bằng Vitest.
//
// Định dạng -z: <status>\0<path>\0 ; riêng R/C: <Rscore>\0<oldPath>\0<newPath>\0.

import type { ChangeKind, CommitFileChange } from '../../shared/types';

const NUL = '\0';

export function parseCommitFiles(stdout: string): CommitFileChange[] {
  const files: CommitFileChange[] = [];
  const tokens = stdout.split(NUL);

  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i];
    if (status === '' || status === undefined) {
      continue;
    }
    const kind = kindOf(status[0]);
    if (kind === null) {
      continue; // loại chưa biết (T, U…) — bỏ qua thay vì đoán sai
    }
    if (kind === 'renamed' || kind === 'copied') {
      const origPath = tokens[++i] ?? '';
      const path = tokens[++i] ?? '';
      files.push({ path, origPath, kind });
    } else {
      const path = tokens[++i] ?? '';
      files.push({ path, kind });
    }
  }
  return files;
}

function kindOf(letter: string | undefined): ChangeKind | null {
  switch (letter) {
    case 'M':
      return 'modified';
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case 'T':
      return 'typechange';
    default:
      return null;
  }
}
