// Phát hiện file nhị phân cho diff view — hàm thuần, test bằng Vitest.
// 2 tầng: đuôi file đã biết chắc (nhanh, đúng cả khi nội dung nhỏ) +
// heuristic byte NUL như chính git dùng (bắt các loại chưa liệt kê).

/** Đuôi file ảnh — webview render so sánh 2 ảnh cạnh nhau. */
export const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.avif',
]);

/** Đuôi file nhị phân khác — webview hiện thông tin thay vì diff chữ. */
const BINARY_EXTENSIONS = new Set([
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.7z',
  '.jar',
  '.exe',
  '.dll',
  '.dylib',
  '.so',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
  '.mp3',
  '.mp4',
  '.mov',
  '.sqlite',
  '.db',
]);

export function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot).toLowerCase();
}

export function isKnownBinaryExtension(path: string): boolean {
  const ext = extensionOf(path);
  return IMAGE_EXTENSIONS.has(ext) || BINARY_EXTENSIONS.has(ext);
}

/** Heuristic của git: có byte NUL trong 8000 byte đầu → nhị phân. */
export function hasBinaryContent(buffer: Buffer): boolean {
  const scanLength = Math.min(buffer.length, 8000);
  for (let i = 0; i < scanLength; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}
