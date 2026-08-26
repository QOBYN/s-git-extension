# Kiến trúc kỹ thuật — SmartGit extension

> Tiếp nối [spec.md](spec.md) (chức năng) và [ui-analysis.md](ui-analysis.md) (layout).
> Stack đã chốt: **vanilla VSCode API + kiến trúc OOP tự thiết kế** ở extension host · **React + Vite** trong webview · **birpc** nối 2 tầng · **Monaco** cho diff · **Vitest** cho test.

## 1. Tổng quan 2 tầng

```
┌─ Extension Host (Node.js) ─────────────────────────────────┐
│  extension/                                                │
│   index.ts ─── composition root: wire DI, đăng ký lệnh     │
│   core/    ─── hạ tầng chung (KHÔNG import 'vscode')       │
│   services/─── nghiệp vụ git thuần TS (KHÔNG import        │
│                'vscode' — nhận adapter qua constructor)    │
│   adapters/─── lớp mỏng bọc VSCode API (imports 'vscode')  │
│   views/   ─── WebviewPanel/View provider (imports 'vscode')│
│   rpc/     ─── bind HostFunctions vào từng webview         │
├──────────────── birpc qua postMessage ─────────────────────┤
│  src/  (webview, chạy trong browser sandbox)               │
│   main.tsx / App.tsx ── khung app, chọn màn hình           │
│   store/   ─── zustand: state nhận từ host                 │
│   rpc.ts   ─── birpc client (proxy typed gọi host)         │
│   engine/  ─── GraphLayoutEngine (thuần TS, test được)     │
│   components/ ─ SplitPane, CommitGraph, DiffView (Monaco), │
│                 FileList, CommitBox, ContextMenu, Modal…   │
│  shared/  ─── types + contract RPC dùng chung 2 tầng       │
└────────────────────────────────────────────────────────────┘
```

**Luật phụ thuộc (ép bằng ESLint rule `no-restricted-imports` sau này):**

1. `core/` và `services/` **không được import `vscode`** — mọi thứ cần từ VSCode đi qua interface, implement ở `adapters/`.
2. `shared/` không import gì ngoài chính nó (chỉ types + hằng số).
3. Webview không import `vscode` (không tồn tại ở đó) — chỉ nói chuyện qua RPC.
4. Chỉ `index.ts` được `new` các service (composition root duy nhất).

Đây là Dependency Inversion áp cho đúng chỗ đau: logic git test được bằng Vitest thuần, không cần mock cả VSCode API.

## 2. Extension host — các module

### 2.1 `core/` — hạ tầng

| Thành phần | Vai trò |
|---|---|
| `DisposableStore` | Base class quản lý vòng đời: `register(d)` gom disposable, `dispose()` giải phóng ngược thứ tự. Mọi service/view kế thừa. |
| `Emitter<T>` | Event emitter tối giản tự viết (subscribe trả về disposable) — để `services/` phát sự kiện mà không cần `vscode.EventEmitter`. |
| `Deferred`, `throttle` | Tiện ích async cho refresh/debounce. |

### 2.2 `services/` — nghiệp vụ git (thuần TS)

| Thành phần | Vai trò | Phụ thuộc |
|---|---|---|
| `GitRunner` (interface) | `run(cwd, args, opts?): Promise<string>` — cổng duy nhất chạy git. | — |
| `SpawnGitRunner` | Impl bằng `child_process.spawn`, quản lý queue per-repo (tránh 2 lệnh ghi chạy song song trên 1 repo). | node:child_process |
| `LogParser` | Hàm thuần: stdout của `git log --pretty=<FORMAT>` → `CommitInfo[]`. FORMAT dùng `%x1f`/`%x1e` làm separator. | — |
| `StatusParser` | Hàm thuần: `git status --porcelain=v2 -z` → `FileChange[]` (phân biệt staged/unstaged/untracked/conflicted). | — |
| `GitService` | Facade các thao tác: `getLog`, `getStatus`, `stage/unstage`, `commit`, `merge/rebase/abort/continue`, `checkout`… Mỗi thao tác = gọi `GitRunner` + parser tương ứng. | GitRunner |
| `RepoStateReader` | Đọc trạng thái đặc biệt từ `.git/`: `MERGE_HEAD`/`REBASE_HEAD`/`CHERRY_PICK_HEAD` + `MERGE_MSG` → `RepoActivityState` (nguồn của banner merging/rebasing). | FileSystem (interface) |
| `RepoManager` | Phát hiện repo trong workspace (kể cả lồng nhau), giữ danh sách `Repository`, phát sự kiện khi repo thay đổi. | WorkspaceReader (interface), GitService |
| `CacheIndex` | Cache commit log per-repo (mục 4). | Storage (interface), GitService |

