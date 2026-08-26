// Event emitter tối giản để services/ phát sự kiện mà không phụ thuộc
// vscode.EventEmitter (luật phụ thuộc — architecture.md mục 1).

import { toDisposable, type IDisposable } from './disposable';

export type Listener<T> = (event: T) => void;

/** Hàm subscribe: gọi với listener, nhận về disposable để huỷ đăng ký. */
export type Event<T> = (listener: Listener<T>) => IDisposable;

export class Emitter<T> implements IDisposable {
  private listeners = new Set<Listener<T>>();
  private isDisposed = false;

  /** Expose cho bên ngoài subscribe — quy ước đặt tên `onDidXxx = emitter.event`. */
  readonly event: Event<T> = (listener) => {
    if (this.isDisposed) {
      return toDisposable(() => {});
    }
    this.listeners.add(listener);
    return toDisposable(() => this.listeners.delete(listener));
  };

  fire(event: T): void {
    // Snapshot trước khi gọi: listener có thể tự huỷ đăng ký ngay trong callback.
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  dispose(): void {
    this.isDisposed = true;
    this.listeners.clear();
  }
}
