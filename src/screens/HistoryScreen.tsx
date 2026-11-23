// Thân màn History — khuôn layout đúng ui-analysis B:
// [B1 sidebar nhánh | B4 graph | B5+B6 chi tiết] / [B7 diff].
// (Repo tabs + toggle + status bar nằm ở MainScreen dùng chung với Working Tree.)
// Danh sách graph ảo hoá (chỉ render viewport) — architecture.md mục 5.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CommitFileChange, CommitInfo } from '../../shared/types';
import { BranchFilter } from '../components/BranchFilter';
import { CheckoutDialog } from '../components/CheckoutDialog';
import { CommitDetail } from '../components/CommitDetail';
import { CommitRow } from '../components/CommitRow';
import { ContextMenu, type MenuState } from '../components/ContextMenu';
import { DiffPanel } from '../components/DiffPanel';
import { MergeDialog } from '../components/MergeDialog';
import { PromptModal } from '../components/PromptModal';
import { ResetDialog } from '../components/ResetDialog';
import { Splitter } from '../components/Splitter';
import { ROW_HEIGHT } from '../components/graph/GraphCell';
import { layoutGraph } from '../engine/graphLayout';
import { useVirtualList } from '../hooks/useVirtualList';
import { useLayoutStore } from '../store/layoutStore';
import { useRepoStore } from '../store/repoStore';
import { copyText } from '../utils/clipboard';

/** Modal nhập tên cho Add Branch/Tag tại commit (context menu E). */
interface RefPrompt {
  kind: 'branch' | 'tag';
  oid: string;
}

