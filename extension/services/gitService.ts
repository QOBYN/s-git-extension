// Facade mọi thao tác git. Mỗi method = gọi GitRunner + parser tương ứng.
// KHÔNG import 'vscode'; KHÔNG tự spawn process; KHÔNG hardcode giá trị chỉnh được —
// nhận qua GitServiceOptions (adapter sẽ nối với VSCode settings).

import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  DEFAULT_LOG_PAGE_SIZE,
  SUBMODULE_LOG_PAGE_SIZE,
  SUBMODULE_PREVIEW_COMMITS,
} from '../../shared/constants';
import type {
  CheckoutOptions,
  CheckoutStashResult,
  CommitFileChange,
  CommitInfo,
  DiffTarget,
  LogOptions,
  LogPage,
  MergeResult,
  MergeStrategy,
  PullMode,
  PushTarget,
  RefInfo,
  RemoteInfo,
  ResetMode,
  StatusScope,
  SubmoduleDiffInfo,
  SubmoduleLogPage,
} from '../../shared/types';
import { parseCommitFiles } from './commitFilesParser';
import { foldersFromPaths } from '../../shared/folders';
import { GitError, type GitRunner } from './gitRunner';
import { parseSubmodulePaths } from './submoduleParser';
import { LOG_FORMAT, parseLog } from './logParser';
import { FOR_EACH_REF_ARGS, parseNameRev, parseRefs } from './refParser';
import {
  parseStatusV2,
  parseSubmoduleStates,
  type StatusResult,
  type SubmoduleState,
} from './statusParser';

export interface GitServiceOptions {
  /** Số commit mỗi trang log; mặc định DEFAULT_LOG_PAGE_SIZE (spec 6.3). */
  logPageSize?: number;
}

export class GitService {
  private readonly logPageSize: number;

  constructor(
    private readonly runner: GitRunner,
    options: GitServiceOptions = {},
  ) {
    this.logPageSize = options.logPageSize ?? DEFAULT_LOG_PAGE_SIZE;
  }

  // ---- truy vấn (P0) ----

  async isRepo(root: string): Promise<boolean> {
    try {
      const out = await this.runner.run(root, ['rev-parse', '--is-inside-work-tree']);
      return out.trim() === 'true';
    } catch {
      return false;
    }
  }

  /** Đường dẫn thư mục .git đã resolve (xử lý cả worktree có .git dạng file). */
  async getGitDir(root: string): Promise<string> {
    const out = await this.runner.run(root, ['rev-parse', '--absolute-git-dir']);
    return out.trim();
  }

  /** null khi repo chưa có commit nào. */
  async getHeadOid(root: string): Promise<string | null> {
    try {
      const out = await this.runner.run(root, ['rev-parse', 'HEAD']);
      return out.trim();
    } catch (error) {
      if (isEmptyRepoError(error)) {
        return null;
      }
      throw error;
    }
  }

  async getCurrentBranch(root: string): Promise<string | null> {
    const out = await this.runner.run(root, ['branch', '--show-current']);
    const name = out.trim();
    return name === '' ? null : name; // rỗng = detached HEAD hoặc repo trống
  }

  async getLog(root: string, options?: LogOptions | null): Promise<LogPage> {
    const opts = options ?? {};
    const limit = opts.limit ?? this.logPageSize;
    const args = [
      'log',
      '--date-order',
      `--pretty=format:${LOG_FORMAT}`,
      // Lấy dư 1 commit để biết còn trang sau không mà không cần đếm toàn bộ.
      `--max-count=${limit + 1}`,
    ];
    if (opts.path) {
      args.push('--follow'); // File Log: theo dấu file qua rename (ui-analysis C)
    }
    const refs = typeof opts.ref === 'string' ? [opts.ref] : opts.ref ?? [];
    if (refs.length > 0) {
      args.push(...refs); // lọc theo nhánh/tag đã chọn (sidebar B1 / dropdown History)
    } else if (!opts.path && (opts.all ?? true)) {
      args.push('--all'); // graph nhiều nhánh như SmartGit (ui-analysis B4)
    }
    if (opts.skip) {
      args.push(`--skip=${opts.skip}`);
    }
    if (opts.path) {
      args.push('--', opts.path);
    }

    let commits;
    try {
      commits = parseLog(await this.runner.run(root, args));
    } catch (error) {
      if (isEmptyRepoError(error)) {
        return { commits: [], hasMore: false, headOid: null };
      }
      throw error;
    }

    return {
      commits: commits.slice(0, limit),
      hasMore: commits.length > limit,
      headOid: await this.getHeadOid(root),
    };
  }

