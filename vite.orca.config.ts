import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

// Build UI của plugin Orca: cùng UI React với webview VSCode (src/), 2 entry HTML
// ở orca/panel/ (index = panel sidebar phải, editor = view giữa) → orca/out/panel/.
// Không dùng plugin vscode() — panel Orca nói chuyện với worker qua window.orca
// (src/orcaBridge.ts). Worker build bằng esbuild trong scripts/build-orca.mjs.

const rootDir = fileURLToPath(new URL('.', import.meta.url));

/**
 * Monaco tự `new Worker(new URL('ts.worker.js', …))` cho language service
 * ts/css/html/json → Vite đóng gói cả 4 worker (~9 MB). S-Git tắt hết các
 * service đó (src/monaco/setup.ts) nên worker không bao giờ chạy — bỏ khỏi
 * bản Orca vì orca/out/ được commit theo từng release.
 */
function dropMonacoLanguageWorkers(): Plugin {
  const workerManager =
    /monaco-editor[\\/]esm[\\/]vs[\\/]languages[\\/]features[\\/][^\\/]+[\\/]workerManager\.js$/;
  const workerCtor =
    /new Worker\(new URL\('[\w.]+\.worker\.js', import\.meta\.url\), \{ type: "module" \}\)/g;
  return {
    name: 's-git:drop-monaco-language-workers',
    enforce: 'pre',
    transform(code, id) {
      if (!workerManager.test(id)) {
        return null;
      }
      const next = code.replace(workerCtor, '(() => { throw new Error("S-Git: language worker disabled"); })()');
      return next === code ? null : { code: next, map: null };
    },
  };
}

export default defineConfig({
  root: `${rootDir}orca/panel`,
  // Frame Orca phục vụ file từ thư mục plugin (orca-plugin-frame://<key>/…) —
  // mọi đường dẫn asset phải tương đối.
  base: './',
  publicDir: false,
  plugins: [react(), dropMonacoLanguageWorkers()],
  define: {
    __SGIT_BUILD__: JSON.stringify(
      new Date().toLocaleTimeString('en-GB', { hour12: false }) +
        ' ' +
        new Date().toLocaleDateString('en-CA'),
    ),
  },
  build: {
    outDir: `${rootDir}orca/out/panel`,
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
