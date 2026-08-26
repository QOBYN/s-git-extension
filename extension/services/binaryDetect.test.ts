import { describe, expect, it } from 'vitest';
import { extensionOf, hasBinaryContent, isKnownBinaryExtension } from './binaryDetect';

describe('binaryDetect', () => {
  it('nhận diện đuôi ảnh và binary, không phân biệt hoa thường', () => {
    expect(isKnownBinaryExtension('assets/logo.PNG')).toBe(true);
    expect(isKnownBinaryExtension('doc.pdf')).toBe(true);
    expect(isKnownBinaryExtension('src/app.ts')).toBe(false);
    expect(isKnownBinaryExtension('Makefile')).toBe(false);
  });

  it('byte NUL trong 8000 byte đầu → nhị phân', () => {
    expect(hasBinaryContent(Buffer.from('hello\0world'))).toBe(true);
    expect(hasBinaryContent(Buffer.from('xin chào thế giới'))).toBe(false);
  });

  it('NUL nằm sau 8000 byte đầu không tính (giống git)', () => {
    const buffer = Buffer.concat([Buffer.alloc(9000, 0x61), Buffer.from([0])]);
    expect(hasBinaryContent(buffer)).toBe(false);
  });

  it('extensionOf lấy đuôi thường hoá', () => {
    expect(extensionOf('a/b/C.JPG')).toBe('.jpg');
    expect(extensionOf('noext')).toBe('');
  });
});
