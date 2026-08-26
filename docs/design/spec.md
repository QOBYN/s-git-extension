# Thiết kế chức năng — SmartGit extension cho VSCode

> Dựa trên [ui-analysis.md](ui-analysis.md) (phân tích screenshot SmartGit thật) và yêu cầu trong [note.md](../note.md).
> Tài liệu này mô tả **chức năng và bố cục**, chưa đi sâu chi tiết code.

## 1. Hình dung tổng thể trong VSCode

SmartGit là app đa cửa sổ; VSCode extension map lại như sau:

| SmartGit | Trong VSCode | Lý do |
|---|---|---|
| Cửa sổ chính (Working Tree / History) | **Editor panel webview "SmartGit"** — full màn hình editor, toggle 2 chế độ như SmartGit | Cần diện tích lớn cho layout 3 cột + diff |
| Repo tabs (nhiều repo) | **Thanh repo tabs ngay trong webview** (giữ nguyên hình thức tab) | Quen thuộc với người dùng SmartGit; VSCode multi-root cung cấp danh sách repo |
| File Log (cửa sổ riêng) | **Editor tab webview riêng** mở từ lệnh/menu chuột phải file | Map tự nhiên cửa sổ → tab |
| Sidebar trái của SmartGit | **Activity bar icon "SmartGit"** → sidebar view rút gọn (repo + nhánh + thao tác nhanh, dạng webview) | Truy cập nhanh không cần mở panel lớn |
| Status bar "Ready" | **VSCode status bar item**: repo hiện tại · nhánh · trạng thái quét | Idiom chuẩn của VSCode |

Nguyên tắc: **panel lớn là trải nghiệm chính** (giống mở SmartGit), sidebar chỉ là lối vào nhanh.

## 2. Các màn hình

### 2.1 Panel chính — chế độ Working Tree (map màn hình A)

Bố cục giữ nguyên khuôn SmartGit: `[Directories] | [Changed files] | [Commit panel] / [Diff dưới đáy]`.

Chức năng theo vùng:

- **Repo tabs (A1)**: mỗi git repo trong workspace là 1 tab; hỗ trợ repo lồng nhau; nút `+` → Add/Clone/Init (P2). Nhớ tab đang mở giữa các session.
- **Toolbar (A2)**: toggle `Working Tree | History`; badge số file thay đổi; Pull▾ / Push / Stage / Unstage / Discard / Stash. Nút mờ khi không áp dụng. Mỗi nút đều có command tương ứng trong Command Palette + phím tắt.
- **Directories (A3)**: cây thư mục; chọn thư mục để scope danh sách file; toggle ẩn/hiện cây (yêu cầu "chọn view folder nào/ẩn hiện").
- **Changed files (A4)**: **2 khung dọc tách biệt — khung trên unstaged/untracked, khung dưới staged** (stage/unstage = file di chuyển giữa 2 khung, theo đúng SmartGit — xem mục F của ui-analysis); path hiển thị nguyên đường dẫn với thư mục mờ + tên file sáng; filter; multi-select để stage/discard hàng loạt; empty-state rõ ràng. Dropdown chế độ hiển thị 3 nhóm: phạm vi (Changed / All excl. ignored / All incl. ignored — vùng này là file browser đầy đủ, không chỉ danh sách diff), sắp xếp (Path / File Name), gom nhóm (None / State / Extension).
- **Commit panel (A5)**: ô message luôn hiện; `Commit to: <branch>`; checkbox Amend, checkbox Commit & Push; nút Commit. (P2: template message, history message cũ.)
- **Recent commits (A6)**: log rút gọn cuộn được ngay dưới ô commit.
- **Diff (A7)**: Monaco diff editor — có sẵn cả 2 chế độ Side-by-Side & Unified (inline), syntax highlight, Ignore Whitespace; thêm nút ↑↓ nhảy hunk. **Stage theo hunk/dòng từ diff** là chức năng đinh (P1).
- **Context menu trên file** (map mục G của ui-analysis): cùng pattern menu commit — nhóm separator, phím tắt in trong menu, disable chứ không ẩn. Phân bổ:
  - Show Changes, Open in Editor (tab VSCode thường), Stage/Unstage, Discard, Copy Name/Path/Relative Path, Reveal in Finder — **P1**
  - File Log, Move or Rename (`git mv` giữ lịch sử), Remove/Delete (3 mức huỷ xoá tách bạch như SmartGit), Stash Selection (stash riêng file đang chọn) — **P2**
  - Blame, Investigate, Index Editor — **P3**
  - Quy ước phím tắt học theo SmartGit: **modifier tăng dần theo độ sâu** (⌘T Stage → ⌥⌘T Index Editor; ⌘L Log → ⌥⌘L Blame → ⌥⇧⌘L Investigate).

### 2.2 Panel chính — chế độ History (map màn hình B)

Bố cục: `[Branches sidebar] | [Commit graph] | [Commit detail + Changed files] / [Diff dưới đáy]`.

