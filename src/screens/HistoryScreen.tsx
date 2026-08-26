// Thân màn History — khuôn layout đúng ui-analysis B:
// [B1 sidebar nhánh | B4 graph | B5+B6 chi tiết] / [B7 diff].
// (Repo tabs + toggle + status bar nằm ở MainScreen dùng chung với Working Tree.)
// Danh sách graph ảo hoá (chỉ render viewport) — architecture.md mục 5.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CommitFileChange, CommitInfo } from '../../shared/types';
import { CommitDetail } from '../components/CommitDetail';
import { CommitRow } from '../components/CommitRow';
import { ContextMenu, type MenuState } from '../components/ContextMenu';
import { DiffPanel } from '../components/DiffPanel';
import { PromptModal } from '../components/PromptModal';
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

  /** Context menu commit — mục E: nhóm separator, hint phím tắt, disable ≠ ẩn. */
  const openCommitMenu = (event: React.MouseEvent, commit: CommitInfo) => {
    setMenu({
      x: event.clientX,
      y: event.clientY,
      entries: [
        {
          label: 'Check Out…',
          hint: '⌘G',
          onClick: () => void store.checkoutBranch(commit.oid),
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

  // Search commit đến từ Ô SEARCH Ở SIDEBAR (navigate) — lọc client-side trang đã tải.
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

  return (
    <>
      <div className="sg-main">
        <div className="sg-graph-column">
          {/* Nhánh + filter + search đã dời ra sidebar VSCode — header chỉ còn
              chip trạng thái lọc (kèm nút bỏ lọc), ẩn khi không lọc gì. */}
          {(store.historyRef !== null || store.commitSearch) && (
            <div className="sg-graph-header">
              {store.historyRef !== null && (
                <span className="sg-ref-badge head" title="Graph filtered to this ref">
                  {store.historyRef}
                  <button className="sg-chip-clear" onClick={() => void store.setHistoryRef(null)}>
                    ✕
                  </button>
                </span>
              )}
              {store.commitSearch && (
                <span className="sg-ref-badge" title="Commit search (from sidebar)">
                  🔍 {store.commitSearch}
                  <button className="sg-chip-clear" onClick={() => store.setCommitSearch(null)}>
                    ✕
                  </button>
                </span>
              )}
            </div>
          )}

          <div className="sg-commit-list" ref={listRef} onScroll={slice.onScroll}>
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
                onSelect={(oid) => void store.selectCommit(oid)}
                onContextMenu={openCommitMenu}
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
          />
        </>
      )}

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
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
