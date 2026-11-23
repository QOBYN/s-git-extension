// Copy vào clipboard trong webview. VSCode: navigator.clipboard; panel Orca chặn
// async clipboard API nên dùng execCommand('copy') — chạy NGAY trong lúc click
// (user gesture) mới được phép.

import { IS_ORCA } from '../env';

export function copyText(text: string): void {
  if (IS_ORCA || navigator.clipboard === undefined) {
    execCopy(text);
    return;
  }
  void navigator.clipboard.writeText(text).catch(() => execCopy(text));
}

function execCopy(text: string): void {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand('copy');
  } finally {
    area.remove();
    previous?.focus();
  }
}
