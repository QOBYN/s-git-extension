// Generated from orca/worker/main.ts by scripts/build-orca.mjs — do not edit.

// orca/worker/main.ts
import { mkdtempSync } from "node:fs";
import * as os2 from "node:os";
import * as path8 from "node:path";

// shared/orcaWire.ts
var ORCA_REQUEST = {
  /** Gọi 1 HostFunction: input CallInput → output CallOutput. */
  call: "sgit.call",
  /** Gửi trước tham số quá lớn theo từng mảnh (UploadInput). */
  upload: "sgit.upload",
  /** Lấy từng mảnh của kết quả quá lớn (ChunkInput → { data }). */
  chunk: "sgit.chunk"
};
var ORCA_NOTIFY_EVENT = "sgit.notify";
var DOWNLOAD_CHUNK_UNITS = 3e5;
var INLINE_RESULT_MAX_BYTES = 9e5;
function splitChunks(text, size) {
  if (size < 2) {
    throw new Error("splitChunks: size ph\u1EA3i \u2265 2");
  }
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length && isHighSurrogate(text.charCodeAt(end - 1))) {
      end -= 1;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}
function isHighSurrogate(code) {
  return code >= 55296 && code <= 56319;
}

// extension/adapters/fileStorage.ts
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import * as path from "node:path";
var FileStorage = class {
  /** `baseDir` = context.globalStorageUri.fsPath — do composition root truyền vào. */
  constructor(baseDir) {
    this.baseDir = baseDir;
  }
  dirReady;
  async read(key) {
    try {
      return await readFile(this.fileOf(key), "utf8");
    } catch {
      return null;
    }
  }
  async write(key, value) {
    await this.ensureDir();
    await writeFile(this.fileOf(key), value, "utf8");
  }
  async delete(key) {
    try {
      await unlink(this.fileOf(key));
    } catch {
    }
  }
  ensureDir() {
    this.dirReady ??= mkdir(this.baseDir, { recursive: true }).then(() => void 0);
    return this.dirReady;
  }
  fileOf(key) {
    return path.join(this.baseDir, `${encodeURIComponent(key)}.json`);
  }
};

// extension/adapters/nodeFs.ts
import { access, readFile as readFile2 } from "node:fs/promises";
var NodeFileSystem = class {
  async exists(path9) {
    try {
      await access(path9);
      return true;
    } catch {
      return false;
    }
  }
  async readFile(path9) {
    try {
      return await readFile2(path9, "utf8");
    } catch {
      return null;
    }
  }
};

// extension/core/disposable.ts
var DisposableStore = class {
  disposables = [];
  isDisposed = false;
  register(disposable) {
    if (this.isDisposed) {
      disposable.dispose();
      return disposable;
    }
    this.disposables.push(disposable);
    return disposable;
  }
  dispose() {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }
  get disposed() {
    return this.isDisposed;
  }
};
function toDisposable(fn) {
  let done = false;
  return {
    dispose() {
      if (!done) {
        done = true;
        fn();
      }
    }
  };
}

// extension/core/async.ts
function debounce(fn, delayMs) {
  let timer;
  return {
    call(...args) {
      if (timer !== void 0) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = void 0;
        fn(...args);
      }, delayMs);
    },
    ...toDisposable(() => {
      if (timer !== void 0) {
        clearTimeout(timer);
        timer = void 0;
      }
    })
  };
}
var KeyedMutex = class {
  tails = /* @__PURE__ */ new Map();
  /** Chạy `task` sau khi mọi task cùng key trước đó xong (kể cả khi chúng lỗi). */
  runExclusive(key, task) {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    this.tails.set(key, run.catch(() => {
    }));
    return run;
  }
  /** Promise chờ mọi task đang giữ key xong — cho tác vụ đọc muốn thấy kết quả mới nhất. */
  pending(key) {
    return this.tails.get(key) ?? Promise.resolve();
  }
};