Interface cho adapter: `WorkspaceReader` (danh sách folder), `FileSystem` (đọc file/watch), `Storage` (đọc/ghi cache). Impl thật nằm ở `adapters/` (bọc `vscode.workspace`, `globalStorageUri`…); impl giả dùng trong test.

### 2.3 `views/` — provider webview

- `MainPanel` — WebviewPanel chính (Working Tree ↔ History), singleton, `retainContextWhenHidden`.
- `FileLogPanel` — mỗi file 1 panel, key theo đường dẫn.
- `FileComparePanel` — File Compare/conflict resolver, mỗi file 1 tab.
- `SidebarView` — WebviewViewProvider cho activity bar.

Cả 4 dùng chung `WebviewHost` helper: set html (`getWebviewHtml` từ plugin), tạo RPC bind, dọn dẹp khi dispose. Mỗi webview khai báo nó là màn hình gì qua query param/`injectCode` để `App.tsx` render đúng màn hình.

### 2.4 Trạng thái & luồng sự kiện

Nguồn sự thật nằm **ở extension host**; webview chỉ là view:

```
.git/ thay đổi ──▶ GitWatcher (adapter, watch HEAD/refs/index)
                      │ (debounce ~300ms)
                      ▼
             RepoManager.refresh() ─▶ GitService/CacheIndex
                      │ phát sự kiện typed
                      ▼
             rpc.notify('repoChanged', delta) ─▶ mọi webview đang mở
                      ▼
             store zustand cập nhật ─▶ React re-render
```

Thao tác từ UI đi chiều ngược: component → `host.stageFiles(...)` (birpc) → GitService → git chạy xong → watcher/refresh tự lan truyền kết quả về. **UI không tự đoán kết quả** (no optimistic update ở P0-P1) — giữ đúng tính "always consistent" của SmartGit.

## 3. Contract RPC (`shared/`)

```ts
// shared/protocol.ts — nguồn sự thật duy nhất cho cả 2 tầng
export interface HostFunctions {
  // đọc
  listRepos(): Promise<RepoInfo[]>
  getLog(repo: string, opts: LogOptions): Promise<LogPage>       // phân trang 1.000
  getStatus(repo: string): Promise<WorkingTreeStatus>            // gồm RepoActivityState
  getDiff(repo: string, target: DiffTarget): Promise<DiffPayload>
  // ghi
  stage(repo: string, paths: string[]): Promise<void>
  stageHunk(repo: string, patch: string): Promise<void>          // git apply --cached
  commit(repo: string, msg: string, opts: CommitOptions): Promise<void>
  merge(repo: string, target: string, strategy: MergeStrategy): Promise<MergeResult>
  rebase(repo: string, onto: string): Promise<MergeResult>       // cùng MergeResult với merge
  abortOperation(repo: string): Promise<void>                    // merge & rebase dùng chung
  continueOperation(repo: string): Promise<void>
  // ...mở rộng theo P1/P2
}
export interface WebviewFunctions {
  repoChanged(repo: string, delta: RepoDelta): void
  operationProgress(msg: string): void                            // status bar "Command succeeded."
}
```

Quy tắc: **mọi type qua RPC nằm trong `shared/`**, serializable (không class, không Date — dùng ISO string). Lỗi git trả về dạng `GitError { code, stderr }` để UI hiển thị đúng thông điệp.

## 4. CacheIndex — chống lag (yêu cầu then chốt của note.md)

- **Lưu**: JSON per-repo trong `globalStorage/<hash-của-repo-path>/log.json` (P0). Cấu trúc: `{ headOid, refsHash, commits: CommitInfo[] }`. Nếu sau này >50k commit cân nhắc SQLite — quyết định khi có số đo, không làm trước.
- **Mở panel**: đọc cache → render ngay (đúng cảm giác "Ready" tức thì) → chạy `git log` nền so `headOid`/`refsHash` → gửi delta nếu lệch.
- **Refresh incremental**: watcher `.git/HEAD`, `.git/refs/**`, `.git/index` (debounce); chỉ `git log <old-head>..<new-head>` phần mới thay vì quét lại từ đầu; rewrite lịch sử (rebase) thì fallback quét lại trang đầu.
- **Phân trang**: trang 1.000 commit (đã chốt), "Load more" gọi `getLog` với `skip`.

