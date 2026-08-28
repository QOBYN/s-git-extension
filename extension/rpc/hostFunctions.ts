// Hiện thực HostFunctions (shared/protocol.ts) — cầu nối RPC → services.
// File này KHÔNG chứa logic git; chỉ điều phối và chuyển đổi dữ liệu cho webview.

import type { HostFunctions } from '../../shared/protocol';
import type {
  DiffPayload,
  DiffTarget,
  LogPage,
  MediaDiffInfo,
  PanelMode,
  WorkingTreeStatus,
} from '../../shared/types';
import {
  extensionOf,
  hasBinaryContent,
  isKnownBinaryExtension,
  isOpaqueBinaryExtension,
  isVideoExtension,
} from '../services/binaryDetect';
import type { CacheIndex } from '../services/cacheIndex';
import type { FeedbackService } from '../services/feedbackService';
import type { GitService } from '../services/gitService';
import type { MediaExporter } from '../services/mediaExporter';
import type { RepoManager } from '../services/repoManager';
import type { RepoStateReader } from '../services/repoStateReader';
import { GitError, GitOutputLimitError, type GitRunner } from '../services/gitRunner';

/** Cổng mở panel chính — composition root nối với MainPanel (tránh import vòng views). */
export interface PanelOpener {
  open(
    repoRoot: string | null,
    mode: PanelMode | null,
    folder: string | null,
    ref: string | null,
    search: string | null,
  ): void;
}

/** Hành động phía VSCode/OS cho context menu file (G) — impl ở composition root. */
export interface ShellPort {
  openFile(repoRoot: string, relPath: string): void;
  revealInOS(repoRoot: string, relPath: string): void;
  openFileLog(repoRoot: string, relPath: string): void;
  openInTerminal(repoRoot: string, relPath: string): void;
  findInFolder(repoRoot: string, relPath: string): void;
  /** Đổi tên giữ nguyên thư mục cha. */
  renamePath(repoRoot: string, relPath: string, newName: string): Promise<void>;
  /** Hỏi xác nhận (modal VSCode) rồi chuyển vào Trash — false = user huỷ. */
  deletePath(repoRoot: string, relPath: string): Promise<boolean>;
  /** Mở file bằng ứng dụng mặc định của HĐH (video player, PDF viewer…). */
  openExternal(fsPath: string): void;
}

export interface HostFunctionDeps {
  repoManager: RepoManager;
  git: GitService;
  stateReader: RepoStateReader;
  runner: GitRunner;
  cache: CacheIndex;
  panelOpener: PanelOpener;
  shell: ShellPort;
  feedback: FeedbackService;
  /** Xuất blob video ra thư mục tạm để webview đọc trực tiếp (diff video). */
  mediaExporter: MediaExporter;
  /** Đổi fsPath → webview URI (impl ở views/webviewHost — cần 1 webview đang sống). */
  toWebviewUri: (fsPath: string) => string | null;
}

