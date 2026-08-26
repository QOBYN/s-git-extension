// Panel diff dưới đáy — header + toolbar theo đúng SmartGit (ui-analysis B7/D3):
// "Changes of <file> (<Kind>)" · chỉ số +a −r · vị trí hunk i/N ·
// Unified | Side by Side · Compact · Word-Wrap · Ignore WS · ↑↓.

import { useRef, useState } from 'react';
import { useEffect } from 'react';
import type { DiffPayload } from '../../shared/types';
import { useDiffPrefs } from '../store/diffPrefsStore';
import type { LineChange } from '../utils/patchBuilder';
import { DiffView, type DiffStats, type DiffViewHandle } from './DiffView';

interface Props {
  path: string;
  height: number;
  /** Nhãn trạng thái file hiển thị cạnh tên: "Modified", "Staged", "Renamed"… */
  kindLabel: string;
  diff: DiffPayload | null;
  loading: boolean;
  /** Truyền vào để hiện nút "Stage Hunk" (diff unstaged của Working Tree). */
  onStageHunk?(change: LineChange): void;
  /** Truyền vào để hiện nút "Unstage Hunk" (diff staged). */
  onUnstageHunk?(change: LineChange): void;
  /** Truyền vào để hiện nút "Revert Hunk" (bỏ hunk khỏi working tree — 2 bước xác nhận). */
  onRevertHunk?(change: LineChange): void;
  /** Cho sửa trực tiếp pane phải + nút Save/⌘S (File Compare — D3). */
  editable?: boolean;
  onSaveContent?(content: string): void;
}

export function DiffPanel({
  path,
  height,
  kindLabel,
  diff,
  loading,
  onStageHunk,
  onUnstageHunk,
  onRevertHunk,
  editable,
  onSaveContent,
}: Props) {
  // Tuỳ chọn hiển thị dùng chung + nhớ qua localStorage (diffPrefsStore).
  const options = useDiffPrefs();
  const [stats, setStats] = useState<DiffStats | null>(null);
  const [cursor, setCursor] = useState<{ index: number; total: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  /** Revert phá huỷ thay đổi — bước 1 bấm chuyển nút thành "Confirm?", 3s tự hoàn. */
  const [confirmRevert, setConfirmRevert] = useState(false);
  const viewRef = useRef<DiffViewHandle>(null);

  useEffect(() => {
    if (!confirmRevert) {
      return;
    }
    const timer = setTimeout(() => setConfirmRevert(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmRevert]);

  const save = () => {
    const content = viewRef.current?.getModifiedContent();
    if (content !== null && content !== undefined && onSaveContent) {
      onSaveContent(content);
      viewRef.current?.markSaved();
    }
  };

  const revertHunk = () => {
    if (!confirmRevert) {
      setConfirmRevert(true);
      return;
    }
    setConfirmRevert(false);
    if (onRevertHunk) {
      applyHunk(onRevertHunk);
    }
  };

  const jump = (direction: 'next' | 'previous') =>
    setCursor(viewRef.current?.gotoDiff(direction) ?? null);

  const applyHunk = (handler: (change: LineChange) => void) => {
    const change = viewRef.current?.getCurrentChange();
    if (change) {
      handler(change);
      setCursor(null); // nội dung diff sắp đổi — vị trí hunk cũ hết ý nghĩa
    }
  };

  return (
    <section className="sg-diff-panel" style={{ height }}>
      <div className="sg-diff-toolbar">
        <span className="sg-diff-file" title={path}>
          Changes of {fileName(path)} <span className="sg-diff-kind">({kindLabel})</span>
        </span>
        {stats !== null && (
          <span className="sg-diff-stats">
            {stats.addedLines > 0 && <span className="stat-added">+{stats.addedLines}</span>}
            {stats.removedLines > 0 && <span className="stat-removed">−{stats.removedLines}</span>}
            <span>
              {cursor ? `${cursor.index}/${stats.changeCount}` : `${stats.changeCount} changes`}
            </span>
          </span>
        )}
        <span className="sg-diff-spacer" />
        <button
          className={`sg-tool${!options.sideBySide ? ' active' : ''}`}
          onClick={() => options.setOption('sideBySide', false)}
        >
          Unified
        </button>
        <button
          className={`sg-tool${options.sideBySide ? ' active' : ''}`}
          onClick={() => options.setOption('sideBySide', true)}
        >
          Side by Side
        </button>
        <span className="sg-tool-sep" />
        <button
          className={`sg-tool${options.compact ? ' active' : ''}`}
          title="Gập các vùng không thay đổi (giữ 3 dòng ngữ cảnh)"
          onClick={() => options.toggle('compact')}
        >
          Compact
        </button>
        <button
          className={`sg-tool${options.wordWrap ? ' active' : ''}`}
          onClick={() => options.toggle('wordWrap')}
        >
          Word-Wrap
        </button>
        <span className="sg-tool-sep" />
        <button
          className={`sg-tool${options.ignoreWhitespace ? ' active' : ''}`}
          onClick={() => options.toggle('ignoreWhitespace')}
        >
          Ignore WS
        </button>
        <button className="sg-tool" title="Previous change" onClick={() => jump('previous')}>
          ↑
        </button>
        <button className="sg-tool" title="Next change" onClick={() => jump('next')}>
          ↓
        </button>
        {onStageHunk && stats !== null && stats.changeCount > 0 && (
          <>
            <span className="sg-tool-sep" />
            <button
              className="sg-tool primary"
              title="Stage hunk hiện tại (chọn hunk bằng ↑↓)"
              onClick={() => applyHunk(onStageHunk)}
            >
              Stage Hunk
            </button>
          </>
        )}
        {onUnstageHunk && stats !== null && stats.changeCount > 0 && (
          <>
            <span className="sg-tool-sep" />
            <button
              className="sg-tool primary"
              title="Unstage hunk hiện tại (chọn hunk bằng ↑↓)"
              onClick={() => applyHunk(onUnstageHunk)}
            >
              Unstage Hunk
            </button>
          </>
        )}
        {onRevertHunk && stats !== null && stats.changeCount > 0 && (
          <button
            className={`sg-tool danger${confirmRevert ? ' confirming' : ''}`}
            title="Bỏ hunk hiện tại khỏi working tree (mất thay đổi đó!) — bấm lần nữa để xác nhận"
            onClick={revertHunk}
          >
            {confirmRevert ? 'Confirm revert?' : 'Revert Hunk'}
          </button>
        )}
        {editable && (
          <>
            <span className="sg-tool-sep" />
            <button
              className={`sg-tool${dirty ? ' primary' : ''}`}
              disabled={!dirty}
              title="Ghi nội dung pane phải xuống file (⌘S trong editor)"
              onClick={save}
            >
              {dirty ? '● Save' : 'Saved'}
            </button>
          </>
        )}
      </div>

      {loading && <div className="sg-diff-loading">Loading diff…</div>}
      {diff && (
        <DiffView
          ref={viewRef}
          original={diff.original}
          modified={diff.modified}
          path={path}
          onDiffUpdate={(s) => {
            setStats(s);
            setCursor(null); // đổi nội dung → vị trí hunk cũ hết ý nghĩa
          }}
          sideBySide={options.sideBySide}
          compact={options.compact}
          wordWrap={options.wordWrap}
          ignoreWhitespace={options.ignoreWhitespace}
          editable={editable}
          onDirtyChange={setDirty}
          onSave={save}
        />
      )}
    </section>
  );
}

const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
