// Nối birpc vào 1 webview: expose HostFunctions, nhận proxy WebviewFunctions.
// Mỗi webview (panel chính, file log, sidebar) có 1 kênh RPC riêng qua hàm này.

import { createBirpc, type BirpcReturn } from 'birpc';
import type * as vscode from 'vscode';
import type { HostFunctions, WebviewFunctions } from '../../shared/protocol';
import { toDisposable, type IDisposable } from '../core/disposable';
import { GitError } from '../services/gitRunner';

/**
 * postMessage của VSCode JSON hoá message: Error instance thành `{}` (message/
 * stack không enumerable) — webview chỉ thấy "[object Object]", mất sạch stderr.
 * Chuyển Error trong REPLY lỗi của birpc ({t:'s', e}) thành object thuần trước
 * khi gửi; webview format lại qua utils/errors.formatError.
 */
function toWireError(error: unknown): unknown {
  if (error instanceof GitError) {
    return { message: error.message, git: error.toInfo() };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return error;
}

function withWireError(data: unknown): unknown {
  const msg = data as { t?: string; e?: unknown } | null;
  if (msg !== null && typeof msg === 'object' && msg.t === 's' && msg.e !== undefined) {
    return { ...msg, e: toWireError(msg.e) };
  }
  return data;
}

export interface HostRpc {
  /** Proxy typed gọi sang webview (fire-and-forget notifications). */
  remote: BirpcReturn<WebviewFunctions, HostFunctions>;
  disposable: IDisposable;
}

export function bindHostRpc(webview: vscode.Webview, functions: HostFunctions): HostRpc {
  let messageSub: vscode.Disposable | undefined;

  const remote = createBirpc<WebviewFunctions, HostFunctions>(functions, {
    post: (data) => void webview.postMessage(withWireError(data)),
    on: (handler) => {
      messageSub = webview.onDidReceiveMessage(handler);
    },
  });

  return {
    remote,
    disposable: toDisposable(() => {
      messageSub?.dispose();
      remote.$close();
    }),
  };
}