- **Branches sidebar (B1)**: Local Branches (nhánh hiện tại đánh dấu), Remotes, **tự gom nhóm theo prefix** (`feat/`, `fix/`…), Stashes, Reflog (P2); filter + regex; chuột phải: checkout, merge, rebase, delete, rename.
- **Commit graph (B4)**: graph nhiều nhánh rail màu; **ref badge nằm trong dòng**; avatar/initials; thời gian tương đối; filter commit (message/author/hash); chọn commit → detail; multi-select 2 commit → so sánh (P2). Virtualized list — chỉ render phần nhìn thấy.
- **Banner (B3)**: "There are local changes → Show Local Changes" chuyển về chế độ Working Tree.
- **Commit detail (B5)**: hash copy được, author, date, message đầy đủ, nhánh chứa commit. (P2: link PR/MR.)
- **Changed files của commit (B6)** → chọn file → **Diff (B7)**.
- **Context menu trên commit** (map mục E của ui-analysis): menu đầy đủ nhóm bằng separator, **phím tắt in ngay trong menu**, lệnh không áp dụng được thì mờ đi (không ẩn). Danh mục lệnh theo SmartGit:
  - Check Out, Add Branch/Tag, Copy Message/ID, Use Message for Commit — **P1**
  - Merge, Rebase, Cherry-Pick, Revert, Reset/Reset Advanced, Push Up To — **P2**
  - Viết lại lịch sử: Modify, Split, Squash, Edit Message, Edit Author, Rebase Interactive From — **P3**

### 2.3 File Log — tab riêng (map màn hình C)

Mở bằng: chuột phải file trong Explorer/editor → "SmartGit: File Log", hoặc từ B6.

- Graph chỉ chứa commit đụng file; **checkbox bật/tắt từng ref** khỏi graph; badge ahead/behind.
- Phát hiện rename/copy (`git log --follow`), hiển thị link "[Copied?]" để nhảy qua tên cũ; banner "disjoint history".
- Panel Files của commit (bảng Name/Modification/Directory) + diff của chính file đó ở đáy.
- Blame / Investigate: **P3** — giai đoạn sau.

### 2.4 Luồng Merge / Rebase & xử lý conflict (map màn hình D1–D3)

Luồng: chọn nhánh/commit trong History → Merge/Rebase → dialog chiến lược → merging/rebasing-state → resolve → commit/continue.

**Đã chốt: Rebase dùng chung toàn bộ luồng conflict với Merge** — cùng banner trạng thái (đọc `.git/REBASE_HEAD` thay vì `MERGE_HEAD`), cùng File Compare resolver; khác biệt duy nhất: banner rebase có thêm **Continue** (bước tiếp commit kế) và **Skip** bên cạnh Abort, vì rebase xử lý từng commit một.

- **Dialog chiến lược merge (D1)**: modal ngay trong webview (không dùng `showQuickPick` — giữ pattern "nút = hành động" của SmartGit): mỗi chiến lược (Fast-Forward / Create Merge-Commit / Merge to Working Tree / Squash-Merge) là 1 nút kèm đoạn giải thích hệ quả; nút khả dĩ nhất là default (Fast-Forward chỉ enable khi ff được). Pattern modal này dùng lại cho Rebase/Stash/Delete sau.
- **Merging-state (D2)**: Working Tree hiện **banner trạng thái** "working tree is in merging-state" + nút **Abort**; commit message **tự điền** ("Merge branch '...'"); badge số file/số commit chưa push cập nhật. Nguồn dữ liệu: đọc `.git/MERGE_HEAD`, `MERGE_MSG` (tương tự cho `REBASE_HEAD`, `CHERRY_PICK_HEAD` — cùng một cơ chế banner).
- **File Compare / conflict resolver (D3)**: mở **editor tab riêng cho từng file**, title ghi rõ ngữ cảnh (HEAD ↔ Index ↔ Working Tree). Nền tảng: Monaco diff editor ở chế độ **editable** (pane phải sửa được), thêm toolbar: **Prev/Next Change**, **Take Left / Take Right** (nhận nguyên khối từ 1 bên); status hiển thị vị trí con trỏ + tổng số thay đổi. Với file conflict 3 bên, giai đoạn đầu chấp nhận 2 pane (ours ↔ theirs trên nền đã merge) + edit tay; merge editor 3-way là mở rộng sau.

### 2.5 Sidebar VSCode (lối vào nhanh)

- Danh sách repo + nhánh hiện tại + số file thay đổi.
- Nút: mở panel chính (2 chế độ), fetch/pull/push nhanh.
- Không nhồi chức năng — mọi thứ phức tạp đưa về panel lớn.

## 3. Yêu cầu xuyên suốt (từ note.md)

