// Bố cục khi chạy trong Orca — panel sidebar phải HOẶC view giữa (custom editor
// .sgit), cùng 1 màn. VSCode có 2 webview riêng (sidebar Activity Bar + panel
// editor); ở Orca gộp: [cây sidebar (bật/tắt bằng nút đầu toolbar)] | [panel chính].
// Hai màn dùng CHUNG 1 store (cùng document) — store.sidebarLoaded lo phần
// refresh cây, click trong cây điều hướng tại chỗ (src/orcaBridge LOCAL_METHODS).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Splitter } from '../components/Splitter';
import { IS_ORCA_EDITOR } from '../env';
import { useRepoStore } from '../store/repoStore';
import { MainScreen } from './MainScreen';
import { SidebarScreen } from './SidebarScreen';

// Panel sidebar phải và view giữa nhớ riêng (cùng origin nên chung localStorage).
const OPEN_KEY = IS_ORCA_EDITOR ? 's-git.orca.editor.sidebarOpen' : 's-git.orca.sidebarOpen';
const WIDTH_KEY = IS_ORCA_EDITOR ? 's-git.orca.editor.sidebarWidth' : 's-git.orca.sidebarWidth';
const WIDTH_LIMITS = { min: 160, max: 520, initial: 240 };
/**
 * Panel hẹp hơn mức này (sidebar phải của Orca thường chỉ ~400–600px) thì cây
 * nổi ĐÈ lên panel chính thay vì chia cột — chia cột sẽ bóp nát graph/diff.
 */
const OVERLAY_BELOW_PX = 760;

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage không khả dụng — dùng mặc định
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // không lưu được thì chỉ mất trạng thái giữa các phiên
  }
}

function clampWidth(width: number): number {
  return Math.min(WIDTH_LIMITS.max, Math.max(WIDTH_LIMITS.min, width));
}

export function OrcaScreen() {
  // Mặc định: view giữa rộng → mở cây; panel sidebar phải hẹp → đóng, nhường chỗ graph/diff.
  const [open, setOpen] = useState(() => {
    const stored = readStored(OPEN_KEY);
    return stored === null ? IS_ORCA_EDITOR : stored === '1';
  });
  const [width, setWidth] = useState(() => {
    const stored = Number(readStored(WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : WIDTH_LIMITS.initial;
  });

  const shellRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = shellRef.current;
    if (el === null) {
      return;
    }
    // Đổi layout ngay trong callback gây "ResizeObserver loop…" — dời sang frame sau.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setNarrow(el.clientWidth < OVERLAY_BELOW_PX));
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    writeStored(OPEN_KEY, '0');
  }, []);

  // Cây nổi: chọn repo/folder/nhánh/File Log trong cây → đóng lại để thấy kết quả.
  useEffect(() => {
    if (!open || !narrow) {
      return;
    }
    return useRepoStore.subscribe((next, prev) => {
      if (
        next.activeRepoRoot !== prev.activeRepoRoot ||
        next.uiMode !== prev.uiMode ||
        next.folderScope !== prev.folderScope ||
        next.historyRefs !== prev.historyRefs ||
        next.commitSearch !== prev.commitSearch ||
        next.fileLogPath !== prev.fileLogPath
      ) {
        close();
      }
    });
  }, [open, narrow, close]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      writeStored(OPEN_KEY, prev ? '0' : '1');
      return !prev;
    });
  }, []);

  const resize = useCallback((delta: number) => {
    setWidth((prev) => {
      const next = clampWidth(prev + delta);
      writeStored(WIDTH_KEY, String(next));
      return next;
    });
  }, []);

  return (
    <div ref={shellRef} className={`sg-orca-shell${narrow ? ' overlay' : ''}`}>
      {open && (
        <>
          <div className="sg-orca-side" style={{ width }}>
            <SidebarScreen embedded />
          </div>
          {narrow ? (
            <div className="sg-orca-backdrop" onClick={close} />
          ) : (
            <Splitter orientation="vertical" onResize={resize} />
          )}
        </>
      )}
      <div className="sg-orca-main">
        <MainScreen sidebar={{ open, onToggle: toggle }} />
      </div>
    </div>
  );
}
