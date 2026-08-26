// Diff viewer trên Monaco diff editor — cover các chức năng SmartGit đã khảo sát
// (ui-analysis B7/D3): Side-by-Side ↔ Unified, Compact (ẩn vùng không đổi),
// Word-Wrap, Ignore Whitespace, nhảy hunk trước/sau + chỉ số thay đổi (+a −r, i/N).

import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { monaco, syncMonacoTheme } from '../monaco/setup';

export interface DiffViewOptions {
  sideBySide: boolean;
  /** hideUnchangedRegions của Monaco = chế độ "Compact" của SmartGit. */
  compact: boolean;
  wordWrap: boolean;
  ignoreWhitespace: boolean;
}

/** Thống kê thay đổi — hiển thị "+a −r · N changes" trên toolbar (screenshot B7: "+2~1"). */
export interface DiffStats {
  addedLines: number;
  removedLines: number;
  changeCount: number;
}

export interface DiffViewHandle {
  /** Nhảy hunk; trả về vị trí mới (1-based) để toolbar hiện "i/N". */
  gotoDiff(direction: 'next' | 'previous'): { index: number; total: number } | null;
  /** Hunk hiện tại (theo con trỏ ↑↓; chưa điều hướng thì hunk đầu) — cho stage-hunk. */
  getCurrentChange(): monaco.editor.ILineChange | null;
  /** Nội dung pane phải (buffer đang sửa) — cho nút Save khi editable. */
  getModifiedContent(): string | null;
  /** Gọi sau khi save thành công — reset trạng thái dirty về baseline mới. */
  markSaved(): void;
}

interface Props extends DiffViewOptions {
  original: string;
  modified: string;
  /** Đường dẫn file — Monaco tự suy ngôn ngữ highlight từ đuôi file trong URI. */
  path: string;
  /**
   * Cho sửa trực tiếp pane phải (working file — map File Compare của SmartGit D3).
   * Kèm mũi tên revert từng block ở lề (renderMarginRevertIcon của Monaco).
   */
  editable?: boolean;
  onDiffUpdate?(stats: DiffStats): void;
  /** Buffer pane phải lệch/khớp baseline — bật/tắt nút Save. */
  onDirtyChange?(dirty: boolean): void;
  /** ⌘S trong editor khi editable. */
  onSave?(): void;
}

