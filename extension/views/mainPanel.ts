// Panel chính — trải nghiệm SmartGit đầy đủ (Working Tree ↔ History, spec mục 1).
// Singleton: mở lại khi panel đang tồn tại thì reveal + điều hướng (navigate)
// thay vì tạo mới — sidebar click nhiều lần vẫn chỉ có 1 panel.

import * as vscode from 'vscode';
import { EXTENSION_ID_PREFIX } from '../../shared/constants';
import type { HostFunctions } from '../../shared/protocol';
import type { PanelMode } from '../../shared/types';
import type { RpcHub } from '../rpc/rpcHub';
import { DisposableStore, toDisposable } from '../core/disposable';
import { attachWebview, webviewOptions, type WebviewInitial } from './webviewHost';

const VIEW_TYPE = `${EXTENSION_ID_PREFIX}.mainPanel`;
const TITLE = 'SmartGit';

export interface PanelNavigation {
  repoRoot: string | null;
  mode: PanelMode | null;
  /** Folder scope cho Working Tree (null = cả repo) — sidebar tab 1. */
  folder: string | null;
  /** Lọc History theo 1 ref (null = mọi nhánh) — sidebar tab 2. */
  ref: string | null;
}

export class MainPanel extends DisposableStore {
  private static current: MainPanel | undefined;

  static createOrShow(
    context: vscode.ExtensionContext,
    functions: HostFunctions,
    hub: RpcHub,
    navigation?: PanelNavigation,
  ): void {
    if (MainPanel.current) {
      MainPanel.current.panel.reveal();
      if (navigation) {
        // Panel đang sống: điều hướng qua RPC (webview nhận WebviewFunctions.navigate).
        void Promise.resolve(
          MainPanel.current.remote.navigate(
            navigation.repoRoot,
            navigation.mode,
            navigation.folder,
            navigation.ref,
          ),
        ).catch(() => {});
      }
      return;
    }
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, TITLE, vscode.ViewColumn.Active, {
      ...webviewOptions(context),
      // Giữ state webview khi panel bị che — mở lại hiện NGAY, đúng cảm giác
      // "Ready" tức thì của SmartGit (ui-analysis A8).
      retainContextWhenHidden: true,
    });
    MainPanel.current = new MainPanel(panel, context, functions, hub, navigation);
  }

  private readonly remote;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    functions: HostFunctions,
    hub: RpcHub,
    navigation: PanelNavigation | undefined,
  ) {
    super();
    // Panel mới: điều hướng ban đầu inject thẳng vào HTML (webview chưa có
    // listener RPC lúc load nên không dùng navigate được).
    const initial: WebviewInitial = {
      screen: 'main',
      repoRoot: navigation?.repoRoot ?? null,
      mode: navigation?.mode ?? null,
      folder: navigation?.folder ?? null,
      ref: navigation?.ref ?? null,
    };
    const rpc = attachWebview(panel.webview, context, functions, hub, initial);
    this.remote = rpc.remote;
    this.register(rpc.disposable);
    this.register(toDisposable(() => (MainPanel.current = undefined)));
    panel.onDidDispose(() => this.dispose());
  }
}
