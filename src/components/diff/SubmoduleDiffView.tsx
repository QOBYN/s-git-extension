// Diff của SUBMODULE / repo git lồng: gitlink không có nội dung text — hiển thị
// so sánh con trỏ (SHA cũ → mới) + lịch sử dạng 2 ĐƯỜNG RAY chụm về 1 gốc:
//   · ray xanh (+) = commit thêm vào (old..new), ray đỏ (−) = commit bị bỏ
//   · con trỏ OLD/NEW ghim chip ngay trên dòng commit tương ứng trong ray
//   · dòng NEO dưới cùng: fast-forward = chính commit OLD (thấy hash old trong
//     dòng chảy), phân kỳ = merge-base — điểm 2 ray gặp nhau.

import type { CommitInfo, SubmoduleDiffInfo } from '../../../shared/types';
import { formatRelativeDate } from '../../utils/date';
import { AuthorBadge } from '../AuthorBadge';

export function SubmoduleDiffView({ info }: { info: SubmoduleDiffInfo }) {
  // 3 trạng thái chính: mới thêm / bị xoá / con trỏ dời (hoặc đứng yên + dirty).
  const state =
    info.oldOid === null && info.newOid !== null
      ? 'added'
      : info.newOid === null && info.oldOid !== null
        ? 'removed'
        : 'changed';

  return (
    <div className="sg-submodule-diff">
      {state === 'added' && (
        <>
          <div className="sg-submodule-state added">
            New submodule — this git repository was added; its pointer will record the commit
            below.
          </div>
          <SubmoduleSide label="Points at" oid={info.newOid} commit={info.newCommit} tone="added" />
        </>
      )}

      {state === 'removed' && (
        <>
          <div className="sg-submodule-state removed">
            Submodule removed — the pointer below is being deleted.
          </div>
          <SubmoduleSide label="Was at" oid={info.oldOid} commit={info.oldCommit} tone="removed" />
        </>
      )}

      {state === 'changed' && (
        <div className="sg-submodule-pointer">
          <SubmoduleSide label="Old" oid={info.oldOid} commit={info.oldCommit} />
          <span className="sg-submodule-arrow">→</span>
          <SubmoduleSide label="New" oid={info.newOid} commit={info.newCommit} />
        </div>
      )}

      {state === 'changed' && info.oldOid === info.newOid && info.dirty && (
        <p className="sg-submodule-note">
          Submodule pointer unchanged — but the submodule has uncommitted changes inside. Commit or
          discard them <em>inside the submodule</em>.
        </p>
      )}
      {(state !== 'changed' || info.oldOid !== info.newOid) && info.dirty && (
        <p className="sg-submodule-note">The submodule also has uncommitted changes inside.</p>
      )}
      {state === 'changed' &&
        info.oldOid !== info.newOid &&
        info.ahead.length === 0 &&
        info.behind.length === 0 && (
          <p className="sg-submodule-note">
            Cannot list the commits in between — the submodule may not be initialized, or the
            commits have not been fetched yet.
          </p>
        )}

      <HistoryRails info={info} state={state} />
    </div>
  );
}

/**
 * Lịch sử dạng cây 1 gốc 2 nhánh. Con trỏ DỜI (state 'changed') thì LUÔN vẽ đủ
 * 2 cột — trái = phía OLD (đỏ), phải = phía NEW (xanh) — phía không có commit
 * riêng vẫn giữ ray + ghi chú, 2 nhánh chụm về dòng neo (gốc):
 *  · fast-forward:  cột trái trống, neo = commit OLD
 *  · lùi con trỏ:   cột phải trống, neo = commit NEW
 *  · phân kỳ:       2 cột có commit, neo = merge-base
 *  · mới thêm/xoá:  1 ray đơn, không neo (không có phía kia)
 */
