// Sidebar VSCode — 2 tab:
//  1. Working Tree: cây thư mục kiểu EXPLORER (chevron, indent, chọn được, badge
//     số change per folder) → click = panel mở Working Tree scope theo folder.
//  2. Git: mỗi repo là 1 cây — Local Branches / Remotes / Tags / Submodules,
//     section thu gọn được; filter nhánh + search commit nằm ngay đầu tab
//     (phần filter/search của panel History dời ra đây).
// Mọi click đều mở/reveal panel qua host.openPanel — không cần chạy lệnh tay.

import { useEffect, useState } from 'react';
import type { RefInfo, RemoteInfo, RepoInfo } from '../../shared/types';
import { childFolders } from '../../shared/folders';
import { CheckoutDialog } from '../components/CheckoutDialog';
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog';
import { ContextMenu, type MenuState } from '../components/ContextMenu';
import { DirtyGuardDialog } from '../components/DirtyGuardDialog';
import { ForceDeleteDialog } from '../components/ForceDeleteDialog';
import { MergeDialog } from '../components/MergeDialog';
import { PromptModal } from '../components/PromptModal';
import { RemoteDialog } from '../components/RemoteDialog';
import { IS_ORCA } from '../env';
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

/** Dialog Add/Edit Remote — remote null = thêm mới. */
interface RemotePrompt {
  repo: RepoInfo;
  remote: RemoteInfo | null;
}

type SidebarTab = 'workingTree' | 'git';

// Nhãn menu theo OS như VSCode ("Reveal in Finder" chỉ đúng trên macOS).
const IS_MAC = navigator.userAgent.includes('Mac');

interface Props {
  /**
   * Orca: cây nằm chung panel với MainScreen — banner lỗi và popup Dirty Guard
   * (đọc chung store) để MainScreen hiện, tránh hiện 2 lần.
   */
  embedded?: boolean;
}

