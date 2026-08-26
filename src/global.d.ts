// Trạng thái khởi tạo do extension host inject qua webviewHost.attachWebview —
// gồm vai của webview (main / file-log / sidebar) và điều hướng ban đầu.
interface Window {
  __SMARTGIT_INIT__?: {
    screen: 'main' | 'file-log' | 'sidebar';
    repoRoot?: string | null;
    mode?: 'workingTree' | 'history' | null;
    folder?: string | null;
    ref?: string | null;
    search?: string | null;
    filePath?: string | null;
  };
  /** Instance acquireVsCodeApi — chỉ acquire được 1 lần/webview (src/rpc.ts). */
  __vscodeApi?: ReturnType<typeof acquireVsCodeApi>;
}

/** Thời điểm build bundle (vite define) — hiện ở status bar để debug bundle cũ/mới. */
declare const __SGIT_BUILD__: string;
