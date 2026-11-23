import { describe, expect, it } from 'vitest';
import type { WebviewFunctions } from '../shared/protocol';
import {
  INLINE_ARGS_MAX_UNITS,
  ORCA_NOTIFY_EVENT,
  ORCA_REQUEST,
  type CallOutput,
} from '../shared/orcaWire';
import { createOrcaHost, type OrcaFramePlugin } from './orcaBridge';

/** Plugin giả: ghi lại request, trả lời theo `respond`, phát sự kiện qua `emit`. */
function fakePlugin(respond: (name: string, input: unknown) => unknown) {
  const requests: Array<{ name: string; input: unknown; timeoutMs?: number }> = [];
  const listeners = new Map<string, (payload: unknown) => void>();
  const plugin: OrcaFramePlugin = {
    async request(name, input, options) {
      requests.push({ name, input, timeoutMs: options?.timeoutMs });
      return respond(name, input);
    },
    on(event, handler) {
      listeners.set(event, handler);
      return { dispose: () => listeners.delete(event) };
    },
  };
  return { plugin, requests, emit: (event: string, payload: unknown) => listeners.get(event)?.(payload) };
}

function recordingLocal() {
  const calls: Array<[string, unknown[]]> = [];
  const local = new Proxy({} as WebviewFunctions, {
    get: (_t, name) => (...args: unknown[]) => calls.push([String(name), args]),
  });
  return { local, calls };
}

describe('createOrcaHost', () => {
  it('gọi worker qua sgit.call với timeout dài, trả value', async () => {
    const { plugin, requests } = fakePlugin(() => ({ ok: true, value: ['r1'] }) satisfies CallOutput);
    const host = createOrcaHost(plugin, recordingLocal().local);
    expect(await host.listRepos()).toEqual(['r1']);
    expect(requests[0]).toMatchObject({
      name: ORCA_REQUEST.call,
      input: { method: 'listRepos', args: [] },
      timeoutMs: 120_000,
    });
  });

  it('input JSON thuần: bỏ undefined ở cuối, field undefined bị loại, undefined giữa → null', async () => {
    const { plugin, requests } = fakePlugin(() => ({ ok: true, value: null }) satisfies CallOutput);
    const host = createOrcaHost(plugin, recordingLocal().local);
    await host.getLog('/r', { skip: 0, ref: undefined, path: undefined });
    await host.getStatus('/r', undefined);
    await host.checkout('/r', undefined as unknown as string, { force: true });
    expect(requests.map((r) => r.input)).toEqual([
      { method: 'getLog', args: ['/r', { skip: 0 }] },
      { method: 'getStatus', args: ['/r'] },
      { method: 'checkout', args: ['/r', null, { force: true }] },
    ]);
  });

  it('lỗi worker → reject với object lỗi nguyên dạng', async () => {
    const error = { message: 'git failed', git: { command: 'x', code: 1, stderr: 'e' } };
    const { plugin } = fakePlugin(() => ({ ok: false, error }) satisfies CallOutput);
    const host = createOrcaHost(plugin, recordingLocal().local);
    await expect(host.fetch('/r')).rejects.toEqual(error);
  });

  it('kết quả chunked → lấy tuần tự từng mảnh rồi ghép', async () => {
    const json = JSON.stringify({ commits: ['a', 'b'], hasMore: false, headOid: 'h' });
    const parts = [json.slice(0, 10), json.slice(10)];
    const { plugin, requests } = fakePlugin((name, input) => {
      if (name === ORCA_REQUEST.call) {
        return { ok: true, chunked: { id: 'c1', count: 2 } } satisfies CallOutput;
      }
      return { data: parts[(input as { index: number }).index] };
    });
    const host = createOrcaHost(plugin, recordingLocal().local);
    expect(await host.getLog('/r')).toEqual(JSON.parse(json));
    expect(requests.slice(1).map((r) => r.input)).toEqual([
      { id: 'c1', index: 0 },
      { id: 'c1', index: 1 },
    ]);
  });

  it('tham số lớn → upload theo mảnh trước, call chỉ mang uploadId', async () => {
    const { plugin, requests } = fakePlugin((name) =>
      name === ORCA_REQUEST.call ? { ok: true, value: null } : { ok: true },
    );
    const host = createOrcaHost(plugin, recordingLocal().local);
    const content = 'x'.repeat(INLINE_ARGS_MAX_UNITS * 2);
    await host.saveWorkingFile('/r', 'a.txt', content);
    const uploads = requests.filter((r) => r.name === ORCA_REQUEST.upload);
    expect(uploads.length).toBeGreaterThan(1);
    const joined = uploads.map((r) => (r.input as { data: string }).data).join('');
    expect(JSON.parse(joined)).toEqual(['/r', 'a.txt', content]);
    const call = requests.at(-1)!;
    expect(call.name).toBe(ORCA_REQUEST.call);
    expect(call.input).toEqual({
      method: 'saveWorkingFile',
      uploadId: (uploads[0].input as { id: string }).id,
    });
  });

  it('openPanel / openFileLog xử lý tại chỗ, không gọi worker', async () => {
    const { plugin, requests } = fakePlugin(() => {
      throw new Error('không được gọi worker');
    });
    const { local, calls } = recordingLocal();
    const host = createOrcaHost(plugin, local);
    await host.openPanel('/r', 'history', undefined, 'main');
    await host.openFileLog('/r', 'src/a.ts');
    expect(requests).toEqual([]);
    expect(calls).toEqual([
      ['navigate', ['/r', 'history', null, 'main', null]],
      ['showFileLog', ['/r', 'src/a.ts']],
    ]);
  });

  it('thông báo từ worker → đúng hàm WebviewFunctions; tên lạ bị bỏ qua', () => {
    const { plugin, emit } = fakePlugin(() => ({ ok: true, value: null }));
    const { local, calls } = recordingLocal();
    createOrcaHost(plugin, local);
    emit(ORCA_NOTIFY_EVENT, { name: 'repoChanged', args: ['/r', { changed: ['status'] }] });
    emit(ORCA_NOTIFY_EVENT, null);
    expect(calls).toEqual([['repoChanged', ['/r', { changed: ['status'] }]]]);
  });

  it('proxy không phải thenable (await host không treo)', async () => {
    const { plugin } = fakePlugin(() => ({ ok: true, value: null }));
    const host = createOrcaHost(plugin, recordingLocal().local);
    expect((host as unknown as { then?: unknown }).then).toBeUndefined();
  });
});
