// Sidebar VSCode — 2 tab:
//  1. Working Tree: cây thư mục kiểu EXPLORER (chevron, indent, chọn được, badge
//     số change per folder) → click = panel mở Working Tree scope theo folder.
//  2. Git: mỗi repo là 1 cây — Local Branches / Remotes / Tags / Submodules,
//     section thu gọn được; filter nhánh + search commit nằm ngay đầu tab
//     (phần filter/search của panel History dời ra đây).
// Mọi click đều mở/reveal panel qua host.openPanel — không cần chạy lệnh tay.

import { useEffect, useState } from 'react';
import type { RefInfo, RepoInfo } from '../../shared/types';
import { childFolders } from '../../shared/folders';
import { ContextMenu, type MenuState } from '../components/ContextMenu';
import { FeedbackDialog } from '../components/FeedbackDialog';
import { MergeDialog } from '../components/MergeDialog';
import { PromptModal } from '../components/PromptModal';
import { host } from '../rpc';
import { useRepoStore } from '../store/repoStore';
import { copyText } from '../utils/clipboard';

/** Modal đổi tên nhánh (context menu sidebar). */
interface RenamePrompt {
  repoRoot: string;
  oldName: string;
}

/** Dialog Merge/Rebase mở từ context menu nhánh — nhánh bấm chuột là nguồn. */
interface MergePrompt {
  kind: 'merge' | 'rebase';
  repo: RepoInfo;
  target: string;
}

type SidebarTab = 'workingTree' | 'git';