export function SidebarScreen({ embedded = false }: Props = {}) {
  const store = useRepoStore();
  const [tab, setTab] = useState<SidebarTab>('workingTree');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamePrompt, setRenamePrompt] = useState<RenamePrompt | null>(null);
  /** Modal đổi tên thư mục (context menu tab Working Tree). */
  const [folderRenamePrompt, setFolderRenamePrompt] = useState<{
    repoRoot: string;
    folder: string;
  } | null>(null);
  const [mergePrompt, setMergePrompt] = useState<MergePrompt | null>(null);
  const [remotePrompt, setRemotePrompt] = useState<RemotePrompt | null>(null);
  /** Orca: xác nhận xoá thư mục (VSCode hỏi bằng modal phía host). */
  const [deletePrompt, setDeletePrompt] = useState<{ repoRoot: string; folder: string } | null>(
    null,
  );
  /** Popup Checkout (double-click nhánh / menu Check Out) — nhánh + repo đích. */
  const [checkoutPrompt, setCheckoutPrompt] = useState<{ repo: RepoInfo; ref: string } | null>(
    null,
  );

  useEffect(() => {
    void useRepoStore.getState().initSidebar();
  }, []);

  /** Mở popup Checkout: refetch status trước để đếm change chưa commit chính xác. */
  const openCheckoutPrompt = (repo: RepoInfo, ref: string) => {
    void store.loadAllStatuses();
    setCheckoutPrompt({ repo, ref });
  };

  /**
   * Context menu folder tab Working Tree — các action folder quen thuộc của
   * Explorer VSCode (reveal/terminal/find/copy path/rename/delete). folder null =
   * header repo: rename/delete/copy-relative bị mờ (không thao tác lên root từ đây).
   */
  const openFolderMenu = (event: React.MouseEvent, repo: RepoInfo, folder: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    const rel = folder ?? '';
    setMenu({
      x: event.clientX,
      y: event.clientY,
      entries: [
        {
          label: IS_MAC ? 'Reveal in Finder' : 'Reveal in File Explorer',
          onClick: () => void host.revealInOS(repo.root, rel),
        },
        // Orca chưa có API mở terminal / Search view cho plugin — ẩn 2 mục này.
        ...(IS_ORCA
          ? []
          : ([
              {
                label: 'Open in Integrated Terminal',
                onClick: () => void host.openInTerminal(repo.root, rel),
              },
              'sep',
              { label: 'Find in Folder…', onClick: () => void host.findInFolder(repo.root, rel) },
            ] as const)),
        'sep',
        {
          label: 'Copy Path',
          onClick: () => copyText(folder === null ? repo.root : `${repo.root}/${folder}`),
        },
        {
          label: 'Copy Relative Path',
          disabled: folder === null,
          onClick: () => copyText(rel),
        },
        'sep',
        {
          label: 'Rename…',
          disabled: folder === null,
          onClick: () => {
            if (folder !== null) {
              setFolderRenamePrompt({ repoRoot: repo.root, folder });
            }
          },
        },
        {
          label: 'Delete',
          disabled: folder === null,
          onClick: () => {
            if (folder === null) {
              return;
            }
            if (IS_ORCA) {
              setDeletePrompt({ repoRoot: repo.root, folder });
            } else {
              void store.deleteFolder(repo.root, folder);
            }
          },
        },
      ],
    });
  };

  /** Context menu nhánh/tag — cùng pattern menu commit: disable ≠ ẩn, hint bên phải. */
  const openRefMenu = (event: React.MouseEvent, repo: RepoInfo, ref: RefInfo) => {
    event.preventDefault();
    const remoteShort = ref.kind === 'remote' ? ref.name.slice(ref.name.indexOf('/') + 1) : null;
    setMenu({
      x: event.clientX,
      y: event.clientY,
      entries: [
        {
          label: ref.kind === 'remote' ? 'Checkout Tracking Branch…' : 'Check Out…',
          hint: '⌘G',
          disabled: ref.kind === 'tag' ? false : ref.isHead,
          onClick: () => openCheckoutPrompt(repo, remoteShort ?? ref.name),
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
            void (ref.kind === 'tag'
              ? store.sidebarGitOp(
                  () => host.deleteTag(repo.root, ref.name),
                  `Deleted '${ref.name}'.`,
                )
              : // Nhánh chưa merge: -d bị git chê → store mở popup Force Delete.
                store.deleteBranchSafe(repo.root, ref.name)),
        },
        'sep',
        { label: 'Copy Name', onClick: () => copyText(ref.name) },
      ],
    });
  };

  /** Context menu header repo (tab Git) — thêm remote mới cho repo đó. */
  const openRepoGitMenu = (event: React.MouseEvent, repo: RepoInfo) => {
    event.preventDefault();
    setMenu({
      x: event.clientX,
      y: event.clientY,
      entries: [
        { label: 'Add Remote…', onClick: () => setRemotePrompt({ repo, remote: null }) },
      ],
    });
  };

  /** Context menu header 1 remote (☁ origin) — sửa tên/URL hoặc thêm remote khác. */
  const openRemoteMenu = (event: React.MouseEvent, repo: RepoInfo, remote: RemoteInfo) => {
    event.preventDefault();
    setMenu({
      x: event.clientX,
      y: event.clientY,
      entries: [
        { label: `Edit Remote '${remote.name}'…`, onClick: () => setRemotePrompt({ repo, remote }) },
        { label: 'Add Remote…', onClick: () => setRemotePrompt({ repo, remote: null }) },
        'sep',
        { label: 'Copy URL', disabled: remote.url === '', onClick: () => copyText(remote.url) },
      ],
    });
  };

  // Submodule là repo có root nằm trong root của repo khác — hiện lồng trong cha.
  const topLevelRepos = store.repos.filter(
    (repo) => !store.repos.some((other) => other !== repo && repo.root.startsWith(other.root + '/')),
  );

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
          store.repos.map((repo) => (
            <RepoWorkingTree key={repo.root} repo={repo} onFolderMenu={openFolderMenu} />
          ))}
        {tab === 'git' && (
          <>
            <GitSearchBar />
            {topLevelRepos.map((repo) => (
              <RepoGit
                key={repo.root}
                repo={repo}
                allRepos={store.repos}
                onRefMenu={openRefMenu}
                onRepoMenu={openRepoGitMenu}
                onRemoteMenu={openRemoteMenu}
                onCheckout={openCheckoutPrompt}
              />
            ))}
          </>
        )}
      </div>

      {!embedded && store.error !== null && <div className="sg-error">{store.error}</div>}

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {deletePrompt !== null && (
        <ConfirmDeleteDialog
          path={deletePrompt.folder}
          onConfirm={() => void store.deleteFolder(deletePrompt.repoRoot, deletePrompt.folder)}
          onClose={() => setDeletePrompt(null)}
        />
      )}
      {checkoutPrompt !== null && (
        <CheckoutDialog
          description={
            <>
              Check out <b>{checkoutPrompt.ref}</b> — repo <b>{checkoutPrompt.repo.name}</b>
              {checkoutPrompt.repo.branch !== null && (
                <>
                  {' '}
                  (đang ở <b>{checkoutPrompt.repo.branch}</b>)
                </>
              )}
            </>
          }
          targets={[
            {
              value: checkoutPrompt.ref,
              label: `‘${checkoutPrompt.ref}’`,
              detail: 'git checkout',
            },
          ]}
          changedCount={(store.statusByRepo[checkoutPrompt.repo.root] ?? []).length}
          onSubmit={(ref, dirty) => void store.checkoutCommit(checkoutPrompt.repo.root, ref, dirty)}
          onClose={() => setCheckoutPrompt(null)}
        />
      )}
      {/* Merge/rebase từ sidebar cũng có thể bị chặn vì working tree bẩn. */}
      {!embedded && store.dirtyGuard !== null && (
        <DirtyGuardDialog
          opLabel={store.dirtyGuard.opLabel}
          message={store.dirtyGuard.message}
          onStashRetry={() => void store.retryDirtyGuardWithStash()}
          onGoCommit={() => store.dirtyGuardGoCommit()}
          onClose={() => store.dismissDirtyGuard()}
        />
      )}
      {store.forceDeletePrompt !== null && (
        <ForceDeleteDialog
          branch={store.forceDeletePrompt.branch}
          message={store.forceDeletePrompt.message}
          onForceDelete={() => void store.confirmForceDeleteBranch()}
          onClose={() => store.dismissForceDeleteBranch()}
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
      {folderRenamePrompt && (
        <PromptModal
          title={`Rename folder '${folderRenamePrompt.folder.slice(
            folderRenamePrompt.folder.lastIndexOf('/') + 1,
          )}'`}
          placeholder="new folder name"
          actionLabel="Rename"
          initialValue={folderRenamePrompt.folder.slice(
            folderRenamePrompt.folder.lastIndexOf('/') + 1,
          )}
          onSubmit={(newName) =>
            void store.renameFolder(folderRenamePrompt.repoRoot, folderRenamePrompt.folder, newName)
          }
          onClose={() => setFolderRenamePrompt(null)}
        />
      )}
      {remotePrompt && (
        <RemoteDialog
          title={
            remotePrompt.remote === null
              ? `Add remote to '${remotePrompt.repo.name}'`
              : `Edit remote '${remotePrompt.remote.name}'`
          }
          actionLabel={remotePrompt.remote === null ? 'Add Remote' : 'Save'}
          initialName={remotePrompt.remote?.name}
          initialUrl={remotePrompt.remote?.url}
          onSubmit={(name, url) => {
            const old = remotePrompt.remote;
            void store.sidebarGitOp(
              () =>
                old === null
                  ? host.addRemote(remotePrompt.repo.root, name, url)
                  : host.editRemote(remotePrompt.repo.root, old.name, name, url),
              old === null ? `Added remote '${name}'.` : `Updated remote '${name}'.`,
            );
          }}
          onClose={() => setRemotePrompt(null)}
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

function RepoWorkingTree({
  repo,
  onFolderMenu,
}: {
  repo: RepoInfo;
  /** Chuột phải folder/header → menu action kiểu Explorer (folder null = root repo). */
  onFolderMenu(event: React.MouseEvent, repo: RepoInfo, folder: string | null): void;
}) {
  const folders = useRepoStore((s) => s.foldersByRepo[repo.root]) ?? [];
  const changes = useRepoStore((s) => s.statusByRepo[repo.root]) ?? [];
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // Folder đang chọn: null = all changes (header), undefined = chưa chọn gì.
  const [selected, setSelected] = useState<string | null | undefined>(undefined);

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
            onContextMenu={(e) => onFolderMenu(e, repo, folder)}
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
      {/* Header kiêm luôn "All changes" — click tên repo là xem mọi change,
          không cần dòng All changes riêng gây thắc mắc. */}
      <div
        className={`sg-repo-header${selected === null ? ' selected' : ''}`}
        title={`${repo.root} — click: show all changes`}
        onClick={() => openScope(null)}
        onContextMenu={(e) => onFolderMenu(e, repo, null)}
      >
        <span
          className={`sg-tree-chevron${collapsed ? '' : ' open'}`}
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed((v) => !v);
          }}
        />
        <span className="sg-repo-name">{repo.name}</span>
        {repo.branch !== null && <span className="sg-ref-badge">{repo.branch}</span>}
        {repo.activity !== 'none' && <span className="sg-ref-badge tag">{repo.activity}</span>}
        {changes.length > 0 && <span className="sg-count-badge">{changes.length}</span>}
      </div>
      {!collapsed && renderLevel(null, 1)}
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
      {/* data-tip = tooltip CSS hiện ngay khi hover (title mặc định chậm ~1s). */}
      <button
        className="sg-tree-toolbar-btn"
        data-tip="Expand all — mở hết cây"
        aria-label="Expand all"
        onClick={() => store.setSidebarTreeOpen(true)}
      >
        <ExpandAllIcon />
      </button>
      <button
        className="sg-tree-toolbar-btn"
        data-tip="Collapse all — đóng hết cây"
        aria-label="Collapse all"
        onClick={() => store.setSidebarTreeOpen(false)}
      >
        <CollapseAllIcon />
      </button>
    </div>
  );
}

// Icon vẽ inline theo currentColor (cùng lý do FileTreeList: CSP chặn tài
// nguyên ngoài, codicon font không expose ra app) — double chevron kiểu
// fold/unfold của VSCode.

/** 2 chevron xuống = mở toàn bộ cây. */
function ExpandAllIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M3.5 3.5 8 8l4.5-4.5" />
      <path d="M3.5 8.5 8 13l4.5-4.5" />
    </svg>
  );
}

