// 1 dòng commit: [cột graph] [initials tác giả] [ref badges] [subject] [thời gian].
// Badge ref nằm TRONG dòng — điểm nhận diện SmartGit (ui-analysis B4).
// Cao cố định ROW_HEIGHT để ảo hoá danh sách.

import { memo } from 'react';
import type { CommitInfo } from '../../shared/types';
import type { GraphRowLayout } from '../engine/graphLayout';
import { formatRelativeDate } from '../utils/date';
import { AuthorBadge } from './AuthorBadge';
import { GraphCell, ROW_HEIGHT } from './graph/GraphCell';

interface Props {
  commit: CommitInfo;
  graphRow: GraphRowLayout;
  laneCount: number;
  selected: boolean;
  onSelect(oid: string): void;
  /** Chuột phải mở context menu (ui-analysis E) — parent quản lý menu state. */
  onContextMenu?(event: React.MouseEvent, commit: CommitInfo): void;
  /** Double-click mở popup Checkout (giống double-click nhánh ở sidebar). */
  onDoubleClick?(commit: CommitInfo): void;
}

export const CommitRow = memo(function CommitRow({
  commit,
  graphRow,
  laneCount,
  selected,
  onSelect,
  onContextMenu,
  onDoubleClick,
}: Props) {
  return (
    <div
      className={`sg-commit-row${selected ? ' selected' : ''}`}
      style={{ height: ROW_HEIGHT }}
      onClick={() => onSelect(commit.oid)}
      onDoubleClick={() => onDoubleClick?.(commit)}
      onContextMenu={(event) => {
        if (onContextMenu) {
          event.preventDefault();
          onSelect(commit.oid); // chuột phải cũng chọn commit — giống SmartGit
          onContextMenu(event, commit);
        }
      }}
    >
      <GraphCell row={graphRow} laneCount={laneCount} />
      <AuthorBadge name={commit.author} />
      {commit.refs.map((ref) => (
        <RefBadge key={ref} decoration={ref} />
      ))}
      <span className="sg-commit-subject" title={commit.subject}>
        {commit.subject}
      </span>
      <span className="sg-commit-date">{formatRelativeDate(commit.date)}</span>
    </div>
  );
});

/**
 * %D decoration → badge: "HEAD -> main" là nhánh hiện tại (nổi bật),
 * "tag: v1" là tag, còn lại là nhánh thường — style theo class.
 */
function RefBadge({ decoration }: { decoration: string }) {
  if (decoration.startsWith('HEAD -> ')) {
    return <span className="sg-ref-badge head">{decoration.slice('HEAD -> '.length)}</span>;
  }
  if (decoration === 'HEAD') {
    return <span className="sg-ref-badge head">HEAD</span>;
  }
  if (decoration.startsWith('tag: ')) {
    return <span className="sg-ref-badge tag">{decoration.slice('tag: '.length)}</span>;
  }
  return <span className="sg-ref-badge">{decoration}</span>;
}
