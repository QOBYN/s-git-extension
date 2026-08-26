// Màn Working Tree (ui-analysis A + F): 2 khung file TÁCH BIỆT (trên = unstaged,
// dưới = staged — stage/unstage là file di chuyển giữa 2 khung), panel commit
// luôn hiện bên phải, banner trạng thái merging/rebasing (D2), diff dưới đáy.

import { useState } from 'react';
import type { FileChange } from '../../shared/types';
import { ContextMenu, type MenuState } from '../components/ContextMenu';
import { DiffPanel } from '../components/DiffPanel';
import { Splitter } from '../components/Splitter';
import { useLayoutStore } from '../store/layoutStore';
import { useRepoStore, type WorkingSelection } from '../store/repoStore';
import { copyText } from '../utils/clipboard';

export function WorkingTreeScreen() {
  const store = useRepoStore();
  const layout = useLayoutStore();
  const status = store.status;
  const [menu, setMenu] = useState<MenuState | null>(null);

  /** Context menu file Working Tree — mục G: index / xem / huỷ / copy / OS. */
  const openFileMenu = (
    event: React.MouseEvent,
    file: FileChange,
    area: WorkingSelection['area'],
  ) => {
    event.preventDefault();
    setMenu({
      x: event.clientX,
      y: event.clientY,
      entries: [
        {
          label: 'Stage',
          hint: '⌘T',
          disabled: area !== 'unstaged',
          onClick: () => void store.stageFiles([file.path]),
        },
        {
          label: 'Unstage',
          hint: '⇧⌘T',
          disabled: area !== 'staged',
          onClick: () => void store.unstageFiles([file.path]),
        },
        {
          label: 'Discard…',
          hint: '⌘Z',
          disabled: area !== 'unstaged' || file.untracked,
          onClick: () => void store.discardFiles([file.path]),
        },
        'sep',
        { label: 'File Log', hint: '⌘L', onClick: () => store.openFileLogFor(file.path) },
        { label: 'Open in Editor', onClick: () => store.openFileInEditor(file.path) },
        { label: 'Reveal in Finder', onClick: () => store.revealFileInOS(file.path) },
        'sep',
        { label: 'Copy Name', onClick: () => copyText(file.path.split('/').pop() ?? file.path) },
        { label: 'Copy Relative Path', onClick: () => copyText(file.path) },
      ],
    });
  };

  // Scope thư mục từ sidebar (A3): chỉ hiện change dưới folder đang chọn.
  const inScope = (path: string): boolean =>
    store.folderScope === null || path.startsWith(`${store.folderScope}/`);

  const unstaged = (status?.files ?? []).filter(
    (f) => inScope(f.path) && (f.unstaged !== null || f.untracked || f.conflicted),
  );
  const staged = (status?.files ?? []).filter(
    (f) => inScope(f.path) && f.staged !== null && !f.conflicted,
  );

  return (
    <>
      <div className="sg-main">
        <div className="sg-wt-left">
          {status && status.activity !== 'none' && <ActivityBanner activity={status.activity} />}

          {store.folderScope !== null && (
            <div className="sg-scope-bar">
              <span>
                Showing changes in <b>{store.folderScope}/</b>
              </span>
              <span className="sg-diff-spacer" />
              <button className="sg-tool" onClick={() => store.setFolderScope(null)}>
                ✕ Show all
              </button>
            </div>
          )}

          <FilePane
            title={`Changes (${unstaged.length})`}
            files={unstaged}
            area="unstaged"
            emptyText="No unstaged changes"
            onFileMenu={openFileMenu}
          />
          <FilePane
            title={`Staged (${staged.length})`}
            files={staged}
            area="staged"
            emptyText="No staged files"
            onFileMenu={openFileMenu}
          />
        </div>

        <Splitter orientation="vertical" invert onResize={(d) => layout.resize('detailWidth', d)} />
        <CommitPanel
          branch={status?.branch ?? null}
          canCommit={staged.length > 0}
          width={layout.detailWidth}
        />
      </div>

      {store.workingSelection && (
        <>
          <Splitter
            orientation="horizontal"
            invert
            onResize={(d) => layout.resize('diffHeight', d)}
          />
          <DiffPanel
            path={store.workingSelection.file.path}
            height={layout.diffHeight}
            kindLabel={kindLabelOf(store.workingSelection)}
            diff={store.workingDiff}
            loading={store.workingDiffLoading}
            // Stage hunk chỉ với diff unstaged của file đã track, không conflict;
            // unstage hunk với diff staged (spec 2.1).
            onStageHunk={
              store.workingSelection.area === 'unstaged' &&
              !store.workingSelection.file.untracked &&
              !store.workingSelection.file.conflicted
                ? (change) => void store.stageCurrentHunk(change)
                : undefined
            }
            onUnstageHunk={
              store.workingSelection.area === 'staged'
                ? (change) => void store.unstageCurrentHunk(change)
                : undefined
            }
            // Revert hunk + sửa trực tiếp: chỉ với diff unstaged (pane phải =
            // file thật trên đĩa); pane phải của diff staged là INDEX, sửa vô nghĩa.
            onRevertHunk={
              store.workingSelection.area === 'unstaged' &&
              !store.workingSelection.file.untracked &&
              !store.workingSelection.file.conflicted
                ? (change) => void store.revertCurrentHunk(change)
                : undefined
            }
            editable={store.workingSelection.area === 'unstaged'}
            onSaveContent={(content) => void store.saveWorkingEdit(content)}
          />
        </>
      )}

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </>
  );
}

