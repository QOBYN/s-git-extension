// Gửi góp ý của người dùng vào group Telegram. Thuần TS, KHÔNG import 'vscode'
// và KHÔNG tự gọi HTTP — mọi request đi qua cổng TelegramApi (impl thật ở
// adapters/telegramApi.ts, impl giả trong test).
//
// Thứ tự gửi CỐ ĐỊNH: từng file đính kèm trước, message sau (yêu cầu nghiệp vụ —
// trong group, phần chữ đứng ngay dưới các file của chính nó).

import {
  FEEDBACK_MAX_ATTACHMENTS,
  FEEDBACK_MAX_ATTACHMENT_BYTES,
  TELEGRAM_MAX_CAPTION_CHARS,
  TELEGRAM_MAX_MESSAGE_CHARS,
} from '../../shared/constants';
import type {
  FeedbackAttachment,
  FeedbackCategory,
  FeedbackPayload,
  FeedbackResult,
} from '../../shared/types';

/**
 * Đích Telegram — FIX CỨNG trong bundle (extension/feedbackTarget.ts), không
 * phải setting của người dùng.
 */
export interface FeedbackConfig {
  botToken: string;
  chatId: string;
  /** Group có topic: id của topic đích; rỗng = gửi vào luồng chung. */
  messageThreadId: string;
}

/** 1 lời gọi Bot API. `file` có thì request là multipart, không thì form thường. */
export interface TelegramRequest {
  method: 'sendMessage' | 'sendPhoto' | 'sendDocument';
  fields: Record<string, string>;
  file?: {
    /** Tên field theo Bot API: 'photo' cho sendPhoto, 'document' cho sendDocument. */
    field: 'photo' | 'document';
    fileName: string;
    mimeType: string;
    dataBase64: string;
  };
}

/** Cổng HTTP tới Telegram Bot API — ném Error khi Telegram trả ok=false. */
export interface TelegramApi {
  call(botToken: string, request: TelegramRequest): Promise<void>;
}

/** Thông tin môi trường đính vào message — người nhận biết bug ở bản nào. */
export interface FeedbackAppInfo {
  extensionVersion: string;
  vscodeVersion: string;
  platform: string;
}

export interface FeedbackServiceDeps {
  config: FeedbackConfig;
  api: TelegramApi;
  appInfo: FeedbackAppInfo;
}

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: '🐞 Bug',
  idea: '💡 Idea',
  question: '❓ Question',
  other: '💬 Other',
};

export class FeedbackService {
  constructor(private readonly deps: FeedbackServiceDeps) {}

  isConfigured(): boolean {
    const { botToken, chatId } = this.deps.config;
    return botToken.trim() !== '' && chatId.trim() !== '';
  }

  async send(payload: FeedbackPayload): Promise<FeedbackResult> {
    const config = this.deps.config;
    const problem = validate(config, payload);
    if (problem !== null) {
      return { ok: false, error: problem };
    }

    const base: Record<string, string> = { chat_id: config.chatId.trim() };
    if (config.messageThreadId.trim() !== '') {
      base.message_thread_id = config.messageThreadId.trim();
    }

    let sentAttachments = 0;
    const skippedAttachments: string[] = [];

    // 1) Đính kèm trước — ảnh gửi dạng photo (xem được ngay trong group),
    //    còn lại gửi dạng document (giữ nguyên tên + không bị nén).
    //    1 file hỏng (quá khổ với Telegram, mạng đứt) KHÔNG được chặn phần chữ:
    //    ghi vào skipped rồi đi tiếp — góp ý đến nơi vẫn hơn là mất trắng.
    for (const attachment of payload.attachments) {
      const asPhoto = isImage(attachment);
      try {
        await this.deps.api.call(config.botToken.trim(), {
          method: asPhoto ? 'sendPhoto' : 'sendDocument',
          fields: { ...base, caption: cut(attachment.name, TELEGRAM_MAX_CAPTION_CHARS) },
          file: {
            field: asPhoto ? 'photo' : 'document',
            fileName: attachment.name,
            mimeType: attachment.mimeType || 'application/octet-stream',
            dataBase64: attachment.dataBase64,
          },
        });
        sentAttachments += 1;
      } catch {
        skippedAttachments.push(attachment.name);
      }
    }

    // 2) Message sau cùng — đây mới là thứ bắt buộc phải tới; hỏng thì cả lần
    //    gửi coi như thất bại (vd token bị đổi/thu hồi sau này).
    try {
      await this.deps.api.call(config.botToken.trim(), {
        method: 'sendMessage',
        fields: {
          ...base,
          text: formatFeedbackText(payload, this.deps.appInfo, skippedAttachments),
          disable_web_page_preview: 'true',
        },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        error:
          sentAttachments > 0
            ? `Đã gửi ${sentAttachments} đính kèm nhưng không gửi được nội dung: ${reason}`
            : reason,
      };
    }

    return { ok: true, sentAttachments, skippedAttachments };
  }
}

/** Trả null nếu hợp lệ, ngược lại là thông điệp lỗi hiển thị cho user. */
function validate(config: FeedbackConfig, payload: FeedbackPayload): string | null {
  if (config.botToken.trim() === '' || config.chatId.trim() === '') {
    // Đích fix cứng trong bundle — user không tự sửa được, chỉ báo người build.
    return 'Bản build này chưa gắn group Telegram nhận feedback (extension/feedbackTarget.ts) — báo người build giúp.';
  }
  if (payload.message.trim() === '' && payload.title.trim() === '') {
    return 'Nội dung góp ý đang trống.';
  }
  if (payload.attachments.length > FEEDBACK_MAX_ATTACHMENTS) {
    return `Tối đa ${FEEDBACK_MAX_ATTACHMENTS} file đính kèm mỗi lần gửi.`;
  }
  const tooBig = payload.attachments.find(
    (a) => base64Bytes(a.dataBase64) > FEEDBACK_MAX_ATTACHMENT_BYTES,
  );
  if (tooBig !== undefined) {
    const limitMb = Math.round(FEEDBACK_MAX_ATTACHMENT_BYTES / (1024 * 1024));
    return `File "${tooBig.name}" vượt quá ${limitMb} MB.`;
  }
  return null;
}

/** Số byte thật của chuỗi base64 (4 ký tự = 3 byte, trừ phần đệm '='). */
export function base64Bytes(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((data.length * 3) / 4) - padding);
}

