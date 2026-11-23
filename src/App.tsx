// Chọn màn hình theo vai của webview (host inject qua window.__SMARTGIT_INIT__ —
// xem extension/views/webviewHost.ts). 1 bundle, nhiều vai — kể cả panel Orca.

import { IS_ORCA } from './env';
import { FileLogScreen } from './screens/FileLogScreen';
import { MainScreen } from './screens/MainScreen';
import { OrcaScreen } from './screens/OrcaScreen';
import { SidebarScreen } from './screens/SidebarScreen';

export function App() {
  // Panel plugin Orca: 1 panel gộp sidebar + panel chính (screens/OrcaScreen).
  if (IS_ORCA) {
    return <OrcaScreen />;
  }
  switch (window.__SMARTGIT_INIT__?.screen ?? 'main') {
    case 'sidebar':
      return <SidebarScreen />;
    case 'file-log':
      return <FileLogScreen />;
    case 'main':
    default:
      return <MainScreen />;
  }
}
