import { describe, expect, it } from 'vitest';
import { base64FromDataUrl, formatBytes, pastedImageName, screenFiles } from './attachments';

describe('base64FromDataUrl', () => {
  it('lấy phần base64 sau marker', () => {
    expect(base64FromDataUrl('data:image/png;base64,AAAB')).toBe('AAAB');
  });

  it('chuỗi không phải data URL base64 trả rỗng', () => {
    expect(base64FromDataUrl('data:text/plain,hello')).toBe('');
    expect(base64FromDataUrl('')).toBe('');
  });
});

describe('pastedImageName', () => {
  it('đặt tên theo giờ dán + đuôi suy từ MIME', () => {
    const at = new Date(2026, 0, 2, 9, 5, 7);
    expect(pastedImageName('image/png', at)).toBe('pasted-09-05-07.png');
    expect(pastedImageName('image/jpeg', at)).toBe('pasted-09-05-07.jpg');
  });

  it('MIME lạ vẫn có đuôi mặc định', () => {
    expect(pastedImageName('image/heic', new Date(2026, 0, 2, 0, 0, 0))).toBe('pasted-00-00-00.png');
  });
});

describe('screenFiles', () => {
  const file = (name: string, size: number) => ({ name, size });

  it('nhận file trong giới hạn', () => {
    const result = screenFiles([file('a.png', 1000), file('b.log', 2000)], 0);
    expect(result.accepted.map((f) => f.name)).toEqual(['a.png', 'b.log']);
    expect(result.rejected).toEqual([]);
  });

  it('từ chối file quá lớn kèm lý do', () => {
    const result = screenFiles([file('big.zip', 20 * 1024 * 1024)], 0);
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0]).toContain('big.zip quá lớn');
  });

  it('chặn khi vượt số lượng, tính cả file đã có sẵn', () => {
    const result = screenFiles([file('d.png', 10), file('e.png', 10)], 4);
    expect(result.accepted.map((f) => f.name)).toEqual(['d.png']);
    expect(result.rejected[0]).toContain('tối đa 5 file');
  });
});

describe('formatBytes', () => {
  it('đổi đơn vị theo kích thước', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
