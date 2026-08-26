<div align="center">

<img src="media/icon-128.png" width="96" alt="">

# S-Git

**Git client đầy đủ bên trong VS Code** — commit graph nhiều nhánh, staging theo hunk,
diff/merge và file log, gói gọn trong một panel.

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

npm run verify     # typecheck + test + build
npm run package    # tạo s-git.vsix
```

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
