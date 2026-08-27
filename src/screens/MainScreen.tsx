// Khung panel chính: [repo tabs] / [toolbar Fetch/Pull/Push — A1] / [toggle
// Working Tree | History — ui-analysis A2] / thân màn hình / [status bar].
// Working Tree và History dùng chung khung này.
// (Merge/Reset chuyển vào context menu commit của History — ít dùng ở toolbar.)

import { useEffect, useState } from 'react';
import { ContextMenu, type MenuState } from '../components/ContextMenu';
import { FeedbackDialog } from '../components/FeedbackDialog';
import { PullDialog } from '../components/PullDialog';
import { PushToDialog } from '../components/PushToDialog';
import { useRepoStore } from '../store/repoStore';
import { HistoryScreen } from './HistoryScreen';
import { WorkingTreeScreen } from './WorkingTreeScreen';

export function MainScreen() {
  const store = useRepoStore();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
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
        {/* Feedback đứng riêng ở mép phải — không phải thao tác git. */}
        <span className="sg-diff-spacer" />
        <ToolbarButton
          label="Feedback"
          title="Góp ý / báo lỗi — gửi thẳng vào group Telegram của team"
          disabled={false}
          onClick={() => setFeedbackOpen(true)}
          icon={<FeedbackIcon />}
        />
      </div>

      {store.error !== null && <div className="sg-error">{store.error}</div>}

      {store.uiMode === 'workingTree' ? <WorkingTreeScreen /> : <HistoryScreen />}

      {pushMenu && <ContextMenu menu={pushMenu} onClose={() => setPushMenu(null)} />}

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

      {feedbackOpen && (
        <FeedbackDialog
          context={{
            screen: 'main',
            repoName: activeRepo?.name ?? null,
            branch: activeRepo?.branch ?? null,
          }}
          onSent={(message) => useRepoStore.setState({ statusMessage: message })}
          onClose={() => setFeedbackOpen(false)}
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

/** Bong bóng thoại — góp ý/báo lỗi. */
function FeedbackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M13.5 3.5v6a1.5 1.5 0 0 1-1.5 1.5H7l-3.5 2.5V11H4a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 4 2h8a1.5 1.5 0 0 1 1.5 1.5Z" />
    </svg>
  );
}
