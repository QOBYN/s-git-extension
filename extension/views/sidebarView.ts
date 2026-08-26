// Sidebar (activity bar) — lối vào nhanh, không nhồi chức năng (spec mục 2.5).
// Dùng chung bundle webview với panel chính, khác screen id.

import * as vscode from 'vscode';
import { EXTENSION_ID_PREFIX } from '../../shared/constants';
import type { HostFunctions } from '../../shared/protocol';
import type { RpcHub } from '../rpc/rpcHub';
import { attachWebview, webviewOptions } from './webviewHost';

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  /** Phải khớp contributes.views trong package.json. */
  static readonly viewType = `${EXTENSION_ID_PREFIX}.mainView`;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly functions: HostFunctions,
    private readonly hub: RpcHub,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = webviewOptions(this.context);
    const rpc = attachWebview(view.webview, this.context, this.functions, this.hub, {
      screen: 'sidebar',
    });
    view.onDidDispose(() => rpc.disposable.dispose());
  }
}
