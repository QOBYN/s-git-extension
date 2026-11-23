// Kênh RPC của panel khi chạy trong Orca — cùng hình dạng HostFunctions như
// birpc bên VSCode nên store/màn hình không cần biết đang chạy ở đâu.
// Gọi host = `orca.plugin.request` tới worker (orca/worker/rpcServer.ts);
// thông báo từ worker = `orca.plugin.on`. Quy ước kích thước: shared/orcaWire.ts.

import type { HostFunctions, WebviewFunctions } from '../shared/protocol';
import {
  INLINE_ARGS_MAX_UNITS,
  ORCA_NOTIFY_EVENT,
  ORCA_REQUEST,
  ORCA_REQUEST_TIMEOUT_MS,
  UPLOAD_CHUNK_UNITS,
  splitChunks,
  type CallInput,
  type CallOutput,
  type HostMethod,
  type NotifyPayload,
} from '../shared/orcaWire';

/** Phần `window.orca.plugin` mà panel dùng (frame API của Orca). */
export interface OrcaFramePlugin {
  request(name: string, input?: unknown, options?: { timeoutMs?: number }): Promise<unknown>;
  on(event: string, handler: (payload: unknown) => void): { dispose(): void };
}

type LocalHandler = (local: WebviewFunctions, args: unknown[]) => void;

/**
 * Điều hướng xử lý ngay trong panel: VSCode mở/reveal tab khác, còn Orca chỉ có
 * 1 panel — vòng qua worker thì worker lại post cho MỌI panel đang mở (nhiều
 * cửa sổ) và chậm hơn. `?? null` giống hệt hostFunctions.openPanel phía host.
 */
const LOCAL_METHODS: Partial<Record<HostMethod, LocalHandler>> = {
  openPanel: (local, [repoRoot, mode, folder, ref, search]) =>
    local.navigate(
      (repoRoot ?? null) as string | null,
      (mode ?? null) as Parameters<WebviewFunctions['navigate']>[1],
      (folder ?? null) as string | null,
      (ref ?? null) as string | null,
      (search ?? null) as string | null,
    ),
  openFileLog: (local, [repoRoot, relPath]) =>
    local.showFileLog(repoRoot as string, relPath as string),
};

export function createOrcaHost(plugin: OrcaFramePlugin, local: WebviewFunctions): HostFunctions {
  plugin.on(ORCA_NOTIFY_EVENT, (payload) => {
    const { name, args } = (payload ?? {}) as Partial<NotifyPayload>;
    const fn = name !== undefined ? (local[name] as unknown) : undefined;
    if (typeof fn === 'function') {
      (fn as (...a: unknown[]) => void)(...(Array.isArray(args) ? args : []));
    }
  });

  let uploadSeq = 0;

  async function call(method: HostMethod, rawArgs: unknown[]): Promise<unknown> {
    // Input của Orca phải là JSON thuần. Bỏ undefined ở CUỐI để tham số tuỳ chọn
    // phía worker nhận undefined (default param còn tác dụng) thay vì null;
    // undefined ở giữa → null, field undefined trong object bị bỏ — như JSON.
    const args = [...rawArgs];
    while (args.length > 0 && args[args.length - 1] === undefined) {
      args.pop();
    }
    const json = JSON.stringify(args);
    let input: CallInput = { method, args: JSON.parse(json) as unknown[] };
    if (json.length > INLINE_ARGS_MAX_UNITS) {
      // Tham số lớn (vd nội dung file sửa trong diff) vượt trần 64 KiB/request.
      const id = `u${Date.now().toString(36)}-${(uploadSeq++).toString(36)}`;
      const parts = splitChunks(json, UPLOAD_CHUNK_UNITS);
      for (let index = 0; index < parts.length; index++) {
        await plugin.request(ORCA_REQUEST.upload, {
          id,
          index,
          count: parts.length,
          data: parts[index],
        });
      }
      input = { method, uploadId: id };
    }

    const output = (await plugin.request(ORCA_REQUEST.call, input, {
      timeoutMs: ORCA_REQUEST_TIMEOUT_MS,
    })) as CallOutput;
    if (!output.ok) {
      // Cùng dạng lỗi birpc trả bên VSCode ({message, git}) — formatError đọc được.
      throw output.error;
    }
    if ('chunked' in output) {
      // Lấy TUẦN TỰ: worker giải phóng bộ đệm khi mảnh cuối được lấy.
      let text = '';
      for (let index = 0; index < output.chunked.count; index++) {
        const part = (await plugin.request(ORCA_REQUEST.chunk, {
          id: output.chunked.id,
          index,
        })) as { data: string };
        text += part.data;
      }
      return JSON.parse(text) as unknown;
    }
    return output.value;
  }

  return new Proxy({} as HostFunctions, {
    get(_target, prop) {
      // 'then' phải undefined — không thì `await host` coi proxy là thenable.
      if (typeof prop !== 'string' || prop === 'then') {
        return undefined;
      }
      const method = prop as HostMethod;
      const localHandler = LOCAL_METHODS[method];
      return (...args: unknown[]) => {
        if (localHandler !== undefined) {
          localHandler(local, args);
          return Promise.resolve();
        }
        return call(method, args);
      };
    },
  });
}
