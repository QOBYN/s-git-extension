// Phần dùng chung cho mọi webview của extension: sinh HTML (dev = Vite server
// có HMR, prod = bundle trong dist/webview) và nối RPC. MainPanel / FileLogPanel /
// SidebarView đều đi qua đây — không lặp lại logic này ở từng view.

import { getWebviewHtml } from 'virtual:vscode';
import * as vscode from 'vscode';
import type { HostFunctions } from '../../shared/protocol';
import type { PanelMode } from '../../shared/types';
import { toDisposable } from '../core/disposable';
import { bindHostRpc, type HostRpc } from '../rpc/bindHost';
import type { RpcHub } from '../rpc/rpcHub';

/** Thư mục chứa bundle webview trong gói extension — khớp output của vite build. */
const WEBVIEW_DIST_DIR = 'dist/webview';

/** Trạng thái khởi tạo inject vào window trước khi app load (src/global.d.ts). */
export interface WebviewInitial {
  /** Vai của webview — App.tsx chọn màn hình theo giá trị này. 1 bundle, nhiều vai. */
  screen: 'main' | 'file-log' | 'sidebar';
  /** Điều hướng ban đầu (từ sidebar click) — null = mặc định. */
  repoRoot?: string | null;
  mode?: PanelMode | null;
  folder?: string | null;
  ref?: string | null;
  search?: string | null;
  /** File cho màn File Log (đường dẫn tương đối trong repo). */
  filePath?: string | null;
}

/**
 * Thư mục ngoài bundle mà webview được phép đọc (composition root đăng ký lúc
 * activate — hiện là thư mục tạm media của MediaExporter).
 */
let extraResourceRoots: vscode.Uri[] = [];

export function setExtraResourceRoots(roots: vscode.Uri[]): void {
  extraResourceRoots = roots;
}

/**
 * Webview đang sống — dùng để đổi fsPath → webview URI từ tầng service (không
 * giữ tham chiếu webview trong hostFunctions). URI tài nguyên local là chung
 * cho mọi webview trong 1 cửa sổ nên lấy webview nào cũng được.
 */
const liveWebviews = new Set<vscode.Webview>();

/** null khi chưa có webview nào (thực tế không xảy ra: request đến từ webview). */
export function toWebviewUri(fsPath: string): string | null {
  for (const webview of liveWebviews) {
    return webview.asWebviewUri(vscode.Uri.file(fsPath)).toString();
  }
  return null;
}

export function webviewOptions(context: vscode.ExtensionContext): vscode.WebviewOptions {
  return {
    enableScripts: true,
    // Chặn webview đọc file ngoài các gốc này (an toàn mặc định): bundle của
    // chính nó + thư mục tạm media + workspace (video working tree đọc tại chỗ).
    localResourceRoots: [
      vscode.Uri.joinPath(context.extensionUri, WEBVIEW_DIST_DIR),
      ...extraResourceRoots,
      ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri),
    ],
  };
}

/** Gán HTML + RPC cho 1 webview và đăng ký kênh vào RpcHub (nhận broadcast). */
export function attachWebview(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  functions: HostFunctions,
  hub: RpcHub,
  initial: WebviewInitial,
): HostRpc {
  // Dev: getWebviewHtml của plugin BỎ QUA injectCode (chỉ render iframe trỏ dev
  // server) → __SMARTGIT_INIT__ không được inject và mọi webview rơi về màn 'main'.
  // Truyền init qua query string thay thế — index.html đọc ra trước khi app load.
  const devServerUrl = process.env.VITE_DEV_SERVER_URL
    ? `${process.env.VITE_DEV_SERVER_URL}?__SMARTGIT_INIT__=${encodeURIComponent(JSON.stringify(initial))}`
    : undefined;
  webview.html = getWebviewHtml({
    serverUrl: devServerUrl,
    webview,
    context,
    injectCode: `<script>window.__SMARTGIT_INIT__=${JSON.stringify(initial)};</script>`,
  });
  const rpc = bindHostRpc(webview, functions);
  const hubSub = hub.add(rpc.remote);
  liveWebviews.add(webview);
  return {
    remote: rpc.remote,
    disposable: toDisposable(() => {
      liveWebviews.delete(webview);
      hubSub.dispose();
      rpc.disposable.dispose();
    }),
  };
}