  async getStatus(root: string, scope?: StatusScope | null): Promise<StatusResult> {
    scope ??= 'changes';
    const out = await this.runner.run(root, [
      'status',
      '--porcelain=v2',
      '-z',
      '--branch',
      // Liệt kê từng file trong thư mục untracked thay vì gộp 1 dòng thư mục —
      // vùng Changed files cần path đầy đủ từng file (ui-analysis mục F).
      '--untracked-files=all',
      // `matching` gộp thư mục ignore nguyên cụm thành 1 dòng (node_modules/) —
      // `traditional` + -uall sẽ liệt kê từng file bên trong, nổ hàng nghìn dòng.
      ...(scope === 'ignored' ? ['--ignored=matching'] : []),
    ]);
    const result = parseStatusV2(out);
    if (scope !== 'changes') {
      // "All files": ghép thêm file tracked KHÔNG thay đổi (status không liệt kê)
      // — mọi field null/false = unchanged. ls-files đã sort sẵn theo tên.
      const known = new Set(result.files.map((f) => f.path));
      const tracked = await this.runner.run(root, ['ls-files', '-z']);
      for (const path of tracked.split('\0')) {
        if (path !== '' && !known.has(path)) {
          result.files.push({ path, staged: null, unstaged: null, untracked: false, conflicted: false });
        }
      }
    }
    return result;
  }

  async listRefs(root: string): Promise<RefInfo[]> {
    return parseRefs(await this.runner.run(root, [...FOR_EACH_REF_ARGS]));
  }

  /**
   * Tên gợi ý cho ô "Nhánh mới" của popup Checkout: nhánh REMOTE gần nhất chứa
   * commit (`name-rev` — trúng tip hay nằm giữa nhánh đều có tên; origin/HEAD bỏ
   * qua), không có thì nhánh LOCAL gần nhất; null khi commit không thuộc nhánh nào.
   * Chỉ trả tên thô — webview tự xử va chạm với nhánh local đã có.
   */
  async suggestBranchName(root: string, oid: string): Promise<string | null> {
    const remote = await this.runner.run(root, [
      'name-rev',
      '--name-only',
      '--refs=refs/remotes/*',
      '--exclude=refs/remotes/*/HEAD',
      oid,
    ]);
    const fromRemote = parseNameRev(remote, 'remote');
    if (fromRemote !== null) {
      return fromRemote;
    }
    const local = await this.runner.run(root, ['name-rev', '--name-only', '--refs=refs/heads/*', oid]);
    return parseNameRev(local, 'local');
  }

  /**
   * Chữ ký toàn bộ refs — cache log chỉ hợp lệ khi CẢ headOid lẫn chữ ký này
   * không đổi (tạo nhánh/tag mới đổi graph dù HEAD đứng yên — architecture.md mục 4).
   */
  async getRefsSignature(root: string): Promise<string> {
    const out = await this.runner.run(root, [...FOR_EACH_REF_ARGS]);
    return createHash('sha1').update(out).digest('hex');
  }

  /** Danh sách file thay đổi của 1 commit (panel B6); -M để phát hiện rename. */
  async getCommitFiles(root: string, oid: string): Promise<CommitFileChange[]> {
    const out = await this.runner.run(root, [
      'show',
      '--format=', // chỉ cần phần name-status, không in header commit
      '--name-status',
      '-z',
      '-M',
      // Merge commit: mặc định git show in combined diff (chỉ file khác CẢ 2
      // parent) nên merge sạch trả rỗng. So với parent 1 để khớp readSide
      // (`oid^:path`) bên diff nội dung.
      '-m',
      '--first-parent',
      oid,
    ]);
    return parseCommitFiles(out);
  }

  /** Message đầy đủ (subject + body) của 1 commit — panel chi tiết B5. */
  async getCommitBody(root: string, oid: string): Promise<string> {
    const out = await this.runner.run(root, ['show', '--no-patch', '--format=%B', oid]);
    return out.trimEnd();
  }

  /**
   * Danh sách path submodule khai báo trong .gitmodules (1 cấp — đệ quy là P2).
   * Repo không có submodule → git config exit 1 → trả rỗng, không phải lỗi.
   */
  async listSubmodulePaths(root: string): Promise<string[]> {
    try {
      const out = await this.runner.run(root, [
        'config',
        '-z',
        '--file',
        '.gitmodules',
        '--get-regexp',
        '^submodule\\..*\\.path$',
      ]);
      return parseSubmodulePaths(out);
    } catch (error) {
      if (error instanceof GitError) {
        return []; // không có .gitmodules / không match — repo không có submodule
      }
      throw error;
    }
  }