/** 2 chevron lên = đóng toàn bộ cây. */
function CollapseAllIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M3.5 7.5 8 3l4.5 4.5" />
      <path d="M3.5 12.5 8 8l4.5 4.5" />
    </svg>
  );
}

/**
 * Nghe lệnh Expand/Collapse All từ GitSearchBar: áp trạng thái của lệnh mỗi khi
 * seq đổi (seq 0 = chưa bấm). Chạy cả lúc mount để node vừa hiện ra do cha mở
 * cũng nghe theo — nhờ vậy Expand All lan xuống hết các tầng submodule.
 */
function useSidebarTreeCmd(apply: (open: boolean) => void) {
  const cmd = useRepoStore((s) => s.sidebarTreeCmd);
  useEffect(() => {
    if (cmd.seq > 0) apply(cmd.open);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy theo lệnh, không theo identity của apply
  }, [cmd]);
}

/** Menu context dùng chung cho cả repo cha lẫn submodule — nhận repo qua tham số. */
interface RepoGitMenus {
  onRefMenu(event: React.MouseEvent, repo: RepoInfo, ref: RefInfo): void;
  onRepoMenu(event: React.MouseEvent, repo: RepoInfo): void;
  onRemoteMenu(event: React.MouseEvent, repo: RepoInfo, remote: RemoteInfo): void;
  /** Double-click nhánh local / menu Check Out — mở popup Checkout xác nhận. */
  onCheckout(repo: RepoInfo, ref: string): void;
}

