// So sánh video 2 bên (Old ↔ New) — <video> đọc trực tiếp qua webview URI
// (nội dung không đi qua RPC). Container Chromium của VSCode không phát được
// (mp4/mov H.264 — bản Electron này không kèm codec bản quyền) thì thẻ video
// bắn error → hiện nút mở bằng player của hệ điều hành.

import { useState } from 'react';
import type { MediaDiffInfo } from '../../../shared/types';
import { host } from '../../rpc';
import { formatBytes } from '../../utils/fileKinds';

export function VideoDiffView({ media }: { media: MediaDiffInfo }) {
  return (
    <div className="sg-image-diff">
      <VideoSide
        label="Old"
        uri={media.originalUri}
        size={media.originalSize}
        fsPath={media.originalFsPath}
      />
      <VideoSide
        label="New"
        uri={media.modifiedUri}
        size={media.modifiedSize}
        fsPath={media.modifiedFsPath}
      />
    </div>
  );
}

function VideoSide({
  label,
  uri,
  size,
  fsPath,
}: {
  label: string;
  uri: string | null;
  size: number | null;
  fsPath: string | null;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="sg-image-side">
      <div className="sg-image-caption">
        <b>{label}</b>
        {size !== null && <span className="sg-detail-meta"> {formatBytes(size)}</span>}
      </div>
      <div className="sg-image-frame">
        {uri === null && fsPath === null ? (
          <span className="sg-empty small">(no video)</span>
        ) : uri === null || failed ? (
          <div className="sg-media-fallback">
            <p>
              {uri === null
                ? 'Panel này không phát video trực tiếp được.'
                : 'Codec không phát được trong VSCode (thường là H.264/HEVC).'}
            </p>
            {fsPath !== null && (
              <button className="sg-tool primary" onClick={() => void host.openPathExternal(fsPath)}>
                Open with system player
              </button>
            )}
          </div>
        ) : (
          // preload metadata: hiện frame đầu + duration, không tải cả file.
          <video src={uri} controls preload="metadata" onError={() => setFailed(true)} />
        )}
      </div>
    </div>
  );
}
