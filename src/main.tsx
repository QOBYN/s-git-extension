import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { IS_ORCA } from './env';
import './styles/global.css';
import './styles/orca.css';

// Panel Orca: bật bảng ánh xạ màu --orca-* → --vscode-* (styles/orca.css). Entry
// HTML của Orca đã gắn sẵn; gắn lại ở đây phòng khi chạy từ entry khác.
if (IS_ORCA) {
  document.documentElement.dataset.sgHost = 'orca';
}

// Dev-only: hover element + ⌘C để copy context component (file:line) cho AI agent.
// Không bao giờ vào bundle production — vite tree-shake cả dynamic import này khi build.
if (import.meta.env.DEV) {
  import('react-grab');
}

// Webview không có devtools mở sẵn — MỌI lỗi phải hiện ra màn hình,
// không bao giờ để màn đen im lặng.
function showFatal(message: string): void {
  const box = document.createElement('pre');
  box.style.cssText =
    'color:var(--vscode-errorForeground,#f66);padding:12px;white-space:pre-wrap;font-size:12px';
  box.textContent = `S-Git crashed:\n${message}`;
  document.body.appendChild(box);
}

window.addEventListener('error', (event) => {
  // Sự kiện 'error' không có .error là lỗi tải resource (vd worker bị CSP chặn —
  // Monaco tự fallback chạy main thread): log là đủ, không phải crash của app.
  if (event.error instanceof Error) {
    showFatal(String(event.error.stack ?? event.error));
  } else {
    console.warn('S-Git resource error:', event);
  }
});
window.addEventListener('unhandledrejection', (event) => showFatal(String(event.reason)));

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <pre className="sg-error">
          S-Git crashed:{'\n'}
          {String(this.state.error.stack ?? this.state.error)}
        </pre>
      );
    }
    return this.props.children;
  }
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Thiếu #root trong index.html');
}
container.innerHTML = ''; // xoá text "Loading…" tĩnh
createRoot(container).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