export function SidebarScreen() {
  const store = useRepoStore();
  const [tab, setTab] = useState<SidebarTab>('workingTree');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamePrompt, setRenamePrompt] = useState<RenamePrompt | null>(null);
  const [mergePrompt, setMergePrompt] = useState<MergePrompt | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    void useRepoStore.getState().initSidebar();
  }, []);

  /** Context menu nhánh/tag — cùng pattern menu commit: disable ≠ ẩn, hint bên phải. */
  const openRefMenu = (event: React.MouseEvent, repo: RepoInfo, ref: RefInfo) => {
    event.preventDefault();
    const remoteShort = ref.kind === 'remote' ? ref.name.slice(ref.name.indexOf('/') + 1) : null;
    setMenu({
      x: event.clientX,
      y: event.clientY,
      entries: [
        {
          label: ref.kind === 'remote' ? 'Checkout Tracking Branch' : 'Check Out',
          hint: '⌘G',
          disabled: ref.kind === 'tag' ? false : ref.isHead,
          onClick: () =>
            void store.sidebarCheckout(repo.root, remoteShort ?? ref.name),
        },
        {
          label: 'Open History',
          onClick: () => void host.openPanel(repo.root, 'history', null, ref.name),
        },
        'sep',
        {
          // Nhánh bấm chuột là NGUỒN — merge vào nhánh đang checkout (D1).
          label: `Merge into '${repo.branch ?? 'HEAD'}'…`,
          disabled: ref.kind === 'tag' || ref.isHead,
          onClick: () => setMergePrompt({ kind: 'merge', repo, target: ref.name }),
        },
        {
          label: `Rebase '${repo.branch ?? 'HEAD'}' onto…`,
          disabled: ref.kind === 'tag' || ref.isHead,
          onClick: () => setMergePrompt({ kind: 'rebase', repo, target: ref.name }),
        },
        'sep',
        {
          label: 'Rename…',
          hint: 'F2',
          disabled: ref.kind !== 'local',
          onClick: () => setRenamePrompt({ repoRoot: repo.root, oldName: ref.name }),
        },
        {
          label: ref.kind === 'tag' ? 'Delete Tag' : 'Delete Branch',
          disabled: ref.kind === 'remote' || (ref.kind === 'local' && ref.isHead),
          onClick: () =>
            void store.sidebarGitOp(
              () =>
                ref.kind === 'tag'
                  ? host.deleteTag(repo.root, ref.name)
                  : host.deleteBranch(repo.root, ref.name),
              `Deleted '${ref.name}'.`,
            ),
        },
        'sep',
        { label: 'Copy Name', onClick: () => copyText(ref.name) },
      ],
    });
  };

  // Submodule là repo có root nằm trong root của repo khác — hiện lồng trong cha.
  const topLevelRepos = store.repos.filter(
    (repo) => !store.repos.some((other) => other !== repo && repo.root.startsWith(other.root + '/')),
  );
  const submodulesOf = (parent: RepoInfo) =>
    store.repos.filter((repo) => repo !== parent && repo.root.startsWith(parent.root + '/'));

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
          className={`sg-mode-btn${tab === 'git' ? ' active' : ''}`}
          onClick={() => setTab('git')}
        >
          Git
        </button>
      </div>

      <div className="sg-sidebar-body">
        {store.repos.length === 0 && !store.loading && (
          <p className="sg-empty small">No git repository in workspace</p>
        )}
        {tab === 'workingTree' &&
          store.repos.map((repo) => <RepoWorkingTree key={repo.root} repo={repo} />)}
        {tab === 'git' && (
          <>
            <GitSearchBar />
            {topLevelRepos.map((repo) => (
              <RepoGit
                key={repo.root}
                repo={repo}
                submodules={submodulesOf(repo)}
                onRefMenu={openRefMenu}
              />
            ))}
          </>
        )}
      </div>

      {/* Luôn nằm đáy sidebar — lối góp ý ở đâu cũng thấy, không phải tìm. */}
      <div className="sg-sidebar-footer">
        <button
          className="sg-feedback-btn"
          title="Góp ý / báo lỗi — gửi thẳng vào group Telegram của team"
          onClick={() => setFeedbackOpen(true)}
        >
          💬 Gửi góp ý
        </button>
      </div>

      {store.error !== null && <div className="sg-error">{store.error}</div>}

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {feedbackOpen && (
        <FeedbackDialog
          context={{
            screen: 'sidebar',
            // Sidebar không có repo "đang chọn"; 1 repo thì lấy luôn cho đỡ hỏi.
            repoName: store.repos.length === 1 ? store.repos[0].name : null,
            branch: store.repos.length === 1 ? store.repos[0].branch : null,
          }}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
      {renamePrompt && (
        <PromptModal
          title={`Rename branch '${renamePrompt.oldName}'`}
          placeholder="new branch name"
          actionLabel="Rename"
          initialValue={renamePrompt.oldName}
          onSubmit={(newName) =>
            void store.sidebarGitOp(
              () => host.renameBranch(renamePrompt.repoRoot, renamePrompt.oldName, newName),
              `Renamed to '${newName}'.`,
            )
          }
          onClose={() => setRenamePrompt(null)}
        />
      )}
      {mergePrompt && (
        <MergeDialog
          kind={mergePrompt.kind}
          currentBranch={mergePrompt.repo.branch}
          targets={(store.refsByRepo[mergePrompt.repo.root] ?? [])
            .filter((r) => r.kind !== 'tag' && !r.isHead)
            .map((r) => r.name)}
          initialTarget={mergePrompt.target}
          onSubmit={(target, strategy) =>
            void (mergePrompt.kind === 'merge'
              ? store.mergeBranch(mergePrompt.repo.root, target, strategy)
              : store.rebaseBranch(mergePrompt.repo.root, target))
          }
          onClose={() => setMergePrompt(null)}
        />
      )}
    </div>
  );
}

// ================= tab 1: Working Tree (Explorer-style) =================

