# Phân tích UI SmartGit (từ screenshot thực tế)

> Nguồn: 3 screenshot SmartGit 26.2 chạy trên macOS, dark theme — xem `docs/screenshots/`.
> Mục đích: hiểu layout + chức năng từng vùng để thiết kế lại thành VSCode extension.

SmartGit tổ chức theo **3 màn hình chính**, chuyển qua lại bằng toggle trên toolbar hoặc mở cửa sổ riêng:

| Màn hình | Screenshot | Vai trò |
|---|---|---|
| A. Working Tree (Local Files) | `image.png` | Xem file thay đổi, stage, commit |
| B. History | `image copy.png` | Log graph nhiều nhánh của cả repo |
| C. File Log | `image copy 2.png` | Log riêng của 1 file (cửa sổ riêng) |

Điểm chung cả 3 màn hình:

- **Bố cục 3 cột + diff dưới đáy**: trái = điều hướng (cây thư mục / cây nhánh), giữa = danh sách chính (file / commit), phải = chi tiết (commit panel), đáy = diff viewer. Các vùng đều có splitter kéo được.
- **Mọi danh sách đều có ô filter riêng** (filter file, filter nhánh, filter commit) + toggle regex `.*`.
- **Toolbar đổi theo ngữ cảnh**: Working Tree có Stage/Discard/Stash; History có Merge/Rebase/Cherry-Pick/Revert.
- Mật độ thông tin cao, ít chrome, phím tắt cho hầu hết thao tác.

---

## A. Màn hình Working Tree (Local Files)

```
┌─────────────────────────────────────────────────────────────────────┐
│ A1  Repo tabs:  4x-root │ 4x-root/4x-client │ [4x-root/4x-server] +│
├─────────────────────────────────────────────────────────────────────┤
│ A2  Toolbar: (Local Files●4 | History)  Pull▾ Push │ Start │ Stage  │
│     Index-Editor Unstage │ Discard Delete │ Save Stash │   Discover │
├───────────┬──────────────────────────────┬──────────────────────────┤
│ A3        │ A4  Changed files ▾ (filter) │ A5  Commit to: main      │
│ Directories│                              │     [ commit message ]  │
│ (cây thư  │  danh sách file thay đổi     │     □Amend □Push [Commit]│
│  mục repo)│  dưới thư mục đang chọn      ├──────────────────────────┤
│           │                              │ A6  Recent commits (log  │
│           │                              │     rút gọn, chấm graph) │
├───────────┴──────────────────────────────┴──────────────────────────┤
│ A7  Diff preview   Unified|Side-by-Side │ Compact Word-Wrap │ ↑ ↓   │
├─────────────────────────────────────────────────────────────────────┤
│ A8  Status bar:  ● Ready                                            │
└─────────────────────────────────────────────────────────────────────┘
```

| Vùng | Chức năng quan sát được |
|---|---|
| **A1 Repo tabs** | Mỗi repo mở là 1 tab (hỗ trợ **nhiều repo cùng lúc**, kể cả repo lồng nhau `4x-root/4x-server`). Nút `+` để add/clone repo mới. Có dropdown `∨` bên phải khi nhiều tab. → map trực tiếp yêu cầu "Nhiều git" trong note. |
| **A2 Toolbar** | Cặp toggle **Local Files / History** chuyển màn hình chính (badge số `4` = số file thay đổi). Nhóm hành động: Pull (có dropdown chọn kiểu), Push, Start (feature flow), Stage, Index Editor (sửa index theo hunk), Unstage, Discard, Delete, Save Stash. Icon mờ khi không áp dụng được (context-aware). |
| **A3 Directories** | Cây thư mục của working tree. **Chọn 1 thư mục → A4 chỉ hiện file thay đổi dưới thư mục đó** (scope filter). → map yêu cầu "Chọn view folder nào/ẩn hiện". |
| **A4 Changed files** | Danh sách file thay đổi, có dropdown đổi chế độ hiển thị ("Changed files"), filter icon. Trạng thái rỗng có empty-state text rõ ràng. Chọn file → diff hiện ở A7. |
| **A5 Commit panel** | Ô soạn commit message luôn hiện (không cần mở dialog). Hàng điều khiển: checkbox **Amend last commit**, checkbox **Push** (commit xong push luôn), nút **Commit**, label **Commit to: main** cảnh báo đang commit vào nhánh nào. |
| **A6 Recent commits** | Log rút gọn ngay dưới ô commit (chấm tròn + message 1 dòng) — để nhìn nhanh ngữ cảnh trước khi commit, cuộn được. |
| **A7 Diff preview** | Diff của file đang chọn. Toggle **Unified / Side by Side** (đáp ứng "xem change trên/dưới, trái/phải"), Compact (ẩn vùng không đổi), Word-Wrap, Ignore Whitespace, nút ↑↓ nhảy giữa các hunk. |
| **A8 Status bar** | Trạng thái nền: `Ready` / đang refresh / đang fetch. Liên quan trực tiếp tới yêu cầu cache index — SmartGit luôn phản hồi tức thì, việc quét chạy nền. |

