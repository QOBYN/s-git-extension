import { describe, expect, it } from 'vitest';
import type { HostFunctions } from '../../shared/protocol';
import { DOWNLOAD_CHUNK_UNITS, splitChunks } from '../../shared/orcaWire';
import { GitError } from '../../extension/services/gitRunner';
import { createRpcServer } from './rpcServer';

function fakeFunctions(impl: Record<string, (...args: unknown[]) => unknown>): HostFunctions {
  return impl as unknown as HostFunctions;
}

describe('createRpcServer.call', () => {
  it('trả kết quả nhỏ trực tiếp; void → null', async () => {
    const server = createRpcServer(
      fakeFunctions({
        getCommitBody: async (root: unknown, oid: unknown) => `${root}@${oid}`,
        stage: async () => undefined,
      }),
    );
    expect(await server.call({ method: 'getCommitBody', args: ['/r', 'abc'] })).toEqual({
      ok: true,
      value: '/r@abc',
    });
    expect(await server.call({ method: 'stage', args: ['/r', ['a']] })).toEqual({
      ok: true,
      value: null,
    });
  });

  it('lỗi → object thuần (GitError giữ stderr), không ném', async () => {
    const server = createRpcServer(
      fakeFunctions({
        checkout: async () => {
          throw new GitError('checkout x', 1, 'error: pathspec');
        },
        commit: async () => {
          throw new Error('boom');
        },
      }),
    );
    const git = await server.call({ method: 'checkout', args: [] });
    expect(git.ok).toBe(false);
    expect(git).toMatchObject({ error: { git: { stderr: 'error: pathspec', code: 1 } } });
    expect(await server.call({ method: 'commit', args: [] })).toEqual({
      ok: false,
      error: { message: 'boom' },
    });
  });

  it('method lạ → lỗi rõ ràng', async () => {
    const server = createRpcServer(fakeFunctions({}));
    const out = await server.call({ method: 'nope', args: [] });
    expect(out).toEqual({ ok: false, error: { message: 'Unknown host method: nope' } });
  });

  it('kết quả lớn → chia mảnh, lấy tuần tự ghép lại đúng (kể cả tiếng Việt/emoji)', async () => {
    const big = { text: 'Xin chào 😀 '.repeat(120_000) };
    const server = createRpcServer(fakeFunctions({ getDiff: async () => big }));
    const out = await server.call({ method: 'getDiff', args: [] });
    if (!out.ok || !('chunked' in out)) {
      throw new Error('phải trả dạng chunked');
    }
    expect(out.chunked.count).toBeGreaterThan(1);
    let text = '';
    for (let index = 0; index < out.chunked.count; index++) {
      const part = server.chunk({ id: out.chunked.id, index }).data;
      expect(part.length).toBeLessThanOrEqual(DOWNLOAD_CHUNK_UNITS);
      text += part;
    }
    expect(JSON.parse(text)).toEqual(big);
    // Mảnh cuối đã lấy → bộ đệm giải phóng.
    expect(() => server.chunk({ id: out.chunked.id, index: 0 })).toThrow();
  });
});

describe('createRpcServer.upload', () => {
  it('ghép tham số upload theo mảnh (thứ tự bất kỳ) rồi gọi hàm', async () => {
    let received: unknown[] = [];
    const server = createRpcServer(
      fakeFunctions({
        saveWorkingFile: async (...args: unknown[]) => {
          received = args;
        },
      }),
    );
    const args = ['/r', 'a.txt', 'nội dung '.repeat(5000)];
    const parts = splitChunks(JSON.stringify(args), 1000);
    [...parts.keys()].reverse().forEach((index) =>
      server.upload({ id: 'u1', index, count: parts.length, data: parts[index] }),
    );
    expect(await server.call({ method: 'saveWorkingFile', uploadId: 'u1' })).toEqual({
      ok: true,
      value: null,
    });
    expect(received).toEqual(args);
  });

  it('thiếu mảnh → lỗi, không gọi hàm với tham số hỏng', async () => {
    let called = false;
    const server = createRpcServer(
      fakeFunctions({
        saveWorkingFile: async () => {
          called = true;
        },
      }),
    );
    server.upload({ id: 'u2', index: 0, count: 2, data: '["a",' });
    const out = await server.call({ method: 'saveWorkingFile', uploadId: 'u2' });
    expect(out.ok).toBe(false);
    expect(called).toBe(false);
  });

  it('input upload sai → ném', () => {
    const server = createRpcServer(fakeFunctions({}));
    expect(() => server.upload({ id: 'x', index: 2, count: 2, data: '' })).toThrow();
    expect(() => server.upload(null)).toThrow();
  });

  it('upload bỏ dở quá hạn bị dọn', async () => {
    let t = 0;
    const server = createRpcServer(
      fakeFunctions({ stage: async () => undefined }),
      { now: () => t },
    );
    server.upload({ id: 'old', index: 0, count: 2, data: '[' });
    t = 10 * 60_000;
    server.upload({ id: 'old', index: 1, count: 2, data: ']' }); // phiên cũ đã bị dọn → thiếu mảnh 0
    const out = await server.call({ method: 'stage', uploadId: 'old' });
    expect(out.ok).toBe(false);
  });
});

describe('JSON thuần (Orca từ chối giá trị không phải JSON)', () => {
  it('kết quả có field undefined / Date → trả bản đã qua JSON', async () => {
    const server = createRpcServer(
      fakeFunctions({
        getLog: async () => ({ commits: [{ oid: 'a', refs: undefined }], at: new Date(0) }),
      }),
    );
    const out = await server.call({ method: 'getLog', args: [] });
    expect(out).toEqual({ ok: true, value: { commits: [{ oid: 'a' }], at: '1970-01-01T00:00:00.000Z' } });
    expect(Object.keys((out as { value: { commits: object[] } }).value.commits[0])).toEqual(['oid']);
  });

  it('lỗi ném ra giá trị lạ vẫn thành JSON', async () => {
    const server = createRpcServer(
      fakeFunctions({
        fetch: async () => {
          throw { message: 'x', extra: undefined };
        },
      }),
    );
    expect(await server.call({ method: 'fetch', args: [] })).toEqual({
      ok: false,
      error: { message: 'x' },
    });
  });
});

describe('onSlow', () => {
  it('báo lệnh chạy lâu (kể cả khi lỗi), bỏ qua lệnh nhanh', async () => {
    let t = 0;
    const slow: Array<[string, number]> = [];
    const server = createRpcServer(
      fakeFunctions({
        fetch: async () => {
          t += 5_000;
        },
        push: async () => {
          t += 6_000;
          throw new Error('x');
        },
        stage: async () => {
          t += 10;
        },
      }),
      { now: () => t, onSlow: (method, ms) => slow.push([method, ms]) },
    );
    await server.call({ method: 'fetch', args: [] });
    await server.call({ method: 'push', args: [] });
    await server.call({ method: 'stage', args: [] });
    expect(slow).toEqual([
      ['fetch', 5_000],
      ['push', 6_000],
    ]);
  });
});
