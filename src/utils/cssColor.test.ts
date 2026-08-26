import { describe, expect, it } from 'vitest';
import { parseCssColor } from '../utils/cssColor';

describe('parseCssColor', () => {
  it('parse hex 6 và 8 ký tự', () => {
    expect(parseCssColor('#3fb950')).toEqual({ r: 63, g: 185, b: 80, a: 1 });
    expect(parseCssColor('#3fb95080')).toEqual({ r: 63, g: 185, b: 80, a: 128 / 255 });
  });

  it('parse hex 3 ký tự', () => {
    expect(parseCssColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('parse rgb() và rgba()', () => {
    expect(parseCssColor('rgb(155, 185, 85)')).toEqual({ r: 155, g: 185, b: 85, a: 1 });
    expect(parseCssColor('rgba(155, 185, 85, 0.2)')).toEqual({ r: 155, g: 185, b: 85, a: 0.2 });
  });

  it('giá trị lạ trả null (dùng fallback, không sập)', () => {
    expect(parseCssColor('var(--x)')).toBeNull();
    expect(parseCssColor('')).toBeNull();
  });
});
