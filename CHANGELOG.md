# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
đánh số theo [Semantic Versioning](https://semver.org/lang/vi/).

Marketplace hiển thị nguyên file này ở tab **Changelog**, nên viết cho người
dùng đọc — mô tả thay đổi nhìn thấy được, không phải tên hàm đã sửa.

## [Unreleased]

## [0.0.3] - 2026-08-27

### Added

- Double-click một dòng commit trong History (hoặc menu **Check Out…**) mở popup checkout:
  chọn checkout nhánh local tại commit đó hay detached HEAD; nếu đang có thay đổi chưa
  commit thì chọn luôn cách xử lý — **Stash & re-apply / Mang theo / Discard** (ghi nhớ lựa chọn)
- Double-click nhánh trong sidebar (hoặc menu **Check Out…**) dùng cùng popup checkout đó —
  click đơn vẫn mở History của nhánh như cũ; hoạt động cả với nhánh trong submodule
- Khi git từ chối pull/merge/rebase/checkout vì có thay đổi chưa commit
  (vd `cannot pull with rebase: You have unstaged changes`), popup hiện rõ lý do và cho xử lý
  ngay: **Stash & Retry** (tự stash → chạy lại → re-apply) hoặc mở Working Tree để commit trước
- Checkout tự đồng bộ submodule theo commit mới (`git submodule update --init`);
  chọn **Discard** thì reset cả con trỏ submodule đang lệch

### Fixed

- Lỗi git trong banner hiển thị `[object Object]` — giờ hiện nguyên văn thông báo của git

## [0.0.2] - 2026-08-27

### Added

- Commit graph nhiều nhánh, phân trang 1.000 commit + *Load more*
- Working Tree: staging theo file và theo hunk, ô commit luôn hiển thị
- Diff nhận biết loại file: ảnh so sánh cạnh nhau, CSV dạng bảng, binary hiện thông tin
- File Log: mở lịch sử một file thành tab editor riêng (context menu Explorer/Editor)
- Fetch / pull / push trên toolbar; hộp thoại Merge và Rebase với lựa chọn strategy
- Pull mở popup chọn cách hoà: **Merge / Rebase / Fast-Forward Only** — ghi nhớ lựa chọn cho lần sau
- Nút Push có mũi tên **Push to…**: đẩy HEAD lên nhánh chỉ định trên remote, tự tạo nhánh mới nếu chưa có
- Chuột phải commit trong History có thêm **Merge…** và **Reset…** (Soft / Mixed / Hard — ghi nhớ lựa chọn)
- Điều hướng bàn phím trong History: mũi tên chuyển pane, ↑/↓ duyệt diff, Page/Home/End
- Nút nhảy hunk: tới đầu/cuối file thì chuyển tiếp sang file trước/sau trong cùng commit
- Toggle hiển thị danh sách file dạng list hoặc cây thư mục
- Theo dõi `.git/` và tự refresh, có debounce chỉnh được

### Changed

- Bỏ nút Merge / Rebase khỏi toolbar (ít dùng) — merge/rebase nhánh vẫn ở context menu
  nhánh trong sidebar, merge một commit nằm ở context menu History

[Unreleased]: https://github.com/QOBYN/s-git-extension/compare/v0.0.3...HEAD
[0.0.3]: https://github.com/QOBYN/s-git-extension/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/QOBYN/s-git-extension/commits/v0.0.2
