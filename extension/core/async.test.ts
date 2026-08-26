import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce, KeyedMutex } from './async';

describe('KeyedMutex', () => {
  it('serialize các task cùng key theo thứ tự gọi', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    const slow = mutex.runExclusive('repo-a', async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push('slow');
    });
    const fast = mutex.runExclusive('repo-a', async () => {
      order.push('fast');
    });

    await Promise.all([slow, fast]);

    expect(order).toEqual(['slow', 'fast']);
  });

  it('task lỗi không làm kẹt task sau cùng key', async () => {
    const mutex = new KeyedMutex();
    const failing = mutex.runExclusive('repo-a', async () => {
      throw new Error('boom');
    });
    await expect(failing).rejects.toThrow('boom');

    const result = await mutex.runExclusive('repo-a', async () => 'ok');
    expect(result).toBe('ok');
  });

  it('khác key chạy độc lập, không chờ nhau', async () => {
    const mutex = new KeyedMutex();
    let aStarted = false;
    // Task key A treo vô hạn — nếu key B bị serialize chung, test sẽ timeout.
    void mutex.runExclusive('repo-a', () => {
      aStarted = true;
      return new Promise(() => {});
    });

    const b = await mutex.runExclusive('repo-b', async () => 'independent');

    expect(aStarted).toBe(true);
    expect(b).toBe('independent');
  });

  it('pending() chờ được task exclusive đang dở', async () => {
    const mutex = new KeyedMutex();
    let done = false;
    const task = mutex.runExclusive('repo-a', async () => {
      await new Promise((r) => setTimeout(r, 10));
      done = true;
    });

    await mutex.pending('repo-a');
    expect(done).toBe(true);
    await task;
  });
});

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gọi dồn dập chỉ chạy 1 lần với args cuối cùng', () => {
    const calls: number[] = [];
    const d = debounce((n: number) => calls.push(n), 300);

    d.call(1);
    d.call(2);
    d.call(3);
    vi.advanceTimersByTime(300);

    expect(calls).toEqual([3]);
  });

  it('dispose huỷ lần chạy đang chờ', () => {
    const calls: number[] = [];
    const d = debounce((n: number) => calls.push(n), 300);

    d.call(1);
    d.dispose();
    vi.advanceTimersByTime(1000);

    expect(calls).toEqual([]);
  });
});
