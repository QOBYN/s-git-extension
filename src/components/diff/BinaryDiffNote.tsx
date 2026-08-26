// File nhị phân không hiển thị được: hiện thông tin thay vì text vô nghĩa.

import type { DiffPayload } from '../../../shared/types';
import { contentByteSize, formatBytes } from '../../utils/fileKinds';

export function BinaryDiffNote({ diff }: { diff: DiffPayload }) {
  const oldSize = contentByteSize(diff.original, diff.encoding);
  const newSize = contentByteSize(diff.modified, diff.encoding);

  return (
    <div className="sg-binary-note">
      <p>Binary file — cannot display text diff.</p>
      <p className="sg-detail-meta">
        {diff.original === '' ? '(created)' : formatBytes(oldSize)}
        {' → '}
        {diff.modified === '' ? '(deleted)' : formatBytes(newSize)}
      </p>
    </div>
  );
}
