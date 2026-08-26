// Tuỳ chọn hiển thị danh sách file thay đổi: List phẳng ↔ Tree explorer.
// Nhớ qua localStorage (giống diffPrefsStore) — chọn 1 lần, áp dụng cho cả
// Working Tree panes lẫn panel Changed files của commit.

import { create } from 'zustand';

export type FileListMode = 'list' | 'tree';

const STORAGE_KEY = 'smartgit.viewPrefs';
const DEFAULT_MODE: FileListMode = 'list';

interface StoredPrefs {
  fileListMode: FileListMode;
}

function load(): FileListMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
      if (parsed.fileListMode === 'list' || parsed.fileListMode === 'tree') {
        return parsed.fileListMode;
      }
    }
  } catch {
    // localStorage không khả dụng — dùng default
  }
  return DEFAULT_MODE;
}

interface ViewPrefsStore {
  fileListMode: FileListMode;
  toggleFileListMode(): void;
}

export const useViewPrefs = create<ViewPrefsStore>((set, get) => ({
  fileListMode: load(),

  toggleFileListMode() {
    const fileListMode: FileListMode = get().fileListMode === 'list' ? 'tree' : 'list';
    set({ fileListMode });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ fileListMode } satisfies StoredPrefs));
    } catch {
      // không lưu được thì thôi
    }
  },
}));
