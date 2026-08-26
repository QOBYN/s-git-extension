// Cổng HTTP thật tới Telegram Bot API (impl của TelegramApi trong
// services/feedbackService.ts). Đây là NƠI DUY NHẤT extension gọi ra mạng —
// webview không gọi được vì CSP `default-src 'none'` chặn hết.
//
// Dùng fetch/FormData/Blob toàn cục của Node 20 (VSCode ≥1.100) — không thêm
// dependency runtime nào.

import type { TelegramApi, TelegramRequest } from '../services/feedbackService';

/** Quá hạn 1 request (ms) — file 10MB qua mạng chậm vẫn kịp, mà không treo mãi. */
const REQUEST_TIMEOUT_MS = 60_000;

export class HttpTelegramApi implements TelegramApi {
  constructor(private readonly timeoutMs: number = REQUEST_TIMEOUT_MS) {}

  async call(botToken: string, request: TelegramRequest): Promise<void> {
    const body = new FormData();
    for (const [key, value] of Object.entries(request.fields)) {
      body.append(key, value);
    }
    if (request.file) {
      const bytes = Buffer.from(request.file.dataBase64, 'base64');
      body.append(
        request.file.field,
        new Blob([bytes], { type: request.file.mimeType }),
        request.file.fileName,
      );
    }

    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${botToken}/${request.method}`, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      // Lỗi mạng/timeout: nói rõ là không tới được Telegram, đừng để user đoán.
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Không gọi được Telegram (${request.method}): ${reason}`);
    }

    // Bot API luôn trả JSON, kể cả khi HTTP status là 4xx — đọc description để
    // hiện đúng lý do ("chat not found", "bot was blocked"…).
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      description?: string;
    } | null;
    if (payload?.ok !== true) {
      const description = payload?.description ?? `HTTP ${response.status}`;
      throw new Error(`Telegram từ chối ${request.method}: ${description}`);
    }
  }
}
