// Panel chi tiết commit bên phải (ui-analysis B5 + B6): initials + hash + tác giả
// + message đầy đủ + danh sách file thay đổi (click file → diff dưới đáy).

import type { CommitFileChange, CommitInfo } from '../../shared/types';
import { AuthorBadge } from './AuthorBadge';

interface Props {
  commit: CommitInfo;
  width: number;
  body: string | null;
  files: CommitFileChange[];
  selectedFile: CommitFileChange | null;
  onSelectFile(file: CommitFileChange): void;
  /** Chuột phải trên file (ui-analysis G) — parent quản lý menu state. */
  onFileContextMenu?(event: React.MouseEvent, file: CommitFileChange): void;
}

/** Ký hiệu 1 chữ theo kiểu SmartGit/git: M/A/D/R/C/T. */
const KIND_LETTER: Record<CommitFileChange['kind'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  typechange: 'T',
};

export function CommitDetail({
  commit,
  width,
  body,
  files,
  selectedFile,
  onSelectFile,
  onFileContextMenu,
}: Props) {
  return (
    <aside className="sg-detail" style={{ width }}>
      <div className="sg-detail-header">
        <AuthorBadge name={commit.author} />
        <div>
          <div>
            Commit <span className="sg-detail-hash">{commit.oid.slice(0, 10)}</span>
          </div>
          <div className="sg-detail-meta">
            by {commit.author}, {new Date(commit.date).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="sg-detail-message">{body ?? commit.subject}</div>

      <div className="sg-detail-files-header">Changed files</div>
      <div className="sg-detail-files">
        {files.map((file) => (
          <div
            key={file.path}
            className={`sg-file-row${file === selectedFile ? ' selected' : ''}`}
            onClick={() => onSelectFile(file)}
            onContextMenu={(event) => {
              if (onFileContextMenu) {
                event.preventDefault();
                onFileContextMenu(event, file);
              }
            }}
            title={file.origPath ? `${file.origPath} → ${file.path}` : file.path}
          >
            <span className={`sg-file-kind kind-${file.kind}`}>{KIND_LETTER[file.kind]}</span>
            <span className="sg-file-name">{fileName(file.path)}</span>
            <span className="sg-file-dir">{dirName(file.path)}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

// Hiển thị "tên file sáng + thư mục mờ" (ui-analysis mục F).
const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const dirName = (path: string): string => {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
};
