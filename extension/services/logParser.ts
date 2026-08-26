// Parser cho `git log --pretty=format:LOG_FORMAT`. Hàm thuần — test trực tiếp bằng Vitest.
//
// FORMAT dùng 2 ký tự điều khiển ASCII làm separator (không thể xuất hiện trong
// nội dung commit): \x1f (unit separator) giữa các field, \x1e (record separator)
// cuối mỗi commit. An toàn với message chứa xuống dòng, tab, unicode.

import type { CommitInfo } from '../../shared/types';

const FIELD_SEP = '\x1f';
const RECORD_SEP = '\x1e';

/**
 * Thứ tự field phải khớp parseLog:
 * %H=oid  %P=parents  %an=author  %ae=email  %aI=date ISO  %D=refs  %s=subject
 */
export const LOG_FORMAT = ['%H', '%P', '%an', '%ae', '%aI', '%D', '%s'].join(FIELD_SEP) + RECORD_SEP;

const FIELD_COUNT = 7;

export function parseLog(stdout: string): CommitInfo[] {
  const commits: CommitInfo[] = [];
  for (const record of stdout.split(RECORD_SEP)) {
    // Giữa các record git chèn "\n" (do format kết thúc bằng %x1e) — bỏ qua phần trắng.
    if (record.trim() === '') {
      continue;
    }
    const fields = record.replace(/^\n/, '').split(FIELD_SEP);
    if (fields.length !== FIELD_COUNT) {
      // Record hỏng: bỏ qua thay vì làm sập cả trang log; lỗi hệ thống sẽ lộ qua test/telemetry.
      continue;
    }
    const [oid, parents, author, email, date, refs, subject] = fields;
    commits.push({
      oid,
      parents: parents === '' ? [] : parents.split(' '),
      author,
      email,
      date,
      refs: parseRefs(refs),
      subject,
    });
  }
  return commits;
}

/**
 * %D trả chuỗi decorations: `HEAD -> main, origin/main, tag: v1.0`.
 * Giữ nguyên văn từng phần tử (webview render badge từ chuỗi thô —
 * "HEAD -> " và "tag: " là thông tin trình bày, không tách ở tầng data).
 */
function parseRefs(raw: string): string[] {
  if (raw === '') {
    return [];
  }
  return raw.split(', ').filter((part) => part !== '');
}