function HistoryRails({
  info,
  state,
}: {
  info: SubmoduleDiffInfo;
  state: 'added' | 'removed' | 'changed';
}) {
  const hasAdded = info.ahead.length > 0;
  const hasRemoved = info.behind.length > 0;
  if (!hasAdded && !hasRemoved) {
    return null;
  }
  const diverged = hasAdded && hasRemoved;
  /** Con trỏ dời → cây 2 nhánh đầy đủ; submodule mới thêm/xoá → 1 ray đơn. */
  const twoRails = state === 'changed';

  // Dòng neo chung dưới đáy — gốc cây, nơi 2 nhánh gặp nhau.
  let anchor: { label: string; oid: string; commit: CommitInfo | null } | null = null;
  if (twoRails) {
    if (diverged) {
      anchor =
        info.baseOid !== null
          ? { label: 'BASE', oid: info.baseOid, commit: info.baseCommit }
          : null;
    } else if (hasAdded && info.oldOid !== null) {
      anchor = { label: 'OLD', oid: info.oldOid, commit: info.oldCommit };
    } else if (hasRemoved && info.newOid !== null) {
      anchor = { label: 'NEW', oid: info.newOid, commit: info.newCommit };
    }
  }

  return (
    <div className="sg-submodule-rails">
      <div className="sg-submodule-rails-columns">
        {(twoRails || hasRemoved) && (
          <Rail
            title={
              state === 'removed'
                ? `History before removal (${count(info.behind, info.behindTruncated)})`
                : `Commits removed (${count(info.behind, info.behindTruncated)})`
            }
            commits={info.behind}
            tone="removed"
            truncated={info.behindTruncated}
            pointer={info.oldOid !== null ? { oid: info.oldOid, label: 'OLD' } : null}
            emptyNote="none — OLD is an ancestor of NEW"
          />
        )}
        {(twoRails || hasAdded) && (
          <Rail
            title={
              state === 'added'
                ? `Commits included (${count(info.ahead, info.aheadTruncated)} — recent history)`
                : `Commits added (${count(info.ahead, info.aheadTruncated)})`
            }
            commits={info.ahead}
            tone="added"
            truncated={info.aheadTruncated}
            pointer={info.newOid !== null ? { oid: info.newOid, label: 'NEW' } : null}
            emptyNote="none — NEW is an ancestor of OLD"
          />
        )}
      </div>
      {anchor !== null && (
        // Vùng hội tụ: kéo 2 nhánh xuống gốc — nhánh phải (NEW) vòng về gốc
        // trái, thành hình cây 1 gốc 2 nhánh.
        <div
          className={`sg-submodule-converge ${twoRails ? 'both' : hasAdded ? 'added' : 'removed'}`}
        />
      )}
      {anchor !== null && (
        <div className="sg-submodule-anchor" title={anchor.oid}>
          <span className="sg-submodule-dot anchor" />
          <span className="sg-submodule-pointer-chip">{anchor.label}</span>
          <code className="sg-submodule-sha">{anchor.oid.slice(0, 8)}</code>
          {anchor.commit !== null ? (
            <>
              <span className="sg-submodule-subject">{anchor.commit.subject}</span>
              <span className="sg-commit-date">{formatRelativeDate(anchor.commit.date)}</span>
            </>
          ) : (
            <span className="sg-detail-meta">
              {anchor.label === 'BASE' ? 'common ancestor' : 'commit not available locally'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const count = (commits: CommitInfo[], truncated: boolean): string =>
  `${commits.length}${truncated ? '+' : ''}`;

/** 1 phía của con trỏ: SHA + subject/author/date + badge nhánh/tag trỏ vào commit đó. */
function SubmoduleSide({
  label,
  oid,
  commit,
  tone,
}: {
  label: string;
  oid: string | null;
  commit: CommitInfo | null;
  tone?: 'added' | 'removed';
}) {
  return (
    <div className={`sg-submodule-side${tone ? ` ${tone}` : ''}`}>
      <div className="sg-submodule-side-head">
        <span className="sg-submodule-side-label">{label}</span>
        {oid === null ? (
          <span className="sg-detail-meta">(none)</span>
        ) : (
          <code className="sg-submodule-sha" title={oid}>
            {oid.slice(0, 10)}
          </code>
        )}
        {commit?.refs.map((ref) => (
          <RefBadge key={ref} decoration={ref} />
        ))}
      </div>
      {commit !== null ? (
        <>
          <div className="sg-submodule-subject" title={commit.subject}>
            {commit.subject}
          </div>
          <div className="sg-detail-meta">
            {commit.author} · {formatRelativeDate(commit.date)}
          </div>
        </>
      ) : (
        oid !== null && (
          <div className="sg-detail-meta">Commit not available locally (fetch the submodule).</div>
        )
      )}
    </div>
  );
}

/** 1 đường ray: kẻ dọc màu theo chiều, mỗi commit là nút tròn +/− trên ray. */
function Rail({
  title,
  commits,
  tone,
  truncated,
  pointer,
  emptyNote,
}: {
  title: string;
  commits: CommitInfo[];
  tone: 'added' | 'removed';
  truncated: boolean;
  /** Con trỏ ghim chip trên dòng commit trùng oid (NEW ở ray xanh, OLD ở ray đỏ). */
  pointer: { oid: string; label: string } | null;
  /** Ghi chú khi nhánh này không có commit riêng (vẫn giữ ray cho đủ 2 đường). */
  emptyNote?: string;
}) {
  return (
    <div className={`sg-submodule-history ${tone}`}>
      <div className="sg-submodule-history-title">{title}</div>
      <div className="sg-submodule-history-body">
        {commits.length === 0 && emptyNote !== undefined && (
          <div className="sg-submodule-commit">
            <span className={`sg-submodule-dot more ${tone}`} />
            <span className="sg-detail-meta">{emptyNote}</span>
          </div>
        )}
        {commits.map((c) => (
          <div key={c.oid} className="sg-submodule-commit" title={`${c.oid}\n${c.subject}`}>
            <span className={`sg-submodule-dot ${tone}`}>{tone === 'added' ? '+' : '−'}</span>
            {pointer !== null && c.oid === pointer.oid && (
              <span className="sg-submodule-pointer-chip">{pointer.label}</span>
            )}
            <AuthorBadge name={c.author} />
            {c.refs.map((ref) => (
              <RefBadge key={ref} decoration={ref} />
            ))}
            <span className="sg-submodule-subject">{c.subject}</span>
            <code className="sg-submodule-sha dim">{c.oid.slice(0, 8)}</code>
            <span className="sg-commit-date">{formatRelativeDate(c.date)}</span>
          </div>
        ))}
        {truncated && (
          <div className="sg-submodule-commit">
            <span className={`sg-submodule-dot more ${tone}`}>⋮</span>
            <span className="sg-detail-meta">earlier commits not shown</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Cùng quy ước badge với CommitRow: HEAD -> nhánh hiện tại, "tag: x" là tag. */
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
