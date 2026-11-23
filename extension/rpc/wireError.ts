// Chuyển lỗi thành object thuần trước khi rời tiến trình host.
// postMessage (VSCode) và IPC của Orca đều JSON hoá message: Error instance thành
// `{}` (message/stack không enumerable) — webview chỉ thấy "[object Object]",
// mất sạch stderr. Webview format lại qua src/utils/errors.formatError.

import { GitError } from '../services/gitRunner';

export function toWireError(error: unknown): unknown {
  if (error instanceof GitError) {
    return { message: error.message, git: error.toInfo() };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return error;
}
