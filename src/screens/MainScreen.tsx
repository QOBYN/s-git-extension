// Khung panel chính: [repo tabs] / [toolbar Fetch/Pull/Push/Merge/Rebase — A1]
// / [toggle Working Tree | History — ui-analysis A2] / thân màn hình / [status bar].
// Working Tree và History dùng chung khung này.

import { useEffect, useState } from 'react';
import { MergeDialog } from '../components/MergeDialog';
import { useRepoStore } from '../store/repoStore';
import { HistoryScreen } from './HistoryScreen';
import { WorkingTreeScreen } from './WorkingTreeScreen';

export function MainScreen() {
  const store = useRepoStore();
  /** Dialog Merge/Rebase đang mở (từ toolbar) — null = đóng. */
  const [dialog, setDialog] = useState<'merge' | 'rebase' | null>(null);

  useEffect(() => {
    void useRepoStore.getState().init();
  }, []);

  const changedCount = store.status?.files.length ?? 0;
  const activeRepo = store.repos.find((r) => r.root === store.activeRepoRoot) ?? null;
  // Nguồn merge/rebase: nhánh local + remote, trừ nhánh đang checkout.
  const mergeTargets = store.refs
    .filter((r) => r.kind !== 'tag' && !r.isHead)
    .map((r) => r.name);

  return (
    <div className="sg-app">
      <div className="sg-repo-tabs">
        {store.repos.map((repo) => (
          <button
            key={repo.root}
            className={`sg-repo-tab${repo.root === store.activeRepoRoot ? ' active' : ''}`}
            onClick={() => void store.selectRepo(repo.root)}
            title={repo.root}
          >
            {repo.name}
            {repo.activity !== 'none' && <span className="sg-ref-badge tag">{repo.activity}</span>}
          </button>
        ))}
        <span className="sg-diff-spacer" />
        <div className="sg-mode-toggle">
          <button
            className={`sg-mode-btn${store.uiMode === 'workingTree' ? ' active' : ''}`}
            onClick={() => store.setMode('workingTree')}
          >
            Working Tree
            {changedCount > 0 && <span className="sg-count-badge">{changedCount}</span>}
          </button>
          <button
            className={`sg-mode-btn${store.uiMode === 'history' ? ' active' : ''}`}
            onClick={() => store.setMode('history')}
          >
            History
          </button>
        </div>
      </div>

      {/* Toolbar thao tác repo (ui-analysis A1): icon + nhãn như SmartGit. */}
      <div className="sg-toolbar">
        <ToolbarButton
          label="Fetch"
          title="git fetch --all --prune"
          disabled={activeRepo === null || store.loading}
          onClick={() => void store.remoteOp('fetch')}
          icon={<FetchIcon />}
        />
        <ToolbarButton
          label="Pull"
          title="git pull"
          disabled={activeRepo === null || store.loading}
          onClick={() => void store.remoteOp('pull')}
          icon={<PullIcon />}
        />
        <ToolbarButton
          label="Push"
          title="git push (tự set upstream nếu chưa có)"
          disabled={activeRepo === null || store.loading}
          onClick={() => void store.remoteOp('push')}
          icon={<PushIcon />}
        />
        <span className="sg-tool-sep" />
        <ToolbarButton
          label="Merge"
          title="Merge nhánh khác vào nhánh hiện tại…"
          disabled={activeRepo === null || store.loading || mergeTargets.length === 0}
          onClick={() => setDialog('merge')}
          icon={<MergeIcon />}
        />
        <ToolbarButton
          label="Rebase"
          title="Rebase nhánh hiện tại lên nhánh khác…"
          disabled={activeRepo === null || store.loading || mergeTargets.length === 0}
          onClick={() => setDialog('rebase')}
          icon={<RebaseIcon />}
        />
      </div>

      {store.error !== null && <div className="sg-error">{store.error}</div>}

      {store.uiMode === 'workingTree' ? <WorkingTreeScreen /> : <HistoryScreen />}

      {dialog !== null && activeRepo !== null && (
        <MergeDialog
          kind={dialog}
          currentBranch={activeRepo.branch}
          targets={mergeTargets}
          onSubmit={(target, strategy) =>
            void (dialog === 'merge'
              ? store.mergeBranch(activeRepo.root, target, strategy)
              : store.rebaseBranch(activeRepo.root, target))
          }
          onClose={() => setDialog(null)}
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
        <span title="Build time — xác nhận bundle đang chạy">{__SMARTGIT_BUILD__}</span>
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

/** 2 node nhập làm 1 (kiểu git-merge của codicon). */
function MergeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="4" cy="3.5" r="1.75" />
      <circle cx="4" cy="12.5" r="1.75" />
      <circle cx="12" cy="8" r="1.75" />
      <path d="M4 5.25c0 3 2.5 2.75 6.25 2.75" />
    </svg>
  );
}

/** Node được nhấc lên đặt lại trên gốc mới. */
function RebaseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="3" r="1.75" />
      <circle cx="8" cy="13" r="1.75" />
      <path d="M8 4.75v3" />
      <path d="M6.25 9.25 8 11l1.75-1.75" />
    </svg>
  );
}
