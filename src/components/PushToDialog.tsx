// Dialog "Push to…" (menu mũi tên của nút Push): chọn remote + gõ tên nhánh
// đích — đẩy HEAD lên nhánh đó, tạo mới trên remote nếu chưa có.

import { useEffect, useRef, useState } from 'react';
import type { PushTarget, RemoteInfo } from '../../shared/types';

interface Props {
  /** Danh sách remote của repo active — rỗng thì nút Push disable. */
  remotes: RemoteInfo[];
  /** Điền sẵn tên nhánh hiện tại (thường push lên nhánh cùng tên). */
  currentBranch: string | null;
  onSubmit(target: PushTarget): void;
  onClose(): void;
}

export function PushToDialog({ remotes, currentBranch, onSubmit, onClose }: Props) {
  const [remote, setRemote] = useState(remotes[0]?.name ?? '');
  const [branch, setBranch] = useState(currentBranch ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const canRun = remote !== '' && branch.trim() !== '';
  const submit = () => {
    if (canRun) {
      onSubmit({ remote, branch: branch.trim() });
      onClose();
    }
  };

  return (
    <div className="sg-menu-overlay center" onClick={onClose}>
      <div
        className="sg-modal wide"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            submit();
          }
          if (e.key === 'Escape') {
            onClose();
          }
        }}
      >
        <div className="sg-modal-title">Push to</div>
        <div className="sg-modal-desc">
          Push <b>HEAD</b> to{' '}
          <select
            className="sg-ref-select"
            value={remote}
            onChange={(e) => setRemote(e.target.value)}
          >
            {remotes.map((r) => (
              <option key={r.name} value={r.name} title={r.url}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <input
          ref={inputRef}
          className="sg-filter-input"
          placeholder="branch name on remote"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
        />
        <p className="sg-modal-note">Nhánh chưa có trên remote sẽ được tạo mới.</p>
        <div className="sg-modal-actions">
          <button className="sg-banner-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="sg-commit-btn" disabled={!canRun} onClick={submit}>
            Push
          </button>
        </div>
      </div>
    </div>
  );
}