export function createHostFunctions(deps: HostFunctionDeps): HostFunctions {
  const {
    repoManager,
    git,
    stateReader,
    runner,
    cache,
    panelOpener,
    shell,
    feedback,
    mediaExporter,
    toWebviewUri,
  } = deps;

  /**
   * Trang đầu của log đi qua cache (architecture.md mục 4): nếu headOid VÀ
   * refsSignature không đổi thì trả cache ngay (mở panel tức thì trên repo lớn);
   * lệch thì quét git thật rồi cập nhật cache. Trang "Load more" (skip>0)
   * không cache — luôn quét.
   */
  async function getLogCached(repoRoot: string, opts?: Parameters<GitService['getLog']>[1]): Promise<LogPage> {
    // Trang "Load more", log lọc theo ref, và log theo file không cache —
    // chỉ cache trang đầu mặc định của graph.
    if (opts?.skip || (opts?.ref?.length ?? 0) > 0 || opts?.path) {
      return git.getLog(repoRoot, opts);
    }
    const [headOid, refsSignature] = await Promise.all([
      git.getHeadOid(repoRoot),
      git.getRefsSignature(repoRoot),
    ]);
    const cached = await cache.load(repoRoot);
    if (cached !== null && cached.headOid === headOid && cached.refsSignature === refsSignature) {
      return { commits: cached.commits, hasMore: cached.hasMore, headOid };
    }
    const page = await git.getLog(repoRoot, opts);
    await cache.save(repoRoot, {
      headOid: page.headOid,
      refsSignature,
      hasMore: page.hasMore,
      commits: page.commits,
    });
    return page;
  }

  return {
    // ---- đọc (P0) ----
    listRepos: () => repoManager.listRepos(),

    getLog: (repoRoot, opts) => getLogCached(repoRoot, opts),

    listRefs: (repoRoot) => git.listRefs(repoRoot),
    getSubmoduleLog: (repoRoot, path, range, skip) =>
      git.getSubmoduleLog(repoRoot, path, range, skip),
    getCommitFiles: (repoRoot, oid) => git.getCommitFiles(repoRoot, oid),
    getCommitBody: (repoRoot, oid) => git.getCommitBody(repoRoot, oid),

    listFolders: (repoRoot) => git.listFolders(repoRoot),

    async openPanel(repoRoot, mode, folder, ref, search) {
      panelOpener.open(repoRoot, mode, folder ?? null, ref ?? null, search ?? null);
    },

    async getStatus(repoRoot, scope): Promise<WorkingTreeStatus> {
      const [status, gitDir] = await Promise.all([
        git.getStatus(repoRoot, scope),
        git.getGitDir(repoRoot),
      ]);
      const state = await stateReader.read(gitDir);
      return {
        ...status,
        activity: state.activity,
        activityMessage: state.message,
      };
    },

    async getDiff(repoRoot, target): Promise<DiffPayload> {
      // Video: không gửi nội dung qua RPC — cấp webview URI cho thẻ <video>
      // đọc trực tiếp (file working tree, hoặc blob xuất ra thư mục tạm).
      if (isVideoExtension(target.path)) {
        return mediaDiff(repoRoot, target, 'video');
      }
      // Nhị phân "đục" (zip/pdf/mp3…): kiểu gì cũng chỉ hiện note kích thước —
      // hỏi size là đủ, khỏi bơm nội dung (có thể hàng trăm MB) qua RPC.
      if (isOpaqueBinaryExtension(target.path)) {
        return mediaDiff(repoRoot, target, 'binary');
      }
      // Đọc base64 thống nhất rồi mới quyết định text/binary — tránh đọc 2 lần.
      let originalB64: string;
      let modifiedB64: string;
      try {
        [originalB64, modifiedB64] = await Promise.all([
          readSide(repoRoot, target, 'original'),
          readSide(repoRoot, target, 'modified'),
        ]);
      } catch (error) {
        // File vượt giới hạn đọc (text/ảnh khổng lồ) — note "quá lớn" thay vì
        // ném lỗi thô ra UI.
        if (error instanceof GitOutputLimitError) {
          return mediaDiff(repoRoot, target, 'tooLarge');
        }
        // Path là SUBMODULE: entry trong index/tree là gitlink (commit SHA của
        // repo con, không phải blob) nên `git show :path` fail "bad object" —
        // trả view so sánh con trỏ thay vì diff nội dung.
        if (error instanceof GitError && error.stderr.includes('bad object')) {
          const submodule = await git.getSubmoduleDiff(repoRoot, target);
          if (submodule !== null) {
            return { original: '', modified: '', encoding: 'text', submodule };
          }
        }
        throw error;
      }
      const originalBuffer = Buffer.from(originalB64, 'base64');
      const modifiedBuffer = Buffer.from(modifiedB64, 'base64');
      // 2 phía đều rỗng: có thể là thư mục repo git LỒNG chưa add (untracked —
      // `git show :path` không lỗi mà trả rỗng, đọc file trên đĩa cũng rỗng vì
      // là thư mục). Nếu đúng thì hiển thị view submodule "mới thêm" thay vì
      // diff trống vô nghĩa.
      if (originalBuffer.length === 0 && modifiedBuffer.length === 0) {
        const submodule = await git.getSubmoduleDiff(repoRoot, target);
        if (submodule !== null) {
          return { original: '', modified: '', encoding: 'text', submodule };
        }
      }
      const binary =
        isKnownBinaryExtension(target.path) ||
        hasBinaryContent(originalBuffer) ||
        hasBinaryContent(modifiedBuffer);
      if (binary) {
        return { original: originalB64, modified: modifiedB64, encoding: 'base64' };
      }
      return {
        original: originalBuffer.toString('utf8'),
        modified: modifiedBuffer.toString('utf8'),
        encoding: 'text',
      };
    },

    // ---- ghi (P1) ----
    stage: (repoRoot, paths) => git.stage(repoRoot, paths),
    unstage: (repoRoot, paths) => git.unstage(repoRoot, paths),
    commit: (repoRoot, message, opts) => git.commit(repoRoot, message, opts),

    discard: (repoRoot, paths) => git.discard(repoRoot, paths),
    checkout: (repoRoot, ref, opts) => git.checkout(repoRoot, ref, opts),
    stashPush: (repoRoot, message) => git.stashPush(repoRoot, message),
    stashPop: (repoRoot) => git.stashPop(repoRoot),
    createBranch: (repoRoot, name, oid) => git.createBranch(repoRoot, name, oid),
    createTag: (repoRoot, name, oid) => git.createTag(repoRoot, name, oid),
    deleteBranch: (repoRoot, name, force) => git.deleteBranch(repoRoot, name, force),
    renameBranch: (repoRoot, oldName, newName) => git.renameBranch(repoRoot, oldName, newName),
    deleteTag: (repoRoot, name) => git.deleteTag(repoRoot, name),

    async openFile(repoRoot, relPath) {
      shell.openFile(repoRoot, relPath);
    },
    async revealInOS(repoRoot, relPath) {
      shell.revealInOS(repoRoot, relPath);
    },
    async openFileLog(repoRoot, relPath) {
      shell.openFileLog(repoRoot, relPath);
    },
    async openInTerminal(repoRoot, relPath) {
      shell.openInTerminal(repoRoot, relPath);
    },
    async findInFolder(repoRoot, relPath) {
      shell.findInFolder(repoRoot, relPath);
    },
    renamePath: (repoRoot, relPath, newName) => shell.renamePath(repoRoot, relPath, newName),
    deletePath: (repoRoot, relPath) => shell.deletePath(repoRoot, relPath),
    async openPathExternal(fsPath) {
      shell.openExternal(fsPath);
    },

    stageHunk: (repoRoot, patch) => git.stageHunk(repoRoot, patch),
    unstageHunk: (repoRoot, patch) => git.unstageHunk(repoRoot, patch),
    revertHunk: (repoRoot, patch) => git.revertHunk(repoRoot, patch),

    async saveWorkingFile(repoRoot, relPath, content) {
      const { writeFile } = await import('node:fs/promises');
      const { resolve, sep } = await import('node:path');
      // Chặn path traversal: file ghi ra phải nằm TRONG repo.
      const absPath = resolve(repoRoot, relPath);
      if (!absPath.startsWith(resolve(repoRoot) + sep)) {
        throw new Error(`Đường dẫn ngoài repo: ${relPath}`);
      }
      await writeFile(absPath, content, 'utf8');
    },

    // ---- quản lý remote ----
    listRemotes: (repoRoot) => git.listRemotes(repoRoot),
    addRemote: (repoRoot, name, url) => git.addRemote(repoRoot, name, url),
    editRemote: (repoRoot, oldName, newName, url) => git.editRemote(repoRoot, oldName, newName, url),

    // ---- remote (P2) ----
    fetch: (repoRoot) => git.fetch(repoRoot),
    pull: (repoRoot, mode) => git.pull(repoRoot, mode),
    push: (repoRoot, to) => git.push(repoRoot, to),

    // ---- merge / rebase / reset (P2) ----
    merge: (repoRoot, target, strategy) => git.merge(repoRoot, target, strategy),
    rebase: (repoRoot, onto) => git.rebase(repoRoot, onto),
    reset: (repoRoot, oid, mode) => git.reset(repoRoot, oid, mode),

    async abortOperation(repoRoot) {
      const activity = await currentActivity(repoRoot);
      if (activity === 'none') {
        throw new Error('Không có thao tác nào đang dở để abort');
      }
      await git.abortOperation(repoRoot, activity);
    },

    async continueOperation(repoRoot) {
      const activity = await currentActivity(repoRoot);
      if (activity !== 'rebasing' && activity !== 'cherry-picking') {
        // Merge không có continue — hoàn tất bằng Commit (spec 2.4).
        throw new Error('Continue chỉ áp dụng cho rebase/cherry-pick đang dở');
      }
      await git.continueOperation(repoRoot, activity);
    },

    // ---- feedback ----
    async isFeedbackConfigured() {
      return feedback.isConfigured();
    },
    // Chốt chặn cuối: FeedbackService đã tự bắt lỗi, nhưng nếu có gì ngoài dự
    // kiến ném ra (payload lạ, service đổi sau này) thì cũng phải thành
    // FeedbackResult — Error đi qua birpc bị JSON hoá thành {} nên webview sẽ
    // treo ở trạng thái "Đang gửi…" mà không biết vì sao.
    async sendFeedback(payload) {
      try {
        return await feedback.send(payload);
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };

  async function currentActivity(repoRoot: string) {
    const gitDir = await git.getGitDir(repoRoot);
    return (await stateReader.read(gitDir)).activity;
  }

  /**
   * DiffPayload không mang nội dung (video / nhị phân đục / quá lớn) — chỉ
   * kích thước 2 phía, và với video thêm webview URI + đường dẫn file trên đĩa.
   */
  async function mediaDiff(
    repoRoot: string,
    target: DiffTarget,
    kind: MediaDiffInfo['kind'],
  ): Promise<DiffPayload> {
    // Chỉ video mới materialize blob ra đĩa (cần cho <video> phát); các kind
    // khác chỉ hỏi size — không tốn IO xuất file mà user có thể chẳng cần.
    const materialize = kind === 'video';
    const ext = extensionOf(target.path);
    const [original, modified] = await Promise.all([
      sideMedia(repoRoot, target, 'original', ext, materialize),
      sideMedia(repoRoot, target, 'modified', ext, materialize),
    ]);
    return {
      original: '',
      modified: '',
      encoding: 'text',
      media: {
        kind,
        originalUri: original.uri,
        modifiedUri: modified.uri,
        originalSize: original.size,
        modifiedSize: modified.size,
        originalFsPath: original.fsPath,
        modifiedFsPath: modified.fsPath,
      },
    };
  }

  /**
   * Thông tin 1 phía của media diff. Best-effort: phía không tồn tại
   * (added/deleted) hoặc đang conflict trả toàn null — UI hiện "(no video)".
   */
  async function sideMedia(
    repoRoot: string,
    target: DiffTarget,
    side: 'original' | 'modified',
    ext: string,
    materialize: boolean,
  ): Promise<{ uri: string | null; size: number | null; fsPath: string | null }> {
    const none = { uri: null, size: null, fsPath: null };
    const spec = showSpec(target, side);
    if (spec === null) {
      // Phía working tree: file nằm sẵn trên đĩa, phục vụ tại chỗ.
      const { stat } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const fsPath = join(repoRoot, target.path);
      try {
        const info = await stat(fsPath);
        return { uri: materialize ? toWebviewUri(fsPath) : null, size: info.size, fsPath };
      } catch {
        return none; // đã xoá khỏi working tree
      }
    }
    try {
      const size = Number.parseInt(
        (await runner.run(repoRoot, ['cat-file', '-s', spec])).trim(),
        10,
      );
      if (!materialize) {
        return { uri: null, size, fsPath: null };
      }
      const fsPath = await mediaExporter.exportBlob(repoRoot, spec, ext);
      return { uri: toWebviewUri(fsPath), size, fsPath };
    } catch (error) {
      if (error instanceof GitError) {
        return none; // path không có ở revision này / gitlink / conflict
      }
      throw error;
    }
  }

  /**
   * Lấy nội dung 1 phía của diff qua `git show`:
   *  - workingTree: index (`:path`) ↔ file trên đĩa (git show không đọc được
   *    working tree nên dùng `cat-file` không được — đọc qua diff của git ở P0
   *    là chưa cần; tạm so index ↔ HEAD khi chưa có adapter đọc file, TODO P0-5).
   *  - index:      HEAD (`HEAD:path`) ↔ index (`:path`)
   *  - commit:     parent (`oid^:path`) ↔ commit (`oid:path`)
   * File không tồn tại ở 1 phía (added/deleted) trả chuỗi rỗng — Monaco render
   * thành diff toàn thêm/toàn xoá, đúng ngữ nghĩa.
   */
  /** Trả BASE64 (an toàn nhị phân); getDiff quyết định decode utf8 hay giữ nguyên. */
  async function readSide(
    repoRoot: string,
    target: DiffTarget,
    side: 'original' | 'modified',
  ): Promise<string> {
    const spec = showSpec(target, side);
    if (spec === null) {
      return readWorkingFile(repoRoot, target.path);
    }
    try {
      return await runner.run(repoRoot, ['show', spec], { encoding: 'base64' });
    } catch (error) {
      if (!(error instanceof GitError)) {
        throw error;
      }
      // Path đang CONFLICT: index chỉ có stage 1/2/3, không có stage 0 nên
      // `git show :path` fail "not at stage 0". Đọc bản "ours" (:2:) thay thế
      // (working tree đang chứa marker conflict để so với nó); ours không có
      // (conflict kiểu deleted-by-us) thì lùi về base (:1:). Với gitlink,
      // `:2:path` fail "bad object" → ném ra để getDiff rơi vào view submodule.
      if (spec.startsWith(':') && error.stderr.includes('not at stage 0')) {
        for (const stage of [2, 1]) {
          try {
            return await runner.run(repoRoot, ['show', `:${stage}${spec}`], { encoding: 'base64' });
          } catch (retryError) {
            if (retryError instanceof GitError && retryError.stderr.includes('not at stage')) {
              continue;
            }
            throw retryError;
          }
        }
        return '';
      }
      if (isMissingPathError(error)) {
        return '';
      }
      throw error;
    }
  }

  /** null = phía này là file working tree (đọc từ đĩa, không qua git show). */
  function showSpec(target: DiffTarget, side: 'original' | 'modified'): string | null {
    switch (target.kind) {
      case 'workingTree':
        return side === 'original' ? `:${target.path}` : null;
      case 'index':
        return side === 'original' ? `HEAD:${target.path}` : `:${target.path}`;
      case 'commit':
        // `oid` bắt buộc theo contract DiffTarget — thiếu là bug ở caller.
        if (!target.oid) {
          throw new Error('DiffTarget.oid là bắt buộc khi kind === "commit"');
        }
        return side === 'original' ? `${target.oid}^:${target.path}` : `${target.oid}:${target.path}`;
      default:
        throw new Error(`DiffTarget.kind không hợp lệ: ${(target as DiffTarget).kind}`);
    }
  }

  async function readWorkingFile(repoRoot: string, relPath: string): Promise<string> {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    try {
      return await readFile(join(repoRoot, relPath), 'base64');
    } catch {
      return ''; // file đã xoá khỏi working tree
    }
  }
}

/** git show báo path không tồn tại ở revision đó (file added/deleted/commit gốc). */
function isMissingPathError(error: GitError): boolean {
  return (
    error.stderr.includes('does not exist') ||
    error.stderr.includes('exists on disk, but not in') ||
    error.stderr.includes('bad revision')
  );
}
