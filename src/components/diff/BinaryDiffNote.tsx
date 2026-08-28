// File nhị phân không hiển thị được: hiện thông tin thay vì text vô nghĩa.
// 2 nguồn dữ liệu: payload media (host chỉ gửi kích thước — zip/pdf/file quá
// lớn) hoặc nội dung base64 (nhị phân phát hiện qua byte NUL, đuôi lạ).

import type { DiffPayload } from '../../../shared/types';
import { host } from '../../rpc';
import { contentByteSize, formatBytes } from '../../utils/fileKinds';

export function BinaryDiffNote({ diff }: { diff: DiffPayload }) {
  const media = diff.media ?? null;
  const oldSize = media !== null ? media.originalSize : sizeOf(diff.original, diff);
  const newSize = media !== null ? media.modifiedSize : sizeOf(diff.modified, diff);
  // Mở phía "mới" (file đang có trên đĩa) — chỉ có khi host đưa được đường dẫn.
  const openPath = media?.modifiedFsPath ?? media?.originalFsPath ?? null;

  return (
    <div className="sg-binary-note">
      <p>
        {media?.kind === 'tooLarge'
          ? 'File quá lớn để preview trong diff view.'
          : 'Binary file — cannot display text diff.'}
      </p>
      <p className="sg-detail-meta">
        {oldSize === null ? '(created)' : formatBytes(oldSize)}
        {' → '}
        {newSize === null ? '(deleted)' : formatBytes(newSize)}
      </p>
      {openPath !== null && (
        <button className="sg-tool" onClick={() => void host.openPathExternal(openPath)}>
          Open with default app
        </button>
      )}
    </div>
  );
}

/** Payload base64: chuỗi rỗng = phía không tồn tại (giữ ngữ nghĩa cũ). */
function sizeOf(content: string, diff: DiffPayload): number | null {
  return content === '' ? null : contentByteSize(content, diff.encoding);
}
