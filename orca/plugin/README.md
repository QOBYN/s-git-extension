# S-Git — gói plugin Orca

Thư mục này là **toàn bộ plugin** Orca cài vào máy (khai báo ở
[`orca-catalog.json`](../../orca-catalog.json) → `source.path`), nên chỉ chứa thứ cần lúc chạy:

| File | Nguồn |
|---|---|
| `orca-plugin.json` | Manifest — sửa tay; `version` tự đồng bộ theo `package.json` |
| `worker.mjs`, `panel/` | **Sinh ra** bởi `npm run build:orca` từ [`orca/worker/`](../worker/) và [`src/`](../../src/) — không sửa tay |
| `icon.png`, `LICENSE.md` | Chép từ [`media/icon.png`](../../media/icon.png) và [`LICENSE.md`](../../LICENSE.md) lúc build |

Source đầy đủ (worker, UI, test) nằm ở phần còn lại của repo
[QOBYN/s-git-extension](https://github.com/QOBYN/s-git-extension).