  /**
   * So sánh con trỏ submodule cho DiffTarget (getDiff gọi khi `git show :path`
   * fail "bad object" — gitlink không phải blob). Trả null nếu path KHÔNG phải
   * gitlink → caller ném lại lỗi gốc. Chi tiết commit/ahead/behind đọc từ repo
   * con là best-effort: submodule chưa init hoặc thiếu object thì chỉ có SHA.
   */
  async getSubmoduleDiff(root: string, target: DiffTarget): Promise<SubmoduleDiffInfo | null> {
    const { kind, path } = target;
    let oldOid: string | null;
    let newOid: string | null;
    let dirty = false;
    switch (kind) {
      case 'workingTree': {
        const stages = await this.gitlinkStages(root, path);
        if (!stages.has(0) && stages.size > 0) {
          // Gitlink đang CONFLICT (merge/rebase): index chỉ có stage 1/2/3.
          // So OURS (:2) ↔ THEIRS (:3) — đúng câu hỏi khi resolve; view 2 nhánh
          // + merge-base phía dưới tự khớp vì 2 con trỏ phân kỳ.
          oldOid = stages.get(2) ?? null;
          newOid = stages.get(3) ?? null;
          dirty = await this.submoduleContentDirty(root, path);
          break;
        }
        oldOid = stages.get(0) ?? null;
        newOid = await this.submoduleWorkingOid(root, path);
        dirty = await this.submoduleContentDirty(root, path);
        if (newOid === null) {
          // Thư mục là 1 repo git LỒNG chưa đăng ký submodule (case "add mới
          // 1 git": untracked, `git show :path` trả rỗng chứ không "bad object").
          const nested = await this.nestedRepoInfo(root, path);
          if (nested !== null) {
            newOid = nested.head;
            dirty = dirty || nested.dirty;
          }
        }
        break;
      }
      case 'index':
        oldOid = await this.gitlinkInTree(root, 'HEAD', path);
        newOid = await this.gitlinkInIndex(root, path);
        break;
      case 'commit':
        oldOid = await this.gitlinkInTree(root, `${target.oid}^`, path);
        newOid = await this.gitlinkInTree(root, target.oid!, path);
        break;
    }
    if (oldOid === null && newOid === null) {
      return null; // không phải submodule — để caller ném lại lỗi gốc của git show
    }

    const subRoot = join(root, path);
    const [oldCommit, newCommit] = await Promise.all([
      this.submoduleCommitInfo(subRoot, oldOid),
      this.submoduleCommitInfo(subRoot, newOid),
    ]);
    // Preview history giữa 2 con trỏ; submodule mới thêm thì lấy history gần nhất.
    let ahead: CommitInfo[] = [];
    let behind: CommitInfo[] = [];
    let baseOid: string | null = null;
    if (oldOid !== null && newOid !== null && oldOid !== newOid) {
      [ahead, behind, baseOid] = await Promise.all([
        this.submoduleLog(subRoot, `${oldOid}..${newOid}`),
        this.submoduleLog(subRoot, `${newOid}..${oldOid}`),
        this.submoduleMergeBase(subRoot, oldOid, newOid),
      ]);
      // Gốc chung chỉ có ý nghĩa khi PHÂN KỲ — fast-forward thì chính old/new
      // đã là gốc, view dùng con trỏ đó làm dòng neo.
      if (baseOid === oldOid || baseOid === newOid) {
        baseOid = null;
      }
    } else if (oldOid === null && newOid !== null) {
      ahead = await this.submoduleLog(subRoot, newOid);
    } else if (newOid === null && oldOid !== null) {
      behind = await this.submoduleLog(subRoot, oldOid);
    }
    return {
      oldOid,
      newOid,
      oldCommit,
      newCommit,
      baseOid,
      baseCommit: await this.submoduleCommitInfo(subRoot, baseOid),
      ahead: ahead.slice(0, SUBMODULE_PREVIEW_COMMITS),
      behind: behind.slice(0, SUBMODULE_PREVIEW_COMMITS),
      aheadTruncated: ahead.length > SUBMODULE_PREVIEW_COMMITS,
      behindTruncated: behind.length > SUBMODULE_PREVIEW_COMMITS,
      dirty,
    };
  }

  /** SHA gitlink của path trong INDEX; ưu tiên stage 0, conflict thì lấy ours. */
  private async gitlinkInIndex(root: string, path: string): Promise<string | null> {
    const stages = await this.gitlinkStages(root, path);
    return stages.get(0) ?? stages.get(2) ?? stages.get(1) ?? stages.get(3) ?? null;
  }

  /**
   * Map stage → SHA gitlink của path trong INDEX (`ls-files -s` mode 160000).
   * Bình thường chỉ có stage 0; đang conflict thì có 1 (base) / 2 (ours) /
   * 3 (theirs). Map rỗng = không phải gitlink.
   */
  private async gitlinkStages(root: string, path: string): Promise<Map<number, string>> {
    const stages = new Map<number, string>();
    try {
      const out = await this.runner.run(root, ['ls-files', '-s', '-z', '--', path]);
      for (const entry of out.split('\0')) {
        const match = /^160000 ([0-9a-f]+) ([0-3])\t/.exec(entry);
        if (match) {
          stages.set(Number(match[2]), match[1]!);
        }
      }
    } catch {
      // ls-files lỗi = coi như không phải gitlink
    }
    return stages;
  }

  /** SHA gitlink của path trong tree của `rev`; null = rev/path không có hoặc không phải gitlink. */
  private async gitlinkInTree(root: string, rev: string, path: string): Promise<string | null> {
    try {
      const out = await this.runner.run(root, ['ls-tree', '-z', rev, '--', path]);
      const match = /^160000 commit ([0-9a-f]+)\t/.exec(out);
      return match ? match[1]! : null;
    } catch {
      return null; // rev không tồn tại (vd commit gốc không có parent)
    }
  }

