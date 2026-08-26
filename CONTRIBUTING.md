# Đóng góp cho S-Git

## Trước khi gửi PR: về bản quyền

S-Git phát hành theo [PolyForm Shield 1.0.0](LICENSE.md) và chủ sở hữu bản
quyền dự định giữ khả năng đổi giấy phép cho các phiên bản về sau (kể cả sang
giấy phép thương mại).

Điều này chỉ khả thi khi **một chủ thể duy nhất nắm toàn bộ bản quyền**. Mặc
định, ai viết code thì giữ bản quyền phần mình viết — nghĩa là một PR được
merge mà không có thoả thuận sẽ khoá vĩnh viễn khả năng đổi giấy phép của toàn
bộ dự án, vì không thể cấp lại quyền cho phần code không thuộc về mình.

Vì vậy PR chỉ được merge sau khi người đóng góp xác nhận dòng sau trong PR:

> Tôi cấp cho chủ sở hữu bản quyền của S-Git quyền không giới hạn, không thể
> thu hồi, được cấp lại cho bên thứ ba, để sử dụng, sửa đổi và phát hành phần
> đóng góp này theo bất kỳ giấy phép nào, bao gồm cả giấy phép thương mại. Tôi
> xác nhận mình có quyền hợp pháp để cấp quyền này (phần đóng góp do tôi tự
> viết và không thuộc sở hữu của người sử dụng lao động của tôi).

Vế trong ngoặc không phải hình thức: ở đa số hợp đồng lao động, code viết trong
giờ làm hoặc bằng thiết bị công ty thuộc về công ty, không thuộc về bạn — nên
bạn không có quyền cấp nó cho dự án này.

## Quy trình

```bash
npm install
npm run verify     # typecheck (3 tsconfig) + vitest + build — phải xanh trước khi mở PR
```

Trước khi push:

- `npm run verify` phải chạy sạch. CI chạy đúng các bước này nên hỏng ở máy là hỏng ở CI.
- Logic thuần (parse, layout, diff, tree) phải có test Vitest đi kèm.
- Đọc [`docs/design/architecture.md`](docs/design/architecture.md) trước khi thêm
  service mới — dự án theo dependency injection, `extension/index.ts` là composition
  root **duy nhất** được phép khởi tạo và nối service.

## Ranh giới tầng

| Thư mục | Môi trường | Không được phép |
|---|---|---|
| `extension/` | Node (extension host) | import từ `src/`, dùng DOM API |
| `src/` | Webview (React) | import từ `extension/`, dùng `node:` module |
| `shared/` | Cả hai | import `vscode`, import React |

Mỗi tầng có `tsconfig.json` riêng — nếu thấy cần nới `lib`/`types` để code chạy
thì gần như chắc chắn code đang đặt sai tầng.

## Commit

Theo [Conventional Commits](https://www.conventionalcommits.org/): `feat(diff): …`,
`fix(graph): …`, `docs: …`. Phần scope dùng tên vùng chức năng (`graph`, `diff`,
`history`, `git`, `ui`).
