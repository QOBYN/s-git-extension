// Màn File Log (ui-analysis C / spec 2.3): log của riêng 1 file (--follow qua
// rename), chọn commit → diff của file tại commit đó ở đáy. Mở từ context menu
// Explorer/editor ("SmartGit: File Log") — host inject repoRoot + filePath.

import { useEffect, useMemo, useRef, useState } from 'react';
import { CommitRow } from '../components/CommitRow';
import { DiffPanel } from '../components/DiffPanel';
import { Splitter } from '../components/Splitter';
import { ROW_HEIGHT } from '../components/graph/GraphCell';
import { layoutGraph } from '../engine/graphLayout';
import { useVirtualList } from '../hooks/useVirtualList';
import { useLayoutStore } from '../store/layoutStore';
import { useRepoStore } from '../store/repoStore';

export function FileLogScreen() {
  const store = useRepoStore();
  const layout = useLayoutStore();
  const filePath = store.fileLogPath;

  useEffect(() => {
    void useRepoStore.getState().init();
  }, []);

  const graph = useMemo(() => layoutGraph(store.commits), [store.commits]);

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

  const slice = useVirtualList(store.commits.length, ROW_HEIGHT, viewportHeight);

  // Chọn commit → xem luôn diff của CHÍNH file này tại commit đó (khác History:
  // không cần chọn file trong danh sách).
  const onSelect = async (oid: string) => {
    await store.selectCommit(oid);
    if (filePath !== null) {
      await store.selectFile({ path: filePath, kind: 'modified' });
    }
  };

  return (
    <div className="sg-app">
      <div className="sg-graph-header">
        <span className="sg-diff-file" title={filePath ?? ''}>
          Log for {filePath}
        </span>
        <span className="sg-diff-spacer" />
        <span className="sg-detail-meta">{store.commits.length} commits</span>
      </div>

      {store.error !== null && <div className="sg-error">{store.error}</div>}

      <div className="sg-main">
        <div className="sg-commit-list" ref={listRef} onScroll={slice.onScroll}>
          {store.commits.length === 0 && !store.loading && store.error === null && (
            <p className="sg-empty">No commits touch this file</p>
          )}
          <div style={{ height: slice.topPad }} />
          {store.commits.slice(slice.start, slice.end).map((commit, i) => (
            <CommitRow
              key={commit.oid}
              commit={commit}
              graphRow={graph.rows[slice.start + i]}
              laneCount={graph.laneCount}
              selected={commit.oid === store.selectedOid}
              onSelect={(oid) => void onSelect(oid)}
            />
          ))}
          <div style={{ height: slice.bottomPad }} />
          {store.hasMoreCommits && (
            <button className="sg-load-more" onClick={() => void store.loadMore()}>
              Load more
            </button>
          )}
        </div>
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
            kindLabel="At selected commit"
            diff={store.diff}
            loading={store.diffLoading}
          />
        </>
      )}

      <div className="sg-status-bar">
        <span className={`sg-status-dot${store.loading ? ' busy' : ''}`} />
        {store.loading ? 'Working…' : store.statusMessage}
      </div>
    </div>
  );
}
