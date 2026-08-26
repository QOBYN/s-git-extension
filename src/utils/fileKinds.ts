// Phân loại file cho diff view — quyết định render Monaco / ảnh / bảng CSV / binary.

import type { DiffPayload } from '../../shared/types';

export type DiffViewKind = 'text' | 'image' | 'csv' | 'binary';

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml', // svg là text nhưng preview ảnh hữu ích hơn diff XML
};

const CSV_EXTENSIONS = new Set(['.csv', '.tsv']);

export function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot).toLowerCase();
}

export function imageMimeOf(path: string): string | null {
  return IMAGE_MIME[extensionOf(path)] ?? null;
}

/** Loại view phù hợp — host đã quyết text/base64, webview quyết CÁCH hiển thị. */
export function diffViewKind(path: string, diff: DiffPayload): DiffViewKind {
  const mime = imageMimeOf(path);
  if (mime !== null) {
    return 'image';
  }
  if (diff.encoding === 'base64') {
    return 'binary';
  }
  if (CSV_EXTENSIONS.has(extensionOf(path))) {
    return 'csv';
  }
  return 'text';
}

/** data: URI cho ảnh — CSP img-src đã cho phép data:. SVG text cần encode lại. */
export function imageDataUri(path: string, content: string, encoding: 'text' | 'base64'): string | null {
  if (content === '') {
    return null; // phía added/deleted không có ảnh
  }
  const mime = imageMimeOf(path);
  if (mime === null) {
    return null;
  }
  const base64 = encoding === 'base64' ? content : btoa(unescape(encodeURIComponent(content)));
  return `data:${mime};base64,${base64}`;
}

/** Kích thước gần đúng (byte) từ nội dung payload — hiện ở view binary/ảnh. */
export function contentByteSize(content: string, encoding: 'text' | 'base64'): number {
  if (encoding === 'base64') {
    // 4 ký tự base64 = 3 byte; trừ padding.
    const padding = content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0;
    return Math.max(0, (content.length * 3) / 4 - padding);
  }
  return new TextEncoder().encode(content).length;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
