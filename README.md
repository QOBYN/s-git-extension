<div align="center">

<img src="media/icon-128.png" width="96" alt="">

# S-Git

**Git client đầy đủ bên trong VS Code và [Orca](https://orca.dev)** — commit graph nhiều
nhánh, staging theo hunk, diff/merge và file log, gói gọn trong một panel.

</div>

---

## Extension này giải quyết gì

Source Control có sẵn của VS Code làm tốt việc stage và commit, nhưng khi cần
*nhìn* lịch sử — nhánh nào tách ở đâu, merge nào kéo theo commit nào, dòng này
ai đổi ở commit nào — thì phải rời editor sang một GUI riêng. S-Git đưa phần
đó vào thẳng VS Code.

## Tính năng

| | |
|---|---|
| **Commit graph** | Vẽ đầy đủ nhánh và merge, tải 1.000 commit mỗi trang kèm *Load more* |
| **Working Tree** | Stage theo file hoặc theo từng hunk; ô commit luôn hiển thị, không phải mở dialog |
| **Diff theo loại file** | Ảnh so sánh cạnh nhau, CSV dựng thành bảng và tô dòng đổi, binary hiện thông tin thay vì rác byte |
| **File Log** | Chuột phải một file → mở lịch sử riêng của nó thành tab editor |
| **Merge & Rebase** | Hộp thoại chọn strategy; xung đột hiện banner ngay trong panel |
| **Bàn phím** | Mũi tên chuyển pane và duyệt diff, Page/Home/End, nhảy giữa các hunk xuyên file |
| **Đa repo** | Nhận cả submodule đã init thành repo riêng |

## Cài đặt

Từ Marketplace: mở **Extensions** (`Cmd/Ctrl+Shift+X`), tìm `S-Git`.

Hoặc cài từ file `.vsix` ở [Releases](https://github.com/QOBYN/s-git-extension/releases):

```bash
code --install-extension s-git-<version>.vsix
```

## Dùng trong Orca

S-Git cũng chạy như một plugin của [Orca](https://orca.dev) (cần Orca ≥ 1.4.248): panel
**S-Git** ở sidebar phải, cùng UI và cùng engine git với bản VS Code.

- **Cài**: Orca → Settings → Plugins → tìm `S-Git`, hoặc
  `orca plugin install QOBYN/s-git-extension`. Plugin chạy `git` trên máy bạn nên Orca hỏi
  quyền trước khi bật (đọc danh sách workspace, mở file trong editor, lưu settings).
- **Theo workspace đang mở**: đổi workspace ở sidebar trái của Orca thì S-Git chuyển sang repo
  của workspace đó; dropdown repo liệt kê mọi workspace local (bỏ qua workspace SSH).
- **Mở ở giữa (rộng)**: nút **+** trên thanh tab → **S-Git** (hoặc Command Palette → `S-Git`)
  mở S-Git thành 1 tab ở vùng editor giữa — hợp với graph nhiều nhánh và diff cạnh nhau. Tab
  là file `.sgit` chưa lưu, S-Git không sửa nội dung nên đóng tab không bị hỏi lưu.
- **Hoặc ở sidebar phải**: panel **S-Git** dạng mini — các vùng xếp trên/dưới (danh sách →
  chi tiết commit / ô commit → diff), graph thu gọn để luôn đọc được message, diff mặc định
  Unified. Nút đầu tiên trên toolbar bật/tắt cây thư mục + nhánh (sidebar của bản VS Code);
  chỗ hẹp thì cây nổi đè lên và tự đóng khi chọn xong. *File Log* mở ngay trong view.
- **Status bar** của Orca hiện số file thay đổi của workspace đang mở.
- Khác bản VS Code: chưa có *Open in Integrated Terminal* / *Find in Folder*; video trong diff
  mở bằng trình phát của hệ điều hành; *Delete* chuyển vào Thùng rác của hệ điều hành.
- **Settings** (Orca → Settings → Plugins → S-Git): `Git executable`, `Commits per page`,
  `Refresh delay (ms)` — cùng nghĩa với bảng dưới, đổi xong bấm *Restart* plugin.

## Cấu hình

| Setting | Mặc định | Ý nghĩa |
|---|---|---|
| `s-git.git.path` | `""` | Đường dẫn binary `git`. Để trống thì dùng `git` trong `PATH`. |
| `s-git.log.pageSize` | `1000` | Số commit tải mỗi trang trong graph. |
| `s-git.git.watchDebounceMs` | `300` | Gom sự kiện thay đổi `.git/` bao lâu trước khi refresh (ms). |

## Phát triển

```bash
npm install
npm run dev        # vite + HMR cho webview
# rồi F5 trong VS Code để mở Extension Development Host

npm run verify     # typecheck + test + build (VS Code + Orca)
npm run package    # tạo s-git.vsix
npm run build:orca # build plugin Orca vào orca/out/ (được commit — Orca cài thẳng từ git)
```

Plugin Orca: manifest [`orca-plugin.json`](orca-plugin.json), worker Node ở
[`orca/worker/`](orca/worker/) (dùng lại services của `extension/`), panel chính là
webview `src/` build với entry [`orca/panel/index.html`](orca/panel/index.html). Chạy thử:
`orca plugin dev watch .` ở thư mục gốc repo.

Quy trình đóng gói và úp lên Marketplace: [`docs/release.md`](docs/release.md).

Kiến trúc và spec nằm ở [`docs/design/`](docs/design/). Nguyên tắc chính:
`extension/` là extension host (Node), `src/` là webview (React), `shared/`
là phần dùng chung — hai môi trường có tsconfig riêng và không lẫn types.

## Giấy phép

[PolyForm Shield 1.0.0](LICENSE.md) — dùng thoải mái cho mọi mục đích, kể cả
trong doanh nghiệp; điều duy nhất không được phép là dùng chính source này để
làm ra sản phẩm cạnh tranh với S-Git.

## Ghi chú

Bố cục và luồng thao tác của S-Git tham khảo từ
[SmartGit](https://www.syntevo.com/smartgit/) của Syntevo GmbH. S-Git là phần
mềm độc lập, viết mới hoàn toàn, **không liên kết với, không được bảo trợ bởi,
và không phái sinh từ** Syntevo GmbH hay bất kỳ sản phẩm nào của họ.
SmartGit là nhãn hiệu của Syntevo GmbH. Git là nhãn hiệu của Software Freedom
Conservancy, Inc.
