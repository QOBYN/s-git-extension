// Tuỳ chọn hiển thị danh sách file thay đổi: List phẳng ↔ Tree explorer, và
// filter phạm vi file trên pane Changes (chỉ tracked / kèm untracked / kèm cả
// ignored). Nhớ qua localStorage (giống diffPrefsStore) — chọn 1 lần, áp dụng
// cho cả Working Tree panes lẫn panel Changed files của commit.

import { create } from 'zustand';
import type { StatusScope } from '../../shared/types';

export type FileListMode = 'list' | 'tree';

/**
 * Phạm vi file hiện trên pane Changes (ui-analysis mục F) — trùng StatusScope
 * vì host cần biết để trả đúng dữ liệu (ls-files / --ignored):
 *  - changes: chỉ file git phát hiện thay đổi (mặc định — hành vi cũ).
 *  - all:     TẤT CẢ file trong project (kèm file tracked không đổi).
 *  - ignored: như all, kèm cả entry .gitignore.
 */
export type ChangesFilter = StatusScope;

const STORAGE_KEY = 's-git.viewPrefs';
const DEFAULT_MODE: FileListMode = 'list';
const DEFAULT_FILTER: ChangesFilter = 'changes';

interface StoredPrefs {
  fileListMode: FileListMode;
  changesFilter: ChangesFilter;
}

function load(): StoredPrefs {
  const prefs: StoredPrefs = { fileListMode: DEFAULT_MODE, changesFilter: DEFAULT_FILTER };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
      if (parsed.fileListMode === 'list' || parsed.fileListMode === 'tree') {
        prefs.fileListMode = parsed.fileListMode;
      }
      if (
        parsed.changesFilter === 'changes' ||
        parsed.changesFilter === 'all' ||
        parsed.changesFilter === 'ignored'
      ) {
        prefs.changesFilter = parsed.changesFilter;
      }
    }
  } catch {
    // localStorage không khả dụng — dùng default
  }
  return prefs;
}

function save(prefs: StoredPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // không lưu được thì thôi
  }
}

interface ViewPrefsStore {
  fileListMode: FileListMode;
  changesFilter: ChangesFilter;
  toggleFileListMode(): void;
  setChangesFilter(filter: ChangesFilter): void;
}

export const useViewPrefs = create<ViewPrefsStore>((set, get) => ({
  ...load(),

  toggleFileListMode() {
    const fileListMode: FileListMode = get().fileListMode === 'list' ? 'tree' : 'list';
    set({ fileListMode });
    save({ fileListMode, changesFilter: get().changesFilter });
  },

  setChangesFilter(changesFilter) {
    set({ changesFilter });
    save({ fileListMode: get().fileListMode, changesFilter });
  },
}));
