// Kênh RPC phía webview: expose WebviewFunctions, trả về proxy HostFunctions.
// VSCode → birpc qua acquireVsCodeApi; Orca → src/orcaBridge (plugin.request).
// Store đăng ký handler qua setNotificationHandlers — tách vòng phụ thuộc
// rpc ↔ store (rpc không import store).

import { createBirpc } from 'birpc';
import type { HostFunctions, WebviewFunctions } from '../shared/protocol';
import { createOrcaHost } from './orcaBridge';

let handlers: Partial<WebviewFunctions> = {};

/** Store gọi 1 lần lúc khởi tạo để nhận notification từ host. */
export function setNotificationHandlers(next: Partial<WebviewFunctions>): void {
  handlers = next;
}

/** Hàm host gọi ngược sang — chuyển tiếp tới handler store đã đăng ký. */
const local: WebviewFunctions = {
  repoChanged: (repoRoot, delta) => handlers.repoChanged?.(repoRoot, delta),
  operationProgress: (message) => handlers.operationProgress?.(message),
  navigate: (repoRoot, mode, folder, ref, search) =>
    handlers.navigate?.(repoRoot, mode, folder, ref, search),
  showFileLog: (repoRoot, relPath) => handlers.showFileLog?.(repoRoot, relPath),
  reposChanged: (focusRoot) => handlers.reposChanged?.(focusRoot),
};

function createVscodeHost(): HostFunctions {
  // acquireVsCodeApi chỉ được gọi ĐÚNG 1 lần cho vòng đời webview — gọi lần 2
  // (HMR reload module trong dev) sẽ throw. Giữ instance trên window để tái dùng.
  const vscodeApi = (window.__vscodeApi ??= acquireVsCodeApi());
  return createBirpc<HostFunctions, WebviewFunctions>(local, {
    post: (data) => vscodeApi.postMessage(data),
    on: (handler) => window.addEventListener('message', (event) => handler(event.data)),
  });
}

/** Proxy typed — gọi `host.getLog(...)` như hàm local, transport lo phần chuyển msg. */
export const host: HostFunctions = window.orca
  ? createOrcaHost(window.orca.plugin, local)
  : createVscodeHost();
