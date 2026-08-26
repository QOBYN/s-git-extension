// Cache trang log đầu tiên per-repo — yêu cầu "có bộ nhớ cache index riêng, để
// không bị lag" của note.md. Chiến lược (architecture.md mục 4): mở panel đọc cache
// hiện NGAY nếu còn hợp lệ; hợp lệ = headOid VÀ refsSignature đều không đổi
// (tạo nhánh/tag mới đổi graph dù HEAD đứng yên).
//
// P0 lưu JSON qua KeyValueStorage (bọc globalStorage). Nâng cấp SQLite chỉ khi
// có số đo cho thấy JSON không đủ — không tối ưu trước.

import type { CommitInfo } from '../../shared/types';
import type { KeyValueStorage } from './interfaces';

export interface CachedLog {
  /** Version cấu trúc cache — đổi cấu trúc thì tăng số để invalidate cache cũ. */
  schemaVersion: number;
  headOid: string | null;
  /** sha1 của toàn bộ for-each-ref (GitService.getRefsSignature). */
  refsSignature: string;
  hasMore: boolean;
  commits: CommitInfo[];
}

export type CachedLogInput = Omit<CachedLog, 'schemaVersion'>;

const SCHEMA_VERSION = 2;
const KEY_PREFIX = 'logcache';

export class CacheIndex {
  constructor(private readonly storage: KeyValueStorage) {}

  /** null khi chưa có cache, cache hỏng, hoặc schema cũ — caller cứ thế quét mới. */
  async load(repoRoot: string): Promise<CachedLog | null> {
    const raw = await this.storage.read(cacheKey(repoRoot));
    if (raw === null) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as CachedLog;
      if (parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.commits)) {
        return null;
      }
      return parsed;
    } catch {
      // Cache hỏng (ghi dở, disk lỗi…) — coi như không có, không ném lỗi ra UI.
      return null;
    }
  }

  async save(repoRoot: string, data: CachedLogInput): Promise<void> {
    const full: CachedLog = { schemaVersion: SCHEMA_VERSION, ...data };
    await this.storage.write(cacheKey(repoRoot), JSON.stringify(full));
  }

  async invalidate(repoRoot: string): Promise<void> {
    await this.storage.delete(cacheKey(repoRoot));
  }
}

/**
 * Key an toàn từ đường dẫn repo: encodeURIComponent để path có ký tự lạ
 * không phá cấu trúc key của storage.
 */
function cacheKey(repoRoot: string): string {
  return `${KEY_PREFIX}:${encodeURIComponent(repoRoot)}`;
}