  /**
   * SHA đang checkout THẬT trong working tree của submodule — qua `git submodule
   * status` của repo CHA (không chạy git trong thư mục con: nếu nó chưa init,
   * git sẽ leo ngược lên repo cha và trả nhầm HEAD của cha).
   * Prefix '-' = chưa init → null.
   */
  private async submoduleWorkingOid(root: string, path: string): Promise<string | null> {
    try {
      const out = await this.runner.run(root, ['submodule', 'status', '--', path]);
      const match = /^([ +U-])([0-9a-f]+) /.exec(out);
      return match === null || match[1] === '-' ? null : match[2]!;
    } catch {
      return null;
    }
  }

  /**
   * Thư mục path có phải GỐC của 1 repo git lồng (chưa đăng ký submodule)?
   * `--show-prefix` rỗng = cwd chính là gốc repo; khác rỗng = git đã leo ngược
   * lên repo CHA (thư mục thường) — tuyệt đối không được lấy nhầm HEAD của cha.
   */
  private async nestedRepoInfo(
    root: string,
    path: string,
  ): Promise<{ head: string; dirty: boolean } | null> {
    const subRoot = join(root, path);
    try {
      const prefix = (await this.runner.run(subRoot, ['rev-parse', '--show-prefix'])).trim();
      if (prefix !== '') {
        return null;
      }
      const head = (await this.runner.run(subRoot, ['rev-parse', 'HEAD'])).trim();
      if (!/^[0-9a-f]+$/.test(head)) {
        return null;
      }
      const status = await this.runner.run(subRoot, ['status', '--porcelain', '-z']);
      return { head, dirty: status !== '' };
    } catch {
      return null; // không phải repo git, thư mục không tồn tại, hoặc chưa có commit
    }
  }

  /** Nội dung BÊN TRONG submodule có thay đổi chưa commit (field <sub> = S?M?/S??U)? */
  private async submoduleContentDirty(root: string, path: string): Promise<boolean> {
    try {
      const out = await this.runner.run(root, ['status', '--porcelain=v2', '-z', '--', path]);
      return out
        .split('\0')
        .some((line) => /^[12u] .. S.[MU]|^[12u] .. S..U/.test(line));
    } catch {
      return false;
    }
  }

  /** Chi tiết 1 commit trong repo con (kèm %D — nhánh/tag trỏ vào nó); best-effort. */
  private async submoduleCommitInfo(subRoot: string, oid: string | null): Promise<CommitInfo | null> {
    if (oid === null) {
      return null;
    }
    try {
      const out = await this.runner.run(subRoot, [
        'log',
        '--max-count=1',
        `--pretty=format:${LOG_FORMAT}`,
        oid,
      ]);
      return parseLog(out)[0] ?? null;
    } catch {
      return null; // chưa init / thiếu object — UI vẫn còn SHA để hiển thị
    }
  }

  /**
   * Trang tiếp theo của history submodule — nút "show more" khi preview bị cắt.
   * `range` do webview dựng từ oid đã có: "old..new" hoặc 1 oid — validate chặt
   * để không thành flag/tham số lạ của git log.
   */
  async getSubmoduleLog(
    root: string,
    path: string,
    range: string,
    skip: number,
  ): Promise<SubmoduleLogPage> {
    if (!/^[0-9a-f]+(\.\.[0-9a-f]+)?$/.test(range)) {
      throw new Error(`Range không hợp lệ: ${range}`);
    }
    try {
      const out = await this.runner.run(join(root, path), [
        'log',
        `--max-count=${SUBMODULE_LOG_PAGE_SIZE + 1}`,
        `--skip=${Math.max(0, Math.floor(skip))}`,
        `--pretty=format:${LOG_FORMAT}`,
        range,
      ]);
      const commits = parseLog(out);
      return {
        commits: commits.slice(0, SUBMODULE_LOG_PAGE_SIZE),
        hasMore: commits.length > SUBMODULE_LOG_PAGE_SIZE,
      };
    } catch {
      return { commits: [], hasMore: false }; // repo con chưa init/thiếu object
    }
  }

  /** Gốc chung của 2 con trỏ trong repo con (`merge-base`) — best-effort. */
  private async submoduleMergeBase(
    subRoot: string,
    oldOid: string,
    newOid: string,
  ): Promise<string | null> {
    try {
      const out = (await this.runner.run(subRoot, ['merge-base', oldOid, newOid])).trim();
      return /^[0-9a-f]+$/.test(out) ? out : null;
    } catch {
      return null; // không có gốc chung / thiếu object — view bỏ dòng neo
    }
  }