## B. Màn hình History (log graph toàn repo)

```
┌─────────────────────────────────────────────────────────────────────┐
│ A1  Repo tabs (giữ nguyên)                                          │
├─────────────────────────────────────────────────────────────────────┤
│ B2  Toolbar: (Local Files | History●) Pull▾ Push │ Add-Branch       │
│     Add-Tag │ Merge Rebase Cherry-Pick Revert │        Discover     │
├───────────┬──────────────────────────────────┬──────────────────────┤
│ B1        │ B3 ⚠ There are local changes     │ B5  Commit detail    │
│ Branches  │        [Show Local Changes]      │  hash│author│date    │
│ sidebar   ├──────────────────────────────────┤  full message        │
│  filter🔍 │ B4  Commit graph                 │  link merge request  │
│  Local Br.│   rail nhiều nhánh, badge ref    │  branches chứa commit│
│  origin/  │   [origin/dev] [origin/main]     ├──────────────────────┤
│  feat/ …  │   avatar│message│date            │ B6  Changed files    │
│  Stashes  │                                  │   của commit đã chọn │
│  Reflog   │                                  │   (path mờ bên cạnh) │
├───────────┴──────────────────────────────────┴──────────────────────┤
│ B7  Diff side-by-side của file chọn ở B6   +2~1 │ Unified|SbS │ ↑↓  │
└─────────────────────────────────────────────────────────────────────┘
```

| Vùng | Chức năng quan sát được |
|---|---|
| **B1 Branches sidebar** | Header "My History / All Branches + Tags" (chế độ xem). Ô filter nhánh + regex. Cây: **Local Branches** (nhánh hiện tại in đậm + ▶), **origin** (dev/main/v2), và đặc biệt: **nhánh tự gom nhóm theo prefix** `backup/`, `design/`, `feat/`, `fix/`, `research/` — mỗi prefix thành 1 section. Cuối sidebar: **Stashes**, **Reflog**. Chọn nhánh nào quyết định graph hiện gì. → map "Chọn view branch/remote nào". |
| **B2 Toolbar** | Đổi theo ngữ cảnh: thêm **Add Branch, Add Tag, Merge, Rebase, Cherry-Pick, Revert** — các thao tác trên commit/nhánh đang chọn trong graph. → map "merge, cherry-pick". |
| **B3 Banner trạng thái** | Banner "There are local changes" + nút **Show Local Changes** nhảy về màn hình A. Cầu nối 2 màn hình, không bắt user tự nhớ. |
| **B4 Commit graph** | Graph nhiều nhánh: rail màu, node tròn, merge line cong. Mỗi dòng: **badge ref** ngay trong dòng (`origin/dev`, `origin/main`, `origin/feat/vip`, có cả badge `~origin/...` = vị trí cũ), avatar/initials tác giả (T, QQ), message 1 dòng, thời gian tương đối bên phải. Filter commit ở góc. Chọn commit → B5/B6 cập nhật. → map "Xem gitlog (xem nhiều nhánh)". |
| **B5 Commit detail** | Hash (link copy được), tác giả, ngày giờ, **message đầy đủ nhiều dòng**, link "See merge request !15" (tích hợp GitLab/GitHub), danh sách nhánh chứa commit. |
| **B6 Changed files của commit** | Danh sách file trong commit đang chọn, dropdown "Changed files", tên file + `(thư mục)` mờ phía sau. Chọn file → B7. |
| **B7 Diff** | Diff side-by-side có syntax highlight đầy đủ (kể cả markdown), số dòng 2 bên, chỉ số thay đổi `+2~1`, cùng bộ toggle như A7. |

