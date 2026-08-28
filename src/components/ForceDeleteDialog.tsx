// Popup Force Delete: `git branch -d` từ chối vì nhánh còn commit chưa merge
// vào nhánh hiện tại — xoá cưỡng bức (-D) là mất các commit đó (chỉ mò lại được
// qua reflog). Thay vì banner lỗi thô, hỏi user có muốn force delete không
// (như SmartGit). Enter cố ý KHÔNG bind vào Force Delete — hành động phá huỷ
// phải bấm chuột tường minh; Escape = huỷ.

import { useEffect, useRef } from 'react';

interface Props {
  /** Tên nhánh bị từ chối xoá. */
  branch: string;
  /** stderr nguyên văn của git — hiện lại để user biết chính xác lý do. */
  message: string;
  onForceDelete(): void;
  onClose(): void;
}

export function ForceDeleteDialog({ branch, message, onForceDelete, onClose }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);

  // Focus vào dialog để Escape hoạt động ngay khi mở (như ChoiceDialog).
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
          if (e.key === 'Escape') {
            onClose();
          }
        }}
      >
        <div className="sg-modal-title">Branch not fully merged</div>
        <div className="sg-modal-desc">
          Nhánh <b>{branch}</b> còn commit chưa merge vào nhánh hiện tại — force delete sẽ mất các
          commit đó:
        </div>
        <div className="sg-modal-note" style={{ whiteSpace: 'pre-wrap' }}>
          {message.trim()}
        </div>

        <div className="sg-modal-actions">
          <button className="sg-banner-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="sg-commit-btn danger" onClick={onForceDelete}>
            Force Delete
          </button>
        </div>
      </div>
    </div>
  );
}
