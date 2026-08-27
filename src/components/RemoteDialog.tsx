// Dialog Add/Edit Remote (context menu sidebar tab Git) — 2 trường tên + URL,
// nút hành động rõ nghĩa theo pattern dialog SmartGit (ui-analysis D1).

import { useEffect, useRef, useState } from 'react';

interface Props {
  title: string;
  actionLabel: string;
  /** Điền sẵn khi Edit; Add để trống. */
  initialName?: string;
  initialUrl?: string;
  onSubmit(name: string, url: string): void;
  onClose(): void;
}

export function RemoteDialog({
  title,
  actionLabel,
  initialName,
  initialUrl,
  onSubmit,
  onClose,
}: Props) {
  const [name, setName] = useState(initialName ?? '');
  const [url, setUrl] = useState(initialUrl ?? '');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const canSubmit = name.trim() !== '' && url.trim() !== '';
  const submit = () => {
    if (canSubmit) {
      onSubmit(name.trim(), url.trim());
      onClose();
    }
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      submit();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="sg-menu-overlay center" onClick={onClose}>
      <div className="sg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sg-modal-title">{title}</div>
        <input
          ref={nameRef}
          className="sg-filter-input"
          placeholder="remote name (e.g. origin)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <input
          className="sg-filter-input"
          placeholder="URL (https://… or git@…)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="sg-modal-actions">
          <button className="sg-banner-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="sg-commit-btn" disabled={!canSubmit} onClick={submit}>
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
