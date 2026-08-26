// Tiện ích async dùng chung. KHÔNG import 'vscode'.

import { toDisposable, type IDisposable } from './disposable';

/**
 * Debounce trả về hàm kèm disposable — dùng cho watcher .git/
 * (nhiều sự kiện file liên tiếp của 1 lệnh git chỉ nên kích 1 lần refresh).
 */
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number,
): { call: (...args: TArgs) => void } & IDisposable {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    call(...args: TArgs) {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = undefined;
        fn(...args);
      }, delayMs);
    },
    ...toDisposable(() => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    }),
  };
}

/**
 * Mutex theo key — serialize các lệnh git GHI trên cùng 1 repo
 * (2 lệnh ghi song song trên 1 repo sẽ giẫm lock của nhau).
 */
export class KeyedMutex {
  private tails = new Map<string, Promise<unknown>>();

  /** Chạy `task` sau khi mọi task cùng key trước đó xong (kể cả khi chúng lỗi). */
  runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    // Giữ tail không-reject để lỗi của task này không làm kẹt task sau.
    this.tails.set(key, run.catch(() => {}));
    return run;
  }

  /** Promise chờ mọi task đang giữ key xong — cho tác vụ đọc muốn thấy kết quả mới nhất. */
  pending(key: string): Promise<unknown> {
    return this.tails.get(key) ?? Promise.resolve();
  }
}
