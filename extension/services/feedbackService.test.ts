import { describe, expect, it } from 'vitest';
import type { FeedbackPayload } from '../../shared/types';
import {
  FeedbackService,
  base64Bytes,
  formatFeedbackText,
  type FeedbackAppInfo,
  type FeedbackConfig,
  type TelegramApi,
  type TelegramRequest,
} from './feedbackService';

const APP_INFO: FeedbackAppInfo = {
  extensionVersion: '0.0.1',
  vscodeVersion: '1.100.0',
  platform: 'darwin',
};

/** TelegramApi giả: ghi lại request, tuỳ chọn ném lỗi ở lời gọi thứ n. */
class FakeTelegram implements TelegramApi {
  readonly calls: Array<{ botToken: string; request: TelegramRequest }> = [];

  constructor(private readonly failAt: number | null = null) {}

  async call(botToken: string, request: TelegramRequest): Promise<void> {
    this.calls.push({ botToken, request });
    if (this.failAt !== null && this.calls.length === this.failAt) {
      throw new Error('Telegram API: chat not found');
    }
  }
}

const CONFIG: FeedbackConfig = { botToken: 'token-1', chatId: '-100123', messageThreadId: '' };

function payload(overrides: Partial<FeedbackPayload> = {}): FeedbackPayload {
  return {
    category: 'bug',
    title: 'Nút stage không chạy',
    message: 'Bấm stage hunk thì không có gì xảy ra.',
    contact: 'trung',
    attachments: [],
    ...overrides,
  };
}

/** base64 của 3 byte bất kỳ — đủ để đóng vai nội dung file trong test. */
const SMALL_B64 = Buffer.from('abc').toString('base64');