  /** Log rút gọn trong repo con cho preview (lấy dư 1 để biết có bị cắt). */
  private async submoduleLog(subRoot: string, range: string): Promise<CommitInfo[]> {
    try {
      const out = await this.runner.run(subRoot, [
        'log',
        `--max-count=${SUBMODULE_PREVIEW_COMMITS + 1}`,
        `--pretty=format:${LOG_FORMAT}`,
        range,
      ]);
      return parseLog(out);
    } catch {
      return [];
    }
  }

  /** Cây thư mục repo (tracked + untracked, bỏ ignored) — sidebar tab Working Tree. */
  async listFolders(root: string): Promise<string[]> {
    const out = await this.runner.run(root, [
      'ls-files',
      '-z',
      '--cached',
      '--others', // gồm cả file untracked — thư mục mới chưa add vẫn hiện
      '--exclude-standard',
    ]);
    return foldersFromPaths(out.split('\0').filter((p) => p !== ''));
  }

  // ---- thao tác ghi (P1 — thêm dần theo lộ trình, mọi lệnh ghi đều exclusive) ----

  async stage(root: string, paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    // `--` chặn path bắt đầu bằng "-" bị hiểu nhầm thành flag.
    await this.runner.run(root, ['add', '--', ...paths], { exclusive: true });
  }

  async unstage(root: string, paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    await this.runner.run(root, ['restore', '--staged', '--', ...paths], { exclusive: true });
  }

  async commit(root: string, message: string, opts?: { amend?: boolean } | null): Promise<void> {
    const args = ['commit', '--message', message];
    if (opts?.amend) {
      args.push('--amend');
    }
    await this.runner.run(root, args, { exclusive: true });
  }

  /**
   * Discard = bỏ thay đổi CHƯA stage: khôi phục working tree từ index
   * (đúng ngữ nghĩa Discard của SmartGit — ui-analysis G: Discard ≠ Remove ≠ Delete).
   * File untracked không bị đụng tới (xoá file thật là hành động Delete riêng, P2).
   *
   * Path là SUBMODULE: `restore` không đụng working tree repo con (gitlink) — exit 0
   * mà không đổi gì. Phải `submodule update --init --force -- <path>`: checkout lại
   * commit ghi trong index của repo cha, bỏ luôn thay đổi tracked bên trong repo
   * con (file untracked trong repo con vẫn giữ — cùng quy tắc với file thường).
   */
  async discard(root: string, paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    const submodules = new Set(await this.listSubmodulePaths(root));
    const files = paths.filter((p) => !submodules.has(p));
    const subs = paths.filter((p) => submodules.has(p));
    if (files.length > 0) {
      await this.runner.run(root, ['restore', '--', ...files], { exclusive: true });
    }
    if (subs.length > 0) {
      await this.runner.run(root, ['submodule', 'update', '--init', '--force', '--', ...subs], {
        exclusive: true,
      });
    }
  }

  /**
   * Checkout + đồng bộ submodule: git không tự cập nhật working tree submodule
   * theo con trỏ của commit mới (không dùng --recurse-submodules) nên phải tự
   * chạy `submodule update --init` sau checkout. Quy tắc an toàn:
   *  - force (Discard): update --force — reset cả con trỏ đang lệch, đúng ý
   *    "bỏ mọi thay đổi chưa commit" mà popup đã cảnh báo.
   *  - thường: CHỈ update khi trước checkout không submodule nào có thay đổi
   *    local (con trỏ lệch/dirty) — thay đổi đó stash không cất được, user chọn
   *    mang theo thì update sẽ xoá mất.
   */
  async checkout(root: string, ref: string, opts?: CheckoutOptions | null): Promise<void> {
    // Webview gọi không truyền opts → qua postMessage JSON hoá thành null (không
    // phải undefined) nên default param không áp dụng — chuẩn hoá tại đây.
    const o = opts ?? {};
    const subPaths = await this.listSubmodulePaths(root);
    const syncSubmodules =
      subPaths.length > 0 && (o.force || (await this.listSubmoduleStates(root)).length === 0);
    await this.runner.run(root, checkoutArgs(ref, o), { exclusive: true });
    if (syncSubmodules) {
      const subArgs = ['submodule', 'update', '--init'];
      if (o.force) {
        subArgs.push('--force');
      }
      await this.runner.run(root, subArgs, { exclusive: true });
    }
  }

