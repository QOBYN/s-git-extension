// Dropdown chọn repo ở toolbar panel chính — thay dãy tab repo cũ (nhiều
// repo/submodule là tràn hàng); có ô search lọc theo tên, submodule thụt lề
// theo mức lồng để thấy quan hệ cha–con. Tái dùng style sg-branch-* của
// BranchFilter cho đồng bộ giao diện.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RepoInfo } from '../../shared/types';
import { useRepoStore } from '../store/repoStore';

export function RepoDropdown() {
  const repos = useRepoStore((s) => s.repos);
  const activeRepoRoot = useRepoStore((s) => s.activeRepoRoot);
  const selectRepo = useRepoStore((s) => s.selectRepo);

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Đóng khi click ra ngoài dropdown (cùng pattern BranchFilter).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Mở dropdown thì focus ngay ô search — gõ được liền không cần click thêm.
  useEffect(() => {
    if (open) {
      setFilter('');
      inputRef.current?.focus();
    }
  }, [open]);

  const active = repos.find((r) => r.root === activeRepoRoot) ?? null;

  /** Mức lồng của repo = số repo khác chứa nó (submodule thụt lề theo cha). */
  const depthOf = (repo: RepoInfo) =>
    repos.filter((other) => other !== repo && repo.root.startsWith(other.root + '/')).length;

  const needle = filter.trim().toLowerCase();
  const matched = useMemo(
    () => (needle === '' ? repos : repos.filter((r) => r.name.toLowerCase().includes(needle))),
    [repos, needle],
  );

  const pick = (root: string) => {
    setOpen(false);
    void selectRepo(root);
  };

  const onInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'Enter' && matched.length > 0) {
      pick(matched[0].root);
    }
  };

  return (
    <div className="sg-branch-filter" ref={rootRef}>
      <button
        className="sg-branch-filter-btn"
        title={active !== null ? `${active.root} — click to switch repo` : 'Select repository'}
        onClick={() => setOpen((v) => !v)}
      >
        <RepoIcon />
        <span className="sg-btn-label">{active?.name ?? 'Select repo'}</span>
        {active !== null && active.activity !== 'none' && (
          <span className="sg-ref-badge tag">{active.activity}</span>
        )}
        <span className="sg-branch-caret">▾</span>
      </button>

      {open && (
        <div className="sg-branch-dropdown">
          <input
            ref={inputRef}
            className="sg-filter-input"
            placeholder="Search repositories"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <div className="sg-branch-list">
            {matched.map((repo) => {
              const checked = repo.root === activeRepoRoot;
              return (
                <button
                  key={repo.root}
                  className={`sg-menu-item${checked ? ' checked' : ''}`}
                  // Đang search thì bỏ thụt lề — kết quả lọc không còn ngữ cảnh cây.
                  style={{ paddingLeft: 8 + (needle === '' ? depthOf(repo) : 0) * 14 }}
                  title={repo.root}
                  onClick={() => pick(repo.root)}
                >
                  <span className="sg-branch-name">
                    <span className={`sg-branch-check${checked ? ' on' : ''}`}>✓</span>
                    {depthOf(repo) > 0 ? '📦 ' : ''}
                    {repo.name}
                  </span>
                  {repo.branch !== null && <span className="sg-ref-badge">{repo.branch}</span>}
                  {repo.activity !== 'none' && (
                    <span className="sg-ref-badge tag">{repo.activity}</span>
                  )}
                </button>
              );
            })}
            {matched.length === 0 && <p className="sg-empty small">No matching repos</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Icon repo — hộp lưu trữ, nét 1.5px cùng phong cách codicon. */
function RepoIcon() {
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
      <path d="M2.5 5.5v7A1 1 0 0 0 3.5 13.5h9a1 1 0 0 0 1-1v-7" />
      <path d="M1.5 2.5h13v3h-13z" />
      <path d="M6.5 8h3" />
    </svg>
  );
}