/** Submodule TRỰC TIẾP của `parent`: nằm trong parent và không có repo nào chen giữa. */
function directSubmodulesOf(parent: RepoInfo, allRepos: RepoInfo[]): RepoInfo[] {
  return allRepos.filter(
    (sub) =>
      sub.root.startsWith(parent.root + '/') &&
      !allRepos.some(
        (mid) =>
          mid !== parent &&
          mid !== sub &&
          mid.root.startsWith(parent.root + '/') &&
          sub.root.startsWith(mid.root + '/'),
      ),
  );
}

function RepoGit({
  repo,
  allRepos,
  ...menus
}: {
  repo: RepoInfo;
  allRepos: RepoInfo[];
} & RepoGitMenus) {
  const [collapsed, setCollapsed] = useState(false);
  useSidebarTreeCmd((open) => setCollapsed(!open));

  return (
    <div className="sg-sidebar-repo">
      <div
        className="sg-repo-header"
        title={repo.root}
        onContextMenu={(e) => menus.onRepoMenu(e, repo)}
      >
        <span
          className={`sg-tree-chevron${collapsed ? '' : ' open'}`}
          onClick={() => setCollapsed((v) => !v)}
        />
        <span className="sg-repo-name" onClick={() => void host.openPanel(repo.root, null, null)}>
          {repo.name}
        </span>
        {repo.activity !== 'none' && <span className="sg-ref-badge tag">{repo.activity}</span>}
      </div>

      {!collapsed && <RepoGitSections repo={repo} allRepos={allRepos} depth={0} {...menus} />}
    </div>
  );
}

