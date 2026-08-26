// Khung panel chính: [repo tabs] / [toggle Working Tree | History — ui-analysis A2]
// / thân màn hình / [status bar]. Working Tree và History dùng chung khung này.

import { useEffect } from 'react';
import { useRepoStore } from '../store/repoStore';
import { HistoryScreen } from './HistoryScreen';
import { WorkingTreeScreen } from './WorkingTreeScreen';

export function MainScreen() {
  const store = useRepoStore();

  useEffect(() => {
    void useRepoStore.getState().init();
  }, []);

  const changedCount = store.status?.files.length ?? 0;

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

      {store.error !== null && <div className="sg-error">{store.error}</div>}

      {store.uiMode === 'workingTree' ? <WorkingTreeScreen /> : <HistoryScreen />}

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