| Yêu cầu | Đáp án thiết kế |
|---|---|
| Nhiều git | Repo tabs + quét multi-root workspace, kể cả repo lồng nhau |
| Dark/light + style VSCode | Chỉ dùng CSS variables `--vscode-*`; Monaco tự theo theme |
| Sidebar left/bottom | Panel webview kéo được xuống panel dưới (VSCode cho phép); sidebar riêng |
| Phím tắt | Bảng keybinding riêng (mục 4), user override được qua Keyboard Shortcuts |
| Add / create / clone / search | Nút `+` trên repo tabs + command palette (P2) |
| Cache index chống lag | Extension host quét `git log` nền 1 lần → cache vào `globalStorage`; mở panel đọc cache hiện ngay, refresh incremental khi HEAD/refs đổi (watch `.git`); status bar hiện trạng thái quét |
| OOP, SOLID, test | Đã chốt: vanilla VSCode API + kiến trúc DI tự thiết kế, logic thuần TS test bằng Vitest (xem hội thoại trước; sẽ ghi thành `architecture.md` khi bắt đầu code) |

## 4. Phím tắt dự kiến (trong panel, theo đúng phím tắt quan sát được từ SmartGit)

Phím tắt lấy từ screenshot menu thật (mục E, G của ui-analysis) để user SmartGit chuyển sang không phải học lại:

| Phím | Hành động | Nguồn |
|---|---|---|
| `Cmd+T` / `Cmd+Shift+T` | Stage / Unstage | SmartGit (⌘T) |
| `Cmd+L` | File Log của file đang chọn | SmartGit (⌘L) |
| `Cmd+G` | Check Out commit/nhánh đang chọn | SmartGit (⌘G) |
| `Cmd+D` | Rebase | SmartGit (⌘D) |
| `Cmd+J` | Squash | SmartGit (⌘J) |
| `Cmd+R` | Reset | SmartGit (⌘R) |
| `F2` | Edit Message (commit) / Rename (file) | SmartGit |
| `F4` | Show Changes của file | SmartGit |
| `F7` / `Shift+F7` | Add Branch / Add Tag | SmartGit |
| `Cmd+K` / `Cmd+Shift+K` | Commit / Commit & Push | tự đặt |
| `Cmd+Shift+H` | Toggle Working Tree ↔ History | tự đặt |
| `Cmd+F` | Focus ô filter của vùng đang đứng | tự đặt |
| `↑/↓` + `Space` | Di chuyển + chọn trong danh sách | tự đặt |
| `[` / `]` | Hunk trước / sau trong diff | tự đặt |

Quy ước mở rộng (học từ SmartGit): **modifier tăng dần theo độ sâu chức năng** — ⌘T Stage → ⌥⌘T Index Editor; ⌘L Log → ⌥⌘L Blame → ⌥⇧⌘L Investigate. Phím tắt chỉ hoạt động khi focus trong panel, không đè phím tắt toàn cục của VSCode; user override được qua Keyboard Shortcuts.

## 5. Lộ trình ưu tiên

- **P0 — Skeleton nhìn được**: panel webview + repo tabs + chế độ History đọc-only (graph + commit detail + diff), cache index v1. *Lý do làm History trước: là view "ăn tiền" nhất và ép giải sớm 2 bài toán khó nhất (graph renderer + cache).*
- **P1 — Làm việc được**: chế độ Working Tree đầy đủ (stage/unstage theo file + hunk, commit, amend), pull/push, File Log cơ bản, phím tắt.
- **P2 — Ngang SmartGit hàng ngày**: merge/rebase/cherry-pick/revert từ graph (kèm dialog chiến lược + banner merging-state + Abort như mục 2.4), File Compare/conflict resolver, stash, branch prefix-group + thao tác nhánh, tạo PR, add/clone repo, so sánh 2 commit.
- **P3 — Sâu**: viết lại lịch sử (Modify/Split/Squash/Edit Message/Edit Author/Interactive Rebase), Blame/Investigate, reflog, index editor theo dòng, submodule.

## 6. Quyết định đã chốt (2026-08-26)

1. **Webview ngay từ đầu** cho mọi màn hình, kể cả Working Tree — không đi đường vòng qua SCM view gốc. Lý do: trải nghiệm diff của SmartGit (side-by-side có connector cong, intra-line highlight, Compact, Ignore WS, nhảy hunk, stage theo hunk ngay trong diff) là giá trị cốt lõi, phải kiểm soát toàn bộ UI. Monaco diff editor cover phần lớn: side-by-side/inline, intra-line highlight, `hideUnchangedRegions` (= Compact), `ignoreTrimWhitespace`, API nhảy hunk — phần stage-theo-hunk tự xây trên đó.
2. **Tự viết `GraphLayoutEngine`** thuần TypeScript (input: danh sách commit + parents → output: toạ độ node/rail/màu), có test đầy đủ. Tiêu chí nghiệm thu: nhìn giống graph của SmartGit (rail màu, merge line cong, ref badge trong dòng).
3. **Tải 1.000 commit đầu + "Load more"**; cache nền tiếp tục quét sâu dần.
