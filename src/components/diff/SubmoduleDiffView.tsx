// Diff của SUBMODULE / repo git lồng: gitlink không có nội dung text — hiển thị
// so sánh con trỏ (SHA cũ → mới) + lịch sử dạng GRAPH 1 KHUNG 2 LANE chụm về 1 gốc:
//   · commit 2 phía trộn chung 1 danh sách, sắp theo thời gian (mới nhất trên cùng)
//   · lane trái đỏ (−) = commit bị bỏ (new..old), lane phải xanh (+) = thêm vào (old..new)
//   · con trỏ OLD/NEW ghim chip ngay trên dòng commit tương ứng trong lane
//   · dòng NEO dưới cùng: fast-forward = chính commit OLD (thấy hash old trong
//     dòng chảy), phân kỳ = merge-base — điểm 2 lane gặp nhau.

import { useState } from 'react';
import type { CommitInfo, SubmoduleDiffInfo } from '../../../shared/types';
import { host } from '../../rpc';
import { useRepoStore } from '../../store/repoStore';
import { formatRelativeDate } from '../../utils/date';
import { AuthorBadge } from '../AuthorBadge';

export function SubmoduleDiffView({ info, path }: { info: SubmoduleDiffInfo; path: string }) {
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

      <HistoryRails info={info} path={path} state={state} />
    </div>
  );
}

type Side = 'ahead' | 'behind';

/**
 * Lịch sử dạng cây 1 gốc 2 nhánh, vẽ trong 1 KHUNG: commit 2 phía trộn chung,
 * sắp theo thời gian giảm dần; mỗi dòng chấm nút vào lane của phía nó. Con trỏ
 * DỜI (state 'changed') thì LUÔN vẽ đủ 2 lane — trái = phía OLD (đỏ), phải =
 * phía NEW (xanh) — phía không có commit riêng vẫn giữ lane + ghi chú, 2 nhánh
 * chụm về dòng neo (gốc):
 *  · fast-forward:  lane trái trống, neo = commit OLD
 *  · lùi con trỏ:   lane phải trống, neo = commit NEW
 *  · phân kỳ:       2 lane có commit, neo = merge-base
 *  · mới thêm/xoá:  1 lane đơn, không neo (không có phía kia)
 */