## 5. GraphLayoutEngine (webview, thuần TS)

Contract:

```ts
// input: commit đã sort theo topo/date từ host
layout(commits: CommitInfo[]): GraphLayout
// GraphLayout = { rows: { oid, lane, dotColor,
//                 segments: {fromLane, toLane, color, kind: 'line'|'merge-in'|'branch-out'}[] }[] ,
//                 laneCount }
```

- Thuật toán gán lane kiểu SmartGit: nhánh đang checkout giữ lane 0, lane tái sử dụng khi nhánh kết thúc, màu gán theo lane (bảng màu cố định ~12 màu).
- Render: mỗi row là 1 hàng ảo hoá (virtualized — chỉ render viewport); cột graph vẽ SVG per-row từ `segments` (đường cong bezier cho merge-in/branch-out); ref badge + message nằm cùng hàng.
- Engine **không biết gì về React/DOM** → test snapshot bằng Vitest với các topology chuẩn: fast-forward, merge chéo, octopus, nhánh mồ côi, lịch sử đứt đoạn (disjoint).

## 6. Chiến lược test

| Tầng | Cách test | Ví dụ |
|---|---|---|
| Parsers (`LogParser`, `StatusParser`) | Vitest thuần, fixture stdout thật chụp từ repo mẫu | ký tự lạ trong message, rename, conflict |
| `GitService` | Vitest + `FakeGitRunner` (ghi lại args, trả stdout định sẵn) | đúng lệnh, đúng thứ tự, queue per-repo |
| `RepoStateReader`, `CacheIndex` | Vitest + `FakeFileSystem`/`FakeStorage` | phát hiện merging-state, invalidate cache khi head đổi |
| `GraphLayoutEngine` | Vitest snapshot layout theo topology mẫu | lane ổn định, không giao cắt thừa |
| Store + component webview | Vitest + Testing Library (jsdom), mock `host` proxy | stage từ UI gọi đúng RPC |
| End-to-end | Giai đoạn sau: `@vscode/test-electron` chạy trên repo fixture | mở panel, graph hiện đúng số commit |

Định mức: mọi hàm thuần và mọi nhánh xử lý lỗi git có test; UI test những tương tác chính, không đuổi coverage hình thức.

## 7. Cấu trúc thư mục đầy đủ

```
extension/
  index.ts
  core/        disposable.ts  emitter.ts  async.ts
  services/    gitRunner.ts  gitService.ts  logParser.ts  statusParser.ts
               repoManager.ts  repoStateReader.ts  cacheIndex.ts
               interfaces.ts        # WorkspaceReader, FileSystem, Storage
  adapters/    vscodeWorkspace.ts  vscodeFs.ts  vscodeStorage.ts  gitWatcher.ts
  views/       webviewHost.ts  mainPanel.ts  fileLogPanel.ts
               fileComparePanel.ts  sidebarView.ts
  rpc/         bindHost.ts
shared/        protocol.ts  types.ts
src/
  main.tsx  App.tsx  rpc.ts
  store/     repoStore.ts  uiStore.ts
  engine/    graphLayout.ts  colors.ts
  components/ layout/ graph/ diff/ files/ commit/ menu/ modal/
  styles/    tokens.css           # chỉ map từ --vscode-* variables
index.html
vite.config.ts        # đã có
package.json          # đã có (bổ sung dependency khi bắt đầu P0)
```

## 8. Trình tự thi công P0 (khi bắt đầu code)

1. `shared/protocol.ts` + `core/` + parsers kèm test — nền móng, chưa đụng UI.
2. `GitService` + `FakeGitRunner` test; `CacheIndex` v1.
3. `WebviewHost` + `MainPanel` + RPC bind; webview render "hello" nhận `listRepos()`.
4. `GraphLayoutEngine` + test topology; sau đó `CommitGraph` component ảo hoá.
5. Commit detail + changed files + Monaco diff read-only → **P0 nghiệm thu**: mở panel History trên repo thật, graph giống SmartGit, chọn commit xem được diff, mở lại panel hiện tức thì từ cache.
