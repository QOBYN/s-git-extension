// Webview đang chạy ở đâu: VSCode (acquireVsCodeApi + birpc) hay panel Orca
// (window.orca do frame shell của Orca định nghĩa trước mọi script plugin).
// 1 bundle UI, 2 nơi chạy — chỉ vài chỗ khác hành vi đọc cờ này.

export const IS_ORCA = typeof window !== 'undefined' && window.orca != null;

/**
 * Orca: đang là VIEW GIỮA (custom editor mở file .sgit — orca/panel/editor.html)
 * chứ không phải panel ở sidebar phải. Rộng hơn nhiều nên bố cục mặc định khác.
 */
export const IS_ORCA_EDITOR =
  IS_ORCA && typeof document !== 'undefined' && document.documentElement.dataset.sgSurface === 'editor';

/**
 * Bố cục MINI: panel ở sidebar phải của Orca (hẹp, cao) — các vùng xếp trên/dưới
 * thay vì trái/phải, graph giới hạn bề rộng. View giữa và VSCode dùng bố cục đầy đủ.
 */
export const IS_MINI = IS_ORCA && !IS_ORCA_EDITOR;