  /**
   * Checkout kiểu "Stash & re-apply" của popup Checkout — làm trọn gói ở đây vì
   * phải theo dõi từng submodule (`git stash` của repo cha KHÔNG cất gì trong repo
   * con: cả con trỏ lệch lẫn file sửa bên trong đều bị bỏ qua, "No local changes"):
   *  1. stash repo cha (-u); stash BÊN TRONG từng submodule đang dirty.
   *  2. checkout. Hỏng → pop lại tất cả rồi ném lỗi — working tree về như cũ.
   *  3. `submodule update --init` cho submodule KHÔNG lệch con trỏ để theo con trỏ
   *     của nhánh mới; submodule user đã tự checkout commit khác thì giữ nguyên chỗ
   *     đứng (đúng nghĩa "re-apply" thay đổi con trỏ).
   *  4. pop repo cha, rồi pop từng submodule (lên trên con trỏ mới).
   * Bước 3–4 lỗi KHÔNG ném — checkout đã xong; trả về warnings để UI báo, thay đổi
   * vẫn nằm trong stash của repo tương ứng.
   */
  async checkoutStashReapply(
    root: string,
    ref: string,
    opts?: CheckoutOptions | null,
    stashMessage?: string | null,
  ): Promise<CheckoutStashResult> {
    const o = opts ?? {};
    const subPaths = await this.listSubmodulePaths(root);
    const states = subPaths.length > 0 ? await this.listSubmoduleStates(root) : [];
    const dirtySubs = states.filter((s) => s.dirty && subPaths.includes(s.path)).map((s) => s.path);
    const movedSubs = new Set(states.filter((s) => s.pointerMoved).map((s) => s.path));

    const stashedSuper = await this.stashPush(root, stashMessage);
    const stashedSubs: string[] = [];
    try {
      for (const sub of dirtySubs) {
        if (await this.stashPush(join(root, sub), stashMessage)) {
          stashedSubs.push(sub);
        }
      }
      await this.runner.run(root, checkoutArgs(ref, o), { exclusive: true });
    } catch (error) {
      // Rollback: pop hết, lỗi pop nuốt — stash vẫn còn đó cho user tự xử.
      if (stashedSuper) {
        await this.stashPop(root).catch(() => undefined);
      }
      for (const sub of stashedSubs) {
        await this.stashPop(join(root, sub)).catch(() => undefined);
      }
      throw error;
    }

    const warnings: CheckoutStashResult['warnings'] = [];
    const toSync = subPaths.filter((p) => !movedSubs.has(p));
    if (toSync.length > 0) {
      try {
        await this.runner.run(root, ['submodule', 'update', '--init', '--', ...toSync], {
          exclusive: true,
        });
      } catch (error) {
        warnings.push({ path: null, message: errorMessage(error) });
      }
    }
    if (stashedSuper) {
      try {
        await this.stashPop(root);
      } catch (error) {
        warnings.push({ path: null, message: errorMessage(error) });
      }
    }
    for (const sub of stashedSubs) {
      try {
        await this.stashPop(join(root, sub));
      } catch (error) {
        warnings.push({ path: sub, message: errorMessage(error) });
      }
    }
    return { warnings };
  }

  /**
   * Submodule đang có thay đổi (con trỏ lệch / nội dung dirty) — rỗng = mọi
   * submodule khớp con trỏ và sạch. Chỉ submodule thay đổi mới có entry trong status.
   */
  private async listSubmoduleStates(root: string): Promise<SubmoduleState[]> {
    const out = await this.runner.run(root, ['status', '--porcelain=v2', '-z']);
    return parseSubmoduleStates(out);
  }

  /**
   * Tạm cất mọi thay đổi chưa commit (kể cả untracked) — bước "stash & re-apply"
   * của popup Checkout. Trả về CÓ TẠO STASH HAY KHÔNG: thay đổi chỉ nằm ở
   * con trỏ submodule (stash không cất được) hoặc working tree sạch thì git in
   * "No local changes to save", exit 0 và KHÔNG tạo entry — caller phải bỏ qua
   * bước `stash pop` kẻo lỗi "No stash entries found" (LC_ALL=C nên message ổn định).
   */
  async stashPush(root: string, message?: string | null): Promise<boolean> {
    const args = ['stash', 'push', '--include-untracked'];
    if (message !== undefined && message !== null) {
      args.push('-m', message);
    }
    const out = await this.runner.run(root, args, { exclusive: true });
    return !out.includes('No local changes to save');
  }

  /** Re-apply stash mới nhất rồi xoá khỏi stack; conflict → git giữ stash + ném lỗi. */
  async stashPop(root: string): Promise<void> {
    await this.runner.run(root, ['stash', 'pop'], { exclusive: true });
  }

  /** Add Branch tại 1 commit (context menu E) — không checkout sang nhánh mới. */
  async createBranch(root: string, name: string, startPoint: string): Promise<void> {
    await this.runner.run(root, ['branch', name, startPoint], { exclusive: true });
  }

  /** Add Tag (lightweight) tại 1 commit (context menu E). */
  async createTag(root: string, name: string, oid: string): Promise<void> {
    await this.runner.run(root, ['tag', name, oid], { exclusive: true });
  }

  /**
   * Xoá nhánh AN TOÀN (-d): git tự từ chối nhánh chưa merge / đang checkout.
   * force = -D, chỉ dùng sau khi user xác nhận popup Force Delete ở webview.
   */
  async deleteBranch(root: string, name: string, force = false): Promise<void> {
    await this.runner.run(root, ['branch', force ? '-D' : '-d', '--', name], { exclusive: true });
  }

  async renameBranch(root: string, oldName: string, newName: string): Promise<void> {
    await this.runner.run(root, ['branch', '-m', '--', oldName, newName], { exclusive: true });
  }

