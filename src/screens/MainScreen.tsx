// Khung panel chính: [toolbar: dropdown repo + Fetch/Pull/Push (A1) + lọc nhánh /
// tìm commit (màn History) + toggle Working Tree | History (A2)] / thân màn hình /
// [status bar].
// Working Tree và History dùng chung khung này.
// (Merge/Reset chuyển vào context menu commit của History — ít dùng ở toolbar.)

import { useEffect, useState } from 'react';
import { BranchFilter } from '../components/BranchFilter';
import { ContextMenu, type MenuState } from '../components/ContextMenu';
import { DirtyGuardDialog } from '../components/DirtyGuardDialog';
import { PullDialog } from '../components/PullDialog';
import { PushToDialog } from '../components/PushToDialog';
import { RepoDropdown } from '../components/RepoDropdown';
import { useRepoStore } from '../store/repoStore';
import { FileLogScreen } from './FileLogScreen';
import { HistoryScreen } from './HistoryScreen';
import { WorkingTreeScreen } from './WorkingTreeScreen';

interface Props {
  /** Orca: panel có cây sidebar nhúng bên trái — nút ☰ đầu toolbar bật/tắt nó. */
  sidebar?: { open: boolean; onToggle(): void };
}

export function MainScreen({ sidebar }: Props = {}) {
  const store = useRepoStore();
  /** Popup Pull (chọn merge/rebase/ff-only — nhớ lựa chọn cũ). */
  const [pullOpen, setPullOpen] = useState(false);
  /** Dialog "Push to…" (từ menu mũi tên của nút Push). */
  const [pushToOpen, setPushToOpen] = useState(false);
  /** Menu nhỏ dưới mũi tên của nút Push. */
  const [pushMenu, setPushMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    void useRepoStore.getState().init();
  }, []);

  const changedCount = store.status?.files.length ?? 0;
  const activeRepo = store.repos.find((r) => r.root === store.activeRepoRoot) ?? null;

  /** Menu của mũi tên Push — mở tại mép dưới nút; remotes nạp trước cho dialog. */
  const openPushMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    void store.loadAllRemotes(); // dialog Push to cần danh sách remote
    setPushMenu({
      x: rect.left,
      y: rect.bottom + 2,
      entries: [{ label: 'Push to…', onClick: () => setPushToOpen(true) }],
    });
  };

  return (
    <div className="sg-app">
      {/* 1 thanh duy nhất: [dropdown repo] [Fetch/Pull/Push] … [toggle mode]
          — dãy tab repo cũ gộp vào đây dưới dạng dropdown có search. */}
      <div className="sg-toolbar">
        {sidebar !== undefined && (
          <button
            className={`sg-toolbar-btn sg-icon-btn${sidebar.open ? ' active' : ''}`}
            title={sidebar.open ? 'Ẩn cây thư mục / nhánh' : 'Hiện cây thư mục / nhánh'}
            aria-pressed={sidebar.open}
            onClick={sidebar.onToggle}
          >
            <SidebarIcon />
          </button>
        )}
        <RepoDropdown />
        <span className="sg-toolbar-sep" />
        <ToolbarButton
          label="Fetch"
          title="git fetch --all --prune"
          disabled={activeRepo === null || store.loading}
          onClick={() => void store.remoteOp('fetch')}
          icon={<FetchIcon />}
        />
        <ToolbarButton
          label="Pull"
          title="git pull — chọn cách hoà (merge/rebase/ff-only)…"
          disabled={activeRepo === null || store.loading}
          onClick={() => setPullOpen(true)}
          icon={<PullIcon />}
        />
        {/* Push là split-button: bấm chính = push thường; mũi tên = menu Push to… */}
        <div className="sg-toolbar-split">
          <ToolbarButton
            label="Push"
            title="git push (tự set upstream nếu chưa có)"
            disabled={activeRepo === null || store.loading}
            onClick={() => void store.remoteOp('push')}
            icon={<PushIcon />}
          />
          <button
            className="sg-toolbar-btn sg-toolbar-arrow"
            title="Tuỳ chọn push…"
            disabled={activeRepo === null || store.loading}
            onClick={openPushMenu}
          >
            <ChevronDownIcon />
          </button>
        </div>
        <span className="sg-diff-spacer" />
        {/* Bộ lọc của màn History: nhánh (tách với filter sidebar) + tìm commit
            (lọc client-side trang đã tải). File Log có header riêng nên ẩn. */}
        {store.uiMode === 'history' && store.fileLogPath === null && (
          <div className="sg-toolbar-history">
            <span className="sg-graph-label">Branch:</span>
            <BranchFilter />
            <input
              className="sg-filter-input inline sg-toolbar-search"
              placeholder="Search commits (message · author · hash)"
              value={store.commitSearch ?? ''}
              onChange={(e) => store.setCommitSearch(e.target.value || null)}
            />
          </div>
        )}
        <div className="sg-mode-toggle">
          {/* Icon chỉ hiện khi panel hẹp (thay nhãn chữ — styles/orca.css). */}
          <button
            className={`sg-mode-btn${store.uiMode === 'workingTree' ? ' active' : ''}`}
            title="Working Tree"
            onClick={() => store.setMode('workingTree')}
          >
            <WorkingTreeIcon />
            <span className="sg-mode-label">Working Tree</span>
            {changedCount > 0 && <span className="sg-count-badge">{changedCount}</span>}
          </button>
          <button
            className={`sg-mode-btn${store.uiMode === 'history' ? ' active' : ''}`}
            title="History"
            onClick={() => store.setMode('history')}
          >
            <HistoryIcon />
            <span className="sg-mode-label">History</span>
          </button>
        </div>
      </div>

      {store.error !== null && <div className="sg-error">{store.error}</div>}

      {/* File Log nhúng (Orca) thay chỗ thân màn hình; VSCode mở tab File Log riêng. */}
      {store.fileLogPath !== null ? (
        <FileLogScreen embedded={{ onBack: () => void store.closeFileLog() }} />
      ) : store.uiMode === 'workingTree' ? (
        <WorkingTreeScreen />
      ) : (
        <HistoryScreen />
      )}

      {pushMenu && <ContextMenu menu={pushMenu} onClose={() => setPushMenu(null)} />}

      {store.dirtyGuard !== null && (
        <DirtyGuardDialog
          opLabel={store.dirtyGuard.opLabel}
          message={store.dirtyGuard.message}
          onStashRetry={() => void store.retryDirtyGuardWithStash()}
          onGoCommit={() => store.dirtyGuardGoCommit()}
          onClose={() => store.dismissDirtyGuard()}
        />
      )}

      {pullOpen && activeRepo !== null && (
        <PullDialog
          currentBranch={activeRepo.branch}
          onSubmit={(mode) => void store.remoteOp('pull', { pullMode: mode })}
          onClose={() => setPullOpen(false)}
        />
      )}

      {pushToOpen && activeRepo !== null && (
        <PushToDialog
          remotes={store.remotesByRepo[activeRepo.root] ?? []}
          currentBranch={activeRepo.branch}
          onSubmit={(target) => void store.remoteOp('push', { pushTo: target })}
          onClose={() => setPushToOpen(false)}
        />
      )}

      <div className="sg-status-bar">
        <span className={`sg-status-dot${store.loading ? ' busy' : ''}`} />
        {store.loading ? 'Working…' : store.statusMessage}
        {store.uiMode === 'history' &&
          store.commits.length > 0 &&
          ` · ${store.commits.length} commits`}
        {store.uiMode === 'workingTree' && changedCount > 0 && ` · ${changedCount} changed files`}
        <span className="sg-diff-spacer" />
        <span title="Build time — xác nhận bundle đang chạy">{__SGIT_BUILD__}</span>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  title,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  title: string;
  disabled: boolean;
  onClick(): void;
  icon: React.ReactNode;
}) {
  return (
    <button className="sg-toolbar-btn" title={title} disabled={disabled} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

// Icon SVG inline theo currentColor (CSP chặn tài nguyên ngoài) — nét 1.5px
// cùng phong cách codicon.

/** Tờ giấy có dấu +/− (thay đổi chưa commit) — nút Working Tree khi hẹp. */
function WorkingTreeIcon() {
  return (
    <svg className="sg-mode-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M3.5 1.75h6l3 3v9.5h-9z" />
      <path d="M8 6.5v4M6 8.5h4" />
    </svg>
  );
}

/** Chuỗi commit nối nhau — nút History khi hẹp. */
function HistoryIcon() {
  return (
    <svg className="sg-mode-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="3.5" r="1.75" />
      <circle cx="8" cy="12.5" r="1.75" />
      <path d="M8 5.25v5.5" />
    </svg>
  );
}

/** Khung có cột trái (bật/tắt cây sidebar nhúng — Orca). */
function SidebarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <path d="M6 3v10" />
    </svg>
  );
}

/** Mũi tên vòng (đồng bộ refs từ remote). */
function FetchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.7 1.6v3h-3" />
    </svg>
  );
}

/** Mũi tên xuống vào vạch (kéo về local). */
function PullIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M8 2v8.5" />
      <path d="M4.5 7.5 8 11l3.5-3.5" />
      <path d="M3 13.5h10" />
    </svg>
  );
}

/** Mũi tên lên khỏi vạch (đẩy lên remote). */
function PushIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M8 12.5V4" />
      <path d="M4.5 7 8 3.5 11.5 7" />
      <path d="M3 14.5h10" />
    </svg>
  );
}

/** Mũi tên nhỏ của split-button Push — mở menu Push to…. */
function ChevronDownIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2 6.5 5 9.5l3-3" />
    </svg>
  );
}
