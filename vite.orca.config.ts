import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Build UI của plugin Orca: cùng UI React với webview VSCode (src/), 2 entry HTML
// ở orca/panel/ (index = panel sidebar phải, editor = view giữa) → orca/plugin/panel/.
// Không dùng plugin vscode() — panel Orca nói chuyện với worker qua window.orca
// (src/orcaBridge.ts). Worker build bằng esbuild trong scripts/build-orca.mjs.

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: `${rootDir}orca/panel`,
  // Frame Orca phục vụ file từ thư mục plugin (orca-plugin-frame://<key>/…) —
  // mọi đường dẫn asset phải tương đối.
  base: './',
  publicDir: false,
  plugins: [react()],
  define: {
    __SGIT_BUILD__: JSON.stringify(
      new Date().toLocaleTimeString('en-GB', { hour12: false }) +
        ' ' +
        new Date().toLocaleDateString('en-CA'),
    ),
  },
  build: {
    outDir: `${rootDir}orca/plugin/panel`,
    emptyOutDir: true,
    // Như vite.config.ts: font codicon của Monaco nhúng data: URI. Frame Orca
    // chặn mạng nhưng cho data:/blob: (cả worker diff inline của Monaco).
    assetsInlineLimit: 200 * 1024,
    // Bundle Monaco vài MB là bình thường — chỉ cần dưới trần 50 MiB/plugin.
    chunkSizeWarningLimit: 8000,
    reportCompressedSize: false,
    rollupOptions: {
      // 2 trang, chung 1 bundle: panel sidebar phải + view giữa (custom editor .sgit).
      input: {
        index: `${rootDir}orca/panel/index.html`,
        editor: `${rootDir}orca/panel/editor.html`,
      },
    },
  },
});
