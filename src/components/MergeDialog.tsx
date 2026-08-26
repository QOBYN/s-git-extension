// Dialog Merge/Rebase theo pattern D1 của SmartGit (docs/design/ui-analysis.md):
// chọn nhánh nguồn + các NÚT HÀNH ĐỘNG RÕ NGHĨA xếp dọc (không OK/Cancel chung
// chung) — mỗi nút 1 chiến lược, kèm dòng phụ giải thích hệ quả.

import { useState } from 'react';
import type { MergeStrategy } from '../../shared/types';

interface StrategyEntry {
  strategy: MergeStrategy;
  label: string;
  detail: string;
}

/** Thứ tự nút theo dialog SmartGit D1: mặc định (merge commit) đứng đầu. */
const MERGE_STRATEGIES: StrategyEntry[] = [
  {
    strategy: 'merge-commit',
    label: 'Create Merge-Commit',
    detail: 'git merge --no-ff — luôn tạo commit merge, giữ lịch sử nhánh',
  },
  {
    strategy: 'fast-forward',
    label: 'Fast-Forward Only',
    detail: 'git merge --ff-only — chỉ tiến HEAD, từ chối nếu phải merge thật',
  },
  {
    strategy: 'merge-to-working-tree',
    label: 'Merge to Working Tree',
    detail: 'git merge --no-commit — hoà vào working tree, dừng để xem lại trước khi commit',
  },
  {
    strategy: 'squash',
    label: 'Squash',
    detail: 'git merge --squash — gộp mọi thay đổi thành 1 bộ change chưa commit',
  },
];

interface Props {
  kind: 'merge' | 'rebase';
  /** Nhánh hiện tại (đích của merge / nhánh bị rebase) — null = detached HEAD. */
  currentBranch: string | null;
  /** Danh sách ref chọn được làm nguồn (local + remote, trừ nhánh hiện tại). */
  targets: string[];
  /** Chọn sẵn (mở từ context menu nhánh); không có thì lấy ref đầu danh sách. */
  initialTarget?: string;
  onSubmit(target: string, strategy: MergeStrategy): void;
  onClose(): void;
}

export function MergeDialog({ kind, currentBranch, targets, initialTarget, onSubmit, onClose }: Props) {
  const [target, setTarget] = useState(initialTarget ?? targets[0] ?? '');
  const current = currentBranch ?? '(detached HEAD)';
  const canRun = target !== '';

  const run = (strategy: MergeStrategy) => {
    if (canRun) {
      onSubmit(target, strategy);
      onClose();
    }
  };

  return (
    <div className="sg-menu-overlay center" onClick={onClose}>
      <div
        className="sg-modal wide"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose();
          }
        }}
      >
        <div className="sg-modal-title">{kind === 'merge' ? 'Merge' : 'Rebase'}</div>

        <div className="sg-modal-desc">
          {kind === 'merge' ? (
            <>
              Merge <RefSelect value={target} targets={targets} onChange={setTarget} /> into{' '}
              <b>{current}</b>
            </>
          ) : (
            <>
              Rebase <b>{current}</b> onto{' '}
              <RefSelect value={target} targets={targets} onChange={setTarget} />
            </>
          )}
        </div>

        {kind === 'merge' ? (
          <div className="sg-strategy-list">
            {MERGE_STRATEGIES.map((entry) => (
              <button
                key={entry.strategy}
                className="sg-strategy-btn"
                disabled={!canRun}
                onClick={() => run(entry.strategy)}
              >
                <span className="sg-strategy-label">{entry.label}</span>
                <span className="sg-strategy-detail">{entry.detail}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="sg-modal-note">
            Conflict (nếu có) xử lý trong Working Tree — banner có nút Continue / Abort.
          </p>
        )}

        <div className="sg-modal-actions">
          <button className="sg-banner-btn" onClick={onClose}>
            Cancel
          </button>
          {kind === 'rebase' && (
            <button
              className="sg-commit-btn"
              disabled={!canRun}
              onClick={() => run('merge-commit') /* strategy không dùng cho rebase */}
            >
              Rebase
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RefSelect({
  value,
  targets,
  onChange,
}: {
  value: string;
  targets: string[];
  onChange(value: string): void;
}) {
  return (
    <select className="sg-ref-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {targets.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}
