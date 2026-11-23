// Webview đang chạy ở đâu: VSCode (acquireVsCodeApi + birpc) hay panel Orca
// (window.orca do frame shell của Orca định nghĩa trước mọi script plugin).
// 1 bundle UI, 2 nơi chạy — chỉ vài chỗ khác hành vi đọc cờ này.

export const IS_ORCA = typeof window !== 'undefined' && window.orca != null;