function RepoWorkingTree({ repo }: { repo: RepoInfo }) {
  const folders = useRepoStore((s) => s.foldersByRepo[repo.root]) ?? [];
  const changes = useRepoStore((s) => s.statusByRepo[repo.root]) ?? [];
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null); // folder đang chọn

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

  const openScope = (folder: string | null) => {
    setSelected(folder);
    void host.openPanel(repo.root, 'workingTree', folder);
  };

  const changesUnder = (folder: string): number =>
    changes.filter((f) => f.path.startsWith(`${folder}/`)).length;

  const renderLevel = (parent: string | null, depth: number) =>
    childFolders(folders, parent).map((folder) => {
      const kids = childFolders(folders, folder);
      const isOpen = expanded.has(folder);
      const count = changesUnder(folder);
      return (
        <div key={folder}>
          <div
            className={`sg-tree-row${selected === folder ? ' selected' : ''}`}
            style={{ paddingLeft: 10 + depth * 12 }}
            onClick={() => openScope(folder)}
            title={`Show changes in ${folder}/`}
          >
            <span
              className={`sg-tree-chevron${kids.length === 0 ? ' hidden' : ''}${isOpen ? ' open' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                toggle(folder);
              }}
            />
            <span className="sg-tree-icon">{isOpen ? '📂' : '📁'}</span>
            <span className="sg-tree-label">{folder.slice(folder.lastIndexOf('/') + 1)}</span>
            {count > 0 && <span className="sg-count-badge">{count}</span>}
          </div>
          {isOpen && renderLevel(folder, depth + 1)}
        </div>
      );
    });

  return (
    <div className="sg-sidebar-repo">
      <div className="sg-repo-header" title={repo.root}>
        <span
          className={`sg-tree-chevron${collapsed ? '' : ' open'}`}
          onClick={() => setCollapsed((v) => !v)}
        />
        <span
          className="sg-repo-name"
          onClick={() => openScope(null)}
          title="Show all changes of this repo"
        >
          {repo.name}
        </span>
        {repo.branch !== null && <span className="sg-ref-badge">{repo.branch}</span>}
        {repo.activity !== 'none' && <span className="sg-ref-badge tag">{repo.activity}</span>}
        {changes.length > 0 && <span className="sg-count-badge">{changes.length}</span>}
      </div>
      {!collapsed && (
        <>
          <div
            className={`sg-tree-row${selected === null ? ' selected' : ''}`}
            style={{ paddingLeft: 10 }}
            onClick={() => openScope(null)}
          >
            <span className="sg-tree-chevron hidden" />
            <span className="sg-tree-icon">🗂</span>
            <span className="sg-tree-label all">All changes</span>
            {changes.length > 0 && <span className="sg-count-badge">{changes.length}</span>}
          </div>
          {renderLevel(null, 1)}
        </>
      )}
    </div>
  );
}

// ================= tab 2: Git (branches/remotes/tags/submodules) =================

/** Filter nhánh/tag — sidebar CHỈ lọc cây ref; search commit nằm trong panel History. */
function GitSearchBar() {
  const store = useRepoStore();

  return (
    <div className="sg-git-search">
      <input
        className="sg-filter-input"
        placeholder="Filter branches & tags"
        value={store.sidebarRefFilter}
        onChange={(e) => store.setSidebarRefFilter(e.target.value)}
      />
    </div>
  );
}

function RepoGit({
  repo,
  submodules,
  onRefMenu,
}: {
  repo: RepoInfo;
  submodules: RepoInfo[];
  onRefMenu(event: React.MouseEvent, repo: RepoInfo, ref: RefInfo): void;
}) {
  const allRefs = useRepoStore((s) => s.refsByRepo[repo.root]) ?? [];
  const filter = useRepoStore((s) => s.sidebarRefFilter).toLowerCase();
  const [collapsed, setCollapsed] = useState(false);

  const refs = filter === '' ? allRefs : allRefs.filter((r) => r.name.toLowerCase().includes(filter));
  const locals = refs.filter((r) => r.kind === 'local');
  const tags = refs.filter((r) => r.kind === 'tag');
  const remotes = new Map<string, RefInfo[]>();
  for (const ref of refs.filter((r) => r.kind === 'remote')) {
    const slash = ref.name.indexOf('/');
    const remote = slash === -1 ? ref.name : ref.name.slice(0, slash);
    (remotes.get(remote) ?? remotes.set(remote, []).get(remote)!).push(ref);
  }

  return (
    <div className="sg-sidebar-repo">
      <div className="sg-repo-header" title={repo.root}>
        <span
          className={`sg-tree-chevron${collapsed ? '' : ' open'}`}
          onClick={() => setCollapsed((v) => !v)}
        />
        <span className="sg-repo-name" onClick={() => void host.openPanel(repo.root, null, null)}>
          {repo.name}
        </span>
        {repo.activity !== 'none' && <span className="sg-ref-badge tag">{repo.activity}</span>}
      </div>

      {!collapsed && (
        <>
          <GitSection title="Local Branches" count={locals.length} defaultOpen>
            {locals.map((ref) => (
              <RefRow
                key={ref.fullName}
                repo={repo}
                refInfo={ref}
                display={ref.name}
                depth={2}
                onContextMenu={onRefMenu}
              />
            ))}
          </GitSection>

          {[...remotes.entries()].map(([remote, members]) => (
            <GitSection key={remote} title={`☁ ${remote}`} count={members.length}>
              {members.map((ref) => (
                <RefRow
                  key={ref.fullName}
                  repo={repo}
                  refInfo={ref}
                  display={ref.name.slice(remote.length + 1)}
                  depth={2}
                  onContextMenu={onRefMenu}
                />
              ))}
            </GitSection>
          ))}

          {tags.length > 0 && (
            <GitSection title="Tags" count={tags.length}>
              {tags.map((ref) => (
                <RefRow
                  key={ref.fullName}
                  repo={repo}
                  refInfo={ref}
                  display={ref.name}
                  depth={2}
                  onContextMenu={onRefMenu}
                />
              ))}
            </GitSection>
          )}

          {submodules.length > 0 && (
            <GitSection title="Submodules" count={submodules.length} defaultOpen>
              {submodules.map((sub) => (
                <div
                  key={sub.root}
                  className="sg-tree-row"
                  style={{ paddingLeft: 34 }}
                  onClick={() => void host.openPanel(sub.root, null, null)}
                  title={sub.root}
                >
                  <span className="sg-tree-icon">📦</span>
                  <span className="sg-tree-label">{sub.root.slice(repo.root.length + 1)}</span>
                  {sub.branch !== null && <span className="sg-ref-badge">{sub.branch}</span>}
                </div>
              ))}
            </GitSection>
          )}
        </>
      )}
    </div>
  );
}

function GitSection({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div>
      <div className="sg-tree-row section" style={{ paddingLeft: 18 }} onClick={() => setOpen(!open)}>
        <span className={`sg-tree-chevron${open ? ' open' : ''}`} />
        <span className="sg-tree-label section-title">{title}</span>
        <span className="sg-count-badge dim">{count}</span>
      </div>
      {open && children}
    </div>
  );
}

function RefRow({
  repo,
  refInfo,
  display,
  depth,
  onContextMenu,
}: {
  repo: RepoInfo;
  refInfo: RefInfo;
  display: string;
  depth: number;
  onContextMenu(event: React.MouseEvent, repo: RepoInfo, ref: RefInfo): void;
}) {
  const store = useRepoStore();
  return (
    <div
      className={`sg-tree-row${refInfo.isHead ? ' head' : ''}`}
      style={{ paddingLeft: 10 + depth * 12 }}
      title={
        refInfo.kind === 'local'
          ? `${refInfo.fullName} — click: open history · double-click: checkout`
          : `${refInfo.fullName} — click: open history`
      }
      onClick={() => void host.openPanel(repo.root, 'history', null, refInfo.name)}
      onContextMenu={(e) => onContextMenu(e, repo, refInfo)}
      onDoubleClick={
        refInfo.kind === 'local' ? () => void store.sidebarCheckout(repo.root, refInfo.name) : undefined
      }
    >
      <span className="sg-tree-icon">{refInfo.kind === 'tag' ? '🏷' : '⎇'}</span>
      <span className="sg-tree-label">
        {refInfo.isHead ? '▶ ' : ''}
        {display}
      </span>
    </div>
  );
}
