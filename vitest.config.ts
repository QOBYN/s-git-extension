import { defineConfig } from 'vitest/config';

// Config vitest ĐỘC LẬP với vite.config.ts: config chính chứa plugin vscode()
// (build extension + webview) — không được chạy khi test. Vitest tự ưu tiên
// file này khi tồn tại.
export default defineConfig({
  test: {
    include: ['extension/**/*.test.ts', 'shared/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
    // Logic thuần chạy môi trường node; component webview sẽ tự khai báo
    // môi trường jsdom per-file khi tới giai đoạn UI.
    environment: 'node',
  },
});
