// Kênh birpc phía webview: expose WebviewFunctions, nhận proxy HostFunctions.
// Store đăng ký handler qua setNotificationHandlers — tách vòng phụ thuộc
// rpc ↔ store (rpc không import store).

import { createBirpc } from 'birpc';
import type { HostFunctions, WebviewFunctions } from '../shared/protocol';

// acquireVsCodeApi chỉ được gọi ĐÚNG 1 lần cho vòng đời webview — gọi lần 2
// (HMR reload module trong dev) sẽ throw. Giữ instance trên window để tái dùng.
const vscodeApi = (window.__vscodeApi ??= acquireVsCodeApi());

let handlers: Partial<WebviewFunctions> = {};

/** Store gọi 1 lần lúc khởi tạo để nhận notification từ host. */
export function setNotificationHandlers(next: Partial<WebviewFunctions>): void {
  handlers = next;
}

/** Proxy typed — gọi `host.getLog(...)` như hàm local, birpc lo phần chuyển msg. */
export const host = createBirpc<HostFunctions, WebviewFunctions>(
  {
    repoChanged: (repoRoot, delta) => handlers.repoChanged?.(repoRoot, delta),
    operationProgress: (message) => handlers.operationProgress?.(message),
    navigate: (repoRoot, mode, folder, ref, search) =>
      handlers.navigate?.(repoRoot, mode, folder, ref, search),
  },
  {
    post: (data) => vscodeApi.postMessage(data),
    on: (handler) => window.addEventListener('message', (event) => handler(event.data)),
  },
);