  async deleteTag(root: string, name: string): Promise<void> {
    await this.runner.run(root, ['tag', '-d', name], { exclusive: true });
  }

  /** Stage 1 hunk: patch unified diff qua stdin — chức năng đinh của P1 (spec 2.1). */
  async stageHunk(root: string, patch: string): Promise<void> {
    await this.runner.run(root, ['apply', '--cached', '-'], { stdin: patch, exclusive: true });
  }

  /** Unstage 1 hunk: đảo patch đã stage (patch dựng từ diff HEAD↔index). */
  async unstageHunk(root: string, patch: string): Promise<void> {
    await this.runner.run(root, ['apply', '--cached', '--reverse', '-'], {
      stdin: patch,
      exclusive: true,
    });
  }

  /** Revert 1 hunk khỏi WORKING TREE (không đụng index) — patch từ diff index↔working. */
  async revertHunk(root: string, patch: string): Promise<void> {
    await this.runner.run(root, ['apply', '--reverse', '-'], { stdin: patch, exclusive: true });
  }

  // ---- quản lý remote (context menu sidebar tab Git) ----

  /** Remote đã khai báo (tên + URL fetch) — nguồn cho sidebar và dialog Edit Remote. */
  async listRemotes(root: string): Promise<RemoteInfo[]> {
    // `git remote -v` in mỗi remote 2 dòng "<tên>\t<url> (fetch|push)" — chỉ lấy fetch.
    const out = await this.runner.run(root, ['remote', '-v']);
    const remotes: RemoteInfo[] = [];
    for (const line of out.split('\n')) {
      const match = /^(\S+)\t(.*) \(fetch\)$/.exec(line);
      if (match) {
        remotes.push({ name: match[1]!, url: match[2]! });
      }
    }
    return remotes;
  }

  async addRemote(root: string, name: string, url: string): Promise<void> {
    await this.runner.run(root, ['remote', 'add', '--', name, url], { exclusive: true });
  }

  /** Đổi tên (nếu khác) rồi set-url — git tự chặn tên trùng/không hợp lệ. */
  async editRemote(root: string, oldName: string, newName: string, url: string): Promise<void> {
    if (newName !== oldName) {
      await this.runner.run(root, ['remote', 'rename', '--', oldName, newName], {
        exclusive: true,
      });
    }
    await this.runner.run(root, ['remote', 'set-url', '--', newName, url], { exclusive: true });
  }

  // ---- remote (P2): fetch / pull / push — đều exclusive vì có thể đổi refs/working tree ----

  /** Fetch mọi remote, dọn nhánh remote đã xoá (--prune) — nút toolbar Fetch. */
  async fetch(root: string): Promise<void> {
    await this.runner.run(root, ['fetch', '--all', '--prune'], { exclusive: true });
  }

  /**
   * Pull theo mode từ popup Pull: merge (--no-rebase) / rebase (--rebase) /
   * ff-only (--ff-only). Không có mode thì theo config của user
   * (pull.rebase/pull.ff…) — không áp đặt chiến lược. Conflict/từ chối:
   * git trả stderr với hint rõ ràng, UI hiển thị nguyên văn.
   */
  async pull(root: string, mode?: PullMode | null): Promise<void> {
    const flags: Record<PullMode, string> = {
      merge: '--no-rebase',
      rebase: '--rebase',
      'ff-only': '--ff-only',
    };
    // mode null: webview không truyền → JSON hoá qua postMessage (xem checkout).
    const args = mode === undefined || mode === null ? ['pull'] : ['pull', flags[mode]];
    await this.runner.run(root, args, { exclusive: true });
  }

  /**
   * Push nhánh hiện tại. Nhánh chưa có upstream: nếu repo có ĐÚNG 1 remote thì
   * tự `push -u <remote> HEAD` (hành vi của các git GUI); nhiều remote thì giữ
   * nguyên lỗi của git để user tự quyết — không đoán bừa remote.
   * Có `to` ("Push to…"): đẩy HEAD lên nhánh chỉ định — refs/heads/ tường minh
   * để tạo nhánh mới trên remote khi chưa tồn tại, không đụng upstream hiện tại.
   */
  async push(root: string, to?: PushTarget | null): Promise<void> {
    if (to !== undefined && to !== null) {
      await this.runner.run(root, ['push', '--', to.remote, `HEAD:refs/heads/${to.branch}`], {
        exclusive: true,
      });
      return;
    }
    try {
      await this.runner.run(root, ['push'], { exclusive: true });
    } catch (error) {
      if (!(error instanceof GitError) || !error.stderr.includes('no upstream branch')) {
        throw error;
      }
      const remotes = (await this.runner.run(root, ['remote']))
        .split('\n')
        .filter((r) => r !== '');
      if (remotes.length !== 1) {
        throw error;
      }
      await this.runner.run(root, ['push', '--set-upstream', remotes[0]!, 'HEAD'], {
        exclusive: true,
      });
    }
  }

