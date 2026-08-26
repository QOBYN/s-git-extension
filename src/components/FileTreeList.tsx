// Chế độ Tree cho danh sách changed files: render folder row (chevron + 📁,
// click = đóng/mở) và uỷ quyền render file row cho caller (mỗi màn có row
// riêng: Working Tree có nút stage, commit detail thì không).
// Kèm nút toggle List ↔ Tree (icon) đặt ở header các panel.

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useViewPrefs } from '../store/viewPrefsStore';
import { buildFileTreeRows } from '../utils/fileTree';

/** Thụt lề mỗi cấp — khớp LANE bên sidebar cho cảm giác đồng nhất. */
export const TREE_INDENT_PX = 14;
/** padding-left gốc của .sg-file-row trong CSS — cộng thêm khi thụt lề. */
const ROW_BASE_PADDING_PX = 12;

/** paddingLeft inline cho row ở depth cho trước (folder lẫn file dùng chung). */
export const treeRowPadding = (depth: number): number =>
  ROW_BASE_PADDING_PX + depth * TREE_INDENT_PX;

interface Props<T> {
  items: readonly T[];
  getPath(item: T): string;
  /** Render 1 file row; caller tự set key + paddingLeft theo depth. */
  renderFile(item: T, depth: number): ReactNode;
}

export function FileTreeList<T>({ items, getPath, renderFile }: Props<T>) {
  // Tập folder đang ĐÓNG (mặc định mở hết — danh sách change thường ngắn).
  // State cục bộ: đổi file/refresh giữ nguyên, đóng panel thì reset — đủ dùng.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const rows = useMemo(
    () => buildFileTreeRows(items, getPath, collapsed),
    [items, getPath, collapsed],
  );

  const toggleFolder = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <>
      {rows.map((row) =>
        row.kind === 'folder' ? (
          <div
            key={`dir:${row.path}`}
            className="sg-file-row folder"
            style={{ paddingLeft: treeRowPadding(row.depth) }}
            onClick={() => toggleFolder(row.path)}
            title={row.path}
          >
            <span className={`sg-tree-chevron${row.collapsed ? '' : ' open'}`} />
            <span className="sg-tree-icon">{row.collapsed ? '📁' : '📂'}</span>
            <span className="sg-file-name">{row.name}</span>
            {row.collapsed && <span className="sg-file-dir">{row.fileCount}</span>}
          </div>
        ) : (
          <Fragment key={`file:${getPath(row.item)}`}>{renderFile(row.item, row.depth)}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * Nút icon đổi chế độ List ↔ Tree — pref dùng chung (viewPrefsStore) nên bấm
 * ở đâu cũng đổi cả Working Tree lẫn commit detail.
 */
export function FileListModeToggle() {
  const mode = useViewPrefs((s) => s.fileListMode);
  const toggle = useViewPrefs((s) => s.toggleFileListMode);

  return (
    <button
      className="sg-tool icon"
      title={mode === 'list' ? 'View as tree (explorer)' : 'View as flat list'}
      onClick={toggle}
    >
      {mode === 'list' ? <ListTreeIcon /> : <ListFlatIcon />}
    </button>
  );
}

// Icon vẽ inline (theo currentColor) — CSP chặn tài nguyên ngoài nên không
// dùng ảnh; codicon font chỉ inline cho Monaco, không expose class ra app.

/** 3 gạch ngang = danh sách phẳng. */
function ListFlatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M2 3.5h12V5H2zM2 7.25h12v1.5H2zM2 11h12v1.5H2z" />
    </svg>
  );
}

/** Gạch gốc + nhánh thụt lề = cây thư mục. */
function ListTreeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M2 3.5h12V5H2z" />
      <path d="M3.5 5v6h1.5V5z" />
      <path d="M5 7.25h9v1.5H5zM5 11h9v1.5H5z" />
    </svg>
  );
}
