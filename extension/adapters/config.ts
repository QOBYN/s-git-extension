// Đọc VSCode settings (contributes.configuration trong package.json).
// Đây là điểm nối DUY NHẤT giữa settings và options của services —
// services không bao giờ tự đọc config (luật DI, architecture.md mục 1).

import * as vscode from 'vscode';
import {
  DEFAULT_GIT_WATCH_DEBOUNCE_MS,
  DEFAULT_LOG_PAGE_SIZE,
  EXTENSION_ID_PREFIX,
} from '../../shared/constants';

export interface ExtensionConfig {
  /** Đường dẫn binary git; rỗng = dùng 'git' trong PATH. */
  gitPath: string;
  logPageSize: number;
  gitWatchDebounceMs: number;
}

export function readExtensionConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(EXTENSION_ID_PREFIX);
  return {
    gitPath: config.get<string>('git.path', ''),
    logPageSize: config.get<number>('log.pageSize', DEFAULT_LOG_PAGE_SIZE),
    gitWatchDebounceMs: config.get<number>('git.watchDebounceMs', DEFAULT_GIT_WATCH_DEBOUNCE_MS),
  };
}