// extension/services/binaryDetect.ts
var IMAGE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".avif"
]);
var VIDEO_EXTENSIONS = /* @__PURE__ */ new Set([
  ".mp4",
  ".m4v",
  ".mov",
  ".webm",
  ".ogv",
  ".avi",
  ".mkv",
  ".mpg",
  ".mpeg"
]);
var BINARY_EXTENSIONS = /* @__PURE__ */ new Set([
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".7z",
  ".jar",
  ".exe",
  ".dll",
  ".dylib",
  ".so",
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
  ".eot",
  ".mp3",
  ".sqlite",
  ".db"
]);
function extensionOf(path9) {
  const dot = path9.lastIndexOf(".");
  return dot === -1 ? "" : path9.slice(dot).toLowerCase();
}
function isKnownBinaryExtension(path9) {
  const ext = extensionOf(path9);
  return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext) || BINARY_EXTENSIONS.has(ext);
}
function isVideoExtension(path9) {
  return VIDEO_EXTENSIONS.has(extensionOf(path9));
}
function isOpaqueBinaryExtension(path9) {
  return BINARY_EXTENSIONS.has(extensionOf(path9));
}
function hasBinaryContent(buffer) {
  const scanLength = Math.min(buffer.length, 8e3);
  for (let i = 0; i < scanLength; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}

// extension/services/gitRunner.ts
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";

// shared/constants.ts
var DEFAULT_LOG_PAGE_SIZE = 1e3;
var DEFAULT_GIT_WATCH_DEBOUNCE_MS = 300;
var DEFAULT_GIT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
var SUBMODULE_PREVIEW_COMMITS = 20;
var SUBMODULE_LOG_PAGE_SIZE = 50;

// extension/services/gitRunner.ts
var GitError = class extends Error {
  constructor(command, code, stderr) {
    super(`git ${command} (exit ${code}): ${stderr.trim()}`);
    this.command = command;
    this.code = code;
    this.stderr = stderr;
    this.name = "GitError";
  }
  /** Dạng serializable để gửi qua RPC (shared/types.GitErrorInfo). */
  toInfo() {
    return { command: this.command, code: this.code, stderr: this.stderr };
  }
};
var GitOutputLimitError = class extends GitError {
  constructor(command, maxBytes) {
    super(command, -1, `output exceeded ${maxBytes} bytes`);
    this.name = "GitOutputLimitError";
  }
};
var SpawnGitRunner = class {
  mutex = new KeyedMutex();
  gitPath;
  maxOutputBytes;
  constructor(options = {}) {
    this.gitPath = options.gitPath ?? "git";
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_GIT_MAX_OUTPUT_BYTES;
  }
  async run(cwd, args, opts = {}) {
    if (opts.exclusive) {
      return this.mutex.runExclusive(cwd, () => this.spawnGit(cwd, args, opts));
    }
    await this.mutex.pending(cwd);
    return this.spawnGit(cwd, args, opts);
  }
  async runToFile(cwd, args, outFile) {
    await this.mutex.pending(cwd);
    return new Promise((resolve4, reject) => {
      const child = this.spawnChild(cwd, args);
      const out = createWriteStream(outFile);
      const stderr = [];
      let settled = false;
      const fail = (error) => {
        if (!settled) {
          settled = true;
          child.kill();
          out.destroy();
          reject(error);
        }
      };
      out.on("error", fail);
      child.stdout.pipe(out);
      child.stderr.on("data", (chunk) => stderr.push(chunk));
      child.on("error", fail);
      child.on("close", (code) => {
        if (settled) {
          return;
        }
        settled = true;
        if (code === 0) {
          out.end(() => resolve4());
        } else {
          out.destroy();
          reject(new GitError(args.join(" "), code ?? -1, Buffer.concat(stderr).toString("utf8")));
        }
      });
      child.stdin.end();
    });
  }
  spawnChild(cwd, args) {
    return spawn(this.gitPath, args, {
      cwd,
      env: {
        ...process.env,
        // Không giữ optional lock — tránh chặn git của user chạy song song ngoài terminal.
        GIT_OPTIONAL_LOCKS: "0",
        // Thông điệp lỗi tiếng Anh ổn định để phát hiện các case như "empty repository".
        LC_ALL: "C",
        // Lệnh cần editor (rebase --continue…) không được treo chờ editor:
        // 'true' = chấp nhận message mặc định.
        GIT_EDITOR: "true",
        // Lệnh network (fetch/pull/push) không được treo chờ nhập credentials
        // trong process nền — fail ngay với thông điệp rõ (user dùng ssh-agent/
        // credential helper như các git GUI khác).
        GIT_TERMINAL_PROMPT: "0"
      }
    });
  }
  spawnGit(cwd, args, opts) {
    const maxBytes = opts.maxOutputBytes ?? this.maxOutputBytes;
    return new Promise((resolve4, reject) => {
      const child = this.spawnChild(cwd, args);
      const stdout = [];
      const stderr = [];
      let outputSize = 0;
      let settled = false;
      const fail = (error) => {
        if (!settled) {
          settled = true;
          child.kill();
          reject(error);
        }
      };
      child.stdout.on("data", (chunk) => {
        outputSize += chunk.length;
        if (outputSize > maxBytes) {
          fail(new GitOutputLimitError(args.join(" "), maxBytes));
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.on("data", (chunk) => stderr.push(chunk));
      child.on("error", fail);
      child.on("close", (code) => {
        if (settled) {
          return;
        }
        settled = true;
        if (code === 0) {
          resolve4(Buffer.concat(stdout).toString(opts.encoding ?? "utf8"));
        } else {
          reject(new GitError(args.join(" "), code ?? -1, Buffer.concat(stderr).toString("utf8")));
        }
      });
      child.stdin.end(opts.stdin ?? "");
    });
  }
};

// extension/rpc/hostFunctions.ts
function createHostFunctions(deps) {
  const {
    repoManager,
    git,
    stateReader,
    runner,
    cache,
    panelOpener,
    shell,
    mediaExporter,
    toWebviewUri
  } = deps;
  async function getLogCached(repoRoot, opts) {
    if (opts?.skip || (opts?.ref?.length ?? 0) > 0 || opts?.path) {
      return git.getLog(repoRoot, opts);
    }
    const [headOid, refsSignature] = await Promise.all([
      git.getHeadOid(repoRoot),
      git.getRefsSignature(repoRoot)
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
      commits: page.commits
    });
    return page;
  }
  return {
    // ---- đọc (P0) ----
    listRepos: () => repoManager.listRepos(),
    getLog: (repoRoot, opts) => getLogCached(repoRoot, opts),
    listRefs: (repoRoot) => git.listRefs(repoRoot),
    suggestBranchName: (repoRoot, oid) => git.suggestBranchName(repoRoot, oid),
    getSubmoduleLog: (repoRoot, path9, range, skip) => git.getSubmoduleLog(repoRoot, path9, range, skip),
    getCommitFiles: (repoRoot, oid) => git.getCommitFiles(repoRoot, oid),
    getCommitBody: (repoRoot, oid) => git.getCommitBody(repoRoot, oid),
    listFolders: (repoRoot) => git.listFolders(repoRoot),
    async openPanel(repoRoot, mode, folder, ref, search) {
      panelOpener.open(repoRoot, mode, folder ?? null, ref ?? null, search ?? null);
    },
    async getStatus(repoRoot, scope) {
      const [status, gitDir] = await Promise.all([
        git.getStatus(repoRoot, scope),
        git.getGitDir(repoRoot)
      ]);
      const state = await stateReader.read(gitDir);
      return {
        ...status,
        activity: state.activity,
        activityMessage: state.message
      };
    },
    async getDiff(repoRoot, target) {
      if (isVideoExtension(target.path)) {
        return mediaDiff(repoRoot, target, "video");
      }
      if (isOpaqueBinaryExtension(target.path)) {
        return mediaDiff(repoRoot, target, "binary");
      }
      let originalB64;
      let modifiedB64;
      try {
        [originalB64, modifiedB64] = await Promise.all([
          readSide(repoRoot, target, "original"),
          readSide(repoRoot, target, "modified")
        ]);
      } catch (error) {
        if (error instanceof GitOutputLimitError) {
          return mediaDiff(repoRoot, target, "tooLarge");
        }
        if (error instanceof GitError && error.stderr.includes("bad object")) {
          const submodule = await git.getSubmoduleDiff(repoRoot, target);
          if (submodule !== null) {
            return { original: "", modified: "", encoding: "text", submodule };
          }
        }
        throw error;
      }
      const originalBuffer = Buffer.from(originalB64, "base64");
      const modifiedBuffer = Buffer.from(modifiedB64, "base64");
      if (originalBuffer.length === 0 && modifiedBuffer.length === 0) {
        const submodule = await git.getSubmoduleDiff(repoRoot, target);
        if (submodule !== null) {
          return { original: "", modified: "", encoding: "text", submodule };
        }
      }
      const binary = isKnownBinaryExtension(target.path) || hasBinaryContent(originalBuffer) || hasBinaryContent(modifiedBuffer);
      if (binary) {
        return { original: originalB64, modified: modifiedB64, encoding: "base64" };
      }
      return {
        original: originalBuffer.toString("utf8"),
        modified: modifiedBuffer.toString("utf8"),
        encoding: "text"
      };
    },
    // ---- ghi (P1) ----
    stage: (repoRoot, paths) => git.stage(repoRoot, paths),
    unstage: (repoRoot, paths) => git.unstage(repoRoot, paths),
    commit: (repoRoot, message, opts) => git.commit(repoRoot, message, opts),
    discard: (repoRoot, paths) => git.discard(repoRoot, paths),
    checkout: (repoRoot, ref, opts) => git.checkout(repoRoot, ref, opts),
    checkoutStashReapply: (repoRoot, ref, opts, stashMessage) => git.checkoutStashReapply(repoRoot, ref, opts, stashMessage),
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
      const { writeFile: writeFile2 } = await import("node:fs/promises");
      const { resolve: resolve4, sep: sep4 } = await import("node:path");
      const absPath = resolve4(repoRoot, relPath);
      if (!absPath.startsWith(resolve4(repoRoot) + sep4)) {
        throw new Error(`\u0110\u01B0\u1EDDng d\u1EABn ngo\xE0i repo: ${relPath}`);
      }
      await writeFile2(absPath, content, "utf8");
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
      if (activity === "none") {
        throw new Error("Kh\xF4ng c\xF3 thao t\xE1c n\xE0o \u0111ang d\u1EDF \u0111\u1EC3 abort");
      }
      await git.abortOperation(repoRoot, activity);
    },
    async continueOperation(repoRoot) {
      const activity = await currentActivity(repoRoot);
      if (activity !== "rebasing" && activity !== "cherry-picking") {
        throw new Error("Continue ch\u1EC9 \xE1p d\u1EE5ng cho rebase/cherry-pick \u0111ang d\u1EDF");
      }
      await git.continueOperation(repoRoot, activity);
    }
  };
  async function currentActivity(repoRoot) {
    const gitDir = await git.getGitDir(repoRoot);
    return (await stateReader.read(gitDir)).activity;
  }
  async function mediaDiff(repoRoot, target, kind) {
    const materialize = kind === "video";
    const ext = extensionOf(target.path);
    const [original, modified] = await Promise.all([
      sideMedia(repoRoot, target, "original", ext, materialize),
      sideMedia(repoRoot, target, "modified", ext, materialize)
    ]);
    return {
      original: "",
      modified: "",
      encoding: "text",
      media: {
        kind,
        originalUri: original.uri,
        modifiedUri: modified.uri,
        originalSize: original.size,
        modifiedSize: modified.size,
        originalFsPath: original.fsPath,
        modifiedFsPath: modified.fsPath
      }
    };
  }
  async function sideMedia(repoRoot, target, side, ext, materialize) {
    const none = { uri: null, size: null, fsPath: null };
    const spec = showSpec(target, side);
    if (spec === null) {
      const { stat } = await import("node:fs/promises");
      const { join: join10 } = await import("node:path");
      const fsPath = join10(repoRoot, target.path);
      try {
        const info = await stat(fsPath);
        return { uri: materialize ? toWebviewUri(fsPath) : null, size: info.size, fsPath };
      } catch {
        return none;
      }
    }
    try {
      const size = Number.parseInt(
        (await runner.run(repoRoot, ["cat-file", "-s", spec])).trim(),
        10
      );
      if (!materialize) {
        return { uri: null, size, fsPath: null };
      }
      const fsPath = await mediaExporter.exportBlob(repoRoot, spec, ext);
      return { uri: toWebviewUri(fsPath), size, fsPath };
    } catch (error) {
      if (error instanceof GitError) {
        return none;
      }
      throw error;
    }
  }
  async function readSide(repoRoot, target, side) {
    const spec = showSpec(target, side);
    if (spec === null) {
      return readWorkingFile(repoRoot, target.path);
    }
    try {
      return await runner.run(repoRoot, ["show", spec], { encoding: "base64" });
    } catch (error) {
      if (!(error instanceof GitError)) {
        throw error;
      }
      if (spec.startsWith(":") && error.stderr.includes("not at stage 0")) {
        for (const stage of [2, 1]) {
          try {
            return await runner.run(repoRoot, ["show", `:${stage}${spec}`], { encoding: "base64" });
          } catch (retryError) {
            if (retryError instanceof GitError && retryError.stderr.includes("not at stage")) {
              continue;
            }
            throw retryError;
          }
        }
        return "";
      }
      if (isMissingPathError(error)) {
        return "";
      }
      throw error;
    }
  }
  function showSpec(target, side) {
    switch (target.kind) {
      case "workingTree":
        return side === "original" ? `:${target.path}` : null;
      case "index":
        return side === "original" ? `HEAD:${target.path}` : `:${target.path}`;
      case "commit":
        if (!target.oid) {
          throw new Error('DiffTarget.oid l\xE0 b\u1EAFt bu\u1ED9c khi kind === "commit"');
        }
        return side === "original" ? `${target.oid}^:${target.path}` : `${target.oid}:${target.path}`;
      default:
        throw new Error(`DiffTarget.kind kh\xF4ng h\u1EE3p l\u1EC7: ${target.kind}`);
    }
  }
  async function readWorkingFile(repoRoot, relPath) {
    const { readFile: readFile3 } = await import("node:fs/promises");
    const { join: join10 } = await import("node:path");
    try {
      return await readFile3(join10(repoRoot, relPath), "base64");
    } catch {
      return "";
    }
  }
}
function isMissingPathError(error) {
  return error.stderr.includes("does not exist") || error.stderr.includes("exists on disk, but not in") || error.stderr.includes("bad revision");
}

// extension/services/cacheIndex.ts
var SCHEMA_VERSION = 2;
var KEY_PREFIX = "logcache";
var CacheIndex = class {
  constructor(storage) {
    this.storage = storage;
  }
  /** null khi chưa có cache, cache hỏng, hoặc schema cũ — caller cứ thế quét mới. */
  async load(repoRoot) {
    const raw = await this.storage.read(cacheKey(repoRoot));
    if (raw === null) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.commits)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
  async save(repoRoot, data) {
    const full = { schemaVersion: SCHEMA_VERSION, ...data };
    await this.storage.write(cacheKey(repoRoot), JSON.stringify(full));
  }
  async invalidate(repoRoot) {
    await this.storage.delete(cacheKey(repoRoot));
  }
};
function cacheKey(repoRoot) {
  return `${KEY_PREFIX}:${encodeURIComponent(repoRoot)}`;
}

// extension/services/gitService.ts
import { createHash } from "node:crypto";
import { join as join2 } from "node:path";

// extension/services/commitFilesParser.ts
var NUL = "\0";
function parseCommitFiles(stdout) {
  const files = [];
  const tokens = stdout.split(NUL);
  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i];
    if (status === "" || status === void 0) {
      continue;
    }
    const kind = kindOf(status[0]);
    if (kind === null) {
      continue;
    }
    if (kind === "renamed" || kind === "copied") {
      const origPath = tokens[++i] ?? "";
      const path9 = tokens[++i] ?? "";
      files.push({ path: path9, origPath, kind });
    } else {
      const path9 = tokens[++i] ?? "";
      files.push({ path: path9, kind });
    }
  }
  return files;
}
function kindOf(letter) {
  switch (letter) {
    case "M":
      return "modified";
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "T":
      return "typechange";
    default:
      return null;
  }
}

// shared/folders.ts
function foldersFromPaths(filePaths) {
  const folders = /* @__PURE__ */ new Set();
  for (const filePath of filePaths) {
    let end = filePath.lastIndexOf("/");
    while (end > 0) {
      const dir = filePath.slice(0, end);
      if (folders.has(dir)) {
        break;
      }
      folders.add(dir);
      end = dir.lastIndexOf("/");
    }
  }
  return [...folders].sort();
}

// extension/services/submoduleParser.ts
function parseSubmodulePaths(stdout) {
  const paths = [];
  for (const entry of stdout.split("\0")) {
    if (entry === "") {
      continue;
    }
    const newline = entry.indexOf("\n");
    if (newline === -1) {
      continue;
    }
    paths.push(entry.slice(newline + 1));
  }
  return paths.sort();
}

// extension/services/logParser.ts
var FIELD_SEP = "";
var RECORD_SEP = "";
var LOG_FORMAT = ["%H", "%P", "%an", "%ae", "%aI", "%D", "%s"].join(FIELD_SEP) + RECORD_SEP;
var FIELD_COUNT = 7;
function parseLog(stdout) {
  const commits = [];
  for (const record of stdout.split(RECORD_SEP)) {
    if (record.trim() === "") {
      continue;
    }
    const fields = record.replace(/^\n/, "").split(FIELD_SEP);
    if (fields.length !== FIELD_COUNT) {
      continue;
    }
    const [oid, parents, author, email, date, refs, subject] = fields;
    commits.push({
      oid,
      parents: parents === "" ? [] : parents.split(" "),
      author,
      email,
      date,
      refs: parseRefs(refs),
      subject
    });
  }
  return commits;
}
function parseRefs(raw) {
  if (raw === "") {
    return [];
  }
  return raw.split(", ").filter((part) => part !== "");
}

// extension/services/refParser.ts
var FIELD_SEP2 = "";
var FOR_EACH_REF_FORMAT = ["%(HEAD)", "%(refname)", "%(objectname)"].join(FIELD_SEP2);
var FOR_EACH_REF_ARGS = [
  "for-each-ref",
  `--format=${FOR_EACH_REF_FORMAT}`,
  "refs/heads",
  "refs/remotes",
  "refs/tags"
];
var NAMESPACES = [
  { prefix: "refs/heads/", kind: "local" },
  { prefix: "refs/remotes/", kind: "remote" },
  { prefix: "refs/tags/", kind: "tag" }
];
function parseRefs2(stdout) {
  const refs = [];
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    const [headMarker, fullName, oid] = line.split(FIELD_SEP2);
    if (fullName === void 0 || oid === void 0) {
      continue;
    }
    const namespace = NAMESPACES.find((ns) => fullName.startsWith(ns.prefix));
    if (namespace === void 0) {
      continue;
    }
    const name = fullName.slice(namespace.prefix.length);
    if (namespace.kind === "remote" && name.endsWith("/HEAD")) {
      continue;
    }
    refs.push({
      name,
      fullName,
      kind: namespace.kind,
      oid,
      isHead: headMarker === "*"
    });
  }
  return refs;
}
function parseNameRev(stdout, kind) {
  let name = stdout.trim().split("\n")[0] ?? "";
  if (name === "" || name === "undefined") {
    return null;
  }
  const cut = name.search(/[~^]/);
  if (cut !== -1) {
    name = name.slice(0, cut);
  }
  if (kind === "remote") {
    name = name.replace(/^remotes\//, "");
    const slash = name.indexOf("/");
    if (slash === -1) {
      return null;
    }
    name = name.slice(slash + 1);
  } else {
    name = name.replace(/^heads\//, "");
  }
  return name === "" || name === "HEAD" ? null : name;
}

// extension/services/statusParser.ts
var NUL2 = "\0";
function parseStatusV2(stdout) {
  const result = { branch: null, upstream: null, ahead: 0, behind: 0, files: [] };
  const tokens = stdout.split(NUL2);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "") {
      continue;
    }
    switch (token[0]) {
      case "#":
        parseHeader(token, result);
        break;
      case "1": {
        const { fields, rest } = splitFields(token, 8);
        result.files.push(makeChange(fields[1], rest, fields[2]));
        break;
      }
      case "2": {
        const { fields, rest } = splitFields(token, 9);
        const origPath = tokens[++i] ?? "";
        result.files.push({ ...makeChange(fields[1], rest, fields[2]), origPath });
        break;
      }
      case "u": {
        const { fields, rest } = splitFields(token, 10);
        result.files.push({
          path: rest,
          staged: null,
          unstaged: null,
          untracked: false,
          conflicted: true,
          ...isSubmodule(fields[2]) ? { submodule: true } : {}
        });
        break;
      }
      case "?":
        result.files.push({
          path: token.slice(2),
          staged: null,
          unstaged: null,
          untracked: true,
          conflicted: false
        });
        break;
      case "!":
        result.files.push({
          path: token.slice(2).replace(/\/$/, ""),
          staged: null,
          unstaged: null,
          untracked: false,
          conflicted: false,
          ignored: true
        });
        break;
      default:
        break;
    }
  }
  return result;
}
function parseSubmoduleStates(stdout) {
  const states = [];
  const tokens = stdout.split(NUL2);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "") {
      continue;
    }
    const count = token[0] === "1" ? 8 : token[0] === "2" ? 9 : token[0] === "u" ? 10 : 0;
    if (count === 0) {
      continue;
    }
    const { fields, rest } = splitFields(token, count);
    if (token[0] === "2") {
      i++;
    }
    const sub = fields[2];
    if (!isSubmodule(sub) || rest === "") {
      continue;
    }
    states.push({
      path: rest,
      pointerMoved: sub[1] === "C",
      dirty: sub[2] === "M" || sub[3] === "U"
    });
  }
  return states;
}
function parseHeader(token, result) {
  if (token.startsWith("# branch.head ")) {
    const head = token.slice("# branch.head ".length);
    result.branch = head === "(detached)" ? null : head;
  } else if (token.startsWith("# branch.upstream ")) {
    result.upstream = token.slice("# branch.upstream ".length);
  } else if (token.startsWith("# branch.ab ")) {
    const match = /^# branch\.ab \+(\d+) -(\d+)$/.exec(token);
    if (match) {
      result.ahead = Number(match[1]);
      result.behind = Number(match[2]);
    }
  }
}
function splitFields(token, count) {
  const fields = [];
  let start = 0;
  for (let n = 0; n < count; n++) {
    const idx = token.indexOf(" ", start);
    if (idx === -1) {
      return { fields, rest: "" };
    }
    fields.push(token.slice(start, idx));
    start = idx + 1;
  }
  return { fields, rest: token.slice(start) };
}
function isSubmodule(sub) {
  return sub !== void 0 && sub.startsWith("S");
}
function makeChange(xy, path9, sub) {
  return {
    path: path9,
    staged: kindOf2(xy[0]),
    unstaged: kindOf2(xy[1]),
    untracked: false,
    conflicted: false,
    ...isSubmodule(sub) ? { submodule: true } : {}
  };
}
function kindOf2(code) {
  switch (code) {
    case "M":
      return "modified";
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "T":
      return "typechange";
    default:
      return null;
  }
}

