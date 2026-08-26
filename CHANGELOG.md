# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
đánh số theo [Semantic Versioning](https://semver.org/lang/vi/).

Marketplace hiển thị nguyên file này ở tab **Changelog**, nên viết cho người
dùng đọc — mô tả thay đổi nhìn thấy được, không phải tên hàm đã sửa.

## [Unreleased]

### Added

- Commit graph nhiều nhánh, phân trang 1.000 commit + *Load more*
- Working Tree: staging theo file và theo hunk, ô commit luôn hiển thị
- Diff nhận biết loại file: ảnh so sánh cạnh nhau, CSV dạng bảng, binary hiện thông tin
- File Log: mở lịch sử một file thành tab editor riêng (context menu Explorer/Editor)
- Fetch / pull / push trên toolbar; hộp thoại Merge và Rebase với lựa chọn strategy
- Điều hướng bàn phím trong History: mũi tên chuyển pane, ↑/↓ duyệt diff, Page/Home/End
- Nút nhảy hunk: tới đầu/cuối file thì chuyển tiếp sang file trước/sau trong cùng commit
- Toggle hiển thị danh sách file dạng list hoặc cây thư mục
- Theo dõi `.git/` và tự refresh, có debounce chỉnh được

[Unreleased]: https://github.com/QOBYN/s-git-extension/commits/main