function isImage(attachment: FeedbackAttachment): boolean {
  return (
    attachment.mimeType.startsWith('image/') &&
    // SVG/TIFF Telegram không nhận làm photo — đẩy sang document cho chắc.
    !/^image\/(svg\+xml|tiff)$/.test(attachment.mimeType)
  );
}

/**
 * Dựng message dạng CHỮ THƯỜNG (không parse_mode): nội dung do user gõ nên mọi
 * markup đều là mồi lỗi escape — plain text thì không bao giờ hỏng.
 */
export function formatFeedbackText(
  payload: FeedbackPayload,
  appInfo: FeedbackAppInfo,
  /** File gửi hỏng — ghi vào message để người nhận biết mà hỏi lại. */
  skippedAttachments: readonly string[] = [],
): string {
  const title = payload.title.trim();
  const header = [
    `${CATEGORY_LABELS[payload.category] ?? CATEGORY_LABELS.other} · S-Git Feedback`,
    ...(title === '' ? [] : [title]),
    '',
  ];

  const footer = ['', '—'];
  footer.push(`From: ${payload.contact.trim() === '' ? '(ẩn danh)' : payload.contact.trim()}`);
  const context = payload.context;
  if (context) {
    const repo = [context.repoName, context.branch].filter(Boolean).join(' @ ');
    if (repo !== '') {
      footer.push(`Repo: ${repo}`);
    }
    footer.push(`Screen: ${context.screen}`);
  }
  footer.push(
    `Env: S-Git ${appInfo.extensionVersion} · VS Code ${appInfo.vscodeVersion} · ${appInfo.platform}`,
  );
  const sent = payload.attachments
    .map((a) => a.name)
    .filter((name) => !skippedAttachments.includes(name));
  if (sent.length > 0) {
    footer.push(`Attachments (gửi ngay trên): ${sent.join(', ')}`);
  }
  if (skippedAttachments.length > 0) {
    footer.push(`⚠ Không gửi được: ${skippedAttachments.join(', ')}`);
  }

  // Message dài thì CẮT PHẦN MESSAGE, không cắt cả chuỗi — footer (env, repo,
  // danh sách đính kèm) là thứ người nhận cần nhất, phải luôn còn.
  const fixed = [...header, ...footer].join('\n');
  // -1 cho ký tự '\n' nối thêm khi chèn message vào giữa.
  const budget = Math.max(0, TELEGRAM_MAX_MESSAGE_CHARS - fixed.length - 1);
  const message = cut(payload.message.trim(), budget);

  return (message === '' ? [...header, ...footer] : [...header, message, ...footer]).join('\n');
}

/** Cắt cho vừa trần Telegram, có dấu … để người đọc biết là bị cắt. */
function cut(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}
