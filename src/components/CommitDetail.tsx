// Panel chi tiết commit bên phải (ui-analysis B5 + B6): initials + hash + tác giả
// + message đầy đủ + danh sách file thay đổi (click file → diff dưới đáy).
// Danh sách file nhận focus bàn phím: ↑/↓ duyệt file, ← trả focus về list commit
// (HistoryScreen nối 2 pane bằng filesRef/onFocusCommits).

import { useRef } from 'react';
import type { CommitFileChange, CommitInfo } from '../../shared/types';
import { useViewPrefs } from '../store/viewPrefsStore';
import { AuthorBadge } from './AuthorBadge';
import { FileListModeToggle, FileTreeList, treeRowPadding } from './FileTreeList';

interface Props {
  commit: CommitInfo;
  /** Cột bên phải: bề rộng. Bố cục mini (nằm dưới danh sách): truyền `height` thay thế. */
  width: number;
  height?: number;
  body: string | null;
  files: CommitFileChange[];
  selectedFile: CommitFileChange | null;
  onSelectFile(file: CommitFileChange): void;
  /** Chuột phải trên file (ui-analysis G) — parent quản lý menu state. */
  onFileContextMenu?(event: React.MouseEvent, file: CommitFileChange): void;
  /** Ref của container danh sách file — parent focus() để chuyển điều khiển phím sang đây. */
  filesRef?: React.RefObject<HTMLDivElement>;
  /** ← trong danh sách file: parent trả focus về list commit. */
  onFocusCommits?(): void;
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
  height,
  body,
  files,
  selectedFile,
  onSelectFile,
  onFileContextMenu,
  filesRef,
  onFocusCommits,
}: Props) {
  const fileListMode = useViewPrefs((s) => s.fileListMode);
  const localRef = useRef<HTMLDivElement>(null);
  const listRef = filesRef ?? localRef;

  /**
   * ↑/↓/Home/End duyệt file theo THỨ TỰ ĐANG HIỂN THỊ (đọc DOM qua data-path —
   * đúng cả chế độ Tree: folder đóng thì file bên trong không nằm trong vòng duyệt).
   * ← trả focus về list commit để chọn commit khác.
   */
  const onFilesKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onFocusCommits?.();
      return;
    }
    const paths = visibleFilePaths(listRef.current);
    if (paths.length === 0) {
      return;
    }
    const current = selectedFile === null ? -1 : paths.indexOf(selectedFile.path);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = Math.min(current + 1, paths.length - 1);
        break;
      case 'ArrowUp':
        next = current === -1 ? 0 : Math.max(current - 1, 0);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = paths.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const file = files.find((f) => f.path === paths[next]);
    if (file !== undefined && file !== selectedFile) {
      onSelectFile(file);
    }
  };

  return (
    <aside className="sg-detail" style={height !== undefined ? { height } : { width }}>
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

      <div className="sg-detail-files-header">
        <span>Changed files</span>
        <span className="sg-diff-spacer" />
        <FileListModeToggle />
      </div>
      {/* tabIndex: nhận focus khi click hoặc khi bấm → từ list commit. */}
      <div className="sg-detail-files" ref={listRef} tabIndex={0} onKeyDown={onFilesKeyDown}>
        {fileListMode === 'tree' ? (
          <FileTreeList
            items={files}
            getPath={(f) => f.path}
            renderFile={(file, depth) => (
              <CommitFileRow
                key={file.path}
                file={file}
                depth={depth}
                selected={file === selectedFile}
                onSelectFile={onSelectFile}
                onFileContextMenu={onFileContextMenu}
              />
            )}
          />
        ) : (
          files.map((file) => (
            <CommitFileRow
              key={file.path}
              file={file}
              selected={file === selectedFile}
              onSelectFile={onSelectFile}
              onFileContextMenu={onFileContextMenu}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function CommitFileRow({
  file,
  depth,
  selected,
  onSelectFile,
  onFileContextMenu,
}: {
  file: CommitFileChange;
  /** Có giá trị = chế độ Tree: thụt lề theo cấp, ẩn cột thư mục. */
  depth?: number;
  selected: boolean;
  onSelectFile(file: CommitFileChange): void;
  onFileContextMenu?(event: React.MouseEvent, file: CommitFileChange): void;
}) {
  return (
    <div
      className={`sg-file-row${selected ? ' selected' : ''}`}
      data-path={file.path}
      // Hàng đang chọn luôn được cuộn vào viewport (duyệt bằng ↑/↓).
      ref={selected ? scrollRowIntoView : undefined}
      style={depth !== undefined ? { paddingLeft: treeRowPadding(depth) } : undefined}
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
      {depth === undefined && <span className="sg-file-dir">{dirName(file.path)}</span>}
    </div>
  );
}

/** Thứ tự file ĐANG HIỂN THỊ (List phẳng hoặc Tree đã mở/đóng) — đọc từ DOM. */
function visibleFilePaths(container: HTMLDivElement | null): string[] {
  if (container === null) {
    return [];
  }
  return Array.from(container.querySelectorAll<HTMLElement>('[data-path]')).map(
    (el) => el.dataset.path!,
  );
}

/** Callback ref: 'nearest' = không cuộn nếu hàng đã trong viewport (idempotent). */
const scrollRowIntoView = (el: HTMLDivElement | null): void =>
  el?.scrollIntoView({ block: 'nearest' });

// Hiển thị "tên file sáng + thư mục mờ" (ui-analysis mục F).
const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const dirName = (path: string): string => {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
};