/**
 * Các section Local Branches / Remotes / Tags / Submodules của 1 repo — dùng cho
 * cả repo cha (depth 0) lẫn submodule lồng bên trong (depth tăng dần); submodule
 * đệ quy qua SubmoduleGit nên sub-trong-sub cũng có cây đầy đủ.
 */
function RepoGitSections({
  repo,
  allRepos,
  depth,
  ...menus
}: {
  repo: RepoInfo;
  allRepos: RepoInfo[];
  depth: number;
} & RepoGitMenus) {
  const allRefs = useRepoStore((s) => s.refsByRepo[repo.root]) ?? [];
  const declaredRemotes = useRepoStore((s) => s.remotesByRepo[repo.root]) ?? [];
  const filter = useRepoStore((s) => s.sidebarRefFilter).toLowerCase();

  const refs = filter === '' ? allRefs : allRefs.filter((r) => r.name.toLowerCase().includes(filter));
  const locals = refs.filter((r) => r.kind === 'local');
  const tags = refs.filter((r) => r.kind === 'tag');
  // Nhóm theo remote: khởi tạo từ danh sách khai báo để remote CHƯA fetch
  // (chưa có ref nào) vẫn hiện — vừa thêm xong là thấy ngay, chuột phải sửa được.
  const remotes = new Map<string, RefInfo[]>(declaredRemotes.map((r) => [r.name, []]));
  for (const ref of refs.filter((r) => r.kind === 'remote')) {
    const slash = ref.name.indexOf('/');
    const remote = slash === -1 ? ref.name : ref.name.slice(0, slash);
    (remotes.get(remote) ?? remotes.set(remote, []).get(remote)!).push(ref);
  }
  const remoteInfoOf = (name: string): RemoteInfo =>
    declaredRemotes.find((r) => r.name === name) ?? { name, url: '' };

  const submodules = directSubmodulesOf(repo, allRepos);

  return (
    <>
      <GitSection title="Local Branches" count={locals.length} depth={depth} defaultOpen>
        {locals.map((ref) => (
          <RefRow
            key={ref.fullName}
            repo={repo}
            refInfo={ref}
            display={ref.name}
            depth={depth + 2}
            onContextMenu={menus.onRefMenu}
            onCheckout={menus.onCheckout}
          />
        ))}
      </GitSection>

      {[...remotes.entries()]
        // Đang filter thì ẩn remote không có ref khớp (giữ danh sách gọn).
        .filter(([, members]) => filter === '' || members.length > 0)
        .map(([remote, members]) => (
          <GitSection
            key={remote}
            title={`☁ ${remote}`}
            count={members.length}
            depth={depth}
            onContextMenu={(e) => menus.onRemoteMenu(e, repo, remoteInfoOf(remote))}
          >
            {members.map((ref) => (
              <RefRow
                key={ref.fullName}
                repo={repo}
                refInfo={ref}
                display={ref.name.slice(remote.length + 1)}
                depth={depth + 2}
                onContextMenu={menus.onRefMenu}
            onCheckout={menus.onCheckout}
              />
            ))}
          </GitSection>
        ))}

      {tags.length > 0 && (
        <GitSection title="Tags" count={tags.length} depth={depth}>
          {tags.map((ref) => (
            <RefRow
              key={ref.fullName}
              repo={repo}
              refInfo={ref}
              display={ref.name}
              depth={depth + 2}
              onContextMenu={menus.onRefMenu}
            onCheckout={menus.onCheckout}
            />
          ))}
        </GitSection>
      )}

      {submodules.length > 0 && (
        <GitSection title="Submodules" count={submodules.length} depth={depth} defaultOpen>
          {submodules.map((sub) => (
            <SubmoduleGit
              key={sub.root}
              repo={sub}
              parentRoot={repo.root}
              allRepos={allRepos}
              depth={depth + 1}
              {...menus}
            />
          ))}
        </GitSection>
      )}
    </>
  );
}