## C. Màn hình File Log (log 1 file — cửa sổ riêng)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Title: ai-review-findings.sh [4x-server] — Log for scripts/…@hash  │
├─────────────────────────────────────────────────────────────────────┤
│ C2  Toolbar: Add-Branch Add-Tag │ Cherry-Pick Revert │ Blame        │
│                                                        Investigate  │
├───────────┬──────────────────────────────────┬──────────────────────┤
│ C1        │ ⓘ File has a disjoint history    │ C4  Commit detail    │
│ Branches  ├──────────────────────────────────┤  (như B5, gọn hơn)   │
│ (checkbox)│ C3  Graph — chỉ commit đụng file │ ─────────────────────│
│ ☑HEAD     │   [Copied?] link phát hiện       │ C5  Files trong      │
│ ☑Commits  │   rename/copy                    │  commit: Name │ Mod. │
│ ☑main -72 │   badge ref như B4               │  │ Relative Dir      │
│ ☑origin 16│                                  │  (file đang xem đậm) │
├───────────┴──────────────────────────────────┴──────────────────────┤
│ C6  Changes of <file> (Modified) (Mode: Executable)  ~5 │ SbS │ ↑↓  │
│     diff side-by-side, intra-line highlight, connector cong 2 bên   │
└─────────────────────────────────────────────────────────────────────┘
```

| Vùng | Chức năng quan sát được |
|---|---|
| **Cửa sổ riêng** | File Log mở thành **cửa sổ độc lập** với title = đường dẫn file @ commit. Trong VSCode sẽ map thành editor tab riêng. → map "Xem log 1 file". |
| **C1 Branches (checkbox)** | Khác B1: mỗi ref có **checkbox** để bật/tắt nhánh đó khỏi graph. Hiện badge ahead/behind (`main < origin -72`), số lượng (`origin (16)`). |
| **C3 Graph theo file** | Chỉ hiện commit đụng tới file. Có link **[Copied?]** — phát hiện rename/copy, click để theo dấu lịch sử qua tên cũ. Banner "File has a disjoint history" khi lịch sử đứt đoạn. |
| **C5 Files panel** | Bảng file trong commit: cột Name / Modification / Relative Directory, sort được, có filter + toolbar icon (đổi kiểu group). File đang theo dõi được highlight. |
| **C6 Diff** | Như B7, thêm metadata đầu diff: trạng thái file `(Modified) (Mode: Executable)`, số thay đổi `~5`. Intra-line highlight (phần đổi trong dòng đậm màu hơn), connector cong nối 2 bên. |
| **Blame / Investigate** | 2 nút mở chế độ điều tra sâu theo dòng (blame từng dòng, Investigate = time-machine của SmartGit). Để giai đoạn sau. |

---

## D. Luồng Merge (3 screenshot trong `docs/screenshots/merge/`)

Luồng quan sát được: chọn nhánh trong History → **Merge** → dialog chọn chiến lược → working tree chuyển sang trạng thái merging → mở File Compare để xử lý từng file → commit thủ công.

### D1. Dialog chọn chiến lược merge (`merge/image.png`)

```
┌──────────────────────────────────────────────────────────────┐
│ <icon>  How to merge from branch 'main'?                     │
│                                                              │
│  (đoạn giải thích: fast-forward là gì, merge-commit là gì,   │
│   Merge to Working Tree / Squash-Merge sẽ chuẩn bị commit    │
│   để commit thủ công sau)                                    │
│                                                              │
│  [Cancel] [Fast-Forward*] [Create Merge-Commit]              │
│           [Merge to Working Tree] [Squash-Merge]             │
└──────────────────────────────────────────────────────────────┘
```

Điểm đáng học:
- **Nút = hành động, không phải OK/Cancel** — mỗi chiến lược là 1 nút riêng, nút khả dĩ nhất (Fast-Forward khi được) là default, highlight xanh.
- Dialog **tự giải thích hệ quả** từng lựa chọn ngay trong thân dialog, không cần đọc docs.
- 4 chiến lược: Fast-Forward / Create Merge-Commit / Merge to Working Tree (chuẩn bị merge-commit, commit sau) / Squash-Merge (gộp thành commit thường, mất thông tin nguồn).

### D2. Working Tree ở trạng thái merging (`merge/image copy.png`)

Vẫn là màn hình A nhưng có các khác biệt:

| Chi tiết | Quan sát |
|---|---|
| **Banner trạng thái** | Thanh ngang nổi trên vùng file: "The working tree is in **merging**-state." + nút **Abort** ngay bên phải — thoát merge 1 click. |
| **Commit message tự điền** | Ô commit đã có sẵn "Merge remote-tracking branch 'origin/main'" — user chỉ việc bấm Commit để hoàn tất merge. |
| **Badge cập nhật** | Local Files badge nhảy lên 185 (số file đổi do merge), Push badge 1 (số commit chưa push). |
| **Danh sách file** | File hiển thị dạng `thư-mục/tên-file` với phần thư mục mờ, tên file sáng (ví dụ `.claude/settings.json`). |
| **Status bar** | "Command succeeded." — phản hồi lệnh vừa chạy xong, kèm chấm xanh. |

### D3. Cửa sổ File Compare — xử lý conflict/so sánh index (`merge/image copy 2.png`)

```
┌──────────────────────────────────────────────────────────────┐
│  Title: [internal/infra/grpcx/retry.go] - File Compare       │
├──────────────────────────────────────────────────────────────┤
│  ↑Prev.Change ↓Next Change │ [Take Left] [Take Right]        │
├──────────────────────────────┬───────────────────────────────┤
│ retry.go (HEAD)              │ retry.go (Index)              │
│  code, số dòng riêng         │  code, số dòng riêng          │
│  vùng khác biệt tô nền xanh, │  block thêm mới highlight     │
│  connector cong nối 2 bên    │  đậm hơn                      │
├──────────────────────────────┴───────────────────────────────┤
│  Ready                                    153:1          +1  │
└──────────────────────────────────────────────────────────────┘
```

Điểm đáng học:
- Cửa sổ so sánh **riêng cho từng file**, title ghi rõ file + ngữ cảnh so sánh (HEAD ↔ Index).
- **Take Left / Take Right**: nhận nguyên khối thay đổi từ bên trái/phải — thao tác resolve cơ bản nhất, đặt ngay trên toolbar.
- **Prev/Next Change** để duyệt tuần tự từng khác biệt; vị trí con trỏ `153:1` + tổng số thay đổi `+1` ở status bar.
- Pane **edit trực tiếp được** (không chỉ xem) — resolve bằng tay khi Take Left/Right không đủ.
- Vùng thay đổi: nền xanh nhạt cho block, connector cong nối 2 bên, phần thêm mới đậm màu hơn (intra-block emphasis).

---

## E. Context menu trên commit trong graph (`docs/screenshots/graph/image.png`)

Chuột phải 1 commit trong graph mở menu đầy đủ, nhóm bằng separator:

| Nhóm | Lệnh (phím tắt) |
|---|---|
| Điều hướng | Check Out… (⌘G), Start Feature… |
| Tích hợp nhánh | Merge…, Cherry-Pick…, Revert…, Rebase… (⌘D) |
| **Viết lại lịch sử** | Modify…, Split…, Squash… (⌘J), Edit Message… (F2), Edit Author…, Rebase Interactive From… |
| Đánh dấu | Add Branch… (F7), Add Tag… (⇧F7) |
| Reset | Reset… (⌘R), Reset Advanced… (⇧⌘R), Rollback To… |
| Push | Push Up To… |
| Tiện ích | Use Message for Commit (⇧⌘K), Copy Message, Copy ID |

Điểm đáng học:
- **Phím tắt in ngay trong menu** — menu đồng thời là bảng dạy phím tắt.
- **Context-aware enable/disable**: trong ảnh phần lớn lệnh mờ (commit đang chọn không cho phép thao tác đó) — lệnh không áp dụng được thì mờ đi chứ không biến mất, giữ layout menu ổn định.
- Nhóm "viết lại lịch sử" (Modify/Split/Squash/Edit Message/Edit Author/Interactive Rebase) là bộ chức năng sâu nhất của SmartGit, đứng thành cụm riêng.
- `…` sau tên lệnh = sẽ mở dialog xác nhận/tuỳ chọn (đúng convention macOS).

## F. Chi tiết vùng Changed files — staged tách khung + chế độ hiển thị (`docs/screenshots/stage/`)

Ảnh `stage/image.png` cho thấy 2 chi tiết chưa thấy ở màn hình A ban đầu:

1. **Vùng file tách làm 2 khung dọc**: khung trên = file chưa stage (untracked/modified, icon trắng), **khung dưới riêng = file đã stage** (icon khác màu). Stage/unstage tức là file di chuyển giữa 2 khung — trạng thái index luôn nhìn thấy được, không lẫn vào nhau.
2. **Đường dẫn file hiển thị nguyên path**: phần thư mục mờ, tên file sáng (`.claude/skills/golang-benchmark/`**`SKILL.md`**) — dễ quét mắt theo tên file mà vẫn thấy ngữ cảnh.
3. Diff đáy ghi kèm metadata `SKILL.md (EOL: Unix)`.

Ảnh `stage/image copy.png` — dropdown của vùng file gồm 3 nhóm tuỳ chọn (checkmark độc lập từng nhóm):

| Nhóm | Lựa chọn |
|---|---|
| Phạm vi | Changed files · **All files, excl. ignored** ✓ · All files, incl. ignored |
| Sắp xếp | **Sort by Path** ✓ · Sort by File Name |
| Gom nhóm | **No Grouping** ✓ · Group by State · Group by Extension |

→ Vùng Changed files thực chất là **file browser đầy đủ của working tree** (xem được cả file không đổi/ignored), không chỉ danh sách diff. "Group by State" là chế độ gom theo trạng thái (modified/untracked/staged…) cho ai thích kiểu SCM view của VSCode.

## G. Context menu trên file trong Working Tree (`docs/screenshots/file/image.png`)

| Nhóm | Lệnh (phím tắt) |
|---|---|
| Xem / mở | Show Changes (F4), Open, Edit |
| Index | Stage (⌘T), Index Editor (⌥⌘T), Stash Selection…, Move or Rename… (F2) |
| Điều tra | Log (⌘L), Blame (⌥⌘L), Investigate (⌥⇧⌘L) |
| Huỷ / xoá | Discard… (⌘Z), Remove… (⌘⌫), Delete… (⌫) |
| Copy | Copy Name, Copy Path (^⌘C), Copy Relative Path (⇧⌘C) |
| Ngoài app | Reveal in Finder, Edit, **Open in VSCode** |

Điểm đáng học:
- **Stash Selection…** — stash chỉ những file đang chọn, không phải cả working tree.
- Phân biệt 3 mức huỷ/xoá: **Discard** (bỏ thay đổi, giữ file) / **Remove** (gỡ khỏi index) / **Delete** (xoá file thật).
- **Log / Blame / Investigate ngay từ file** — đường vào màn hình C (File Log) chính là menu này.
- **Move or Rename qua git** (`git mv`) để giữ lịch sử — thao tác hệ thống file nhưng làm đúng kiểu git.
- Cụm phím tắt nhất quán: ⌘T=Stage, thêm ⌥=biến thể sâu hơn (⌥⌘T=Index Editor); ⌘L=Log, ⌥⌘L=Blame, ⌥⇧⌘L=Investigate — **modifier tăng dần theo độ sâu chức năng**.
- Tự tích hợp editor ngoài ("Open in VSCode") — với extension của mình thì chiều ngược lại: "Open in Editor" mở file bằng tab VSCode thường.

---

## Nhận xét rút ra cho thiết kế extension

1. **Mô hình 3 màn hình là xương sống** — extension nên giữ đúng 3 view này (Working Tree / History / File Log), không trộn thành 1.
2. **Layout lặp lại 1 khuôn**: trái-điều hướng, giữa-danh sách, phải-chi tiết, đáy-diff → làm 1 bộ component layout (SplitPane) dùng chung cho cả 3 màn hình.
3. **Commit inline, không dialog** — ô commit message luôn hiển thị là điểm ăn tiền của SmartGit so với Git trong VSCode.
4. **Ref badge nằm trong dòng graph** (không tách cột) và **nhánh gom nhóm theo prefix** — 2 chi tiết nhỏ nhưng quyết định cảm giác "giống SmartGit".
5. **Mọi list đều filter được** + toolbar theo ngữ cảnh + banner điều hướng chéo giữa các màn hình.
6. **Luôn phản hồi tức thì** (status bar "Ready", quét nền) — củng cố yêu cầu cache index riêng trong note.
7. **Dialog kiểu "nút = hành động"**: mọi dialog thao tác (merge, và nhiều khả năng rebase/stash tương tự) liệt kê từng chiến lược thành nút riêng kèm giải thích hệ quả — extension nên giữ pattern này thay vì dropdown + OK.
8. **Trạng thái repo đặc biệt (merging/rebasing) hiển thị bằng banner trong Working Tree** kèm nút thoát (Abort) và commit message tự điền — user không bao giờ "kẹt" giữa chừng mà không biết đang ở trạng thái nào.