export function HistoryScreen() {
  const store = useRepoStore();
  const layout = useLayoutStore();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [refPrompt, setRefPrompt] = useState<RefPrompt | null>(null);
  /** Dialog Merge commit vào nhánh hiện tại (context menu) — oid nguồn. */
  const [mergeOid, setMergeOid] = useState<string | null>(null);
  /** Dialog Reset nhánh hiện tại về commit (context menu) — oid đích. */
  const [resetOid, setResetOid] = useState<string | null>(null);
  /**
   * Popup Checkout (double-click dòng log / menu Check Out…) — oid đích + tên
   * điền sẵn cho "Nhánh mới" (hỏi git trước khi mở để dialog nhận ngay từ đầu).
   */
  const [checkout, setCheckout] = useState<{ oid: string; suggestedName: string } | null>(null);
  const checkoutOid = checkout?.oid ?? null;

  const activeRepo = store.repos.find((r) => r.root === store.activeRepoRoot) ?? null;

  /**
   * Mở popup Checkout: refetch status (đếm change chưa commit chính xác) và hỏi
   * tên nhánh gợi ý song song; mở popup khi có tên (1 lệnh git, gần như tức thì).
   */
  const openCheckout = async (commit: CommitInfo) => {
    const root = store.activeRepoRoot;
    if (root === null) {
      return;
    }
    void store.refreshStatus();
    const suggestedName = await store.suggestBranchName(root, commit.oid);
    setCheckout({ oid: commit.oid, suggestedName });
  };

  /** Context menu commit — mục E: nhóm separator, hint phím tắt, disable ≠ ẩn. */
  const openCommitMenu = (event: React.MouseEvent, commit: CommitInfo) => {
    setMenu({
      x: event.clientX,
      y: event.clientY,
      entries: [
        {
          label: 'Check Out…',
          hint: '⌘G',
          disabled: store.loading,
          onClick: () => void openCheckout(commit),
        },
        {
          label: 'Merge…',
          disabled: store.loading,
          onClick: () => setMergeOid(commit.oid),
        },
        {
          label: 'Reset…',
          disabled: store.loading,
          onClick: () => setResetOid(commit.oid),
        },
        'sep',
        {
          label: 'Add Branch…',
          hint: 'F7',
          onClick: () => setRefPrompt({ kind: 'branch', oid: commit.oid }),
        },
        {
          label: 'Add Tag…',
          hint: '⇧F7',
          onClick: () => setRefPrompt({ kind: 'tag', oid: commit.oid }),
        },
        'sep',
        {
          label: 'Use Message for Commit',
          hint: '⇧⌘K',
          onClick: () => store.useCommitMessage(store.commitBody ?? commit.subject),
        },
        { label: 'Copy Message', onClick: () => copyText(commit.subject) },
        { label: 'Copy ID', onClick: () => copyText(commit.oid) },
      ],
    });
  };

  /** Context menu file trong panel chi tiết commit — mục G (nhóm xem/copy). */
  const openCommitFileMenu = (event: React.MouseEvent, file: CommitFileChange) => {
    setMenu({
      x: event.clientX,
      y: event.clientY,
      entries: [
        { label: 'File Log', hint: '⌘L', onClick: () => store.openFileLogFor(file.path) },
        { label: 'Open in Editor', onClick: () => store.openFileInEditor(file.path) },
        { label: 'Reveal in Finder', onClick: () => store.revealFileInOS(file.path) },
        'sep',
        { label: 'Copy Name', onClick: () => copyText(file.path.split('/').pop() ?? file.path) },
        { label: 'Copy Relative Path', onClick: () => copyText(file.path) },
      ],
    });
  };

  // Ô search commit của màn History (header graph) — lọc client-side trang đã tải.
  const visibleCommits = useMemo(() => {
    const needle = (store.commitSearch ?? '').trim().toLowerCase();
    if (needle === '') {
      return store.commits;
    }
    return store.commits.filter(
      (c) =>
        c.subject.toLowerCase().includes(needle) ||
        c.author.toLowerCase().includes(needle) ||
        c.oid.startsWith(needle),
    );
  }, [store.commits, store.commitSearch]);

  // Layout graph tính lại khi danh sách commit đổi — thuần TS, đủ nhanh cho 1k+/trang.
  const graph = useMemo(() => layoutGraph(visibleCommits), [visibleCommits]);

  // Đo chiều cao viewport danh sách cho ảo hoá.
  const listRef = useRef<HTMLDivElement>(null);
  /** Container danh sách file của commit — → chuyển focus sang, ← quay lại. */
  const detailFilesRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(600);
  useEffect(() => {
    const el = listRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const slice = useVirtualList(visibleCommits.length, ROW_HEIGHT, viewportHeight);

  const selected = store.commits.find((c) => c.oid === store.selectedOid) ?? null;
  /** Commit của popup Checkout — tra lại từ danh sách để có subject/refs. */
  const checkoutCommit = store.commits.find((c) => c.oid === checkoutOid) ?? null;

  /** Nhánh local trỏ đúng commit checkout (trừ nhánh hiện tại) — đích ưu tiên. */
  const localBranchesAtCheckout =
    checkoutCommit === null
      ? []
      : store.refs.filter(
          (r) => r.kind === 'local' && r.oid === checkoutCommit.oid && !r.isHead,
        );

  /**
   * ↑/↓ trong diff chạm biên change đầu/cuối → chuyển file trước/sau TRONG CÙNG
   * COMMIT, theo thứ tự đang hiển thị (List/Tree — đọc DOM qua data-path).
   * Đầu/cuối danh sách file thì đứng yên.
   */
  const crossFile = (direction: 'next' | 'previous') => {
    const filesEl = detailFilesRef.current;
    if (filesEl === null) {
      return;
    }
    const paths = Array.from(filesEl.querySelectorAll<HTMLElement>('[data-path]')).map(
      (el) => el.dataset.path!,
    );
    const currentPath = store.selectedFile?.path ?? null;
    const current = currentPath === null ? -1 : paths.indexOf(currentPath);
    const next = direction === 'next' ? current + 1 : current - 1;
    if (next < 0 || next >= paths.length) {
      return;
    }
    const file = store.commitFiles.find((f) => f.path === paths[next]);
    if (file !== undefined) {
      void store.selectFile(file);
    }
  };

  /**
   * Điều hướng commit bằng bàn phím: ↑/↓ từng dòng, PageUp/Down từng trang,
   * Home/End đầu/cuối. List ảo hoá → tự chỉnh scrollTop để hàng chọn luôn
   * nằm trong viewport (không dùng scrollIntoView vì hàng có thể chưa render).
   */
  const onListKeyDown = (event: React.KeyboardEvent) => {
    const count = visibleCommits.length;
    if (count === 0) {
      return;
    }
    // → : chuyển điều khiển phím sang danh sách changed files của commit đang
    // chọn (duyệt diff từng file bằng ↑/↓; ← ở đó quay lại đây).
    if (event.key === 'ArrowRight') {
      const filesEl = detailFilesRef.current;
      if (filesEl !== null && store.commitFiles.length > 0) {
        event.preventDefault();
        filesEl.focus();
        if (store.selectedFile === null) {
          // Chọn file ĐẦU TIÊN THEO HIỂN THỊ (List/Tree khác thứ tự) — đọc DOM.
          const firstPath = filesEl.querySelector<HTMLElement>('[data-path]')?.dataset.path;
          const first = store.commitFiles.find((f) => f.path === firstPath);
          if (first !== undefined) {
            void store.selectFile(first);
          }
        }
      }
      return;
    }
    const current = visibleCommits.findIndex((c) => c.oid === store.selectedOid);
    const pageRows = Math.max(1, Math.floor(viewportHeight / ROW_HEIGHT) - 1);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = Math.min(current + 1, count - 1);
        break;
      case 'ArrowUp':
        next = Math.max(current - 1, 0);
        break;
      case 'PageDown':
        next = Math.min(current + pageRows, count - 1);
        break;
      case 'PageUp':
        next = Math.max(current - pageRows, 0);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault(); // chặn scroll mặc định — mình tự cuộn theo selection
    const commit = visibleCommits[next]!;
    if (commit.oid !== store.selectedOid) {
      void store.selectCommit(commit.oid);
    }
    const el = listRef.current;
    if (el) {
      const rowTop = next * ROW_HEIGHT;
      if (rowTop < el.scrollTop) {
        el.scrollTop = rowTop;
      } else if (rowTop + ROW_HEIGHT > el.scrollTop + el.clientHeight) {
        el.scrollTop = rowTop + ROW_HEIGHT - el.clientHeight;
      }
    }
  };

  return (
    <>
      <div className="sg-main">
        <div className="sg-graph-column">
          {/* Cây nhánh nằm ở sidebar VSCode; header của graph có dropdown lọc
              nhánh CỦA RIÊNG màn History (tách với filter sidebar — luôn thấy
              rõ đang xem nhánh nào) + ô search commit (lọc trang đã tải). */}
          <div className="sg-graph-header">
            <span className="sg-graph-label">Branch:</span>
            <BranchFilter />
            <span className="sg-diff-spacer" />
            <input
              className="sg-filter-input inline"
              placeholder="Search commits (message · author · hash)"
              value={store.commitSearch ?? ''}
              onChange={(e) => store.setCommitSearch(e.target.value || null)}
            />
          </div>

          {/* tabIndex để nhận focus → phím ↑/↓ hoạt động; click row cũng focus. */}
          <div
            className="sg-commit-list"
            ref={listRef}
            tabIndex={0}
            onScroll={slice.onScroll}
            onKeyDown={onListKeyDown}
          >
            {visibleCommits.length === 0 && !store.loading && store.error === null && (
              <p className="sg-empty">No commits to show</p>
            )}
            <div style={{ height: slice.topPad }} />
            {visibleCommits.slice(slice.start, slice.end).map((commit, i) => (
              <CommitRow
                key={commit.oid}
                commit={commit}
                graphRow={graph.rows[slice.start + i]}
                laneCount={graph.laneCount}
                selected={commit.oid === store.selectedOid}
                onSelect={(oid) => {
                  listRef.current?.focus(); // để ↑/↓ dùng được ngay sau khi click
                  void store.selectCommit(oid);
                }}
                onContextMenu={openCommitMenu}
                onDoubleClick={(c) => void openCheckout(c)}
              />
            ))}
            <div style={{ height: slice.bottomPad }} />
            {store.hasMoreCommits && !store.commitSearch && (
              <button className="sg-load-more" onClick={() => void store.loadMore()}>
                Load more
              </button>
            )}
          </div>
        </div>

        {selected && (
          <>
            <Splitter
              orientation="vertical"
              invert
              onResize={(d) => layout.resize('detailWidth', d)}
            />
            <CommitDetail
              commit={selected}
              width={layout.detailWidth}
              body={store.commitBody}
              files={store.commitFiles}
              selectedFile={store.selectedFile}
              onSelectFile={(file) => void store.selectFile(file)}
              onFileContextMenu={openCommitFileMenu}
              filesRef={detailFilesRef}
              onFocusCommits={() => listRef.current?.focus()}
            />
          </>
        )}
      </div>

      {store.selectedFile && (
        <>
          <Splitter
            orientation="horizontal"
            invert
            onResize={(d) => layout.resize('diffHeight', d)}
          />
          <DiffPanel
            path={store.selectedFile.path}
            height={layout.diffHeight}
            kindLabel={capitalize(store.selectedFile.kind)}
            diff={store.diff}
            loading={store.diffLoading}
            onCrossFile={crossFile}
          />
        </>
      )}

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {checkoutCommit !== null && activeRepo !== null && (
        <CheckoutDialog
          description={
            <>
              Check out <b>{checkoutCommit.oid.slice(0, 7)}</b> — {checkoutCommit.subject}
            </>
          }
          // Nhánh local trỏ đúng commit này (trừ nhánh đang checkout) — ưu tiên
          // checkout theo tên; luôn kèm lựa chọn detached HEAD tại commit.
          targets={[
            ...localBranchesAtCheckout.map((r) => ({
              value: r.name,
              label: `Branch ‘${r.name}’`,
              detail: 'nhánh local trỏ tại commit này',
            })),
            {
              value: checkoutCommit.oid,
              label: `Commit ${checkoutCommit.oid.slice(0, 7)}`,
              detail: 'detached HEAD — không đứng trên nhánh nào',
            },
          ]}
          newBranchAt={checkoutCommit.oid}
          // Không có nhánh local tại commit → "Nhánh mới" là mặc định, tên điền
          // sẵn theo nhánh remote gần nhất chứa commit (store.suggestBranchName).
          newBranchDefaultName={checkout?.suggestedName ?? ''}
          newBranchPreselected={localBranchesAtCheckout.length === 0}
          note={
            localBranchesAtCheckout.length > 0 ? undefined : (
              <>
                Không có nhánh local nào tại commit này — chọn <b>Nhánh mới</b> để tránh
                trạng thái <b>detached HEAD</b>.
              </>
            )
          }
          changedCount={store.status?.files.length ?? 0}
          onSubmit={(ref, dirty, newBranch) =>
            void store.checkoutCommit(activeRepo.root, ref, dirty, newBranch)
          }
          onClose={() => setCheckout(null)}
        />
      )}
      {mergeOid !== null && activeRepo !== null && (
        <MergeDialog
          kind="merge"
          currentBranch={activeRepo.branch}
          targets={[mergeOid]}
          initialTarget={mergeOid}
          targetLabel={`commit ${mergeOid.slice(0, 7)}`}
          onSubmit={(target, strategy) => void store.mergeBranch(activeRepo.root, target, strategy)}
          onClose={() => setMergeOid(null)}
        />
      )}
      {resetOid !== null && activeRepo !== null && (
        <ResetDialog
          currentBranch={activeRepo.branch}
          oid={resetOid}
          onSubmit={(mode) => void store.resetToCommit(resetOid, mode)}
          onClose={() => setResetOid(null)}
        />
      )}
      {refPrompt && (
        <PromptModal
          title={refPrompt.kind === 'branch' ? 'Add Branch at commit' : 'Add Tag at commit'}
          placeholder={refPrompt.kind === 'branch' ? 'branch name' : 'tag name'}
          actionLabel={refPrompt.kind === 'branch' ? 'Add Branch' : 'Add Tag'}
          onSubmit={(name) =>
            void (refPrompt.kind === 'branch'
              ? store.createBranchAt(name, refPrompt.oid)
              : store.createTagAt(name, refPrompt.oid))
          }
          onClose={() => setRefPrompt(null)}
        />
      )}
    </>
  );
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