/** Banner trạng thái đặc biệt + lối thoát 1 click (ui-analysis D2, spec 2.4). */
function ActivityBanner({ activity }: { activity: string }) {
  const store = useRepoStore();
  return (
    <div className="sg-activity-banner">
      <span>
        The working tree is in <b>{activity}</b>-state.
      </span>
      <span className="sg-diff-spacer" />
      {(activity === 'rebasing' || activity === 'cherry-picking') && (
        <button className="sg-banner-btn" onClick={() => void store.continueOperation()}>
          Continue
        </button>
      )}
      <button className="sg-banner-btn" onClick={() => void store.abortOperation()}>
        Abort
      </button>
    </div>
  );
}

function FilePane({
  title,
  files,
  area,
  emptyText,
  onFileMenu,
}: {
  title: string;
  files: FileChange[];
  area: WorkingSelection['area'];
  emptyText: string;
  onFileMenu(event: React.MouseEvent, file: FileChange, area: WorkingSelection['area']): void;
}) {
  const store = useRepoStore();
  const selection = store.workingSelection;

  return (
    <div className="sg-file-pane">
      <div className="sg-file-pane-header">
        <span>{title}</span>
        <span className="sg-diff-spacer" />
        {files.length > 0 && area === 'unstaged' && (
          <button
            className="sg-tool"
            onClick={() => void store.stageFiles(files.map((f) => f.path))}
          >
            Stage All
          </button>
        )}
        {files.length > 0 && area === 'staged' && (
          <button
            className="sg-tool"
            onClick={() => void store.unstageFiles(files.map((f) => f.path))}
          >
            Unstage All
          </button>
        )}
      </div>
      <div className="sg-file-pane-body">
        {files.length === 0 && <p className="sg-empty small">{emptyText}</p>}
        {files.map((file) => (
          <WorkingFileRow
            key={`${area}:${file.path}`}
            file={file}
            area={area}
            onContextMenu={(e) => onFileMenu(e, file, area)}
          />
        ))}
      </div>
    </div>
  );
}

function WorkingFileRow({
  file,
  area,
  onContextMenu,
}: {
  file: FileChange;
  area: WorkingSelection['area'];
  onContextMenu(event: React.MouseEvent): void;
}) {
  const store = useRepoStore();
  const selected =
    store.workingSelection?.file.path === file.path && store.workingSelection.area === area;
  const letter = statusLetter(file, area);

  return (
    <div
      className={`sg-file-row${selected ? ' selected' : ''}`}
      onClick={() => void store.selectWorkingFile({ file, area })}
      onContextMenu={onContextMenu}
      title={file.origPath ? `${file.origPath} → ${file.path}` : file.path}
    >
      <span className={`sg-file-kind ${letter.className}`}>{letter.char}</span>
      <span className="sg-file-name">{fileName(file.path)}</span>
      <span className="sg-file-dir">{dirName(file.path)}</span>
      <span className="sg-row-actions">
        {area === 'unstaged' ? (
          <>
            <button
              className="sg-tool"
              title="Stage"
              onClick={(e) => {
                e.stopPropagation();
                void store.stageFiles([file.path]);
              }}
            >
              +
            </button>
            {!file.untracked && (
              <button
                className="sg-tool"
                title="Discard changes"
                onClick={(e) => {
                  e.stopPropagation();
                  void store.discardFiles([file.path]);
                }}
              >
                ↩
              </button>
            )}
          </>
        ) : (
          <button
            className="sg-tool"
            title="Unstage"
            onClick={(e) => {
              e.stopPropagation();
              void store.unstageFiles([file.path]);
            }}
          >
            −
          </button>
        )}
      </span>
    </div>
  );
}

/** Ô commit luôn hiện (điểm ăn tiền của SmartGit so với Git mặc định — ui-analysis A5). */
function CommitPanel({
  branch,
  canCommit,
  width,
}: {
  branch: string | null;
  canCommit: boolean;
  width: number;
}) {
  const store = useRepoStore();
  const [amend, setAmend] = useState(false);

  return (
    <aside className="sg-commit-panel" style={{ width }}>
      <div className="sg-commit-target">
        Commit to: <b>{branch ?? '(detached HEAD)'}</b>
      </div>
      <textarea
        className="sg-commit-message"
        placeholder="Enter commit message here."
        value={store.commitMessage}
        onChange={(e) => store.setCommitMessage(e.target.value)}
      />
      <div className="sg-commit-actions">
        <label className="sg-checkbox">
          <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} />
          Amend last commit
        </label>
        <span className="sg-diff-spacer" />
        <button
          className="sg-commit-btn"
          disabled={store.commitMessage.trim() === '' || (!canCommit && !amend)}
          onClick={() => void store.commitNow({ amend })}
        >
          Commit
        </button>
      </div>
    </aside>
  );
}

/** Nhãn trạng thái cho header diff: "Changes of x (Modified)" — ui-analysis D3. */
function kindLabelOf(selection: WorkingSelection): string {
  const { file, area } = selection;
  if (file.conflicted) {
    return 'Conflict';
  }
  if (file.untracked) {
    return 'Untracked';
  }
  const kind = area === 'staged' ? file.staged : file.unstaged;
  const label = kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Modified';
  return area === 'staged' ? `${label}, staged` : label;
}

function statusLetter(
  file: FileChange,
  area: WorkingSelection['area'],
): { char: string; className: string } {
  if (file.conflicted) {
    return { char: 'U', className: 'kind-deleted' }; // conflict nổi bật màu đỏ
  }
  if (file.untracked) {
    return { char: '?', className: 'kind-added' };
  }
  const kind = area === 'staged' ? file.staged : file.unstaged;
  const char = kind ? kind[0]!.toUpperCase() : ' ';
  return { char, className: `kind-${kind ?? 'modified'}` };
}

const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const dirName = (path: string): string => {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
};
