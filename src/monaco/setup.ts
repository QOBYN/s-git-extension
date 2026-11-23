// Khởi tạo môi trường Monaco cho webview.
//
// QUAN TRỌNG: worker phải INLINE (?worker&inline → Blob URL). Webview VSCode
// chạy ở origin vscode-webview:// còn asset nằm trên vscode-cdn.net — tạo Worker
// từ URL khác origin bị chặn, Monaco chờ worker mãi → DIFF KHÔNG BAO GIỜ TÍNH XONG
// (không màu, không chỉ số thay đổi). Blob worker không đi qua mạng nên luôn chạy.

// CHỈ nạp phần S-Git dùng (bộ xem diff + tô cú pháp), không nạp `monaco-editor`
// đầy đủ: bản đầy đủ kéo theo mọi tính năng IDE (gợi ý, rename, quick open…) và
// language service ts/css/html/json kèm worker riêng (~9 MB) mà diff không cần.
import * as monaco from 'monaco-editor/editor';
import 'monaco-editor/features/codicon/register'; // icon (mũi tên code di chuyển, nút ẩn vùng không đổi)
import 'monaco-editor/features/diffEditor/register'; // lệnh của diff editor (nhảy thay đổi, revert…)
import 'monaco-editor/features/clipboard/register'; // copy/paste trong pane sửa được
import 'monaco-editor/features/contextmenu/register'; // menu chuột phải
import 'monaco-editor/features/find/register'; // Cmd/Ctrl+F
// Tô màu cú pháp (monarch, chạy main thread) cho các ngôn ngữ phổ biến: mỗi dòng
// chỉ đăng ký id + đuôi file, tokenizer nạp lười khi mở file đó. Ngôn ngữ hiếm
// (ABAP, Apex, MIPS, Q#…) bỏ để bundle nhỏ — file của chúng vẫn diff, chỉ không tô màu.
import 'monaco-editor/languages/definitions/bat/register';
import 'monaco-editor/languages/definitions/clojure/register';
import 'monaco-editor/languages/definitions/coffee/register';
import 'monaco-editor/languages/definitions/cpp/register';
import 'monaco-editor/languages/definitions/csharp/register';
import 'monaco-editor/languages/definitions/css/register';
import 'monaco-editor/languages/definitions/dart/register';
import 'monaco-editor/languages/definitions/dockerfile/register';
import 'monaco-editor/languages/definitions/elixir/register';
import 'monaco-editor/languages/definitions/fsharp/register';
import 'monaco-editor/languages/definitions/go/register';
import 'monaco-editor/languages/definitions/graphql/register';
import 'monaco-editor/languages/definitions/handlebars/register';
import 'monaco-editor/languages/definitions/hcl/register';
import 'monaco-editor/languages/definitions/html/register';
import 'monaco-editor/languages/definitions/ini/register';
import 'monaco-editor/languages/definitions/java/register';
import 'monaco-editor/languages/definitions/javascript/register';
import 'monaco-editor/languages/definitions/julia/register';
import 'monaco-editor/languages/definitions/kotlin/register';
import 'monaco-editor/languages/definitions/less/register';
import 'monaco-editor/languages/definitions/lua/register';
import 'monaco-editor/languages/definitions/markdown/register';
import 'monaco-editor/languages/definitions/mdx/register';
import 'monaco-editor/languages/definitions/mysql/register';
import 'monaco-editor/languages/definitions/objective-c/register';
import 'monaco-editor/languages/definitions/perl/register';
import 'monaco-editor/languages/definitions/pgsql/register';
import 'monaco-editor/languages/definitions/php/register';
import 'monaco-editor/languages/definitions/powershell/register';
import 'monaco-editor/languages/definitions/protobuf/register';
import 'monaco-editor/languages/definitions/pug/register';
import 'monaco-editor/languages/definitions/python/register';
import 'monaco-editor/languages/definitions/r/register';
import 'monaco-editor/languages/definitions/razor/register';
import 'monaco-editor/languages/definitions/ruby/register';
import 'monaco-editor/languages/definitions/rust/register';
import 'monaco-editor/languages/definitions/scala/register';
import 'monaco-editor/languages/definitions/scheme/register';
import 'monaco-editor/languages/definitions/scss/register';
import 'monaco-editor/languages/definitions/shell/register';
import 'monaco-editor/languages/definitions/solidity/register';
import 'monaco-editor/languages/definitions/sql/register';
import 'monaco-editor/languages/definitions/swift/register';
import 'monaco-editor/languages/definitions/typescript/register';
import 'monaco-editor/languages/definitions/vb/register';
import 'monaco-editor/languages/definitions/xml/register';
import 'monaco-editor/languages/definitions/yaml/register';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker&inline';
import { defineSmartGitTheme } from './theme';

self.MonacoEnvironment = {
  // Chỉ có editor worker (tính diff + tiện ích text) — không nạp language service
  // nào nên không bao giờ cần worker khác.
  getWorker: () => new EditorWorker(),
};

/**
 * Theme Monaco theo theme VSCode hiện tại — VSCode gắn class lên body của webview.
 * Dùng theme s-git-* (màu diff lấy từ theme user + ép độ đậm tối thiểu cho
 * vùng thay đổi nổi rõ). Gọi lại khi theme đổi (observer trong DiffView).
 */
export function syncMonacoTheme(): void {
  monaco.editor.setTheme(defineSmartGitTheme());
}

export { monaco };
