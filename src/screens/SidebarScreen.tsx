// Sidebar VSCode — 2 tab (yêu cầu user, map ui-analysis A3 + B1):
//  1. Working Tree: cây thư mục repo → click folder = panel mở Working Tree
//     và CHỈ hiện change dưới folder đó (folder scope).
//  2. Branches: cây repo → nhánh local → click = panel mở History.
// Mọi click đều mở/reveal panel qua host.openPanel — không cần chạy lệnh tay.

import { useEffect, useState } from 'react';
import type { RepoInfo } from '../../shared/types';
import { childFolders } from '../../shared/folders';
import { host } from '../rpc';
import { useRepoStore } from '../store/repoStore';

type SidebarTab = 'workingTree' | 'branches';

export function SidebarScreen() {
  const store = useRepoStore();
  const [tab, setTab] = useState<SidebarTab>('workingTree');

  useEffect(() => {
    void useRepoStore.getState().initSidebar();
  }, []);

  return (
    <div className="sg-app">
      <div className="sg-side-tabs">
        <button
          className={`sg-mode-btn${tab === 'workingTree' ? ' active' : ''}`}
          onClick={() => setTab('workingTree')}
        >
          Working Tree
        </button>
        <button
          className={`sg-mode-btn${tab === 'branches' ? ' active' : ''}`}
          onClick={() => setTab('branches')}
        >
          Branches
        </button>
      </div>

      <div className="sg-sidebar-body">
        {store.repos.length === 0 && !store.loading && (
          <p className="sg-empty small">No git repository in workspace</p>
        )}
        {store.repos.map((repo) =>
          tab === 'workingTree' ? (
            <RepoFolders key={repo.root} repo={repo} />
          ) : (
            <RepoBranches key={repo.root} repo={repo} />
          ),
        )}
      </div>
      {store.error !== null && <div className="sg-error">{store.error}</div>}
    </div>
  );
}

// ---- tab 1: cây thư mục ----

function RepoFolders({ repo }: { repo: RepoInfo }) {
  const folders = useRepoStore((s) => s.foldersByRepo[repo.root]) ?? [];
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const toggle = (folder: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });

  const renderLevel = (parent: string | null, depth: number) =>
    childFolders(folders, parent).map((folder) => {
      const hasChildren = childFolders(folders, folder).length > 0;
      const isOpen = expanded.has(folder);
      return (
        <div key={folder}>
          <div
            className="sg-folder-row"
            style={{ paddingLeft: 8 + depth * 14 }}
            title={`Show changes in ${folder}/`}
          >
            <button
              className="sg-sidebar-caret"
              style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
              onClick={() => toggle(folder)}
              aria-label={isOpen ? 'Collapse' : 'Expand'}
            >
              {isOpen ? '▾' : '▸'}
            </button>
            <span
              className="sg-folder-name"
              onClick={() => void host.openPanel(repo.root, 'workingTree', folder)}
            >
              {folder.slice(folder.lastIndexOf('/') + 1)}
            </span>
          </div>
          {isOpen && renderLevel(folder, depth + 1)}
        </div>
      );
    });

  return (
    <div className="sg-sidebar-repo">
      <RepoHeader repo={repo} />
      {/* Hàng gốc: xem change của CẢ repo (bỏ scope). */}
      <div
        className="sg-folder-row root"
        style={{ paddingLeft: 8 }}
        onClick={() => void host.openPanel(repo.root, 'workingTree', null)}
        title="Show all changes"
      >
        <span className="sg-folder-name">(all changes)</span>
      </div>
      {renderLevel(null, 0)}
    </div>
  );
}

// ---- tab 2: nhánh ----

function RepoBranches({ repo }: { repo: RepoInfo }) {
  const refs = useRepoStore((s) => s.refsByRepo[repo.root]) ?? [];
  const locals = refs.filter((r) => r.kind === 'local');

  return (
    <div className="sg-sidebar-repo">
      <RepoHeader repo={repo} />
      {locals.map((ref) => (
        <div
          key={ref.fullName}
          className={`sg-branch-row indent${ref.isHead ? ' head' : ''}`}
          title={`Open history of ${repo.name} — ${ref.name}`}
          onClick={() => void host.openPanel(repo.root, 'history', null, ref.name)}
        >
          {ref.isHead ? '▶ ' : ''}
          {ref.name}
        </div>
      ))}
    </div>
  );
}

/** Header repo dùng chung 2 tab: tên đậm + badge trạng thái, click mở panel. */
function RepoHeader({ repo }: { repo: RepoInfo }) {
  return (
    <div className="sg-sidebar-repo-row" title={repo.root}>
      <span className="sg-sidebar-repo-name" onClick={() => void host.openPanel(repo.root, null, null)}>
        {repo.name}
      </span>
      {repo.branch !== null && <span className="sg-ref-badge">{repo.branch}</span>}
      {repo.activity !== 'none' && <span className="sg-ref-badge tag">{repo.activity}</span>}
    </div>
  );
}
