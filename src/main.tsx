import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

// Webview không có devtools mở sẵn — MỌI lỗi phải hiện ra màn hình,
// không bao giờ để màn đen im lặng.
function showFatal(message: string): void {
  const box = document.createElement('pre');
  box.style.cssText =
    'color:var(--vscode-errorForeground,#f66);padding:12px;white-space:pre-wrap;font-size:12px';
  box.textContent = `SmartGit crashed:\n${message}`;
  document.body.appendChild(box);
}

window.addEventListener('error', (event) => {
  // Sự kiện 'error' không có .error là lỗi tải resource (vd worker bị CSP chặn —
  // Monaco tự fallback chạy main thread): log là đủ, không phải crash của app.
  if (event.error instanceof Error) {
    showFatal(String(event.error.stack ?? event.error));
  } else {
    console.warn('SmartGit resource error:', event);
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
          SmartGit crashed:{'\n'}
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
