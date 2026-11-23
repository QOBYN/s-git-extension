# Deploy / Release

## Úp tay lên VS Code Marketplace (cách đang dùng)

1. Đóng gói:

   ```bash
   npm run package    # verify (typecheck + test + build) rồi tạo s-git.vsix
   ```

2. Vào <https://marketplace.visualstudio.com/manage/publishers/qobyn>.
3. Login bằng acc **lemin2601@gmail.com**, thông qua kết nối với **GitHub**.
4. Bấm **New extension → Visual Studio Code** (lần đầu) hoặc **⋯ → Update** (các lần sau), kéo thả file `s-git.vsix`.
5. Chờ marketplace verify (thường 5–15 phút). Treo quá ~30 phút thì bấm vào extension xem error log.

Lưu ý: mỗi lần úp lại phải bump `version` trong `package.json` — marketplace từ chối version trùng.

## Release tự động qua CI (khi đã có secrets)

Workflow [.github/workflows/release.yml](../.github/workflows/release.yml) chạy khi push tag `v*.*.*`:

```bash
# đứng ở main
npm run release:patch    # bump version + tạo tag + push --follow-tags
```

CI sẽ: typecheck → test → build → đóng gói `.vsix` → publish lên Marketplace (`VSCE_PAT`) + Open VSX (`OVSX_PAT`) → tạo GitHub Release kèm file `.vsix`. Thiếu secret nào thì bước đó bỏ qua kèm warning.

Secrets khai ở repo **Settings → Secrets and variables → Actions**:

- `VSCE_PAT` — Azure DevOps PAT (dev.azure.com, cùng Microsoft account sở hữu publisher `qobyn`): Organization chọn *All accessible organizations*, scope *Marketplace → Manage*.
- `OVSX_PAT` — token từ <https://open-vsx.org/user-settings/tokens> (login GitHub, ký Publisher Agreement, tạo namespace `qobyn` một lần bằng `npx ovsx create-namespace qobyn -p <token>`).

## Plugin Orca

Orca cài plugin thẳng từ commit của tag `vX.Y.Z` (không chạy build), nên bản build
`orca/out/` phải nằm trong chính commit đó. `npm version` (gọi bởi `npm run release:*`)
tự chạy script `version`: `npm run build:orca` → đồng bộ `version` của
[`orca-plugin.json`](../orca-plugin.json) theo `package.json` → `git add` vào commit bump.

Lần đầu đưa lên danh mục plugin của Orca (chỉ làm 1 lần):

```bash
gh repo edit QOBYN/s-git-extension --add-topic orca-plugin
```

Sau đó mỗi tag `vX.Y.Z` mới được Orca tự quét (~1 giờ). Kiểm tra trạng thái ở
<https://orca.dev/plugins/qobyn/s-git-extension>. Trước khi tag nên chạy
`orca plugin validate .` (cần Orca ≥ 1.4.248) để bắt lỗi manifest sớm.