/**
 * 1 submodule trong section Submodules: dòng 📦 (click mở panel, chuột phải =
 * menu repo — Add Remote…) + cây git riêng của nó (nhánh/remote/tag) để thao tác
 * checkout/merge/fetch… thẳng từ sidebar, không phải mở panel trước.
 */
function SubmoduleGit({
  repo,
  parentRoot,
  allRepos,
  depth,
  ...menus
}: {
  repo: RepoInfo;
  parentRoot: string;
  allRepos: RepoInfo[];
  depth: number;
} & RepoGitMenus) {
  const [open, setOpen] = useState(false);
  useSidebarTreeCmd(setOpen);

  return (
    <div>
      <div
        className="sg-tree-row"
        style={{ paddingLeft: 18 + depth * 12 }}
        title={`${repo.root} — click: mở panel · chevron: xem nhánh/remote`}
        onClick={() => void host.openPanel(repo.root, null, null)}
        onContextMenu={(e) => menus.onRepoMenu(e, repo)}
      >
        <span
          className={`sg-tree-chevron${open ? ' open' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        />
        <span className="sg-tree-icon">📦</span>
        <span className="sg-tree-label">{repo.root.slice(parentRoot.length + 1)}</span>
        {repo.branch !== null && <span className="sg-ref-badge">{repo.branch}</span>}
        {repo.activity !== 'none' && <span className="sg-ref-badge tag">{repo.activity}</span>}
      </div>
      {open && <RepoGitSections repo={repo} allRepos={allRepos} depth={depth + 1} {...menus} />}
    </div>
  );
}

function GitSection({
  title,
  count,
  depth = 0,
  defaultOpen,
  onContextMenu,
  children,
}: {
  title: string;
  count: number;
  /** Mức lồng: section của submodule thụt vào theo depth (12px/mức). */
  depth?: number;
  defaultOpen?: boolean;
  onContextMenu?(event: React.MouseEvent): void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  useSidebarTreeCmd(setOpen);
  return (
    <div>
      <div
        className="sg-tree-row section"
        style={{ paddingLeft: 18 + depth * 12 }}
        onClick={() => setOpen(!open)}
        onContextMenu={onContextMenu}
      >
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
  onCheckout,
}: {
  repo: RepoInfo;
  refInfo: RefInfo;
  display: string;
  depth: number;
  onContextMenu(event: React.MouseEvent, repo: RepoInfo, ref: RefInfo): void;
  /** Double-click nhánh local (chưa checkout) — mở popup Checkout xác nhận. */
  onCheckout(repo: RepoInfo, ref: string): void;
}) {
  // Nhánh đang checkout thì double-click là no-op — không mở popup thừa.
  const canCheckout = refInfo.kind === 'local' && !refInfo.isHead;
  return (
    <div
      className={`sg-tree-row${refInfo.isHead ? ' head' : ''}`}
      style={{ paddingLeft: 10 + depth * 12 }}
      title={
        canCheckout
          ? `${refInfo.fullName} — click: open history · double-click: checkout`
          : `${refInfo.fullName} — click: open history`
      }
      onClick={() => void host.openPanel(repo.root, 'history', null, refInfo.name)}
      onContextMenu={(e) => onContextMenu(e, repo, refInfo)}
      onDoubleClick={canCheckout ? () => onCheckout(repo, refInfo.name) : undefined}
    >
      <span className="sg-tree-icon">{refInfo.kind === 'tag' ? '🏷' : '⎇'}</span>
      <span className="sg-tree-label">
        {refInfo.isHead ? '▶ ' : ''}
        {display}
      </span>
    </div>
  );
}
