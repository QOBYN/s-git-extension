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

  private view: vscode.WebviewView | undefined;
  private badgeCount = 0;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly functions: HostFunctions,
    private readonly hub: RpcHub,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = webviewOptions(this.context);
    const rpc = attachWebview(view.webview, this.context, this.functions, this.hub, {
      screen: 'sidebar',
    });
    view.onDidDispose(() => {
      this.view = undefined;
      rpc.disposable.dispose();
    });
    this.applyBadge();
  }

  /** Badge số file thay đổi trên icon Activity Bar; 0 = ẩn badge. */
  setBadge(count: number): void {
    this.badgeCount = count;
    this.applyBadge();
  }

  private applyBadge(): void {
    // VSCode chỉ cho set badge sau khi view được resolve (mở sidebar lần đầu);
    // trước đó giữ count lại, resolveWebviewView sẽ áp dụng.
    if (!this.view) {
      return;
    }
    this.view.badge =
      this.badgeCount > 0
        ? { value: this.badgeCount, tooltip: `${this.badgeCount} file thay đổi` }
        : undefined;
  }
}
