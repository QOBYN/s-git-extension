// Modal nhập 1 giá trị (tên nhánh/tag mới) — theo pattern dialog của SmartGit:
// nút hành động rõ nghĩa, không phải OK/Cancel chung chung (ui-analysis D1).

import { useEffect, useRef, useState } from 'react';

interface Props {
  title: string;
  placeholder: string;
  actionLabel: string;
  onSubmit(value: string): void;
  onClose(): void;
}

export function PromptModal({ title, placeholder, actionLabel, onSubmit, onClose }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed !== '') {
      onSubmit(trimmed);
      onClose();
    }
  };

  return (
    <div className="sg-menu-overlay center" onClick={onClose}>
      <div className="sg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sg-modal-title">{title}</div>
        <input
          ref={inputRef}
          className="sg-filter-input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              submit();
            }
            if (e.key === 'Escape') {
              onClose();
            }
          }}
        />
        <div className="sg-modal-actions">
          <button className="sg-banner-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="sg-commit-btn" disabled={value.trim() === ''} onClick={submit}>
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