describe('FeedbackService.send', () => {
  it('gửi đính kèm TRƯỚC rồi mới tới message', async () => {
    const api = new FakeTelegram();
    const service = new FeedbackService({ config: CONFIG, api, appInfo: APP_INFO });

    const result = await service.send(
      payload({
        attachments: [
          { name: 'shot.png', mimeType: 'image/png', size: 3, dataBase64: SMALL_B64 },
          { name: 'log.txt', mimeType: 'text/plain', size: 3, dataBase64: SMALL_B64 },
        ],
      }),
    );

    expect(result).toEqual({ ok: true, sentAttachments: 2, skippedAttachments: [] });
    expect(api.calls.map((c) => c.request.method)).toEqual([
      'sendPhoto',
      'sendDocument',
      'sendMessage',
    ]);
    expect(api.calls[0].request.file).toMatchObject({ field: 'photo', fileName: 'shot.png' });
    expect(api.calls[1].request.file).toMatchObject({ field: 'document', fileName: 'log.txt' });
    expect(api.calls[2].request.fields.text).toContain('Bấm stage hunk');
  });

  it('gắn message_thread_id khi group dùng topic', async () => {
    const api = new FakeTelegram();
    const service = new FeedbackService({
      config: { ...CONFIG, messageThreadId: '42' },
      api,
      appInfo: APP_INFO,
    });

    await service.send(payload());

    expect(api.calls[0].request.fields.message_thread_id).toBe('42');
  });

  it('ảnh SVG đi đường document (Telegram không nhận làm photo)', async () => {
    const api = new FakeTelegram();
    const service = new FeedbackService({ config: CONFIG, api, appInfo: APP_INFO });

    await service.send(
      payload({
        attachments: [{ name: 'i.svg', mimeType: 'image/svg+xml', size: 3, dataBase64: SMALL_B64 }],
      }),
    );

    expect(api.calls[0].request.method).toBe('sendDocument');
  });

  it('chưa cấu hình thì không gọi API và báo lỗi rõ ràng', async () => {
    const api = new FakeTelegram();
    const service = new FeedbackService({
      config: { botToken: '', chatId: '', messageThreadId: '' },
      api,
      appInfo: APP_INFO,
    });

    const result = await service.send(payload());

    expect(result.ok).toBe(false);
    expect(api.calls).toHaveLength(0);
    expect(result.ok === false && result.error).toContain('chưa gắn group Telegram');
  });

  it('nội dung rỗng bị chặn tại chỗ', async () => {
    const api = new FakeTelegram();
    const service = new FeedbackService({ config: CONFIG, api, appInfo: APP_INFO });

    const result = await service.send(payload({ title: '  ', message: '\n' }));

    expect(result).toEqual({ ok: false, error: 'Nội dung góp ý đang trống.' });
    expect(api.calls).toHaveLength(0);
  });

  it('file quá lớn bị chặn trước khi gửi bất cứ thứ gì', async () => {
    const api = new FakeTelegram();
    const service = new FeedbackService({ config: CONFIG, api, appInfo: APP_INFO });
    const huge = 'A'.repeat(11 * 1024 * 1024 * 2); // ~16.5 MB sau decode

    const result = await service.send(
      payload({ attachments: [{ name: 'big.bin', mimeType: '', size: 0, dataBase64: huge }] }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('big.bin');
    expect(api.calls).toHaveLength(0);
  });

  it('1 đính kèm hỏng KHÔNG chặn message — file đó bị bỏ qua và ghi vào nội dung', async () => {
    const api = new FakeTelegram(1); // file đầu hỏng
    const service = new FeedbackService({ config: CONFIG, api, appInfo: APP_INFO });

    const result = await service.send(
      payload({
        attachments: [
          { name: 'hong.png', mimeType: 'image/png', size: 3, dataBase64: SMALL_B64 },
          { name: 'ok.txt', mimeType: 'text/plain', size: 3, dataBase64: SMALL_B64 },
        ],
      }),
    );

    expect(result).toEqual({ ok: true, sentAttachments: 1, skippedAttachments: ['hong.png'] });
    // Vẫn đủ 3 lời gọi: file hỏng, file ok, message.
    expect(api.calls.map((c) => c.request.method)).toEqual([
      'sendPhoto',
      'sendDocument',
      'sendMessage',
    ]);
    const text = api.calls[2].request.fields.text;
    expect(text).toContain('Không gửi được: hong.png');
    expect(text).toContain('Attachments (gửi ngay trên): ok.txt');
  });

  it('mọi đính kèm hỏng nhưng message vẫn tới nơi', async () => {
    const api = new FakeTelegram(1);
    const service = new FeedbackService({ config: CONFIG, api, appInfo: APP_INFO });

    const result = await service.send(
      payload({
        attachments: [{ name: 'a.png', mimeType: 'image/png', size: 3, dataBase64: SMALL_B64 }],
      }),
    );

    expect(result).toEqual({ ok: true, sentAttachments: 0, skippedAttachments: ['a.png'] });
  });

  it('lỗi ở bước message nói rõ đã gửi được mấy đính kèm', async () => {
    const api = new FakeTelegram(2); // đính kèm 1 ok, message hỏng
    const service = new FeedbackService({ config: CONFIG, api, appInfo: APP_INFO });

    const result = await service.send(
      payload({
        attachments: [{ name: 'shot.png', mimeType: 'image/png', size: 3, dataBase64: SMALL_B64 }],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('Đã gửi 1 đính kèm');
    expect(result.ok === false && result.error).toContain('chat not found');
  });

  it('isConfigured chỉ đúng khi có cả token lẫn chat id', () => {
    const api = new FakeTelegram();
    const make = (config: FeedbackConfig) =>
      new FeedbackService({ config, api, appInfo: APP_INFO }).isConfigured();

    expect(make(CONFIG)).toBe(true);
    expect(make({ ...CONFIG, chatId: '   ' })).toBe(false);
    expect(make({ ...CONFIG, botToken: '' })).toBe(false);
  });
});

describe('formatFeedbackText', () => {
  it('có tiêu đề, nội dung, người gửi, repo và môi trường', () => {
    const text = formatFeedbackText(
      payload({
        context: { screen: 'main', repoName: 's-git', branch: 'main' },
        attachments: [{ name: 'shot.png', mimeType: 'image/png', size: 3, dataBase64: SMALL_B64 }],
      }),
      APP_INFO,
    );

    expect(text).toContain('🐞 Bug');
    expect(text).toContain('Nút stage không chạy');
    expect(text).toContain('From: trung');
    expect(text).toContain('Repo: s-git @ main');
    expect(text).toContain('S-Git 0.0.1 · VS Code 1.100.0 · darwin');
    expect(text).toContain('shot.png');
  });

  it('không có contact thì ghi ẩn danh', () => {
    expect(formatFeedbackText(payload({ contact: '  ' }), APP_INFO)).toContain('From: (ẩn danh)');
  });

  it('message quá dài bị cắt nhưng footer vẫn còn nguyên', () => {
    const text = formatFeedbackText(payload({ message: 'x'.repeat(9000) }), APP_INFO);

    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text).toContain('From: trung');
    expect(text).toContain('S-Git 0.0.1');
  });
});

describe('base64Bytes', () => {
  it('tính đúng kích thước thật kể cả có ký tự đệm', () => {
    expect(base64Bytes(Buffer.from('abc').toString('base64'))).toBe(3); // không đệm
    expect(base64Bytes(Buffer.from('ab').toString('base64'))).toBe(2); // 1 dấu '='
    expect(base64Bytes(Buffer.from('a').toString('base64'))).toBe(1); // 2 dấu '='
    expect(base64Bytes('')).toBe(0);
  });
});
