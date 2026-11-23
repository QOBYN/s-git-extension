// Settings của plugin Orca (contributes.settings trong orca-plugin.json) +
// thư mục cache — tương đương extension/adapters/config.ts của VSCode.

import * as os from 'node:os';
import * as path from 'node:path';
import { DEFAULT_GIT_WATCH_DEBOUNCE_MS, DEFAULT_LOG_PAGE_SIZE } from '../../shared/constants';

/** Cùng nghĩa ExtensionConfig của VSCode (extension/adapters/config.ts — file đó import 'vscode'). */
export interface OrcaSettings {
  /** Đường dẫn binary git; rỗng = dùng 'git' trong PATH. */
  gitPath: string;
  logPageSize: number;
  gitWatchDebounceMs: number;
}

/** Khoá setting — phải khớp `contributes.settings[].key` trong orca-plugin.json. */
export const SETTING_KEYS = {
  gitPath: 'gitPath',
  logPageSize: 'logPageSize',
  watchDebounceMs: 'watchDebounceMs',
} as const;

function intInRange(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

/** Giá trị lạ/thiếu → mặc định; Orca đã kiểm theo khai báo nhưng không tin hoàn toàn. */
export function parseSettings(raw: Record<string, unknown> | null | undefined): OrcaSettings {
  const values = raw ?? {};
  const gitPath = values[SETTING_KEYS.gitPath];
  return {
    gitPath: typeof gitPath === 'string' ? gitPath.trim() : '',
    logPageSize: intInRange(values[SETTING_KEYS.logPageSize], 50, 100_000, DEFAULT_LOG_PAGE_SIZE),
    gitWatchDebounceMs: intInRange(
      values[SETTING_KEYS.watchDebounceMs],
      0,
      5_000,
      DEFAULT_GIT_WATCH_DEBOUNCE_MS,
    ),
  };
}

export async function readSettings(host: {
  call(method: string, params?: unknown): Promise<unknown>;
}): Promise<OrcaSettings> {
  const result = (await host.call('settings.get', {}).catch(() => null)) as {
    settings?: Record<string, unknown>;
  } | null;
  return parseSettings(result?.settings);
}

/**
 * Cache log (CacheIndex) — thư mục cache chuẩn của từng hệ điều hành; Orca
 * không đưa worker thư mục dữ liệu riêng (pluginRoot là nội bộ).
 */
export function cacheDir(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
): string {
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Caches', 's-git-orca');
  }
  if (platform === 'win32') {
    return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 's-git-orca', 'Cache');
  }
  return path.join(env.XDG_CACHE_HOME || path.join(home, '.cache'), 's-git-orca');
}
