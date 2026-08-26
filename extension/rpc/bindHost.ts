// Nối birpc vào 1 webview: expose HostFunctions, nhận proxy WebviewFunctions.
// Mỗi webview (panel chính, file log, sidebar) có 1 kênh RPC riêng qua hàm này.

import { createBirpc, type BirpcReturn } from 'birpc';
import type * as vscode from 'vscode';
import type { HostFunctions, WebviewFunctions } from '../../shared/protocol';
import { toDisposable, type IDisposable } from '../core/disposable';

export interface HostRpc {
  /** Proxy typed gọi sang webview (fire-and-forget notifications). */
  remote: BirpcReturn<WebviewFunctions, HostFunctions>;
  disposable: IDisposable;
}

export function bindHostRpc(webview: vscode.Webview, functions: HostFunctions): HostRpc {
  let messageSub: vscode.Disposable | undefined;

  const remote = createBirpc<WebviewFunctions, HostFunctions>(functions, {
    post: (data) => void webview.postMessage(data),
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
