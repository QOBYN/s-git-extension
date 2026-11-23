import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_GIT_WATCH_DEBOUNCE_MS, DEFAULT_LOG_PAGE_SIZE } from '../../shared/constants';
import { cacheDir, parseSettings } from './config';
import { isRelevantWorktreeEvent, supportsWorkingTreeWatch } from './watchers';

describe('parseSettings', () => {
  it('thiếu / sai kiểu / ngoài khoảng → mặc định', () => {
    const defaults = {
      gitPath: '',
      logPageSize: DEFAULT_LOG_PAGE_SIZE,
      gitWatchDebounceMs: DEFAULT_GIT_WATCH_DEBOUNCE_MS,
    };
    expect(parseSettings(undefined)).toEqual(defaults);
    expect(parseSettings({ gitPath: 3, logPageSize: 10, watchDebounceMs: 1.5 })).toEqual(defaults);
    expect(parseSettings({ logPageSize: 200_000, watchDebounceMs: -1 })).toEqual(defaults);
  });

  it('giá trị hợp lệ được giữ (gitPath trim)', () => {
    expect(parseSettings({ gitPath: ' /opt/git ', logPageSize: 500, watchDebounceMs: 0 })).toEqual({
      gitPath: '/opt/git',
      logPageSize: 500,
      gitWatchDebounceMs: 0,
    });
  });
});

describe('cacheDir', () => {
  it('thư mục cache chuẩn theo hệ điều hành', () => {
    expect(cacheDir('darwin', {}, '/Users/u')).toBe(path.join('/Users/u', 'Library', 'Caches', 's-git-orca'));
    expect(cacheDir('linux', {}, '/home/u')).toBe(path.join('/home/u', '.cache', 's-git-orca'));
    expect(cacheDir('linux', { XDG_CACHE_HOME: '/xdg' }, '/home/u')).toBe(path.join('/xdg', 's-git-orca'));
    expect(cacheDir('win32', { LOCALAPPDATA: 'C:/L' }, 'C:/U')).toBe(path.join('C:/L', 's-git-orca', 'Cache'));
  });
});

describe('watchers', () => {
  it('bỏ sự kiện trong .git/ và node_modules/', () => {
    expect(isRelevantWorktreeEvent('src/a.ts')).toBe(true);
    expect(isRelevantWorktreeEvent(null)).toBe(true);
    expect(isRelevantWorktreeEvent('.git/index')).toBe(false);
    expect(isRelevantWorktreeEvent('node_modules\\x\\y.js')).toBe(false);
    expect(isRelevantWorktreeEvent('.github/ci.yml')).toBe(true);
  });

  it('watch working tree chỉ bật trên macOS/Windows', () => {
    expect(supportsWorkingTreeWatch('darwin')).toBe(true);
    expect(supportsWorkingTreeWatch('win32')).toBe(true);
    expect(supportsWorkingTreeWatch('linux')).toBe(false);
  });
});
