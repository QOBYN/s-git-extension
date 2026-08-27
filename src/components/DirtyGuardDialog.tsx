// Popup Dirty Guard: git TỪ CHỐI 1 thao tác (pull --rebase, merge, rebase,
// checkout…) vì working tree có thay đổi chưa commit. Thay vì chỉ banner lỗi
// thô, popup nói rõ chuyện gì xảy ra và cho xử lý ngay:
//   Stash & Retry (mặc định) · Commit trước (mở Working Tree) · Cancel.

import { useEffect, useRef } from 'react';

interface Props {
  /** Nhãn thao tác bị chặn — "Pull (rebase)", "Merge 'dev'"… */
  opLabel: string;
  /** stderr nguyên văn của git — hiện lại để user biết chính xác lý do. */
  message: string;
  onStashRetry(): void;
  onGoCommit(): void;
  onClose(): void;
}

export function DirtyGuardDialog({ opLabel, message, onStashRetry, onGoCommit, onClose }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);

  // Focus vào dialog để Enter/Escape hoạt động ngay khi mở (như ChoiceDialog).
  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  return (
    <div className="sg-menu-overlay center" onClick={onClose}>
      <div
        ref={boxRef}
        className="sg-modal wide"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onStashRetry();
          }
          if (e.key === 'Escape') {
            onClose();
          }
        }}
      >
        <div className="sg-modal-title">Uncommitted changes</div>
        <div className="sg-modal-desc">
          Git từ chối <b>{opLabel}</b> vì working tree đang có thay đổi chưa commit:
        </div>
        <div className="sg-modal-note" style={{ whiteSpace: 'pre-wrap' }}>
          {message.trim()}
        </div>
        <div className="sg-modal-desc">
          <b>Stash &amp; Retry</b>: tạm cất thay đổi (git stash) → chạy lại {opLabel} → re-apply
          (stash pop). <b>Commit trước</b>: mở Working Tree để bạn tự commit rồi chạy lại sau.
        </div>

        <div className="sg-modal-actions">
          <button className="sg-banner-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="sg-banner-btn" onClick={onGoCommit}>
            Commit trước…
          </button>
          <button className="sg-commit-btn" onClick={onStashRetry}>
            Stash &amp; Retry
          </button>
        </div>
      </div>
    </div>
  );
}
