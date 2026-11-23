// Parser cho `git status --porcelain=v2 -z --branch`. Hàm thuần — test bằng Vitest.
//
// Định dạng v2 với -z: mỗi record kết thúc bằng NUL; riêng record rename ('2')
// có THÊM 1 token NUL kế tiếp là đường dẫn cũ. Tài liệu: git-status(1), STATUS V2.

import type { ChangeKind, FileChange } from '../../shared/types';

/** Kết quả thô từ status — GitService sẽ ghép thêm RepoActivity thành WorkingTreeStatus. */
export interface StatusResult {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: FileChange[];
}

const NUL = '\0';

export function parseStatusV2(stdout: string): StatusResult {
  const result: StatusResult = { branch: null, upstream: null, ahead: 0, behind: 0, files: [] };
  const tokens = stdout.split(NUL);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '') {
      continue;
    }
    switch (token[0]) {
      case '#':
        parseHeader(token, result);
        break;
      case '1': {
        // `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>` — 8 field rồi tới path
        // (path có thể chứa khoảng trắng nên không split toàn bộ).
        const { fields, rest } = splitFields(token, 8);
        result.files.push(makeChange(fields[1], rest, fields[2]));
        break;
      }
      case '2': {
        // `2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <Xscore> <path>` + token kế = origPath.
        const { fields, rest } = splitFields(token, 9);
        const origPath = tokens[++i] ?? '';
        result.files.push({ ...makeChange(fields[1], rest, fields[2]), origPath });
        break;
      }
      case 'u': {
        // `u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>` — file conflict.
        const { fields, rest } = splitFields(token, 10);
        result.files.push({
          path: rest,
          staged: null,
          unstaged: null,
          untracked: false,
          conflicted: true,
          ...(isSubmodule(fields[2]) ? { submodule: true } : {}),
        });
        break;
      }
      case '?':
        result.files.push({
          path: token.slice(2),
          staged: null,
          unstaged: null,
          untracked: true,
          conflicted: false,
        });
        break;
      case '!':
        // `! <path>` — chỉ xuất hiện khi status chạy với --ignored (chế độ
        // "All files, incl. ignored" — ui-analysis mục F). Thư mục ignore
        // nguyên cụm được git gộp 1 dòng có '/' cuối — bỏ '/' cho đồng nhất
        // path (display + tree builder không phải xử lý segment rỗng).
        result.files.push({
          path: token.slice(2).replace(/\/$/, ''),
          staged: null,
          unstaged: null,
          untracked: false,
          conflicted: false,
          ignored: true,
        });
        break;
      default:
        // Loại record chưa biết (git version mới) — bỏ qua, không làm hỏng cả status.
        break;
    }
  }
  return result;
}

/** Trạng thái 1 submodule đang có thay đổi (rút từ field <sub> "S<c><m><u>"). */
export interface SubmoduleState {
  path: string;
  /** <c> = 'C': repo con đang đứng ở commit KHÁC con trỏ ghi trong index repo cha. */
  pointerMoved: boolean;
  /** <m> = 'M' hoặc <u> = 'U': bên trong repo con có thay đổi tracked / file untracked. */
  dirty: boolean;
}

/**
 * Lọc các entry submodule từ cùng output `status --porcelain=v2 -z` — chỉ submodule
 * đang có thay đổi mới có entry. Dùng cho checkout "Stash & re-apply" quyết định
 * submodule nào phải stash bên trong, submodule nào giữ nguyên chỗ đứng.
 */
export function parseSubmoduleStates(stdout: string): SubmoduleState[] {
  const states: SubmoduleState[] = [];
  const tokens = stdout.split(NUL);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '') {
      continue;
    }
    // Số field trước path của từng loại record (xem parseStatusV2).
    const count = token[0] === '1' ? 8 : token[0] === '2' ? 9 : token[0] === 'u' ? 10 : 0;
    if (count === 0) {
      continue;
    }
    const { fields, rest } = splitFields(token, count);
    if (token[0] === '2') {
      i++; // token kế là origPath — bỏ qua
    }
    const sub = fields[2];
    if (!isSubmodule(sub) || rest === '') {
      continue;
    }
    states.push({
      path: rest,
      pointerMoved: sub[1] === 'C',
      dirty: sub[2] === 'M' || sub[3] === 'U',
    });
  }
  return states;
}

function parseHeader(token: string, result: StatusResult): void {
  if (token.startsWith('# branch.head ')) {
    const head = token.slice('# branch.head '.length);
    // Git in "(detached)" khi detached HEAD — giữ null để UI tự hiển thị trạng thái.
    result.branch = head === '(detached)' ? null : head;
  } else if (token.startsWith('# branch.upstream ')) {
    result.upstream = token.slice('# branch.upstream '.length);
  } else if (token.startsWith('# branch.ab ')) {
    // Dạng: `# branch.ab +<ahead> -<behind>`
    const match = /^# branch\.ab \+(\d+) -(\d+)$/.exec(token);
    if (match) {
      result.ahead = Number(match[1]);
      result.behind = Number(match[2]);
    }
  }
}

/** Tách `count` field đầu (cách nhau bởi space), phần còn lại trả nguyên (là path). */
function splitFields(token: string, count: number): { fields: string[]; rest: string } {
  const fields: string[] = [];
  let start = 0;
  for (let n = 0; n < count; n++) {
    const idx = token.indexOf(' ', start);
    if (idx === -1) {
      return { fields, rest: '' };
    }
    fields.push(token.slice(start, idx));
    start = idx + 1;
  }
  return { fields, rest: token.slice(start) };
}

/** Field <sub> của porcelain v2: "N..." = file thường, "S<c><m><u>" = submodule. */
function isSubmodule(sub: string | undefined): boolean {
  return sub !== undefined && sub.startsWith('S');
}

/** XY của porcelain v2: X = trạng thái index (staged), Y = trạng thái working tree. */
function makeChange(xy: string, path: string, sub?: string): FileChange {
  return {
    path,
    staged: kindOf(xy[0]),
    unstaged: kindOf(xy[1]),
    untracked: false,
    conflicted: false,
    ...(isSubmodule(sub) ? { submodule: true } : {}),
  };
}

function kindOf(code: string | undefined): ChangeKind | null {
  switch (code) {
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
      return null; // '.' = không thay đổi
  }
}