export const DiffView = forwardRef<DiffViewHandle, Props>(function DiffView(
  {
    original,
    modified,
    path,
    sideBySide,
    compact,
    wordWrap,
    ignoreWhitespace,
    editable,
    onDiffUpdate,
    onDirtyChange,
    onSave,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  /** Vị trí hunk hiện tại cho next/prev — reset khi đổi file. */
  const diffCursor = useRef(-1);
  /** Baseline so sánh dirty = nội dung modified lúc load/save gần nhất. */
  const baselineRef = useRef(modified);
  const contentSubRef = useRef<monaco.IDisposable | null>(null);
  const onDiffUpdateRef = useRef(onDiffUpdate);
  onDiffUpdateRef.current = onDiffUpdate;
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Tạo editor 1 lần cho vòng đời component.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    syncMonacoTheme();
    const editor = monaco.editor.createDiffEditor(container, {
      readOnly: true,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      minimap: { enabled: false },
      renderOverviewRuler: false,
      // Thuật toán diff mới của Monaco — kết quả gọn hơn với code di chuyển.
      diffAlgorithm: 'advanced',
      // Dấu +/− ở lề như SmartGit.
      renderIndicators: true,
      // Phát hiện code DI CHUYỂN và vẽ mũi tên nối 2 vị trí — gần với connector
      // giữa 2 pane của SmartGit (ui-analysis D3).
      experimental: { showMoves: true },
      fontSize: 12,
    });
    editorRef.current = editor;

    // ⌘S / Ctrl+S trong pane phải → Save (khi editable; không thì onSave undefined).
    editor
      .getModifiedEditor()
      .addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current?.());

    // Monaco tính diff async — khi xong mới có getLineChanges để báo stats.
    const updateSub = editor.onDidUpdateDiff(() => {
      onDiffUpdateRef.current?.(computeStats(editor.getLineChanges() ?? []));
    });

    // Theme VSCode đổi (user toggle dark/light) → body class đổi → sync lại.
    const themeObserver = new MutationObserver(syncMonacoTheme);
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    return () => {
      updateSub.dispose();
      contentSubRef.current?.dispose();
      themeObserver.disconnect();
      // Thứ tự bắt buộc của Monaco: GỠ model khỏi editor rồi mới dispose model —
      // dispose model trước sẽ ném "TextModel got disposed before DiffEditorWidget
      // model got reset".
      const model = editor.getModel();
      editor.setModel(null);
      editor.dispose();
      model?.original.dispose();
      model?.modified.dispose();
      editorRef.current = null;
    };
  }, []);

  // Đổi nội dung/file → thay model (URI theo path để Monaco tự chọn ngôn ngữ).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const previous = editor.getModel();
    // URI cần unique giữa 2 phía và giữa các lần đổi file.
    const stamp = Date.now();
    editor.setModel({
      original: monaco.editor.createModel(
        original,
        undefined,
        monaco.Uri.parse(`smartgit://original/${stamp}/${path}`),
      ),
      modified: monaco.editor.createModel(
        modified,
        undefined,
        monaco.Uri.parse(`smartgit://modified/${stamp}/${path}`),
      ),
    });
    previous?.original.dispose();
    previous?.modified.dispose();
    diffCursor.current = -1;

    // Theo dõi buffer pane phải để báo dirty (editable mode).
    baselineRef.current = modified;
    onDirtyChangeRef.current?.(false);
    contentSubRef.current?.dispose();
    const modifiedModel = editor.getModel()!.modified;
    contentSubRef.current = modifiedModel.onDidChangeContent(() => {
      onDirtyChangeRef.current?.(modifiedModel.getValue() !== baselineRef.current);
    });
  }, [original, modified, path]);

  // Đổi tuỳ chọn hiển thị.
  useEffect(() => {
    editorRef.current?.updateOptions({
      renderSideBySide: sideBySide,
      // Compact của SmartGit: gập vùng không đổi, giữ 3 dòng ngữ cảnh quanh
      // mỗi thay đổi; click vào dải gập để mở thêm 20 dòng.
      hideUnchangedRegions: {
        enabled: compact,
        contextLineCount: 3,
        minimumLineCount: 3,
        revealLineCount: 20,
      },
      ignoreTrimWhitespace: ignoreWhitespace,
      wordWrap: wordWrap ? 'on' : 'off',
      // Editable: pane phải sửa được + mũi tên revert từng block ở lề giữa
      // (copy block bên trái đè lên block bên phải trong buffer).
      readOnly: !editable,
      renderMarginRevertIcon: editable === true,
    });
  }, [sideBySide, compact, wordWrap, ignoreWhitespace, editable]);

  useImperativeHandle(ref, () => ({
    gotoDiff(direction) {
      const editor = editorRef.current;
      const changes = editor?.getLineChanges();
      if (!editor || !changes || changes.length === 0) {
        return null;
      }
      diffCursor.current =
        direction === 'next'
          ? (diffCursor.current + 1) % changes.length
          : (diffCursor.current - 1 + changes.length) % changes.length;
      const change = changes[diffCursor.current];
      const line = change.modifiedStartLineNumber || change.originalStartLineNumber;
      editor.revealLineInCenter(line);
      return { index: diffCursor.current + 1, total: changes.length };
    },

    getCurrentChange() {
      const changes = editorRef.current?.getLineChanges();
      if (!changes || changes.length === 0) {
        return null;
      }
      return changes[Math.max(diffCursor.current, 0)];
    },

    getModifiedContent() {
      return editorRef.current?.getModel()?.modified.getValue() ?? null;
    },

    markSaved() {
      const value = editorRef.current?.getModel()?.modified.getValue();
      if (value !== undefined) {
        baselineRef.current = value;
        onDirtyChangeRef.current?.(false);
      }
    },
  }));

  return <div ref={containerRef} className="sg-diff-editor" />;
});

function computeStats(changes: monaco.editor.ILineChange[]): DiffStats {
  let addedLines = 0;
  let removedLines = 0;
  for (const change of changes) {
    // modifiedEndLineNumber = 0 nghĩa là phía modified không có dòng (thuần xoá) — và ngược lại.
    if (change.modifiedEndLineNumber > 0) {
      addedLines += change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1;
    }
    if (change.originalEndLineNumber > 0) {
      removedLines += change.originalEndLineNumber - change.originalStartLineNumber + 1;
    }
  }
  return { addedLines, removedLines, changeCount: changes.length };
}
