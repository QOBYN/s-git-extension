// So sánh ảnh 2 bên (Old ↔ New) — nền caro để thấy vùng trong suốt,
// kèm kích thước file; phía không có ảnh (added/deleted) hiện ô trống.

import { useState } from 'react';
import type { DiffPayload } from '../../../shared/types';
import { contentByteSize, formatBytes, imageDataUri } from '../../utils/fileKinds';

interface Props {
  path: string;
  diff: DiffPayload;
}

export function ImageDiffView({ path, diff }: Props) {
  const oldUri = imageDataUri(path, diff.original, diff.encoding);
  const newUri = imageDataUri(path, diff.modified, diff.encoding);

  return (
    <div className="sg-image-diff">
      <ImageSide label="Old" uri={oldUri} bytes={contentByteSize(diff.original, diff.encoding)} />
      <ImageSide label="New" uri={newUri} bytes={contentByteSize(diff.modified, diff.encoding)} />
    </div>
  );
}

function ImageSide({ label, uri, bytes }: { label: string; uri: string | null; bytes: number }) {
  // Kích thước pixel đọc từ chính ảnh sau khi load.
  const [dims, setDims] = useState<string | null>(null);

  return (
    <div className="sg-image-side">
      <div className="sg-image-caption">
        <b>{label}</b>
        {uri !== null && (
          <span className="sg-detail-meta">
            {dims !== null ? ` ${dims} · ` : ' '}
            {formatBytes(bytes)}
          </span>
        )}
      </div>
      <div className="sg-image-frame">
        {uri === null ? (
          <span className="sg-empty small">(no image)</span>
        ) : (
          <img
            src={uri}
            alt={label}
            onLoad={(e) =>
              setDims(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)
            }
          />
        )}
      </div>
    </div>
  );
}
