import { describe, expect, it } from 'vitest';
import { DisposableStore, toDisposable } from './disposable';

// DisposableStore là base class — mở protected `register` ra để test trực tiếp.
class TestStore extends DisposableStore {
  add<T extends { dispose(): void }>(d: T): T {
    return this.register(d);
  }
}

describe('DisposableStore', () => {
  it('dispose giải phóng theo thứ tự ngược lại lúc đăng ký', () => {
    const order: string[] = [];
    const store = new TestStore();
    store.add(toDisposable(() => order.push('first')));
    store.add(toDisposable(() => order.push('second')));

    store.dispose();

    expect(order).toEqual(['second', 'first']);
  });

  it('dispose nhiều lần chỉ giải phóng một lần', () => {
    let count = 0;
    const store = new TestStore();
    store.add(toDisposable(() => count++));

    store.dispose();
    store.dispose();

    expect(count).toBe(1);
  });

  it('đăng ký sau khi đã dispose thì giải phóng ngay (chống rò rỉ vòng đời)', () => {
    const store = new TestStore();
    store.dispose();

    let disposed = false;
    store.add(toDisposable(() => (disposed = true)));

    expect(disposed).toBe(true);
  });
});

describe('toDisposable', () => {
  it('gọi dispose lặp lại không chạy callback lần hai', () => {
    let count = 0;
    const d = toDisposable(() => count++);
    d.dispose();
    d.dispose();
    expect(count).toBe(1);
  });
});
