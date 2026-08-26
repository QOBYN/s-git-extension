// Hạ tầng quản lý vòng đời. KHÔNG import 'vscode' — interface IDisposable ở đây
// tương thích cấu trúc với vscode.Disposable nên dùng lẫn được ở tầng adapter/view.

export interface IDisposable {
  dispose(): void;
}

/**
 * Base class cho mọi service/view có tài nguyên cần giải phóng.
 * - `register()` nhận disposable con và trả lại chính nó (tiện gán biến).
 * - `dispose()` giải phóng theo thứ tự NGƯỢC lại lúc đăng ký (con trước, cha sau)
 *   và an toàn khi gọi nhiều lần.
 */
export class DisposableStore implements IDisposable {
  private disposables: IDisposable[] = [];
  private isDisposed = false;

  protected register<T extends IDisposable>(disposable: T): T {
    if (this.isDisposed) {
      // Đăng ký sau khi store đã dispose là bug vòng đời — giải phóng ngay
      // thay vì giữ tham chiếu rò rỉ.
      disposable.dispose();
      return disposable;
    }
    this.disposables.push(disposable);
    return disposable;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  protected get disposed(): boolean {
    return this.isDisposed;
  }
}

/** Gói 1 callback thành IDisposable. */
export function toDisposable(fn: () => void): IDisposable {
  let done = false;
  return {
    dispose() {
      if (!done) {
        done = true;
        fn();
      }
    },
  };
}