// extension/services/gitService.ts
var GitService = class {
  constructor(runner, options = {}) {
    this.runner = runner;
    this.logPageSize = options.logPageSize ?? DEFAULT_LOG_PAGE_SIZE;
  }
  logPageSize;
  // ---- truy vấn (P0) ----
  async isRepo(root) {
    try {
      const out = await this.runner.run(root, ["rev-parse", "--is-inside-work-tree"]);
      return out.trim() === "true";
    } catch {
      return false;
    }
  }
  /** Đường dẫn thư mục .git đã resolve (xử lý cả worktree có .git dạng file). */
  async getGitDir(root) {
    const out = await this.runner.run(root, ["rev-parse", "--absolute-git-dir"]);
    return out.trim();
  }
  /** null khi repo chưa có commit nào. */
  async getHeadOid(root) {
    try {
      const out = await this.runner.run(root, ["rev-parse", "HEAD"]);
      return out.trim();
    } catch (error) {
      if (isEmptyRepoError(error)) {
        return null;
      }
      throw error;
    }
  }
  async getCurrentBranch(root) {
    const out = await this.runner.run(root, ["branch", "--show-current"]);
    const name = out.trim();
    return name === "" ? null : name;
  }
  async getLog(root, options) {
    const opts = options ?? {};
    const limit = opts.limit ?? this.logPageSize;
    const args = [
      "log",
      "--date-order",
      `--pretty=format:${LOG_FORMAT}`,
      // Lấy dư 1 commit để biết còn trang sau không mà không cần đếm toàn bộ.
      `--max-count=${limit + 1}`
    ];
    if (opts.path) {
      args.push("--follow");
    }
    const refs = typeof opts.ref === "string" ? [opts.ref] : opts.ref ?? [];
    if (refs.length > 0) {
      args.push(...refs);
    } else if (!opts.path && (opts.all ?? true)) {
      args.push("--all");
    }
    if (opts.skip) {
      args.push(`--skip=${opts.skip}`);
    }
    if (opts.path) {
      args.push("--", opts.path);
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
      headOid: await this.getHeadOid(root)
    };
  }
  async getStatus(root, scope) {
    scope ??= "changes";
    const out = await this.runner.run(root, [
      "status",
      "--porcelain=v2",
      "-z",
      "--branch",
      // Liệt kê từng file trong thư mục untracked thay vì gộp 1 dòng thư mục —
      // vùng Changed files cần path đầy đủ từng file (ui-analysis mục F).
      "--untracked-files=all",
      // `matching` gộp thư mục ignore nguyên cụm thành 1 dòng (node_modules/) —
      // `traditional` + -uall sẽ liệt kê từng file bên trong, nổ hàng nghìn dòng.
      ...scope === "ignored" ? ["--ignored=matching"] : []
    ]);
    const result = parseStatusV2(out);
    if (scope !== "changes") {
      const known = new Set(result.files.map((f) => f.path));
      const tracked = await this.runner.run(root, ["ls-files", "-z"]);
      for (const path9 of tracked.split("\0")) {
        if (path9 !== "" && !known.has(path9)) {
          result.files.push({ path: path9, staged: null, unstaged: null, untracked: false, conflicted: false });
        }
      }
    }
    return result;
  }
  async listRefs(root) {
    return parseRefs2(await this.runner.run(root, [...FOR_EACH_REF_ARGS]));
  }
  /**
   * Tên gợi ý cho ô "Nhánh mới" của popup Checkout: nhánh REMOTE gần nhất chứa
   * commit (`name-rev` — trúng tip hay nằm giữa nhánh đều có tên; origin/HEAD bỏ
   * qua), không có thì nhánh LOCAL gần nhất; null khi commit không thuộc nhánh nào.
   * Chỉ trả tên thô — webview tự xử va chạm với nhánh local đã có.
   */
  async suggestBranchName(root, oid) {
    const remote = await this.runner.run(root, [
      "name-rev",
      "--name-only",
      "--refs=refs/remotes/*",
      "--exclude=refs/remotes/*/HEAD",
      oid
    ]);
    const fromRemote = parseNameRev(remote, "remote");
    if (fromRemote !== null) {
      return fromRemote;
    }
    const local = await this.runner.run(root, ["name-rev", "--name-only", "--refs=refs/heads/*", oid]);
    return parseNameRev(local, "local");
  }
  /**
   * Chữ ký toàn bộ refs — cache log chỉ hợp lệ khi CẢ headOid lẫn chữ ký này
   * không đổi (tạo nhánh/tag mới đổi graph dù HEAD đứng yên — architecture.md mục 4).
   */
  async getRefsSignature(root) {
    const out = await this.runner.run(root, [...FOR_EACH_REF_ARGS]);
    return createHash("sha1").update(out).digest("hex");
  }
  /** Danh sách file thay đổi của 1 commit (panel B6); -M để phát hiện rename. */
  async getCommitFiles(root, oid) {
    const out = await this.runner.run(root, [
      "show",
      "--format=",
      // chỉ cần phần name-status, không in header commit
      "--name-status",
      "-z",
      "-M",
      // Merge commit: mặc định git show in combined diff (chỉ file khác CẢ 2
      // parent) nên merge sạch trả rỗng. So với parent 1 để khớp readSide
      // (`oid^:path`) bên diff nội dung.
      "-m",
      "--first-parent",
      oid
    ]);
    return parseCommitFiles(out);
  }
  /** Message đầy đủ (subject + body) của 1 commit — panel chi tiết B5. */
  async getCommitBody(root, oid) {
    const out = await this.runner.run(root, ["show", "--no-patch", "--format=%B", oid]);
    return out.trimEnd();
  }
  /**
   * Danh sách path submodule khai báo trong .gitmodules (1 cấp — đệ quy là P2).
   * Repo không có submodule → git config exit 1 → trả rỗng, không phải lỗi.
   */
  async listSubmodulePaths(root) {
    try {
      const out = await this.runner.run(root, [
        "config",
        "-z",
        "--file",
        ".gitmodules",
        "--get-regexp",
        "^submodule\\..*\\.path$"
      ]);
      return parseSubmodulePaths(out);
    } catch (error) {
      if (error instanceof GitError) {
        return [];
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
  async getSubmoduleDiff(root, target) {
    const { kind, path: path9 } = target;
    let oldOid;
    let newOid;
    let dirty = false;
    switch (kind) {
      case "workingTree": {
        const stages = await this.gitlinkStages(root, path9);
        if (!stages.has(0) && stages.size > 0) {
          oldOid = stages.get(2) ?? null;
          newOid = stages.get(3) ?? null;
          dirty = await this.submoduleContentDirty(root, path9);
          break;
        }
        oldOid = stages.get(0) ?? null;
        newOid = await this.submoduleWorkingOid(root, path9);
        dirty = await this.submoduleContentDirty(root, path9);
        if (newOid === null) {
          const nested = await this.nestedRepoInfo(root, path9);
          if (nested !== null) {
            newOid = nested.head;
            dirty = dirty || nested.dirty;
          }
        }
        break;
      }
      case "index":
        oldOid = await this.gitlinkInTree(root, "HEAD", path9);
        newOid = await this.gitlinkInIndex(root, path9);
        break;
      case "commit":
        oldOid = await this.gitlinkInTree(root, `${target.oid}^`, path9);
        newOid = await this.gitlinkInTree(root, target.oid, path9);
        break;
    }
    if (oldOid === null && newOid === null) {
      return null;
    }
    const subRoot = join2(root, path9);
    const [oldCommit, newCommit] = await Promise.all([
      this.submoduleCommitInfo(subRoot, oldOid),
      this.submoduleCommitInfo(subRoot, newOid)
    ]);
    let ahead = [];
    let behind = [];
    let baseOid = null;
    if (oldOid !== null && newOid !== null && oldOid !== newOid) {
      [ahead, behind, baseOid] = await Promise.all([
        this.submoduleLog(subRoot, `${oldOid}..${newOid}`),
        this.submoduleLog(subRoot, `${newOid}..${oldOid}`),
        this.submoduleMergeBase(subRoot, oldOid, newOid)
      ]);
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
      dirty
    };
  }
  /** SHA gitlink của path trong INDEX; ưu tiên stage 0, conflict thì lấy ours. */
  async gitlinkInIndex(root, path9) {
    const stages = await this.gitlinkStages(root, path9);
    return stages.get(0) ?? stages.get(2) ?? stages.get(1) ?? stages.get(3) ?? null;
  }
  /**
   * Map stage → SHA gitlink của path trong INDEX (`ls-files -s` mode 160000).
   * Bình thường chỉ có stage 0; đang conflict thì có 1 (base) / 2 (ours) /
   * 3 (theirs). Map rỗng = không phải gitlink.
   */
  async gitlinkStages(root, path9) {
    const stages = /* @__PURE__ */ new Map();
    try {
      const out = await this.runner.run(root, ["ls-files", "-s", "-z", "--", path9]);
      for (const entry of out.split("\0")) {
        const match = /^160000 ([0-9a-f]+) ([0-3])\t/.exec(entry);
        if (match) {
          stages.set(Number(match[2]), match[1]);
        }
      }
    } catch {
    }
    return stages;
  }
  /** SHA gitlink của path trong tree của `rev`; null = rev/path không có hoặc không phải gitlink. */
  async gitlinkInTree(root, rev, path9) {
    try {
      const out = await this.runner.run(root, ["ls-tree", "-z", rev, "--", path9]);
      const match = /^160000 commit ([0-9a-f]+)\t/.exec(out);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
  /**
   * SHA đang checkout THẬT trong working tree của submodule — qua `git submodule
   * status` của repo CHA (không chạy git trong thư mục con: nếu nó chưa init,
   * git sẽ leo ngược lên repo cha và trả nhầm HEAD của cha).
   * Prefix '-' = chưa init → null.
   */
  async submoduleWorkingOid(root, path9) {
    try {
      const out = await this.runner.run(root, ["submodule", "status", "--", path9]);
      const match = /^([ +U-])([0-9a-f]+) /.exec(out);
      return match === null || match[1] === "-" ? null : match[2];
    } catch {
      return null;
    }
  }
  /**
   * Thư mục path có phải GỐC của 1 repo git lồng (chưa đăng ký submodule)?
   * `--show-prefix` rỗng = cwd chính là gốc repo; khác rỗng = git đã leo ngược
   * lên repo CHA (thư mục thường) — tuyệt đối không được lấy nhầm HEAD của cha.
   */
  async nestedRepoInfo(root, path9) {
    const subRoot = join2(root, path9);
    try {
      const prefix = (await this.runner.run(subRoot, ["rev-parse", "--show-prefix"])).trim();
      if (prefix !== "") {
        return null;
      }
      const head = (await this.runner.run(subRoot, ["rev-parse", "HEAD"])).trim();
      if (!/^[0-9a-f]+$/.test(head)) {
        return null;
      }
      const status = await this.runner.run(subRoot, ["status", "--porcelain", "-z"]);
      return { head, dirty: status !== "" };
    } catch {
      return null;
    }
  }
  /** Nội dung BÊN TRONG submodule có thay đổi chưa commit (field <sub> = S?M?/S??U)? */
  async submoduleContentDirty(root, path9) {
    try {
      const out = await this.runner.run(root, ["status", "--porcelain=v2", "-z", "--", path9]);
      return out.split("\0").some((line) => /^[12u] .. S.[MU]|^[12u] .. S..U/.test(line));
    } catch {
      return false;
    }
  }
  /** Chi tiết 1 commit trong repo con (kèm %D — nhánh/tag trỏ vào nó); best-effort. */
  async submoduleCommitInfo(subRoot, oid) {
    if (oid === null) {
      return null;
    }
    try {
      const out = await this.runner.run(subRoot, [
        "log",
        "--max-count=1",
        `--pretty=format:${LOG_FORMAT}`,
        oid
      ]);
      return parseLog(out)[0] ?? null;
    } catch {
      return null;
    }
  }
  /**
   * Trang tiếp theo của history submodule — nút "show more" khi preview bị cắt.
   * `range` do webview dựng từ oid đã có: "old..new" hoặc 1 oid — validate chặt
   * để không thành flag/tham số lạ của git log.
   */
  async getSubmoduleLog(root, path9, range, skip) {
    if (!/^[0-9a-f]+(\.\.[0-9a-f]+)?$/.test(range)) {
      throw new Error(`Range kh\xF4ng h\u1EE3p l\u1EC7: ${range}`);
    }
    try {
      const out = await this.runner.run(join2(root, path9), [
        "log",
        `--max-count=${SUBMODULE_LOG_PAGE_SIZE + 1}`,
        `--skip=${Math.max(0, Math.floor(skip))}`,
        `--pretty=format:${LOG_FORMAT}`,
        range
      ]);
      const commits = parseLog(out);
      return {
        commits: commits.slice(0, SUBMODULE_LOG_PAGE_SIZE),
        hasMore: commits.length > SUBMODULE_LOG_PAGE_SIZE
      };
    } catch {
      return { commits: [], hasMore: false };
    }
  }
  /** Gốc chung của 2 con trỏ trong repo con (`merge-base`) — best-effort. */
  async submoduleMergeBase(subRoot, oldOid, newOid) {
    try {
      const out = (await this.runner.run(subRoot, ["merge-base", oldOid, newOid])).trim();
      return /^[0-9a-f]+$/.test(out) ? out : null;
    } catch {
      return null;
    }
  }
  /** Log rút gọn trong repo con cho preview (lấy dư 1 để biết có bị cắt). */
  async submoduleLog(subRoot, range) {
    try {
      const out = await this.runner.run(subRoot, [
        "log",
        `--max-count=${SUBMODULE_PREVIEW_COMMITS + 1}`,
        `--pretty=format:${LOG_FORMAT}`,
        range
      ]);
      return parseLog(out);
    } catch {
      return [];
    }
  }
  /** Cây thư mục repo (tracked + untracked, bỏ ignored) — sidebar tab Working Tree. */
  async listFolders(root) {
    const out = await this.runner.run(root, [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      // gồm cả file untracked — thư mục mới chưa add vẫn hiện
      "--exclude-standard"
    ]);
    return foldersFromPaths(out.split("\0").filter((p) => p !== ""));
  }
  // ---- thao tác ghi (P1 — thêm dần theo lộ trình, mọi lệnh ghi đều exclusive) ----
  async stage(root, paths) {
    if (paths.length === 0) {
      return;
    }
    await this.runner.run(root, ["add", "--", ...paths], { exclusive: true });
  }
  async unstage(root, paths) {
    if (paths.length === 0) {
      return;
    }
    await this.runner.run(root, ["restore", "--staged", "--", ...paths], { exclusive: true });
  }
  async commit(root, message, opts) {
    const args = ["commit", "--message", message];
    if (opts?.amend) {
      args.push("--amend");
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
  async discard(root, paths) {
    if (paths.length === 0) {
      return;
    }
    const submodules = new Set(await this.listSubmodulePaths(root));
    const files = paths.filter((p) => !submodules.has(p));
    const subs = paths.filter((p) => submodules.has(p));
    if (files.length > 0) {
      await this.runner.run(root, ["restore", "--", ...files], { exclusive: true });
    }
    if (subs.length > 0) {
      await this.runner.run(root, ["submodule", "update", "--init", "--force", "--", ...subs], {
        exclusive: true
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
  async checkout(root, ref, opts) {
    const o = opts ?? {};
    const subPaths = await this.listSubmodulePaths(root);
    const syncSubmodules = subPaths.length > 0 && (o.force || (await this.listSubmoduleStates(root)).length === 0);
    await this.runner.run(root, checkoutArgs(ref, o), { exclusive: true });
    if (syncSubmodules) {
      const subArgs = ["submodule", "update", "--init"];
      if (o.force) {
        subArgs.push("--force");
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
  async checkoutStashReapply(root, ref, opts, stashMessage) {
    const o = opts ?? {};
    const subPaths = await this.listSubmodulePaths(root);
    const states = subPaths.length > 0 ? await this.listSubmoduleStates(root) : [];
    const dirtySubs = states.filter((s) => s.dirty && subPaths.includes(s.path)).map((s) => s.path);
    const movedSubs = new Set(states.filter((s) => s.pointerMoved).map((s) => s.path));
    const stashedSuper = await this.stashPush(root, stashMessage);
    const stashedSubs = [];
    try {
      for (const sub of dirtySubs) {
        if (await this.stashPush(join2(root, sub), stashMessage)) {
          stashedSubs.push(sub);
        }
      }
      await this.runner.run(root, checkoutArgs(ref, o), { exclusive: true });
    } catch (error) {
      if (stashedSuper) {
        await this.stashPop(root).catch(() => void 0);
      }
      for (const sub of stashedSubs) {
        await this.stashPop(join2(root, sub)).catch(() => void 0);
      }
      throw error;
    }
    const warnings = [];
    const toSync = subPaths.filter((p) => !movedSubs.has(p));
    if (toSync.length > 0) {
      try {
        await this.runner.run(root, ["submodule", "update", "--init", "--", ...toSync], {
          exclusive: true
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
        await this.stashPop(join2(root, sub));
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
  async listSubmoduleStates(root) {
    const out = await this.runner.run(root, ["status", "--porcelain=v2", "-z"]);
    return parseSubmoduleStates(out);
  }
  /**
   * Tạm cất mọi thay đổi chưa commit (kể cả untracked) — bước "stash & re-apply"
   * của popup Checkout. Trả về CÓ TẠO STASH HAY KHÔNG: thay đổi chỉ nằm ở
   * con trỏ submodule (stash không cất được) hoặc working tree sạch thì git in
   * "No local changes to save", exit 0 và KHÔNG tạo entry — caller phải bỏ qua
   * bước `stash pop` kẻo lỗi "No stash entries found" (LC_ALL=C nên message ổn định).
   */
  async stashPush(root, message) {
    const args = ["stash", "push", "--include-untracked"];
    if (message !== void 0 && message !== null) {
      args.push("-m", message);
    }
    const out = await this.runner.run(root, args, { exclusive: true });
    return !out.includes("No local changes to save");
  }
  /** Re-apply stash mới nhất rồi xoá khỏi stack; conflict → git giữ stash + ném lỗi. */
  async stashPop(root) {
    await this.runner.run(root, ["stash", "pop"], { exclusive: true });
  }
  /** Add Branch tại 1 commit (context menu E) — không checkout sang nhánh mới. */
  async createBranch(root, name, startPoint) {
    await this.runner.run(root, ["branch", name, startPoint], { exclusive: true });
  }
  /** Add Tag (lightweight) tại 1 commit (context menu E). */
  async createTag(root, name, oid) {
    await this.runner.run(root, ["tag", name, oid], { exclusive: true });
  }
  /**
   * Xoá nhánh AN TOÀN (-d): git tự từ chối nhánh chưa merge / đang checkout.
   * force = -D, chỉ dùng sau khi user xác nhận popup Force Delete ở webview.
   */
  async deleteBranch(root, name, force = false) {
    await this.runner.run(root, ["branch", force ? "-D" : "-d", "--", name], { exclusive: true });
  }
  async renameBranch(root, oldName, newName) {
    await this.runner.run(root, ["branch", "-m", "--", oldName, newName], { exclusive: true });
  }
  async deleteTag(root, name) {
    await this.runner.run(root, ["tag", "-d", name], { exclusive: true });
  }
  /** Stage 1 hunk: patch unified diff qua stdin — chức năng đinh của P1 (spec 2.1). */
  async stageHunk(root, patch) {
    await this.runner.run(root, ["apply", "--cached", "-"], { stdin: patch, exclusive: true });
  }
  /** Unstage 1 hunk: đảo patch đã stage (patch dựng từ diff HEAD↔index). */
  async unstageHunk(root, patch) {
    await this.runner.run(root, ["apply", "--cached", "--reverse", "-"], {
      stdin: patch,
      exclusive: true
    });
  }
  /** Revert 1 hunk khỏi WORKING TREE (không đụng index) — patch từ diff index↔working. */
  async revertHunk(root, patch) {
    await this.runner.run(root, ["apply", "--reverse", "-"], { stdin: patch, exclusive: true });
  }
  // ---- quản lý remote (context menu sidebar tab Git) ----
  /** Remote đã khai báo (tên + URL fetch) — nguồn cho sidebar và dialog Edit Remote. */
  async listRemotes(root) {
    const out = await this.runner.run(root, ["remote", "-v"]);
    const remotes = [];
    for (const line of out.split("\n")) {
      const match = /^(\S+)\t(.*) \(fetch\)$/.exec(line);
      if (match) {
        remotes.push({ name: match[1], url: match[2] });
      }
    }
    return remotes;
  }
  async addRemote(root, name, url) {
    await this.runner.run(root, ["remote", "add", "--", name, url], { exclusive: true });
  }
  /** Đổi tên (nếu khác) rồi set-url — git tự chặn tên trùng/không hợp lệ. */
  async editRemote(root, oldName, newName, url) {
    if (newName !== oldName) {
      await this.runner.run(root, ["remote", "rename", "--", oldName, newName], {
        exclusive: true
      });
    }
    await this.runner.run(root, ["remote", "set-url", "--", newName, url], { exclusive: true });
  }
  // ---- remote (P2): fetch / pull / push — đều exclusive vì có thể đổi refs/working tree ----
  /** Fetch mọi remote, dọn nhánh remote đã xoá (--prune) — nút toolbar Fetch. */
  async fetch(root) {
    await this.runner.run(root, ["fetch", "--all", "--prune"], { exclusive: true });
  }
  /**
   * Pull theo mode từ popup Pull: merge (--no-rebase) / rebase (--rebase) /
   * ff-only (--ff-only). Không có mode thì theo config của user
   * (pull.rebase/pull.ff…) — không áp đặt chiến lược. Conflict/từ chối:
   * git trả stderr với hint rõ ràng, UI hiển thị nguyên văn.
   */
  async pull(root, mode) {
    const flags = {
      merge: "--no-rebase",
      rebase: "--rebase",
      "ff-only": "--ff-only"
    };
    const args = mode === void 0 || mode === null ? ["pull"] : ["pull", flags[mode]];
    await this.runner.run(root, args, { exclusive: true });
  }
  /**
   * Push nhánh hiện tại. Nhánh chưa có upstream: nếu repo có ĐÚNG 1 remote thì
   * tự `push -u <remote> HEAD` (hành vi của các git GUI); nhiều remote thì giữ
   * nguyên lỗi của git để user tự quyết — không đoán bừa remote.
   * Có `to` ("Push to…"): đẩy HEAD lên nhánh chỉ định — refs/heads/ tường minh
   * để tạo nhánh mới trên remote khi chưa tồn tại, không đụng upstream hiện tại.
   */
  async push(root, to) {
    if (to !== void 0 && to !== null) {
      await this.runner.run(root, ["push", "--", to.remote, `HEAD:refs/heads/${to.branch}`], {
        exclusive: true
      });
      return;
    }
    try {
      await this.runner.run(root, ["push"], { exclusive: true });
    } catch (error) {
      if (!(error instanceof GitError) || !error.stderr.includes("no upstream branch")) {
        throw error;
      }
      const remotes = (await this.runner.run(root, ["remote"])).split("\n").filter((r) => r !== "");
      if (remotes.length !== 1) {
        throw error;
      }
      await this.runner.run(root, ["push", "--set-upstream", remotes[0], "HEAD"], {
        exclusive: true
      });
    }
  }
  // ---- merge / rebase (P2 — spec 2.4: conflict dùng chung luồng với banner D2) ----
  /**
   * Merge `target` vào nhánh hiện tại theo chiến lược của dialog D1.
   * Exit ≠ 0 kèm file conflict → trả 'conflicts' (không phải lỗi — user xử lý
   * tiếp trong Working Tree); lỗi khác ném nguyên GitError.
   */
  async merge(root, target, strategy) {
    const args = {
      "fast-forward": ["merge", "--ff-only", target],
      "merge-commit": ["merge", "--no-ff", target],
      // "Merge to Working Tree" của SmartGit: hoà vào working tree + index,
      // DỪNG trước commit để user xem lại (ui-analysis D1).
      "merge-to-working-tree": ["merge", "--no-ff", "--no-commit", target],
      squash: ["merge", "--squash", target]
    };
    try {
      const out = await this.runner.run(root, args[strategy], { exclusive: true });
      return {
        status: out.includes("Already up to date") ? "up-to-date" : "clean",
        conflictedPaths: []
      };
    } catch (error) {
      return { status: "conflicts", conflictedPaths: await this.conflictsOrRethrow(root, error) };
    }
  }
  /** Rebase nhánh hiện tại lên `onto` — conflict xử lý như merge (spec 2.4). */
  async rebase(root, onto) {
    try {
      const out = await this.runner.run(root, ["rebase", onto], { exclusive: true });
      return {
        status: out.includes("is up to date") ? "up-to-date" : "clean",
        conflictedPaths: []
      };
    } catch (error) {
      return { status: "conflicts", conflictedPaths: await this.conflictsOrRethrow(root, error) };
    }
  }
  /**
   * Reset nhánh hiện tại về 1 commit (dialog Reset — context menu History).
   * --hard huỷ thay đổi local: dialog phía UI đã cảnh báo rõ trước khi gọi.
   */
  async reset(root, oid, mode) {
    await this.runner.run(root, ["reset", `--${mode}`, oid], { exclusive: true });
  }
  /** Danh sách file đang conflict (unmerged) trong working tree. */
  async listConflictedPaths(root) {
    const out = await this.runner.run(root, ["diff", "--name-only", "--diff-filter=U", "-z"]);
    return out.split("\0").filter((p) => p !== "");
  }
  /**
   * Merge/rebase exit ≠ 0 có 2 khả năng: conflict (bình thường — trả danh sách
   * file) hoặc lỗi thật (ff-only không ff được, ref sai…) — ném lại nguyên vẹn.
   */
  async conflictsOrRethrow(root, error) {
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
  async abortOperation(root, activity) {
    const command = {
      merging: ["merge", "--abort"],
      rebasing: ["rebase", "--abort"],
      "cherry-picking": ["cherry-pick", "--abort"]
    }[activity];
    await this.runner.run(root, command, { exclusive: true });
  }
  /**
   * Continue cho rebase/cherry-pick (đi từng commit — spec 2.4).
   * Merge không có continue: hoàn tất bằng Commit (message đã điền sẵn).
   */
  async continueOperation(root, activity) {
    const command = {
      rebasing: ["rebase", "--continue"],
      "cherry-picking": ["cherry-pick", "--continue"]
    }[activity];
    await this.runner.run(root, command, { exclusive: true });
  }
};
function isEmptyRepoError(error) {
  return error instanceof GitError && (error.stderr.includes("does not have any commits yet") || error.stderr.includes("bad default revision") || error.stderr.includes("unknown revision"));
}
function checkoutArgs(ref, o) {
  const args = ["checkout"];
  if (o.force) {
    args.push("--force");
  }
  if (o.newBranch !== void 0 && o.newBranch !== null) {
    args.push("-b", o.newBranch);
  }
  args.push(ref);
  return args;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// extension/services/mediaExporter.ts
import { access as access2, mkdir as mkdir2, rename, rm } from "node:fs/promises";
import { join as join3 } from "node:path";
var MediaExporter = class {
  constructor(runner, dir) {
    this.runner = runner;
    this.dir = dir;
  }
  /** Chống xuất trùng khi 2 request cùng blob tới song song (double-click…). */
  inflight = /* @__PURE__ */ new Map();
  /**
   * Xuất blob tại `spec` (dạng `oid:path` / `:path` — như tham số của git show)
   * ra file `<oid-blob><ext>` trong thư mục tạm; cache theo oid blob nên cùng
   * nội dung chỉ xuất 1 lần. Trả đường dẫn tuyệt đối của file.
   */
  async exportBlob(repoRoot, spec, ext) {
    const oid = (await this.runner.run(repoRoot, ["rev-parse", spec])).trim();
    const outFile = join3(this.dir, oid + ext);
    const running = this.inflight.get(outFile);
    if (running !== void 0) {
      return running;
    }
    const task = this.materialize(repoRoot, oid, outFile).finally(
      () => this.inflight.delete(outFile)
    );
    this.inflight.set(outFile, task);
    return task;
  }
  async materialize(repoRoot, oid, outFile) {
    try {
      await access2(outFile);
      return outFile;
    } catch {
    }
    await mkdir2(this.dir, { recursive: true });
    const partFile = `${outFile}.part`;
    await this.runner.runToFile(repoRoot, ["cat-file", "blob", oid], partFile);
    await rename(partFile, outFile);
    return outFile;
  }
  /** Xoá toàn bộ thư mục tạm — gọi khi extension deactivate. */
  async dispose() {
    await rm(this.dir, { recursive: true, force: true }).catch(() => void 0);
  }
};

// extension/services/repoManager.ts
import * as path2 from "node:path";
var RepoManager = class {
  constructor(workspace, git, stateReader) {
    this.workspace = workspace;
    this.git = git;
    this.stateReader = stateReader;
  }
  async listRepos() {
    const folders = await this.workspace.getFolders();
    const nested = await Promise.all(
      folders.map(async (folder) => {
        const parent = await this.describeRepo(folder.fsPath, folder.name);
        if (parent === null) {
          return [];
        }
        const subPaths = await this.git.listSubmodulePaths(folder.fsPath);
        const subs = await Promise.all(
          subPaths.map(
            (subPath) => this.describeRepo(path2.join(folder.fsPath, subPath), `${folder.name}/${subPath}`)
          )
        );
        return [parent, ...subs.filter((repo) => repo !== null)];
      })
    );
    return nested.flat();
  }
  async describeRepo(root, name) {
    if (!await this.git.isRepo(root)) {
      return null;
    }
    const [branch, gitDir] = await Promise.all([
      this.git.getCurrentBranch(root),
      this.git.getGitDir(root)
    ]);
    const state = await this.stateReader.read(gitDir);
    return { root, name, branch, activity: state.activity };
  }
};

// extension/services/repoStateReader.ts
import * as path3 from "node:path";
var RepoStateReader = class {
  constructor(fs) {
    this.fs = fs;
  }
  /**
   * `gitDir` là đường dẫn tới thư mục .git đã resolve (worktree có .git dạng file
   * trỏ đi nơi khác — việc resolve là trách nhiệm của adapter/RepoManager).
   * Thứ tự kiểm tra khớp độ ưu tiên hiển thị: rebase đang dở cũng tạo MERGE_MSG
   * nên phải kiểm tra rebase TRƯỚC merge.
   */
  async read(gitDir) {
    const rebasing = await this.fs.exists(path3.join(gitDir, "rebase-merge")) || await this.fs.exists(path3.join(gitDir, "rebase-apply"));
    if (rebasing) {
      return { activity: "rebasing", message: await this.readMessage(gitDir) };
    }
    if (await this.fs.exists(path3.join(gitDir, "MERGE_HEAD"))) {
      return { activity: "merging", message: await this.readMessage(gitDir) };
    }
    if (await this.fs.exists(path3.join(gitDir, "CHERRY_PICK_HEAD"))) {
      return { activity: "cherry-picking", message: await this.readMessage(gitDir) };
    }
    return { activity: "none" };
  }
  async readMessage(gitDir) {
    const raw = await this.fs.readFile(path3.join(gitDir, "MERGE_MSG"));
    return raw?.trim() || void 0;
  }
};

// orca/worker/config.ts
import * as os from "node:os";
import * as path4 from "node:path";
var SETTING_KEYS = {
  gitPath: "gitPath",
  logPageSize: "logPageSize",
  watchDebounceMs: "watchDebounceMs"
};
function intInRange(value, min, max, fallback) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}
function parseSettings(raw) {
  const values = raw ?? {};
  const gitPath = values[SETTING_KEYS.gitPath];
  return {
    gitPath: typeof gitPath === "string" ? gitPath.trim() : "",
    logPageSize: intInRange(values[SETTING_KEYS.logPageSize], 50, 1e5, DEFAULT_LOG_PAGE_SIZE),
    gitWatchDebounceMs: intInRange(
      values[SETTING_KEYS.watchDebounceMs],
      0,
      5e3,
      DEFAULT_GIT_WATCH_DEBOUNCE_MS
    )
  };
}
async function readSettings(host) {
  const result = await host.call("settings.get", {}).catch(() => null);
  return parseSettings(result?.settings);
}
function cacheDir(platform = process.platform, env = process.env, home = os.homedir()) {
  if (platform === "darwin") {
    return path4.join(home, "Library", "Caches", "s-git-orca");
  }
  if (platform === "win32") {
    return path4.join(env.LOCALAPPDATA || path4.join(home, "AppData", "Local"), "s-git-orca", "Cache");
  }
  return path4.join(env.XDG_CACHE_HOME || path4.join(home, ".cache"), "s-git-orca");
}

// extension/rpc/wireError.ts
function toWireError(error) {
  if (error instanceof GitError) {
    return { message: error.message, git: error.toInfo() };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return error;
}

// orca/worker/rpcServer.ts
var PENDING_TTL_MS = 2 * 6e4;
function createRpcServer(functions, options = {}) {
  const now = options.now ?? Date.now;
  let counter = 0;
  const newId = options.newId ?? (() => `${now().toString(36)}-${(counter++).toString(36)}`);
  const uploads = /* @__PURE__ */ new Map();
  const downloads = /* @__PURE__ */ new Map();
  function sweep() {
    const t = now();
    for (const store of [uploads, downloads]) {
      for (const [id, pending] of store) {
        if (pending.expiresAt < t) {
          store.delete(id);
        }
      }
    }
  }
  function takeArgs(input) {
    if (input.uploadId === void 0) {
      return Array.isArray(input.args) ? input.args : [];
    }
    const pending = uploads.get(input.uploadId);
    uploads.delete(input.uploadId);
    if (pending === void 0 || Array.from(pending.parts, (part) => part === void 0).includes(true)) {
      throw new Error("Tham s\u1ED1 g\u1EEDi l\xEAn b\u1ECB thi\u1EBFu m\u1EA3nh \u2014 th\u1EED l\u1EA1i thao t\xE1c.");
    }
    const args = JSON.parse(pending.parts.join(""));
    return Array.isArray(args) ? args : [];
  }
  return {
    async call(raw) {
      sweep();
      const input = raw;
      const fn = functions[input?.method];
      if (typeof fn !== "function") {
        return { ok: false, error: { message: `Unknown host method: ${String(input?.method)}` } };
      }
      let value;
      try {
        value = await fn.apply(functions, takeArgs(input));
      } catch (error) {
        return { ok: false, error: toWireError(error) };
      }
      const json = JSON.stringify(value ?? null);
      if (Buffer.byteLength(json, "utf8") <= INLINE_RESULT_MAX_BYTES) {
        return { ok: true, value: value ?? null };
      }
      const id = newId();
      const parts = splitChunks(json, DOWNLOAD_CHUNK_UNITS);
      downloads.set(id, { parts, expiresAt: now() + PENDING_TTL_MS });
      return { ok: true, chunked: { id, count: parts.length } };
    },
    upload(raw) {
      sweep();
      const input = raw;
      if (typeof input?.id !== "string" || !Number.isInteger(input.index) || !Number.isInteger(input.count) || input.index < 0 || input.index >= input.count || typeof input.data !== "string") {
        throw new Error("upload: input kh\xF4ng h\u1EE3p l\u1EC7");
      }
      let pending = uploads.get(input.id);
      if (pending === void 0) {
        pending = { parts: new Array(input.count), expiresAt: 0 };
        uploads.set(input.id, pending);
      }
      pending.parts[input.index] = input.data;
      pending.expiresAt = now() + PENDING_TTL_MS;
      return { ok: true };
    },
    chunk(raw) {
      const input = raw;
      const pending = downloads.get(input?.id);
      const data = pending?.parts[input.index];
      if (pending === void 0 || data === void 0) {
        throw new Error("K\u1EBFt qu\u1EA3 \u0111\xE3 h\u1EBFt h\u1EA1n \u2014 th\u1EED l\u1EA1i thao t\xE1c.");
      }
      if (input.index === pending.parts.length - 1) {
        downloads.delete(input.id);
      } else {
        pending.expiresAt = now() + PENDING_TTL_MS;
      }
      return { data };
    }
  };
}

// orca/worker/shell.ts
import { spawn as spawn2 } from "node:child_process";
import { access as access3, rename as rename2 } from "node:fs/promises";
import * as path6 from "node:path";

// orca/worker/workspaces.ts
import * as path5 from "node:path";
function pickLocalWorkspaces(rows) {
  return rows.filter((row) => row.hostId === null || row.hostId === "local");
}
function matchFocusedWorkspace(context, rows) {
  if (context === null) {
    return null;
  }
  if (context.workspaceId !== void 0) {
    const byId = rows.find((row) => row.id === context.workspaceId);
    if (byId !== void 0) {
      return byId;
    }
  }
  return rows.find((row) => row.name === context.displayName && row.branch === context.branch) ?? null;
}
function displayName(row) {
  const project = row.project?.trim();
  if (row.kind === "worktree" && project && project !== row.name) {
    return `${project} \xB7 ${row.name}`;
  }
  return row.name || path5.basename(row.path);
}
function orderFocusedFirst(rows, focused) {
  if (focused === null) {
    return [...rows];
  }
  return [focused, ...rows.filter((row) => row.id !== focused.id)];
}
function workspaceContaining(rows, absPath) {
  const target = path5.resolve(absPath);
  let best = null;
  for (const row of rows) {
    const root = path5.resolve(row.path);
    const inside = target === root || target.startsWith(root + path5.sep);
    if (inside && (best === null || root.length > path5.resolve(best.path).length)) {
      best = row;
    }
  }
  return best;
}
var OrcaWorkspaces = class {
  constructor(host) {
    this.host = host;
  }
  focusContext = null;
  /** Ghi nhận context mới từ sự kiện `workspace.changed` (khỏi phải hỏi lại readContext). */
  setFocusContext(context) {
    this.focusContext = context;
  }
  async list() {
    const result = await this.host.call("workspace.list", {});
    return pickLocalWorkspaces(result?.workspaces ?? []);
  }
  async focused(rows) {
    const list = rows ?? await this.list();
    if (this.focusContext === null) {
      this.focusContext = await this.host.call("workspace.readContext", {}).catch(() => null);
    }
    return matchFocusedWorkspace(this.focusContext, list);
  }
  async getFolders() {
    const rows = await this.list();
    const focused = await this.focused(rows);
    return orderFocusedFirst(rows, focused).map((row) => ({
      name: displayName(row),
      fsPath: row.path
    }));
  }
};

// orca/worker/shell.ts
function resolveInside(repoRoot, relPath, allowRoot) {
  const root = path6.resolve(repoRoot);
  const abs = path6.resolve(root, relPath);
  if (abs === root ? !allowRoot : !abs.startsWith(root + path6.sep)) {
    throw new Error(`\u0110\u01B0\u1EDDng d\u1EABn ngo\xE0i repo: ${relPath}`);
  }
  return abs;
}
function assertPlainName(name) {
  const trimmed = name.trim();
  if (trimmed === "" || trimmed === "." || trimmed === ".." || /[\\/]/.test(trimmed)) {
    throw new Error(`T\xEAn kh\xF4ng h\u1EE3p l\u1EC7: '${name}'`);
  }
}
function appleScriptString(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function createOrcaShell(deps) {
  const platform = deps.platform ?? process.platform;
  const commands = deps.commands ?? nodeCommandRunner;
  const background = (label, task) => void task.catch(
    (error) => deps.log(`${label}: ${error instanceof Error ? error.message : String(error)}`)
  );
  function openWithSystem(absPath) {
    if (platform === "darwin") {
      commands.launch("open", [absPath]);
    } else if (platform === "win32") {
      commands.launch("explorer.exe", [absPath]);
    } else {
      commands.launch("xdg-open", [absPath]);
    }
  }
  async function openInOrcaEditor(absPath) {
    if (!deps.host.has("editor.open")) {
      return false;
    }
    const rows = await deps.workspaces.list();
    const workspace = workspaceContaining(rows, absPath);
    if (workspace === null) {
      return false;
    }
    const focused = await deps.workspaces.focused(rows);
    if (focused?.id !== workspace.id && deps.host.has("workspace.open")) {
      await deps.host.call("workspace.open", { workspaceId: workspace.id });
    }
    const relative2 = path6.relative(workspace.path, absPath).split(path6.sep).join("/");
    await deps.host.call("editor.open", { workspaceId: workspace.id, path: relative2 });
    return true;
  }
  async function moveToTrash(absPath) {
    if (platform === "darwin") {
      const hasTrashCli = await access3("/usr/bin/trash").then(
        () => true,
        () => false
      );
      if (hasTrashCli) {
        await commands.run("/usr/bin/trash", [absPath]);
      } else {
        await commands.run("osascript", [
          "-e",
          `tell application "Finder" to delete (POSIX file ${appleScriptString(absPath)} as alias)`
        ]);
      }
      return;
    }
    if (platform === "win32") {
      const script = [
        "Add-Type -AssemblyName Microsoft.VisualBasic",
        "$p = $env:SGIT_TRASH_PATH",
        "if (Test-Path -LiteralPath $p -PathType Container) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin') }",
        "else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin') }"
      ].join("; ");
      await commands.run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        SGIT_TRASH_PATH: absPath
      });
      return;
    }
    await commands.run("gio", ["trash", absPath]).catch((error) => {
      throw new Error(
        `Kh\xF4ng chuy\u1EC3n \u0111\u01B0\u1EE3c v\xE0o Th\xF9ng r\xE1c (c\u1EA7n l\u1EC7nh 'gio' c\u1EE7a GLib) \u2014 ch\u01B0a xo\xE1 g\xEC. ${error instanceof Error ? error.message : String(error)}`
      );
    });
  }
  return {
    openFile(repoRoot, relPath) {
      background(
        "Open in Editor",
        (async () => {
          const abs = resolveInside(repoRoot, relPath, false);
          if (!await openInOrcaEditor(abs)) {
            openWithSystem(abs);
          }
        })()
      );
    },
    revealInOS(repoRoot, relPath) {
      background(
        "Reveal",
        (async () => {
          const abs = resolveInside(repoRoot, relPath, true);
          if (platform === "darwin") {
            commands.launch("open", ["-R", abs]);
          } else if (platform === "win32") {
            commands.launch("explorer.exe", [`/select,${abs}`]);
          } else {
            commands.launch("xdg-open", [abs === path6.resolve(repoRoot) ? abs : path6.dirname(abs)]);
          }
        })()
      );
    },
    openFileLog(repoRoot, relPath) {
      deps.showFileLog(repoRoot, relPath);
    },
    openInTerminal() {
      deps.log("Open in Terminal: Orca ch\u01B0a c\xF3 API cho plugin \u2014 b\u1ECF qua.");
    },
    findInFolder() {
      deps.log("Find in Folder: Orca ch\u01B0a c\xF3 API cho plugin \u2014 b\u1ECF qua.");
    },
    async renamePath(repoRoot, relPath, newName) {
      assertPlainName(newName);
      const abs = resolveInside(repoRoot, relPath, false);
      const target = path6.join(path6.dirname(abs), newName.trim());
      const exists = await access3(target).then(
        () => true,
        () => false
      );
      if (exists) {
        throw new Error(`'${newName}' \u0111\xE3 t\u1ED3n t\u1EA1i.`);
      }
      await rename2(abs, target);
    },
    async deletePath(repoRoot, relPath) {
      await moveToTrash(resolveInside(repoRoot, relPath, false));
      return true;
    },
    openExternal(fsPath) {
      openWithSystem(path6.resolve(fsPath));
    }
  };
}
var nodeCommandRunner = {
  run(command, args, env) {
    return new Promise((resolve4, reject) => {
      const child = spawn2(command, args, {
        stdio: ["ignore", "ignore", "pipe"],
        env: env ? { ...process.env, ...env } : process.env,
        windowsHide: true
      });
      let stderr = "";
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on(
        "close",
        (code) => code === 0 ? resolve4() : reject(new Error(`${command} exited ${code}${stderr ? `: ${stderr.trim()}` : ""}`))
      );
    });
  },
  launch(command, args) {
    const child = spawn2(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => {
    });
    child.unref();
  }
};

// orca/worker/watchers.ts
import { watch } from "node:fs";
import * as path7 from "node:path";
var GIT_STATE_ENTRIES = /* @__PURE__ */ new Set([
  "HEAD",
  "index",
  "packed-refs",
  "MERGE_HEAD",
  "REBASE_HEAD",
  "CHERRY_PICK_HEAD",
  "rebase-merge",
  "rebase-apply"
]);
var IGNORED_TOP_DIRS = /* @__PURE__ */ new Set([".git", "node_modules"]);
function supportsWorkingTreeWatch(platform = process.platform) {
  return platform === "darwin" || platform === "win32";
}
function isRelevantWorktreeEvent(filename) {
  if (filename === null || filename === "") {
    return true;
  }
  const top = filename.split(/[\\/]/)[0];
  return !IGNORED_TOP_DIRS.has(top);
}
var NodeRepoWatcher = class extends DisposableStore {
  constructor(repos, worktreeRoots, debounceMs, onChange, log) {
    super();
    for (const { root, gitDir } of repos) {
      const gitTrigger = this.register(
        debounce(() => onChange(root, { changed: ["log", "status", "refs"] }), debounceMs)
      );
      this.tryWatch(gitDir, false, log, (name) => {
        if (name === null || GIT_STATE_ENTRIES.has(name)) {
          gitTrigger.call();
        }
      });
      if (!this.tryWatch(path7.join(gitDir, "refs"), true, log, () => gitTrigger.call(), true)) {
        this.tryWatch(path7.join(gitDir, "refs", "heads"), false, log, () => gitTrigger.call());
      }
      if (worktreeRoots.has(root) && supportsWorkingTreeWatch()) {
        const statusTrigger = this.register(
          debounce(() => onChange(root, { changed: ["status"] }), debounceMs)
        );
        this.tryWatch(root, true, log, (name) => {
          if (isRelevantWorktreeEvent(name)) {
            statusTrigger.call();
          }
        });
      }
    }
  }
  /** false khi không watch được (thư mục chưa có, nền tảng không hỗ trợ recursive). */
  tryWatch(target, recursive, log, onEvent, quiet = false) {
    let watcher;
    try {
      watcher = watch(
        target,
        { recursive, persistent: false },
        (_event, filename) => onEvent(filename === null ? null : filename.toString())
      );
    } catch (error) {
      if (!quiet) {
        log(`watch ${target}: ${error instanceof Error ? error.message : String(error)}`);
      }
      return false;
    }
    watcher.on("error", () => watcher.close());
    this.register(toDisposable(() => watcher.close()));
    return true;
  }
};

// orca/worker/main.ts
var STATUS_ITEM_ID = "changes";
var app = null;
async function activate(orca) {
  app?.dispose();
  app = new SgitOrcaApp(orca, await readSettings(orca.host));
  app.start();
}
async function deactivate() {
  app?.dispose();
  app = null;
}
function isInside(root, parent) {
  const a = path8.resolve(root);
  const b = path8.resolve(parent);
  return a === b || a.startsWith(b + path8.sep);
}
var SgitOrcaApp = class extends DisposableStore {
  constructor(orca, settings) {
    super();
    this.orca = orca;
    const log = (message) => orca.log(message);
    const runner = new SpawnGitRunner({ gitPath: settings.gitPath || void 0 });
    this.git = new GitService(runner, { logPageSize: settings.logPageSize });
    const stateReader = new RepoStateReader(new NodeFileSystem());
    this.workspaces = new OrcaWorkspaces(orca.host);
    this.repoManager = new RepoManager(this.workspaces, this.git, stateReader);
    const cache = new CacheIndex(new FileStorage(cacheDir()));
    const mediaExporter = new MediaExporter(
      runner,
      mkdtempSync(path8.join(os2.tmpdir(), "s-git-orca-media-"))
    );
    this.register(toDisposable(() => void mediaExporter.dispose()));
    const hostFunctions = createHostFunctions({
      repoManager: this.repoManager,
      git: this.git,
      stateReader,
      runner,
      cache,
      // Panel tự điều hướng tại chỗ (src/orcaBridge chặn openPanel/openFileLog);
      // đường qua worker chỉ là dự phòng.
      panelOpener: {
        open: (repoRoot, mode, folder, ref, search) => this.notify("navigate", repoRoot, mode, folder, ref, search)
      },
      shell: createOrcaShell({
        host: orca.host,
        workspaces: this.workspaces,
        showFileLog: (repoRoot, relPath) => this.notify("showFileLog", repoRoot, relPath),
        log
      }),
      mediaExporter,
      // Frame Orca chỉ tải được file trong thư mục plugin — không có URI cho file tạm.
      toWebviewUri: () => null
    });
    const server = createRpcServer(hostFunctions);
    this.register(orca.panels.handle(ORCA_REQUEST.call, (input) => server.call(input)));
    this.register(orca.panels.handle(ORCA_REQUEST.upload, (input) => server.upload(input)));
    this.register(orca.panels.handle(ORCA_REQUEST.chunk, (input) => server.chunk(input)));
    this.badge = this.register(
      debounce(() => void this.updateStatusBar(), settings.gitWatchDebounceMs)
    );
    this.debounceMs = settings.gitWatchDebounceMs;
  }
  workspaces;
  repoManager;
  git;
  watcher = null;
  /** Đồng bộ workspace chạy nối đuôi — sự kiện dồn dập không chạy chồng lên nhau. */
  syncChain = Promise.resolve();
  /** Trạng thái đã đồng bộ lần trước — chỉ báo panel khi thật sự đổi. */
  last = null;
  /** Repo thuộc workspace đang focus — nguồn số đếm trên status bar. */
  focusedRepoRoots = [];
  focusedName = "";
  /** Gom các lần đổi liên tiếp thành 1 lần đếm lại cho status bar. */
  badge;
  debounceMs;
  start() {
    this.register(
      this.orca.events.on("workspace.changed", (payload) => {
        this.workspaces.setFocusContext(
          payload?.context ?? null
        );
        this.queueSync();
      })
    );
    this.register(this.orca.events.on("workspace.created", () => this.queueSync()));
    this.register(this.orca.events.on("workspace.removed", () => this.queueSync()));
    this.register(toDisposable(() => this.watcher?.dispose()));
    this.queueSync();
  }
  notify(name, ...args) {
    try {
      this.orca.panels.post(ORCA_NOTIFY_EVENT, { name, args });
    } catch (error) {
      this.orca.log(`post ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  queueSync() {
    this.syncChain = this.syncChain.then(() => this.sync()).catch(
      (error) => this.orca.log(`sync: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
  /** Đọc lại workspace của Orca → dựng lại watcher, báo panel khi repo/focus đổi. */
  async sync() {
    if (this.disposed) {
      return;
    }
    const rows = await this.workspaces.list();
    const focused = await this.workspaces.focused(rows);
    const repos = await this.repoManager.listRepos();
    const repoKey = repos.map((repo) => repo.root).join("\n");
    const focusId = focused?.id ?? null;
    const previous = this.last;
    this.last = { repoKey, focusId };
    this.focusedRepoRoots = focused === null ? [] : repos.map((r) => r.root).filter((root) => isInside(root, focused.path));
    this.focusedName = focused?.name ?? "";
    if (previous === null || previous.repoKey !== repoKey || previous.focusId !== focusId) {
      await this.rebuildWatcher(repos.map((repo) => repo.root));
    }
    if (previous !== null) {
      if (previous.focusId !== focusId) {
        const focusRoot = focused !== null && repos.some((repo) => repo.root === focused.path) ? focused.path : null;
        this.notify("reposChanged", focusRoot);
      } else if (previous.repoKey !== repoKey) {
        this.notify("reposChanged", null);
      }
    }
    this.badge.call();
  }
  async rebuildWatcher(roots) {
    const watched = await Promise.all(
      roots.map(async (root) => ({ root, gitDir: await this.git.getGitDir(root) }))
    );
    this.watcher?.dispose();
    if (this.disposed) {
      return;
    }
    this.watcher = new NodeRepoWatcher(
      watched,
      new Set(this.focusedRepoRoots),
      this.debounceMs,
      (repoRoot, delta) => {
        this.notify("repoChanged", repoRoot, delta);
        if (this.focusedRepoRoots.includes(repoRoot)) {
          this.badge.call();
        }
      },
      (message) => this.orca.log(message)
    );
  }
  /** Status bar Orca: số file thay đổi của workspace đang focus (badge activity bar của VSCode). */
  async updateStatusBar() {
    if (this.disposed || !this.orca.host.has("statusBar.update")) {
      return;
    }
    const counts = await Promise.all(
      this.focusedRepoRoots.map(
        (root) => this.git.getStatus(root).then(
          (status) => status.files.length,
          () => 0
        )
      )
    );
    const total = counts.reduce((sum, n) => sum + n, 0);
    const where = this.focusedName === "" ? "this workspace" : this.focusedName;
    await this.orca.host.call("statusBar.update", {
      id: STATUS_ITEM_ID,
      text: total > 0 ? `S-Git ${total}` : "S-Git",
      tone: total > 0 ? "accent" : "neutral",
      tooltip: total > 0 ? `S-Git: ${total} changed file${total === 1 ? "" : "s"} in ${where}` : `S-Git: no changes in ${where}`
    }).catch(
      (error) => this.orca.log(`statusBar.update: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
};
export {
  deactivate,
  activate as default
};
