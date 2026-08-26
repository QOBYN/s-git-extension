// Chọn màn hình theo vai của webview (host inject qua window.__SMARTGIT_INIT__ —
// xem extension/views/webviewHost.ts). 1 bundle, nhiều vai.

import { FileLogScreen } from './screens/FileLogScreen';
import { MainScreen } from './screens/MainScreen';
import { SidebarScreen } from './screens/SidebarScreen';

export function App() {
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
