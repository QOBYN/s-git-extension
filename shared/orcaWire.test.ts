import { describe, expect, it } from 'vitest';
import { splitChunks } from './orcaWire';

describe('splitChunks', () => {
  it('cắt đều theo size, ghép lại đúng chuỗi gốc', () => {
    const text = 'abcdefghij';
    const parts = splitChunks(text, 3);
    expect(parts).toEqual(['abc', 'def', 'ghi', 'j']);
    expect(parts.join('')).toBe(text);
  });

  it('chuỗi rỗng → không mảnh nào; ngắn hơn size → 1 mảnh', () => {
    expect(splitChunks('', 4)).toEqual([]);
    expect(splitChunks('ab', 4)).toEqual(['ab']);
  });

  it('không cắt giữa cặp surrogate (emoji)', () => {
    const text = 'a😀b😀c'; // 😀 = 2 code unit
    const parts = splitChunks(text, 2);
    expect(parts.join('')).toBe(text);
    for (const part of parts) {
      const last = part.charCodeAt(part.length - 1);
      expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
    }
  });

  it('size < 2 bị từ chối (không thể tránh cắt surrogate)', () => {
    expect(() => splitChunks('abc', 1)).toThrow();
  });
});
