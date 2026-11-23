// Xác nhận xoá file/thư mục (chuyển vào Thùng rác). VSCode hỏi bằng modal của
// chính nó phía host; worker Orca không hiện được hộp thoại nên panel tự hỏi.
// Cùng quy ước ForceDeleteDialog: Enter KHÔNG xác nhận, Escape = huỷ.

import { useEffect, useRef } from 'react';

interface Props {
  /** Đường dẫn tương đối trong repo của thứ sắp xoá. */
  path: string;
  onConfirm(): void;
  onClose(): void;
}

export function ConfirmDeleteDialog({ path, onConfirm, onClose }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  const name = path.split('/').pop() ?? path;

  return (
    <div className="sg-menu-overlay center" onClick={onClose}>
      <div
        ref={boxRef}
        className="sg-modal"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose();
          }
        }}
      >
        <div className="sg-modal-title">Delete '{name}'?</div>
        <div className="sg-modal-desc">
          <b>{path}</b> sẽ được chuyển vào Thùng rác — khôi phục được từ đó.
        </div>
        <div className="sg-modal-actions">
          <button className="sg-banner-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="sg-commit-btn danger"
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            Move to Trash
          </button>
        </div>
      </div>
    </div>
  );
}
