// Copy vào clipboard trong webview — navigator.clipboard hoạt động trong VSCode
// webview; fallback execCommand cho ngữ cảnh không cấp quyền.

export function copyText(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  });
}
