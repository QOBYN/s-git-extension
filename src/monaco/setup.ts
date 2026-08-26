// Khởi tạo môi trường Monaco cho webview.
//
// QUAN TRỌNG: worker phải INLINE (?worker&inline → Blob URL). Webview VSCode
// chạy ở origin vscode-webview:// còn asset nằm trên vscode-cdn.net — tạo Worker
// từ URL khác origin bị chặn, Monaco chờ worker mãi → DIFF KHÔNG BAO GIỜ TÍNH XONG
// (không màu, không chỉ số thay đổi). Blob worker không đi qua mạng nên luôn chạy.

import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker&inline';
import { defineSmartGitTheme } from './theme';

self.MonacoEnvironment = {
  // Chỉ cần editor worker (tính diff + tiện ích text). Các language service
  // (ts/css/html/json) đã bị tắt bên dưới nên không bao giờ đòi worker riêng.
  getWorker: () => new EditorWorker(),
};

/**
 * Tắt toàn bộ tính năng ngữ nghĩa của các language service nặng — diff viewer
 * chỉ cần tô màu cú pháp (monarch, chạy main thread). Không tắt thì chúng spawn
 * worker riêng (ts.worker ~7MB) và lỗi vì nhận nhầm editor worker.
 */
const MODE_OFF = {
  completionItems: false,
  hovers: false,
  documentSymbols: false,
  definitions: false,
  references: false,
  documentHighlights: false,
  rename: false,
  diagnostics: false,
  documentRangeFormattingEdits: false,
  signatureHelp: false,
  onTypeFormattingEdits: false,
  codeActions: false,
  inlayHints: false,
  colors: false,
  foldingRanges: false,
  selectionRanges: false,
  documentFormattingEdits: false,
  links: false,
  tokens: false,
} as const;

// Monaco ≥0.53: defaults nằm ở namespace top-level (monaco.typescript…),
// monaco.languages.typescript cũ đã deprecated.
monaco.typescript.typescriptDefaults.setModeConfiguration(MODE_OFF);
monaco.typescript.javascriptDefaults.setModeConfiguration(MODE_OFF);
monaco.css.cssDefaults.setModeConfiguration(MODE_OFF);
monaco.css.scssDefaults.setModeConfiguration(MODE_OFF);
monaco.css.lessDefaults.setModeConfiguration(MODE_OFF);
monaco.html.htmlDefaults.setModeConfiguration(MODE_OFF);
monaco.html.handlebarDefaults.setModeConfiguration(MODE_OFF);
monaco.html.razorDefaults.setModeConfiguration(MODE_OFF);
monaco.json.jsonDefaults.setModeConfiguration(MODE_OFF);

/**
 * Theme Monaco theo theme VSCode hiện tại — VSCode gắn class lên body của webview.
 * Dùng theme s-git-* (màu diff lấy từ theme user + ép độ đậm tối thiểu cho
 * vùng thay đổi nổi rõ). Gọi lại khi theme đổi (observer trong DiffView).
 */
export function syncMonacoTheme(): void {
  monaco.editor.setTheme(defineSmartGitTheme());
}

export { monaco };
