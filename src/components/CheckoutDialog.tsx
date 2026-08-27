// Popup Checkout — dùng chung cho 2 đường vào:
//  - History: double-click dòng log / menu Check Out… (đích = commit, kèm lựa
//    chọn nhánh local trỏ tại commit đó hay detached HEAD).
//  - Sidebar: double-click nhánh local (đích = đúng 1 nhánh, không cần radio).
// Working tree có thay đổi chưa commit thì bắt chọn cách xử lý (stash & re-apply
// / mang theo / discard) NGAY TRONG popup — lựa chọn nhớ qua localStorage.

import { useEffect, useRef, useState } from 'react';
import type { CheckoutDirtyAction } from '../../shared/types';

const STORAGE_KEY = 's-git.checkoutDirtyAction';

/** 1 đích checkout (nhánh local / commit detached) — radio khi có nhiều đích. */
export interface CheckoutTarget {
  /** Ref truyền cho `git checkout` — tên nhánh hoặc oid. */
  value: string;
  label: string;
  detail: string;
}

interface DirtyChoice {
  value: CheckoutDirtyAction;
  label: string;
  detail: string;
  danger?: boolean;
}

const DIRTY_CHOICES: DirtyChoice[] = [
  {
    value: 'stash-reapply',
    label: 'Stash & re-apply',
    detail: 'git stash push -u → checkout → stash pop — thay đổi quay lại trên nhánh mới',
  },
  {
    value: 'bring',
    label: 'Mang theo',
    detail: 'checkout thường — giữ thay đổi trong working tree; git từ chối nếu đụng file',
  },
  {
    value: 'discard',
    label: 'Discard',
    detail:
      'git checkout --force — BỎ MỌI thay đổi chưa commit, kể cả con trỏ submodule (file untracked giữ nguyên)',
    danger: true,
  },
];

/** Lựa chọn lần trước (mặc định stash & re-apply — an toàn nhất). */
function loadDirtyAction(): CheckoutDirtyAction {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'stash-reapply' || raw === 'bring' || raw === 'discard') {
      return raw;
    }
  } catch {
    // localStorage không khả dụng — dùng default
  }
  return 'stash-reapply';
}

interface Props {
  /** Câu mô tả trên cùng — JSX để bôi đậm tên nhánh/commit. */
  description: React.ReactNode;
  /** Các đích checkout (≥1); đúng 1 đích thì ẩn radio, chỉ xác nhận. */
  targets: CheckoutTarget[];
  /** Ghi chú thêm (vd cảnh báo detached HEAD khi commit không có nhánh). */
  note?: React.ReactNode;
  /** Số file thay đổi chưa commit; 0 = sạch, popup chỉ còn bước xác nhận. */
  changedCount: number;
  onSubmit(ref: string, dirty: CheckoutDirtyAction): void;
  onClose(): void;
}

export function CheckoutDialog({
  description,
  targets,
  note,
  changedCount,
  onSubmit,
  onClose,
}: Props) {
  const [target, setTarget] = useState<string>(targets[0]!.value);
  const [dirty, setDirty] = useState<CheckoutDirtyAction>(loadDirtyAction());
  const boxRef = useRef<HTMLDivElement>(null);

  // Focus vào dialog để Enter/Escape hoạt động ngay khi mở (như ChoiceDialog).
  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  const submit = () => {
    if (changedCount > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, dirty);
      } catch {
        // không lưu được thì thôi
      }
    }
    onSubmit(target, dirty);
    onClose();
  };

  return (
    <div className="sg-menu-overlay center" onClick={onClose}>
      <div
        ref={boxRef}
        className="sg-modal wide"
        tabIndex={-1}
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
        <div className="sg-modal-title">Check Out</div>
        <div className="sg-modal-desc">{description}</div>

        {targets.length > 1 && (
          <div className="sg-choice-list">
            {targets.map((choice) => (
              <label
                key={choice.value}
                className={`sg-choice${target === choice.value ? ' selected' : ''}`}
              >
                <input
                  type="radio"
                  name="sg-checkout-target"
                  checked={target === choice.value}
                  onChange={() => setTarget(choice.value)}
                />
                <span className="sg-choice-text">
                  <span className="sg-choice-label">{choice.label}</span>
                  <span className="sg-choice-detail">{choice.detail}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        {note !== undefined && <div className="sg-modal-note">{note}</div>}

        {changedCount > 0 && (
          <>
            <div className="sg-modal-desc">
              Working tree đang có <b>{changedCount}</b> file thay đổi chưa commit — xử lý trước
              khi checkout:
            </div>
            <div className="sg-choice-list">
              {DIRTY_CHOICES.map((choice) => (
                <label
                  key={choice.value}
                  className={`sg-choice${choice.value === dirty ? ' selected' : ''}${choice.danger ? ' danger' : ''}`}
                >
                  <input
                    type="radio"
                    name="sg-checkout-dirty"
                    checked={choice.value === dirty}
                    onChange={() => setDirty(choice.value)}
                  />
                  <span className="sg-choice-text">
                    <span className="sg-choice-label">{choice.label}</span>
                    <span className="sg-choice-detail">{choice.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="sg-modal-actions">
          <button className="sg-banner-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="sg-commit-btn" onClick={submit}>
            Check Out
          </button>
        </div>
      </div>
    </div>
  );
}
