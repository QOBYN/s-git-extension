// Dropdown lọc nhánh của RIÊNG màn History (header graph) — tách biệt với ô
// filter nhánh bên sidebar (sidebarRefFilter). Mục đích: luôn thấy rõ graph
// đang hiển thị nhánh nào ngay trong tab, tránh view nhầm nhánh mà không để ý.
// MULTI-SELECT: click từng ref để bật/tắt (dropdown giữ mở để chọn tiếp);
// graph log các ref đã chọn gộp lại (git log ref1 ref2…), [] = mọi nhánh.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefInfo } from '../../shared/types';
import { useRepoStore } from '../store/repoStore';

export function BranchFilter() {
  const historyRefs = useRepoStore((s) => s.historyRefs);
  const refs = useRepoStore((s) => s.refs);
  const toggleHistoryRef = useRepoStore((s) => s.toggleHistoryRef);
  const clearHistoryRefs = useRepoStore((s) => s.clearHistoryRefs);

  const [open, setOpen] = useState(false);
  // Ô gõ lọc trong dropdown — state cục bộ, KHÔNG dùng chung với sidebar.
  const [filter, setFilter] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Đóng khi click ra ngoài dropdown.
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

  // Mở dropdown thì focus ngay ô lọc — gõ được liền không cần click thêm.
  useEffect(() => {
    if (open) {
      setFilter('');
      inputRef.current?.focus();
    }
  }, [open]);

  const needle = filter.trim().toLowerCase();
  const matched = useMemo(
    () => (needle === '' ? refs : refs.filter((r) => r.name.toLowerCase().includes(needle))),
    [refs, needle],
  );
  const locals = matched.filter((r) => r.kind === 'local');
  const remotes = matched.filter((r) => r.kind === 'remote');
  const tags = matched.filter((r) => r.kind === 'tag');

  const onInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'Enter') {
      // Enter bật/tắt ref khớp đầu tiên theo thứ tự hiển thị (local → remote → tag).
      const first = locals[0] ?? remotes[0] ?? tags[0];
      if (first !== undefined) {
        void toggleHistoryRef(first.name);
      }
    }
  };

  // Nhãn nút: rõ trạng thái lọc mà không chiếm chỗ — "main +2" khi chọn nhiều.
  const label =
    historyRefs.length === 0
      ? 'All branches'
      : historyRefs.length === 1
        ? historyRefs[0]
        : `${historyRefs[0]} +${historyRefs.length - 1}`;

  const renderGroup = (title: string, group: RefInfo[]) =>
    group.length > 0 && (
      <>
        <div className="sg-branch-group">{title}</div>
        {group.map((ref) => {
          const checked = historyRefs.includes(ref.name);
          return (
            <button
              key={ref.fullName}
              className={`sg-menu-item${checked ? ' checked' : ''}`}
              onClick={() => void toggleHistoryRef(ref.name)}
              title={`${ref.fullName} — click to ${checked ? 'remove from' : 'add to'} filter`}
            >
              <span className="sg-branch-name">
                <span className={`sg-branch-check${checked ? ' on' : ''}`}>✓</span>
                {ref.isHead ? '▶ ' : ''}
                {ref.name}
              </span>
            </button>
          );
        })}
      </>
    );

  return (
    <div className="sg-branch-filter" ref={rootRef}>
      <button
        className={`sg-branch-filter-btn${historyRefs.length > 0 ? ' active' : ''}`}
        title={
          historyRefs.length > 0
            ? `Graph filtered to: ${historyRefs.join(', ')} — click to change`
            : 'Showing all branches — click to filter'
        }
        onClick={() => setOpen((v) => !v)}
      >
        ⎇ <span className="sg-btn-label">{label}</span>
        <span className="sg-branch-caret">▾</span>
      </button>
      {/* Đang lọc: thêm nút ✕ bỏ hết lọc nhanh không cần mở dropdown. */}
      {historyRefs.length > 0 && (
        <button
          className="sg-chip-clear"
          title="Show all branches"
          onClick={() => void clearHistoryRefs()}
        >
          ✕
        </button>
      )}

      {open && (
        <div className="sg-branch-dropdown">
          <input
            ref={inputRef}
            className="sg-filter-input"
            placeholder="Filter branches & tags"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <div className="sg-branch-list">
            <button
              className={`sg-menu-item${historyRefs.length === 0 ? ' checked' : ''}`}
              onClick={() => {
                setOpen(false);
                void clearHistoryRefs();
              }}
            >
              <span className="sg-branch-name">
                <span className={`sg-branch-check${historyRefs.length === 0 ? ' on' : ''}`}>✓</span>
                All branches
              </span>
            </button>
            {renderGroup('Local Branches', locals)}
            {renderGroup('Remote Branches', remotes)}
            {renderGroup('Tags', tags)}
            {matched.length === 0 && <p className="sg-empty small">No matching refs</p>}
          </div>
        </div>
      )}
    </div>
  );
}
