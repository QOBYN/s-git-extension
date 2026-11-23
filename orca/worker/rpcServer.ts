// Phía worker của RPC Orca: nhận CallInput từ panel, chạy HostFunctions, trả
// CallOutput. Thay cho birpc (VSCode) vì Orca chỉ có request/response có giới
// hạn kích thước — tham số lớn đi qua `upload`, kết quả lớn đi qua `chunk`
// (quy ước ở shared/orcaWire.ts).

import type { HostFunctions } from '../../shared/protocol';
import {
  DOWNLOAD_CHUNK_UNITS,
  INLINE_RESULT_MAX_BYTES,
  splitChunks,
  type CallInput,
  type CallOutput,
  type ChunkInput,
  type UploadInput,
} from '../../shared/orcaWire';
import { toWireError } from '../../extension/rpc/wireError';

const SLOW_CALL_MS = 1_500;

/** Mảnh không được lấy/hoàn tất sau khoảng này thì bỏ — panel đã đóng hoặc bỏ cuộc. */
const PENDING_TTL_MS = 2 * 60_000;

interface Pending {
  parts: string[];
  expiresAt: number;
}

export interface RpcServer {
  call(input: unknown): Promise<CallOutput>;
  upload(input: unknown): { ok: true };
  chunk(input: unknown): { data: string };
}

/** Bản JSON thuần của 1 giá trị (bỏ field undefined, Date → chuỗi…); không serialize được → chuỗi. */
export function toJsonValue(value: unknown): unknown {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? null : (JSON.parse(json) as unknown);
  } catch {
    return { message: String(value) };
  }
}

export function createRpcServer(
  functions: HostFunctions,
  options: {
    now?: () => number;
    newId?: () => string;
    /** Lệnh chạy lâu hơn SLOW_CALL_MS — ghi `orca plugin logs` để chẩn đoán. */
    onSlow?: (method: string, ms: number) => void;
  } = {},
): RpcServer {
  const now = options.now ?? Date.now;
  let counter = 0;
  const newId = options.newId ?? (() => `${now().toString(36)}-${(counter++).toString(36)}`);
  const uploads = new Map<string, Pending>();
  const downloads = new Map<string, Pending>();

  function sweep(): void {
    const t = now();
    for (const store of [uploads, downloads]) {
      for (const [id, pending] of store) {
        if (pending.expiresAt < t) {
          store.delete(id);
        }
      }
    }
  }

  function takeArgs(input: CallInput): unknown[] {
    if (input.uploadId === undefined) {
      return Array.isArray(input.args) ? input.args : [];
    }
    const pending = uploads.get(input.uploadId);
    uploads.delete(input.uploadId);
    // Array.from: mảng tạo bằng new Array(n) có "lỗ" — some/every bỏ qua lỗ.
    if (pending === undefined || Array.from(pending.parts, (part) => part === undefined).includes(true)) {
      throw new Error('Tham số gửi lên bị thiếu mảnh — thử lại thao tác.');
    }
    const args = JSON.parse(pending.parts.join('')) as unknown;
    return Array.isArray(args) ? args : [];
  }

  return {
    async call(raw) {
      sweep();
      const input = raw as CallInput;
      const fn = (functions as unknown as Record<string, unknown>)[input?.method];
      if (typeof fn !== 'function') {
        return { ok: false, error: { message: `Unknown host method: ${String(input?.method)}` } };
      }
      let value: unknown;
      const startedAt = now();
      try {
        value = await (fn as (...args: unknown[]) => unknown).apply(functions, takeArgs(input));
      } catch (error) {
        return { ok: false, error: toJsonValue(toWireError(error)) };
      } finally {
        const elapsed = now() - startedAt;
        if (elapsed >= SLOW_CALL_MS) {
          options.onSlow?.(String(input.method), elapsed);
        }
      }
      // undefined không đi qua JSON — Promise<void> trả null cho chắc.
      const json = JSON.stringify(value ?? null);
      if (Buffer.byteLength(json, 'utf8') <= INLINE_RESULT_MAX_BYTES) {
        // Orca từ chối answer không phải JSON thuần (field undefined, Date…) —
        // birpc/VSCode thì tự bỏ qua. Trả đúng bản JSON đã serialize.
        return { ok: true, value: JSON.parse(json) as unknown };
      }
      const id = newId();
      const parts = splitChunks(json, DOWNLOAD_CHUNK_UNITS);
      downloads.set(id, { parts, expiresAt: now() + PENDING_TTL_MS });
      return { ok: true, chunked: { id, count: parts.length } };
    },

    upload(raw) {
      sweep();
      const input = raw as UploadInput;
      if (
        typeof input?.id !== 'string' ||
        !Number.isInteger(input.index) ||
        !Number.isInteger(input.count) ||
        input.index < 0 ||
        input.index >= input.count ||
        typeof input.data !== 'string'
      ) {
        throw new Error('upload: input không hợp lệ');
      }
      let pending = uploads.get(input.id);
      if (pending === undefined) {
        pending = { parts: new Array<string>(input.count), expiresAt: 0 };
        uploads.set(input.id, pending);
      }
      pending.parts[input.index] = input.data;
      pending.expiresAt = now() + PENDING_TTL_MS;
      return { ok: true };
    },

    chunk(raw) {
      const input = raw as ChunkInput;
      const pending = downloads.get(input?.id);
      const data = pending?.parts[input.index];
      if (pending === undefined || data === undefined) {
        throw new Error('Kết quả đã hết hạn — thử lại thao tác.');
      }
      // Mảnh cuối đã lấy → giải phóng (panel lấy tuần tự).
      if (input.index === pending.parts.length - 1) {
        downloads.delete(input.id);
      } else {
        pending.expiresAt = now() + PENDING_TTL_MS;
      }
      return { data };
    },
  };
}
