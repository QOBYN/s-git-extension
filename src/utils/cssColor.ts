// Parse màu CSS thuần — tách khỏi monaco/theme.ts để test chạy trong node
// (theme.ts import monaco-editor vốn cần DOM).

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parse "#rgb/#rrggbb/#rrggbbaa" và "rgb()/rgba()" — đủ cho giá trị VSCode sinh ra. */
export function parseCssColor(value: string): Rgba | null {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    const h = hex[1];
    const expand = (s: string) => parseInt(s.length === 1 ? s + s : s, 16);
    if (h.length === 3 || h.length === 4) {
      return {
        r: expand(h[0]),
        g: expand(h[1]),
        b: expand(h[2]),
        a: h.length === 4 ? expand(h[3]) / 255 : 1,
      };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: expand(h.slice(0, 2)),
        g: expand(h.slice(2, 4)),
        b: expand(h.slice(4, 6)),
        a: h.length === 8 ? expand(h.slice(6, 8)) / 255 : 1,
      };
    }
    return null;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i.exec(
    value,
  );
  if (rgb) {
    const alphaRaw = rgb[4];
    const a =
      alphaRaw === undefined
        ? 1
        : alphaRaw.endsWith('%')
          ? Number(alphaRaw.slice(0, -1)) / 100
          : Number(alphaRaw);
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a };
  }
  return null;
}
