// Format lỗi từ host cho banner sg-error. Lỗi git qua RPC đến dưới dạng object
// thuần { message, git? } (extension/rpc/bindHost.toWireError) — String() trên
// object đó ra "[object Object]" nên phải đọc message tường minh.

import type { GitErrorInfo } from '../../shared/types';

interface WireError {
  message: string;
  /** Có mặt khi lỗi gốc là GitError — stderr nguyên văn nằm trong message rồi. */
  git?: GitErrorInfo;
}

function isWireError(error: unknown): error is WireError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

/** Chuỗi hiển thị được cho mọi giá trị bị throw/reject từ host hoặc local. */
export function formatError(error: unknown): string {
  if (isWireError(error)) {
    return error.message;
  }
  return String(error);
}

/**
 * Các câu git TỪ CHỐI chạy vì working tree có thay đổi chưa commit — lệnh chưa
 * bắt đầu, repo còn nguyên. SpawnGitRunner đặt LC_ALL=C nên message ổn định.
 * (pull --rebase / rebase / merge / checkout đều có biến thể riêng.)
 */
const DIRTY_TREE_PATTERNS = [
  'You have unstaged changes', // pull --rebase, rebase
  'Please commit or stash them', // pull --rebase
  'Please commit your changes or stash them', // merge / checkout (…before you merge/switch)
  'would be overwritten by', // "Your local changes … would be overwritten by merge/checkout"
  'Your index contains uncommitted changes', // rebase khi có thay đổi đã stage
];

/**
 * Lỗi thuộc nhóm "git từ chối vì working tree bẩn"? → UI mở popup Dirty Guard
 * (stash & retry / đi commit) thay vì chỉ banner lỗi thô.
 */
export function isDirtyWorkingTreeError(message: string): boolean {
  return DIRTY_TREE_PATTERNS.some((pattern) => message.includes(pattern));
}
