// Kích thước các vùng UI do user kéo thả (splitter) — nhớ giữa các phiên
// qua localStorage của webview. Mỗi vùng có min/max để không kéo mất vùng khác.

import { create } from 'zustand';

export interface LayoutSizes {
  /** Bề rộng sidebar nhánh (trái, màn History). */
  branchesWidth: number;
  /** Bề rộng panel chi tiết commit / panel commit (phải). */
  detailWidth: number;
  /** Chiều cao panel diff (đáy). */
  diffHeight: number;
  /** Bố cục mini (Orca sidebar phải): chiều cao chi tiết commit nằm DƯỚI danh sách. */
  miniDetailHeight: number;
  /** Bố cục mini: chiều cao ô commit nằm DƯỚI danh sách file Working Tree. */
  miniCommitHeight: number;
}

const DEFAULT_SIZES: LayoutSizes = {
  branchesWidth: 210,
  detailWidth: 340,
  diffHeight: 300,
  miniDetailHeight: 200,
  miniCommitHeight: 170,
};

/** Giới hạn kéo cho từng vùng — không hardcode rải rác ở component. */
export const SIZE_LIMITS: Record<keyof LayoutSizes, { min: number; max: number }> = {
  branchesWidth: { min: 140, max: 480 },
  detailWidth: { min: 240, max: 640 },
  diffHeight: { min: 120, max: 900 },
  miniDetailHeight: { min: 90, max: 700 },
  miniCommitHeight: { min: 110, max: 500 },
};

const STORAGE_KEY = 's-git.layoutSizes';

function loadSizes(): LayoutSizes {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      // Chỉ nhận các key hợp lệ — dữ liệu cũ/hỏng không phá layout.
      const parsed = JSON.parse(raw) as Partial<LayoutSizes>;
      return { ...DEFAULT_SIZES, ...parsed };
    }
  } catch {
    // localStorage không khả dụng trong một số ngữ cảnh webview — dùng default.
  }
  return DEFAULT_SIZES;
}

interface LayoutStore extends LayoutSizes {
  resize(key: keyof LayoutSizes, delta: number): void;
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  ...loadSizes(),

  resize(key, delta) {
    const { min, max } = SIZE_LIMITS[key];
    const next = Math.min(max, Math.max(min, get()[key] + delta));
    set({ [key]: next } as Partial<LayoutSizes>);
    try {
      const sizes = Object.fromEntries(
        (Object.keys(DEFAULT_SIZES) as Array<keyof LayoutSizes>).map((k) => [k, get()[k]]),
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
    } catch {
      // không lưu được thì thôi — size vẫn đúng trong phiên hiện tại
    }
  },
}));
