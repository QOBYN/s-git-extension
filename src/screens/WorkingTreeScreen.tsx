// Màn Working Tree (ui-analysis A + F): 2 khung file TÁCH BIỆT (trên = unstaged,
// dưới = staged — stage/unstage là file di chuyển giữa 2 khung), panel commit
// luôn hiện bên phải, banner trạng thái merging/rebasing (D2), diff dưới đáy.

import { useEffect, useRef, useState } from 'react';
import type { FileChange } from '../../shared/types';
import { ContextMenu, type MenuState } from '../components/ContextMenu';
import { DiffPanel } from '../components/DiffPanel';
import { FileListModeToggle, FileTreeList, treeRowPadding } from '../components/FileTreeList';
import { Splitter } from '../components/Splitter';
import { useLayoutStore } from '../store/layoutStore';
import { useRepoStore, type WorkingSelection } from '../store/repoStore';
import { useViewPrefs, type ChangesFilter } from '../store/viewPrefsStore';
import { copyText } from '../utils/clipboard';

export function WorkingTreeScreen() {
  const store = useRepoStore();
  const layout = useLayoutStore();
  const status = store.status;
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Filter "chỉ hiện conflict" khi merge/rebase — bật tắt bằng nút trên pane
  // Changes; tự vô hiệu khi đã resolve hết (không cần reset tay).
  const [conflictsOnly, setConflictsOnly] = useState(false);
  // Ô search lọc file theo tên/path (nút phễu) — null = đóng, '' = mở chưa gõ.
  // Áp cho CẢ 2 pane (unstaged + staged) để tìm nhanh khi danh sách dài.
  const [fileSearch, setFileSearch] = useState<string | null>(null);
  // Chế độ wildcard (nút [*.]): token hiểu là pattern kiểu *.json / src/**.
  const [patternMode, setPatternMode] = useState(false);

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
          disabled: area !== 'unstaged' || file.ignored === true || !hasChange(file),
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
          disabled:
            area !== 'unstaged' || file.untracked || file.ignored === true || !hasChange(file),
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

  // Filter phạm vi pane Changes (ui-analysis mục F): Changes / All / +Ignored.
  const changesFilter = useViewPrefs((s) => s.changesFilter);
  const setChangesFilter = useViewPrefs((s) => s.setChangesFilter);
  const applyFilter = (next: ChangesFilter) => {
    if (next === changesFilter) {
      return;
    }
    setChangesFilter(next);
    // Scope là tham số của getStatus (all = ghép ls-files, ignored = --ignored)
    // — phải refetch mới đúng dữ liệu.
    void store.refreshStatus();
  };
  const inFilter = (f: FileChange): boolean => {
    if (f.ignored) {
      return changesFilter === 'ignored';
    }
    // all/ignored: host đã trả TẤT CẢ file project — hiện hết (kể cả không đổi).
    return changesFilter === 'changes' ? hasChange(f) : true;
  };

  // Search thường: MỌI token (cách nhau bằng space) đều phải xuất hiện trong
  // path (AND) — gõ "store repo" tìm được src/store/repoStore.ts.
  // Chế độ wildcard: file khớp BẤT KỲ token nào (OR) — "*.json *.ts" = json HOẶC ts.
  const searchTokens = (fileSearch ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t !== '');
  const patternRegexes = patternMode ? searchTokens.map(globToRegex) : [];
  const matchesSearch = (path: string): boolean => {
    if (searchTokens.length === 0) {
      return true;
    }
    const p = path.toLowerCase();
    if (patternMode) {
      return patternRegexes.some((rx, i) =>
        // Token không có ký tự glob nào thì vẫn lọc kiểu substring cho đỡ bất ngờ.
        rx === null ? p.includes(searchTokens[i]!) : rx.test(p),
      );
    }
    return searchTokens.every((t) => p.includes(t));
  };

  const scoped = (status?.files ?? []).filter((f) => inScope(f.path));
  const conflictCount = scoped.filter((f) => f.conflicted).length;
  const showConflictsOnly = conflictsOnly && conflictCount > 0;
  const unstaged = scoped.filter(
    (f) => inFilter(f) && matchesSearch(f.path) && (!showConflictsOnly || f.conflicted),
  );
  const staged = scoped.filter((f) => f.staged !== null && !f.conflicted && matchesSearch(f.path));

  // ↑/↓ di chuyển selection qua file kế (không cuộn list) — đi xuyên 2 pane
  // theo thứ tự hiển thị: hết Changes thì sang Staged. Chưa chọn gì thì ↓ chọn
  // file đầu, ↑ chọn file cuối.
  const navRows: WorkingSelection[] = [
    ...unstaged.map((file) => ({ file, area: 'unstaged' as const })),
    ...staged.map((file) => ({ file, area: 'staged' as const })),
  ];
  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
      return;
    }
    const target = e.target as HTMLElement;
    // Đang gõ trong ô search/input thì trả phím cho input (di chuyển con trỏ).
    if (target.closest('input, textarea') !== null) {
      return;
    }
    e.preventDefault();
    if (navRows.length === 0) {
      return;
    }
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    const sel = store.workingSelection;
    const idx =
      sel === null
        ? -1
        : navRows.findIndex((r) => r.area === sel.area && r.file.path === sel.file.path);
    const next =
      idx === -1
        ? delta === 1
          ? 0
          : navRows.length - 1
        : Math.min(Math.max(idx + delta, 0), navRows.length - 1);
    if (next !== idx) {
      void store.selectWorkingFile(navRows[next]!);
    }
  };
  /** Click vào vùng list là focus container để ↑/↓ hoạt động ngay (trừ khi click input). */
  const focusList = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('input, textarea') === null) {
      e.currentTarget.focus({ preventScroll: true });
    }
  };

  return (
    <>
      <div className="sg-main">
        <div className="sg-wt-left" tabIndex={0} onKeyDown={onListKeyDown} onClick={focusList}>
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

          {fileSearch !== null && (
            <div className="sg-file-search">
              <input
                className="sg-filter-input inline"
                placeholder={
                  patternMode
                    ? 'Filter by pattern — *.json, src/**, a?.ts (space = OR)'
                    : 'Filter files (name or path)'
                }
                value={fileSearch}
                autoFocus
                onChange={(e) => setFileSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setFileSearch(null);
                  }
                }}
              />
              <button
                className={`sg-tool mono${patternMode ? ' active' : ''}`}
                title="Wildcard mode — match patterns like *.json or src/** (space-separated = match any)"
                onClick={() => setPatternMode(!patternMode)}
              >
                [*.]
              </button>
              {fileSearch !== '' && (
                <button className="sg-tool" title="Clear filter" onClick={() => setFileSearch('')}>
                  ✕
                </button>
              )}
            </div>
          )}

          <FilePane
            title={`Changes (${unstaged.length})`}
            files={unstaged}
            area="unstaged"
            emptyText={
              searchTokens.length > 0
                ? 'No files match the filter'
                : showConflictsOnly
                  ? 'No conflicts left — all resolved 🎉'
                  : 'No unstaged changes'
            }
            onFileMenu={openFileMenu}
            showModeToggle
            headerExtra={
              <>
                {conflictCount > 0 && (
                  <>
                    <button
                      className={`sg-tool${showConflictsOnly ? ' active' : ''}`}
                      title="Show only files that still need conflict resolution"
                      onClick={() => setConflictsOnly(!conflictsOnly)}
                    >
                      ⚠ Conflicts ({conflictCount})
                    </button>
                    <span className="sg-tool-sep" />
                  </>
                )}
                <button
                  className={`sg-tool${changesFilter === 'changes' ? ' active' : ''}`}
                  title="Only files git detects as changed (added / modified / deleted)"
                  onClick={() => applyFilter('changes')}
                >
                  Changes
                </button>
                <button
                  className={`sg-tool${changesFilter === 'all' ? ' active' : ''}`}
                  title="Every file in the project, incl. unchanged files"
                  onClick={() => applyFilter('all')}
                >
                  All
                </button>
                <button
                  className={`sg-tool${changesFilter === 'ignored' ? ' active' : ''}`}
                  title="Every file in the project, incl. ignored entries"
                  onClick={() => applyFilter('ignored')}
                >
                  +Ignored
                </button>
                <span className="sg-tool-sep" />
                <button
                  className={`sg-tool icon${fileSearch !== null ? ' active' : ''}`}
                  title="Filter files by name/path"
                  onClick={() => setFileSearch(fileSearch === null ? '' : null)}
                >
                  <FilterFunnelIcon />
                </button>
              </>
            }
          />
          <FilePane
            title={`Staged (${staged.length})`}
            files={staged}
            area="staged"
            emptyText={searchTokens.length > 0 ? 'No files match the filter' : 'No staged files'}
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

      {/* Panel diff LUÔN hiển thị để layout ổn định (không nhảy khi chọn/bỏ chọn
          file) — chưa chọn thì giữ chỗ bằng placeholder trống cùng chiều cao. */}
      <Splitter orientation="horizontal" invert onResize={(d) => layout.resize('diffHeight', d)} />
      {store.workingSelection === null ? (
        <div className="sg-diff-panel sg-diff-placeholder" style={{ height: layout.diffHeight }}>
          Select a file to view its changes
        </div>
      ) : (
        <>
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
  showModeToggle = false,
  headerExtra,
}: {
  title: string;
  files: FileChange[];
  area: WorkingSelection['area'];
  emptyText: string;
  onFileMenu(event: React.MouseEvent, file: FileChange, area: WorkingSelection['area']): void;
  /** Nút List↔Tree chỉ đặt 1 chỗ (pane Changes) — pref là chung cho cả 2 pane. */
  showModeToggle?: boolean;
  /** Nút bổ sung trên header (vd filter Conflicts khi merge). */
  headerExtra?: React.ReactNode;
}) {
  const store = useRepoStore();
  const fileListMode = useViewPrefs((s) => s.fileListMode);

  return (
    <div className="sg-file-pane">
      <div className="sg-file-pane-header">
        <span>{title}</span>
        <span className="sg-diff-spacer" />
        {headerExtra}
        {showModeToggle && <FileListModeToggle />}
        {files.some((f) => !f.ignored && hasChange(f)) && area === 'unstaged' && (
          <button
            className="sg-tool"
            onClick={() =>
              void store.stageFiles(
                files.filter((f) => !f.ignored && hasChange(f)).map((f) => f.path),
              )
            }
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
        {fileListMode === 'tree' ? (
          <FileTreeList
            items={files}
            getPath={(f) => f.path}
            renderFile={(file, depth) => (
              <WorkingFileRow
                key={`${area}:${file.path}`}
                file={file}
                area={area}
                depth={depth}
                onContextMenu={(e) => onFileMenu(e, file, area)}
              />
            )}
          />
        ) : (
          files.map((file) => (
            <WorkingFileRow
              key={`${area}:${file.path}`}
              file={file}
              area={area}
              onContextMenu={(e) => onFileMenu(e, file, area)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function WorkingFileRow({
  file,
  area,
  depth,
  onContextMenu,
}: {
  file: FileChange;
  area: WorkingSelection['area'];
  /** Có giá trị = đang ở chế độ Tree: thụt lề theo cấp, ẩn cột thư mục. */
  depth?: number;
  onContextMenu(event: React.MouseEvent): void;
}) {
  const store = useRepoStore();
  const selected =
    store.workingSelection?.file.path === file.path && store.workingSelection.area === area;
  const letter = statusLetter(file, area);
  // Chọn bằng ↑/↓: row mới có thể nằm ngoài vùng nhìn — cuộn tối thiểu cho thấy.
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) {
      rowRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [selected]);

  return (
    <div
      ref={rowRef}
      className={`sg-file-row${selected ? ' selected' : ''}${file.ignored ? ' ignored' : ''}`}
      style={depth !== undefined ? { paddingLeft: treeRowPadding(depth) } : undefined}
      onClick={() => void store.selectWorkingFile({ file, area })}
      onContextMenu={onContextMenu}
      title={file.origPath ? `${file.origPath} → ${file.path}` : file.path}
    >
      <span className={`sg-file-kind ${letter.className}`}>{letter.char}</span>
      <span className="sg-file-name">{fileName(file.path)}</span>
      {depth === undefined && <span className="sg-file-dir">{dirName(file.path)}</span>}
      <span className="sg-row-actions">
        {/* File ignored / không đổi (filter All): không stage/discard được — chỉ xem. */}
        {file.ignored || (area === 'unstaged' && !hasChange(file)) ? null : area === 'unstaged' ? (
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
  if (file.ignored) {
    return 'Ignored';
  }
  if (file.untracked) {
    return 'Untracked';
  }
  // Filter "All files": file tracked không có thay đổi nào.
  if (file.staged === null && file.unstaged === null) {
    return 'Unchanged';
  }
  const kind = area === 'staged' ? file.staged : file.unstaged;
  let label = kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Modified';
  if (file.submodule) {
    label = `Submodule ${label.toLowerCase()}`;
  }
  return area === 'staged' ? `${label}, staged` : label;
}

function statusLetter(
  file: FileChange,
  area: WorkingSelection['area'],
): { char: string; className: string } {
  if (file.conflicted) {
    return { char: 'U', className: 'kind-deleted' }; // conflict nổi bật màu đỏ
  }
  if (file.ignored) {
    return { char: 'I', className: 'kind-ignored' };
  }
  if (file.untracked) {
    return { char: '?', className: 'kind-added' };
  }
  const kind = area === 'staged' ? file.staged : file.unstaged;
  const char = kind ? kind[0]!.toUpperCase() : ' ';
  return { char, className: `kind-${kind ?? 'modified'}` };
}

/** Icon phễu (filter) — vẽ inline theo currentColor như các icon khác (CSP chặn ảnh ngoài). */
function FilterFunnelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M2 3h12l-4.6 5.4V13l-2.8-1.6V8.4z" />
    </svg>
  );
}

/**
 * Đổi 1 token wildcard thành RegExp: `*` = trong 1 segment, `?` = 1 ký tự,
 * `**` = xuyên thư mục. Token KHÔNG chứa '/' thì khớp theo TÊN FILE ở bất kỳ
 * thư mục nào (*.json ăn cả src/a.json) — giống "files to include" của VSCode.
 * Trả null khi token không có ký tự glob nào → caller lọc substring bình thường.
 */
function globToRegex(glob: string): RegExp | null {
  if (!/[*?]/.test(glob)) {
    return null;
  }
  // Token đã split theo whitespace nên không thể chứa space — mượn ' ' làm
  // placeholder giữ chỗ cho '**' trước khi thay '*' đơn.
  const source = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, ' ')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/ /g, '.*');
  return new RegExp(glob.includes('/') ? `^${source}$` : `^(?:.*/)?${source}$`);
}

/** File có thay đổi phía working tree (đối tượng của stage/discard). */
const hasChange = (f: FileChange): boolean => f.unstaged !== null || f.untracked || f.conflicted;

const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const dirName = (path: string): string => {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
};
