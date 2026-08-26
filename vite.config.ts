import vscode from '@tomjs/vite-plugin-vscode';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

// CSP mặc định của plugin KHÔNG có worker-src → Worker (kể cả blob inline) bị chặn
// → Monaco không tính được diff (không màu, không chỉ số thay đổi).
// Override: thêm worker-src blob: (diff worker), font-src (codicon của Monaco),
// img-src data: (icon inline); giữ nguyên phần script/style của plugin.
const WEBVIEW_CSP =
  '<meta http-equiv="Content-Security-Policy" content="' +
  "default-src 'none'; " +
  "style-src {{cspSource}} 'unsafe-inline'; " +
  'font-src {{cspSource}} data:; ' +
  'img-src {{cspSource}} data:; ' +
  "script-src 'nonce-{{nonce}}' 'unsafe-eval'; " +
  'worker-src blob: {{cspSource}};' +
  '">';

export default defineConfig({
  build: {
    // Nhúng asset ≤200KB (gồm font codicon ~140KB của Monaco) thẳng vào bundle
    // dạng data: URI. CSS của vite trỏ font bằng path tuyệt đối /assets/… —
    // trong webview path đó phân giải sai gốc (mất prefix đường dẫn extension)
    // → font 404 → mọi icon codicon thành ô vuông. Inline là hết phụ thuộc path.
    assetsInlineLimit: 200 * 1024,
  },
  define: {
    // Dấu build hiện ở status bar webview — xác nhận đang chạy bundle nào khi debug.
    __SGIT_BUILD__: JSON.stringify(
      new Date().toLocaleTimeString('en-GB', { hour12: false }) + ' ' + new Date().toLocaleDateString('en-CA'),
    ),
  },
  plugins: [
    react(),
    vscode({
      extension: { entry: 'extension/index.ts' },
      webview: { csp: WEBVIEW_CSP },
    }),
  ],
});
