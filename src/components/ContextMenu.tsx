// Context menu tự vẽ trong webview (menu mặc định của browser chỉ có Cut/Copy/Paste).
// Theo pattern SmartGit (ui-analysis E/G): nhóm bằng separator, phím tắt/hint in
// bên phải, lệnh không áp dụng được thì MỜ đi chứ không ẩn (giữ layout ổn định).

import { useEffect, useRef } from 'react';

export interface MenuItem {
  label: string;
  /** Hint bên phải (phím tắt/ghi chú) — chỉ hiển thị, không bắt phím ở menu. */
  hint?: string;
  disabled?: boolean;
  onClick?(): void;
}

export type MenuEntry = MenuItem | 'sep';

export interface MenuState {
  x: number;
  y: number;
  entries: MenuEntry[];
}

interface Props {
  menu: MenuState;
  onClose(): void;
}

export function ContextMenu({ menu, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Đóng bằng Escape; click ra ngoài đóng qua overlay bên dưới.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Kẹp vị trí trong viewport sau khi đo được kích thước menu.
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      el.style.left = `${Math.max(0, window.innerWidth - rect.width - 4)}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${Math.max(0, window.innerHeight - rect.height - 4)}px`;
    }
  }, [menu]);

  return (
    <div
      className="sg-menu-overlay"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={ref}
        className="sg-menu"
        style={{ left: menu.x, top: menu.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {menu.entries.map((entry, i) =>
          entry === 'sep' ? (
            <div key={i} className="sg-menu-sep" />
          ) : (
            <button
              key={i}
              className="sg-menu-item"
              disabled={entry.disabled}
              onClick={() => {
                entry.onClick?.();
                onClose();
              }}
            >
              <span>{entry.label}</span>
              {entry.hint && <span className="sg-menu-hint">{entry.hint}</span>}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
