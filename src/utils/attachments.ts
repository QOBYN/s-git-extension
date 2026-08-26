// Chuyển File/ảnh dán từ clipboard thành FeedbackAttachment gửi qua RPC.
// Phần thuần (tách data URL, đặt tên, kiểm tra giới hạn) tách riêng để test được
// trong môi trường node — chỉ `fileToAttachment` cần API của trình duyệt.

import {
  FEEDBACK_MAX_ATTACHMENTS,
  FEEDBACK_MAX_ATTACHMENT_BYTES,
} from '../../shared/constants';
import type { FeedbackAttachment } from '../../shared/types';

/** Đuôi file suy ra từ MIME cho ảnh dán (clipboard không có tên file). */
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};

/** `data:image/png;base64,AAAA` → `AAAA`. Chuỗi không đúng dạng trả ''. */
export function base64FromDataUrl(dataUrl: string): string {
  const marker = ';base64,';
  const at = dataUrl.indexOf(marker);
  return at === -1 ? '' : dataUrl.slice(at + marker.length);
}

/** Tên cho ảnh dán từ clipboard: pasted-<hh-mm-ss>.<ext>. */
export function pastedImageName(mimeType: string, now: Date): string {
  const stamp = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-');
  return `pasted-${stamp}.${IMAGE_EXTENSIONS[mimeType] ?? 'png'}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Lọc danh sách file mới trước khi nạp: trả về những file nhận được và lý do
 * từ chối các file còn lại (hiện ngay trong form, không đợi tới lúc bấm Send).
 */
export function screenFiles<T extends { name: string; size: number }>(
  incoming: readonly T[],
  currentCount: number,
): { accepted: T[]; rejected: string[] } {
  const accepted: T[] = [];
  const rejected: string[] = [];
  for (const file of incoming) {
    if (file.size > FEEDBACK_MAX_ATTACHMENT_BYTES) {
      rejected.push(`${file.name} quá lớn (${formatBytes(file.size)} > ${formatBytes(FEEDBACK_MAX_ATTACHMENT_BYTES)})`);
    } else if (currentCount + accepted.length >= FEEDBACK_MAX_ATTACHMENTS) {
      rejected.push(`${file.name} bị bỏ qua — tối đa ${FEEDBACK_MAX_ATTACHMENTS} file`);
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

/** Đọc 1 File thành attachment base64 (FileReader — chỉ chạy trong webview). */
export function fileToAttachment(file: File, name = file.name): Promise<FeedbackAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Không đọc được file ${name}`));
    reader.onload = () =>
      resolve({
        name,
        mimeType: file.type,
        size: file.size,
        dataBase64: base64FromDataUrl(String(reader.result ?? '')),
      });
    reader.readAsDataURL(file);
  });
}

/** Ảnh thì hiện thumbnail trong form — data URL dựng lại từ attachment. */
export function attachmentPreviewUrl(attachment: FeedbackAttachment): string | null {
  return attachment.mimeType.startsWith('image/')
    ? `data:${attachment.mimeType};base64,${attachment.dataBase64}`
    : null;
}