  // ---- merge / rebase (P2 — spec 2.4: conflict dùng chung luồng với banner D2) ----

  /**
   * Merge `target` vào nhánh hiện tại theo chiến lược của dialog D1.
   * Exit ≠ 0 kèm file conflict → trả 'conflicts' (không phải lỗi — user xử lý
   * tiếp trong Working Tree); lỗi khác ném nguyên GitError.
   */
  async merge(root: string, target: string, strategy: MergeStrategy): Promise<MergeResult> {
    const args: Record<MergeStrategy, string[]> = {
      'fast-forward': ['merge', '--ff-only', target],
      'merge-commit': ['merge', '--no-ff', target],
      // "Merge to Working Tree" của SmartGit: hoà vào working tree + index,
      // DỪNG trước commit để user xem lại (ui-analysis D1).
      'merge-to-working-tree': ['merge', '--no-ff', '--no-commit', target],
      squash: ['merge', '--squash', target],
    };
    try {
      const out = await this.runner.run(root, args[strategy], { exclusive: true });
      return {
        status: out.includes('Already up to date') ? 'up-to-date' : 'clean',
        conflictedPaths: [],
      };
    } catch (error) {
      return { status: 'conflicts', conflictedPaths: await this.conflictsOrRethrow(root, error) };
    }
  }

  /** Rebase nhánh hiện tại lên `onto` — conflict xử lý như merge (spec 2.4). */
  async rebase(root: string, onto: string): Promise<MergeResult> {
    try {
      const out = await this.runner.run(root, ['rebase', onto], { exclusive: true });
      return {
        status: out.includes('is up to date') ? 'up-to-date' : 'clean',
        conflictedPaths: [],
      };
    } catch (error) {
      return { status: 'conflicts', conflictedPaths: await this.conflictsOrRethrow(root, error) };
    }
  }

  /**
   * Reset nhánh hiện tại về 1 commit (dialog Reset — context menu History).
   * --hard huỷ thay đổi local: dialog phía UI đã cảnh báo rõ trước khi gọi.
   */
  async reset(root: string, oid: string, mode: ResetMode): Promise<void> {
    await this.runner.run(root, ['reset', `--${mode}`, oid], { exclusive: true });
  }

  /** Danh sách file đang conflict (unmerged) trong working tree. */
  async listConflictedPaths(root: string): Promise<string[]> {
    const out = await this.runner.run(root, ['diff', '--name-only', '--diff-filter=U', '-z']);
    return out.split('\0').filter((p) => p !== '');
  }

  /**
   * Merge/rebase exit ≠ 0 có 2 khả năng: conflict (bình thường — trả danh sách
   * file) hoặc lỗi thật (ff-only không ff được, ref sai…) — ném lại nguyên vẹn.
   */
  private async conflictsOrRethrow(root: string, error: unknown): Promise<string[]> {
    if (!(error instanceof GitError)) {
      throw error;
    }
    const conflicted = await this.listConflictedPaths(root);
    if (conflicted.length === 0) {
      throw error;
    }
    return conflicted;
  }

  /** Abort thao tác đang dở — lệnh tuỳ trạng thái (spec 2.4: merge/rebase dùng chung luồng). */
  async abortOperation(root: string, activity: 'merging' | 'rebasing' | 'cherry-picking'): Promise<void> {
    const command = {
      merging: ['merge', '--abort'],
      rebasing: ['rebase', '--abort'],
      'cherry-picking': ['cherry-pick', '--abort'],
    }[activity];
    await this.runner.run(root, command, { exclusive: true });
  }

  /**
   * Continue cho rebase/cherry-pick (đi từng commit — spec 2.4).
   * Merge không có continue: hoàn tất bằng Commit (message đã điền sẵn).
   */
  async continueOperation(root: string, activity: 'rebasing' | 'cherry-picking'): Promise<void> {
    const command = {
      rebasing: ['rebase', '--continue'],
      'cherry-picking': ['cherry-pick', '--continue'],
    }[activity];
    await this.runner.run(root, command, { exclusive: true });
  }
}

/**
 * `git log`/`rev-parse HEAD` trên repo chưa có commit trả lỗi thay vì rỗng.
 * LC_ALL=C trong SpawnGitRunner đảm bảo message ổn định để nhận diện.
 */
function isEmptyRepoError(error: unknown): boolean {
  return (
    error instanceof GitError &&
    (error.stderr.includes('does not have any commits yet') ||
      error.stderr.includes('bad default revision') ||
      error.stderr.includes('unknown revision'))
  );
}

/** Args `git checkout` theo CheckoutOptions — dùng chung cho checkout thường và stash & re-apply. */
function checkoutArgs(ref: string, o: CheckoutOptions): string[] {
  const args = ['checkout'];
  if (o.force) {
    args.push('--force');
  }
  if (o.newBranch !== undefined && o.newBranch !== null) {
    args.push('-b', o.newBranch); // tạo nhánh mới tại ref rồi đứng trên đó
  }
  args.push(ref);
  return args;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
