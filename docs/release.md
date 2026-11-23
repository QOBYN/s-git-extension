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

Gói Orca nằm ở [`orca/plugin/`](../orca/plugin/) (chỉ manifest + bản build + icon + LICENSE),
khai báo bằng [`orca-catalog.json`](../orca-catalog.json) ở gốc repo (`source.path`) — nhờ vậy
source, docs, `.claude/`… không bị tính vào plugin. Orca cài thẳng từ commit nên bản build phải
nằm trong repo. `npm run release:*` lo hết:

1. `version` — `npm run build:orca` (build vào `orca/plugin/`, đồng bộ `version` của manifest)
   → `git add orca/plugin` vào commit bump (C1).
2. `postversion` — [`scripts/orca-catalog-release.mjs`](../scripts/orca-catalog-release.mjs):
   lấy release entry của C1 bằng `orca plugin release-entry orca/plugin --json` (cần Orca cài
   trên máy, hoặc đặt `ORCA_CLI`), ghi vào `orca-catalog.json`, commit (C2), dời tag sang C2.
3. `git push --follow-tags`.

Danh mục Orca quét tag mới (~30 phút/lần). Trạng thái:
<https://orca.dev/plugins/qobyn/s-git-extension> — hoặc mục `qobyn/s-git-extension` trong
[`status.json`](https://github.com/stablyai/orca-community-plugins/blob/main/status.json).
Kiểm tra trước khi tag: `orca plugin validate orca/plugin`.
