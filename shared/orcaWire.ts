// Giao thức RPC panel ↔ worker khi chạy trong Orca (orca/worker ↔ src/orcaBridge).
// Trong VSCode RPC đi bằng birpc qua postMessage; Orca chỉ có request/response
// (`plugin.request` → `panels.handle`) và post 1 chiều (`panels.post` → `plugin.on`),
// kèm giới hạn kích thước — file này gom mọi quy ước đó về 1 chỗ, thuần TS để
// cả worker (node) lẫn panel (DOM) dùng chung và test được.

import type { HostFunctions, WebviewFunctions } from './protocol';

/** Tên handler worker đăng ký bằng `orca.panels.handle`. */
export const ORCA_REQUEST = {
  /** Gọi 1 HostFunction: input CallInput → output CallOutput. */
  call: 'sgit.call',
  /** Gửi trước tham số quá lớn theo từng mảnh (UploadInput). */
  upload: 'sgit.upload',
  /** Lấy từng mảnh của kết quả quá lớn (ChunkInput → { data }). */
  chunk: 'sgit.chunk',
} as const;

/** Tên sự kiện worker `panels.post` → panel `plugin.on`: thông báo WebviewFunctions. */
export const ORCA_NOTIFY_EVENT = 'sgit.notify';

/**
 * Orca: input request ≤ 64 KiB, output ≤ 1 MiB, đo bằng byte UTF-8 sau khi
 * JSON hoá. Mảnh là chuỗi con của 1 văn bản JSON nên khi bị JSON hoá lần nữa
 * mỗi code unit tốn tối đa 3 byte (ký tự BMP ngoài ASCII; `"` và `\` chỉ thành
 * 2) — chia theo code unit với hệ số 3 là luôn lọt trần.
 */
export const UPLOAD_CHUNK_UNITS = 16_000; // ≤ 48 KB < 64 KiB
export const DOWNLOAD_CHUNK_UNITS = 300_000; // ≤ 900 KB < 1 MiB

/** Tham số JSON dài hơn ngưỡng này (code unit) thì upload trước theo mảnh. */
export const INLINE_ARGS_MAX_UNITS = UPLOAD_CHUNK_UNITS;

/** Kết quả JSON nặng hơn ngưỡng này (byte UTF-8) thì trả về dạng mảnh. */
export const INLINE_RESULT_MAX_BYTES = 900_000;

/** Request/response dài nhất Orca cho phép — fetch/push repo lớn có thể lâu. */
export const ORCA_REQUEST_TIMEOUT_MS = 120_000;

export type HostMethod = keyof HostFunctions;

export interface CallInput {
  method: HostMethod;
  /** Tham số trực tiếp — vắng khi đã upload trước (uploadId). */
  args?: unknown[];
  /** Id phiên upload chứa JSON của `args`. */
  uploadId?: string;
}

/** Lỗi đã chuyển thành object thuần (message + git stderr) — xem extension/rpc/wireError. */
export type WireError = unknown;

export type CallOutput =
  | { ok: true; value: unknown }
  | { ok: true; chunked: { id: string; count: number } }
  | { ok: false; error: WireError };

export interface UploadInput {
  id: string;
  index: number;
  count: number;
  data: string;
}

export interface ChunkInput {
  id: string;
  index: number;
}

export type NotifyName = keyof WebviewFunctions;

export interface NotifyPayload {
  name: NotifyName;
  args: unknown[];
}

/**
 * Cắt chuỗi thành các mảnh tối đa `size` code unit, KHÔNG cắt giữa 1 cặp
 * surrogate (emoji, chữ Hán mở rộng…): mảnh lẻ surrogate có thể bị thay bằng
 * U+FFFD khi đi qua IPC dạng UTF-8 → ghép lại sai nội dung.
 */
export function splitChunks(text: string, size: number): string[] {
  if (size < 2) {
    throw new Error('splitChunks: size phải ≥ 2');
  }
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length && isHighSurrogate(text.charCodeAt(end - 1))) {
      end -= 1;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