function HistoryRails({
  info,
  path,
  state,
}: {
  info: SubmoduleDiffInfo;
  path: string;
  state: 'added' | 'removed' | 'changed';
}) {
  const repoRoot = useRepoStore((s) => s.activeRepoRoot);
  /**
   * Trang load thêm ("show more") nối vào sau preview của host. Component được
   * remount theo key path+oldOid+newOid (DiffPanel) nên không cần tự reset.
   */
  const [extraAhead, setExtraAhead] = useState<CommitInfo[]>([]);
  const [extraBehind, setExtraBehind] = useState<CommitInfo[]>([]);
  const [aheadHasMore, setAheadHasMore] = useState(info.aheadTruncated);
  const [behindHasMore, setBehindHasMore] = useState(info.behindTruncated);
  const [loadingSide, setLoadingSide] = useState<'ahead' | 'behind' | null>(null);

  const ahead = [...info.ahead, ...extraAhead];
  const behind = [...info.behind, ...extraBehind];

  const hasAdded = ahead.length > 0;
  const hasRemoved = behind.length > 0;
  if (!hasAdded && !hasRemoved) {
    return null;
  }
  const diverged = hasAdded && hasRemoved;
  /** Con trỏ dời → cây 2 nhánh đầy đủ; submodule mới thêm/xoá → 1 ray đơn. */
  const twoRails = state === 'changed';

  /** Range như host đã dùng cho chiều đó — "old..new" / "new..old" / 1 oid. */
  const rangeOf = (side: Side): string | null => {
    const { oldOid, newOid } = info;
    if (oldOid !== null && newOid !== null) {
      return side === 'ahead' ? `${oldOid}..${newOid}` : `${newOid}..${oldOid}`;
    }
    return side === 'ahead' ? newOid : oldOid;
  };

  const loadMore = async (side: Side) => {
    const range = rangeOf(side);
    if (repoRoot === null || range === null || loadingSide !== null) {
      return;
    }
    setLoadingSide(side);
    try {
      const skip = side === 'ahead' ? ahead.length : behind.length;
      const page = await host.getSubmoduleLog(repoRoot, path, range, skip);
      if (side === 'ahead') {
        setExtraAhead((prev) => [...prev, ...page.commits]);
        setAheadHasMore(page.hasMore);
      } else {
        setExtraBehind((prev) => [...prev, ...page.commits]);
        setBehindHasMore(page.hasMore);
      }
    } catch {
      // Lỗi tải trang (repo con đổi giữa chừng…) — giữ hasMore để bấm thử lại.
    }
    setLoadingSide(null);
  };

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

  /** Thứ tự lane trên mỗi dòng: 2 lane khi con trỏ dời, 1 lane khi thêm/xoá. */
  const lanes: Side[] = twoRails ? ['behind', 'ahead'] : hasAdded ? ['ahead'] : ['behind'];

  // Trộn commit 2 phía vào 1 danh sách, mới nhất trên cùng (sort ổn định nên
  // các commit cùng timestamp giữ nguyên thứ tự git log của phía nó).
  const entries: { commit: CommitInfo; side: Side }[] = [
    ...behind.map((c) => ({ commit: c, side: 'behind' as const })),
    ...ahead.map((c) => ({ commit: c, side: 'ahead' as const })),
  ].sort((a, b) => Date.parse(b.commit.date) - Date.parse(a.commit.date));

  const pointerOf = (side: Side) =>
    side === 'behind'
      ? info.oldOid !== null
        ? { oid: info.oldOid, label: 'OLD' }
        : null
      : info.newOid !== null
        ? { oid: info.newOid, label: 'NEW' }
        : null;

  return (
    <div className="sg-submodule-rails">
      <div className="sg-submodule-history-title">
        {state === 'added' && `Commits included (${count(ahead, aheadHasMore)} — recent history)`}
        {state === 'removed' && `History before removal (${count(behind, behindHasMore)})`}
        {state === 'changed' && (
          <>
            <span className="sg-submodule-title-part removed">
              − removed ({count(behind, behindHasMore)})
            </span>
            <span className="sg-submodule-title-sep">·</span>
            <span className="sg-submodule-title-part added">
              + added ({count(ahead, aheadHasMore)})
            </span>
          </>
        )}
      </div>
      <div className="sg-submodule-history-scroll">
        <div
          className={`sg-submodule-history-body lanes-${lanes.length} ${twoRails ? '' : hasAdded ? 'added' : 'removed'}`}
        >
        {twoRails && !hasRemoved && (
          <div className="sg-submodule-commit">
            <Lanes lanes={lanes} side="behind" dashed />
            <span className="sg-detail-meta">none — OLD is an ancestor of NEW</span>
          </div>
        )}
        {twoRails && !hasAdded && (
          <div className="sg-submodule-commit">
            <Lanes lanes={lanes} side="ahead" dashed />
            <span className="sg-detail-meta">none — NEW is an ancestor of OLD</span>
          </div>
        )}
        {entries.map(({ commit: c, side }) => {
          const pointer = pointerOf(side);
          return (
            <div key={c.oid} className="sg-submodule-commit" title={`${c.oid}\n${c.subject}`}>
              <Lanes lanes={lanes} side={side} />
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
          );
        })}
        {behindHasMore && (
          <MoreRow
            lanes={lanes}
            side="behind"
            loading={loadingSide === 'behind'}
            label={twoRails ? 'show earlier removed commits' : 'show earlier commits'}
            onClick={() => void loadMore('behind')}
          />
        )}
        {aheadHasMore && (
          <MoreRow
            lanes={lanes}
            side="ahead"
            loading={loadingSide === 'ahead'}
            label={twoRails ? 'show earlier added commits' : 'show earlier commits'}
            onClick={() => void loadMore('ahead')}
          />
        )}
        </div>
      </div>
      {anchor !== null && (
        // Vùng hội tụ: kéo 2 nhánh xuống gốc — nhánh phải (NEW, xanh) vòng từ
        // lane phải về gốc trái, thành hình cây 1 gốc 2 nhánh.
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

const toneOf = (side: Side): 'added' | 'removed' => (side === 'ahead' ? 'added' : 'removed');

/**
 * Cụm ô lane đầu mỗi dòng: mỗi lane 1 ô cố định để dòng nào cũng thẳng cột;
 * ô của phía `side` chấm nút tròn (+/−, hoặc nét đứt cho dòng phụ), ô kia để
 * trống cho đường kẻ dọc của lane chạy xuyên qua.
 */
function Lanes({
  lanes,
  side,
  dashed,
  symbol,
}: {
  lanes: Side[];
  side: Side;
  dashed?: boolean;
  symbol?: string;
}) {
  return (
    <>
      {lanes.map((lane) => (
        <span key={lane} className="sg-submodule-lane">
          {lane === side && (
            <span className={`sg-submodule-dot ${dashed ? 'more ' : ''}${toneOf(side)}`}>
              {symbol ?? (dashed ? '' : side === 'ahead' ? '+' : '−')}
            </span>
          )}
        </span>
      ))}
    </>
  );
}

/** Dòng "show earlier commits" — button load trang tiếp theo của 1 phía. */
function MoreRow({
  lanes,
  side,
  loading,
  label,
  onClick,
}: {
  lanes: Side[];
  side: Side;
  loading: boolean;
  label: string;
  onClick(): void;
}) {
  return (
    <button className="sg-submodule-commit sg-submodule-more" disabled={loading} onClick={onClick}>
      <Lanes lanes={lanes} side={side} dashed symbol="⋮" />
      <span className="sg-detail-meta">{loading ? 'loading…' : label}</span>
    </button>
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
