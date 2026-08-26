// File Log — mỗi file 1 editor tab riêng (map cửa sổ riêng của SmartGit,
// ui-analysis C / spec 2.3). Mở lại cùng file thì reveal tab cũ.

import * as path from 'node:path';
import * as vscode from 'vscode';
import { EXTENSION_ID_PREFIX } from '../../shared/constants';
import type { HostFunctions } from '../../shared/protocol';
import type { RpcHub } from '../rpc/rpcHub';
import { DisposableStore, toDisposable } from '../core/disposable';
import { attachWebview, webviewOptions } from './webviewHost';

const VIEW_TYPE = `${EXTENSION_ID_PREFIX}.fileLog`;

export class FileLogPanel extends DisposableStore {
  private static readonly open = new Map<string, FileLogPanel>();

  static show(
    context: vscode.ExtensionContext,
    functions: HostFunctions,
    hub: RpcHub,
    repoRoot: string,
    /** Đường dẫn tương đối trong repo, separator '/'. */
    filePath: string,
  ): void {
    const key = `${repoRoot}:${filePath}`;
    const existing = FileLogPanel.open.get(key);
    if (existing) {
      existing.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      `${path.posix.basename(filePath)} — Log`,
      vscode.ViewColumn.Active,
      { ...webviewOptions(context), retainContextWhenHidden: true },
    );
    FileLogPanel.open.set(key, new FileLogPanel(panel, context, functions, hub, key, repoRoot, filePath));
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    functions: HostFunctions,
    hub: RpcHub,
    key: string,
    repoRoot: string,
    filePath: string,
  ) {
    super();
    const rpc = attachWebview(panel.webview, context, functions, hub, {
      screen: 'file-log',
      repoRoot,
      filePath,
    });
    this.register(rpc.disposable);
    this.register(toDisposable(() => FileLogPanel.open.delete(key)));
    panel.onDidDispose(() => this.dispose());
  }
}
