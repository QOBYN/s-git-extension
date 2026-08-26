// Adapter: nối WorkspaceReader với vscode.workspace.
// Tầng adapter là nơi DUY NHẤT (cùng views/ và index.ts) được import 'vscode'.

import * as vscode from 'vscode';
import type { WorkspaceReader } from '../services/interfaces';

export class VscodeWorkspaceReader implements WorkspaceReader {
  getFolders(): ReadonlyArray<{ name: string; fsPath: string }> {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => ({
      name: folder.name,
      fsPath: folder.uri.fsPath,
    }));
  }
}
