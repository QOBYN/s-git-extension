// Tuỳ chọn hiển thị diff (Side-by-Side/Compact/Word-Wrap/Ignore WS) — nhớ qua
// localStorage: user bật Compact một lần là mọi diff về sau đều compact,
// không reset mỗi lần đổi file như trước.

import { create } from 'zustand';
import type { DiffViewOptions } from '../components/DiffView';
import { IS_MINI } from '../env';

const DEFAULTS: DiffViewOptions = {
  // SmartGit mặc định Side by Side (screenshot B7); bố cục mini (Orca sidebar
  // phải, hẹp) mặc định Unified — 2 cột ở ~500px không đọc nổi.
  sideBySide: !IS_MINI,
  compact: false,
  wordWrap: false,
  ignoreWhitespace: false,
};

// Panel mini và view giữa của Orca chung localStorage (cùng origin) → nhớ riêng.
const STORAGE_KEY = IS_MINI ? 's-git.diffPrefs.mini' : 's-git.diffPrefs';

function load(): DiffViewOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<DiffViewOptions>) };
    }
  } catch {
    // localStorage không khả dụng — dùng default
  }
  return DEFAULTS;
}

interface DiffPrefsStore extends DiffViewOptions {
  setOption<K extends keyof DiffViewOptions>(key: K, value: DiffViewOptions[K]): void;
  toggle(key: keyof DiffViewOptions): void;
}

export const useDiffPrefs = create<DiffPrefsStore>((set, get) => {
  const persist = () => {
    try {
      const { sideBySide, compact, wordWrap, ignoreWhitespace } = get();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ sideBySide, compact, wordWrap, ignoreWhitespace }),
      );
    } catch {
      // không lưu được thì thôi
    }
  };

  return {
    ...load(),

    setOption(key, value) {
      set({ [key]: value } as Partial<DiffViewOptions>);
      persist();
    },

    toggle(key) {
      set({ [key]: !get()[key] } as Partial<DiffViewOptions>);
      persist();
    },
  };
});
