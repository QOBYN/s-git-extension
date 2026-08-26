// Sổ đăng ký các kênh RPC đang mở (panel chính, sidebar, file log…) —
// nơi duy nhất broadcast notification host → mọi webview (architecture.md 2.4).

import type { BirpcReturn } from 'birpc';
import type { HostFunctions, WebviewFunctions } from '../../shared/protocol';
import type { RepoDelta } from '../../shared/types';
import { DisposableStore, toDisposable, type IDisposable } from '../core/disposable';

type Remote = BirpcReturn<WebviewFunctions, HostFunctions>;

export class RpcHub extends DisposableStore {
  private readonly remotes = new Set<Remote>();

  /** View đăng ký kênh của nó; dispose trả về sẽ gỡ khỏi hub khi view đóng. */
  add(remote: Remote): IDisposable {
    this.remotes.add(remote);
    return toDisposable(() => this.remotes.delete(remote));
  }

  broadcastRepoChanged(repoRoot: string, delta: RepoDelta): void {
    for (const remote of this.remotes) {
      // Notification fire-and-forget: webview vừa đóng có thể reject — nuốt lỗi,
      // hub sẽ được dọn qua disposable của view.
      void Promise.resolve(remote.repoChanged(repoRoot, delta)).catch(() => {});
    }
  }

  broadcastProgress(message: string): void {
    for (const remote of this.remotes) {
      void Promise.resolve(remote.operationProgress(message)).catch(() => {});
    }
  }

  override dispose(): void {
    this.remotes.clear();
    super.dispose();
  }
}
