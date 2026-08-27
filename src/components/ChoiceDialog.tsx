// Dialog chọn 1 phương án (radio) + OK/Cancel — khuôn chung cho popup Pull và
// Reset. Khác MergeDialog (D1, mỗi nút 1 chiến lược): ở đây user chọn rồi xác
// nhận, vì lựa chọn được GHI NHỚ cho lần sau (caller lo phần persist).

import { useEffect, useRef, useState } from 'react';

export interface Choice<V extends string> {
  value: V;
  label: string;
  detail: string;
  /** Phương án phá huỷ dữ liệu (reset --hard) — tô đỏ cho user khựng lại. */
  danger?: boolean;
}

interface Props<V extends string> {
  title: string;
  /** Câu mô tả trên danh sách — JSX để bôi đậm tên nhánh/commit. */
  description: React.ReactNode;
  choices: Choice<V>[];
  initialValue: V;
  actionLabel: string;
  onSubmit(value: V): void;
  onClose(): void;
}

export function ChoiceDialog<V extends string>({
  title,
  description,
  choices,
  initialValue,
  actionLabel,
  onSubmit,
  onClose,
}: Props<V>) {
  const [value, setValue] = useState<V>(initialValue);
  const boxRef = useRef<HTMLDivElement>(null);

  // Focus vào dialog để Enter/Escape hoạt động ngay khi mở.
  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  const submit = () => {
    onSubmit(value);
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
        <div className="sg-modal-title">{title}</div>
        <div className="sg-modal-desc">{description}</div>

        <div className="sg-choice-list">
          {choices.map((choice) => (
            <label
              key={choice.value}
              className={`sg-choice${choice.value === value ? ' selected' : ''}${choice.danger ? ' danger' : ''}`}
            >
              <input
                type="radio"
                name="sg-choice"
                checked={choice.value === value}
                onChange={() => setValue(choice.value)}
              />
              <span className="sg-choice-text">
                <span className="sg-choice-label">{choice.label}</span>
                <span className="sg-choice-detail">{choice.detail}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="sg-modal-actions">
          <button className="sg-banner-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="sg-commit-btn" onClick={submit}>
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
