// Theme Monaco riêng cho diff — lấy màu diff từ CSS variables của THEME VSCODE
// hiện tại rồi ép độ đậm tối thiểu: nhiều theme để alpha quá nhạt, vùng thay đổi
// nhìn không rõ (yêu cầu user: "hiển thị màu để rõ phần change").

import * as monaco from 'monaco-editor';
import { parseCssColor, type Rgba } from '../utils/cssColor';

/** Alpha tối thiểu — dưới ngưỡng này vùng đổi bị chìm vào nền. */
const MIN_LINE_ALPHA = 0.16; // nền cả dòng thêm/xoá
const MIN_TEXT_ALPHA = 0.38; // intra-line: phần chữ thực sự đổi (đậm hơn nền dòng)

/** Fallback khi theme của user không định nghĩa màu diff. */
const FALLBACK_INSERTED = { r: 63, g: 185, b: 80 }; // xanh git
const FALLBACK_REMOVED = { r: 248, g: 81, b: 73 }; // đỏ git

/**
 * Định nghĩa (đè) theme s-git theo theme VSCode hiện tại và trả về tên theme.
 * Gọi lại mỗi lần user đổi theme — defineTheme cùng tên sẽ ghi đè.
 */
export function defineSmartGitTheme(): string {
  const body = document.body.classList;
  // VSCode gắn class theme lên <body>; panel Orca gắn `light`/`dark` lên <html>.
  const base: monaco.editor.BuiltinTheme =
    body.contains('vscode-light') || document.documentElement.classList.contains('light')
      ? 'vs'
      : body.contains('vscode-high-contrast')
        ? 'hc-black'
        : 'vs-dark';
  const name = `s-git-${base}`;

  const inserted = readVar('--vscode-diffEditor-insertedTextBackground') ?? {
    ...FALLBACK_INSERTED,
    a: MIN_TEXT_ALPHA,
  };
  const removed = readVar('--vscode-diffEditor-removedTextBackground') ?? {
    ...FALLBACK_REMOVED,
    a: MIN_TEXT_ALPHA,
  };
  const insertedLine =
    readVar('--vscode-diffEditor-insertedLineBackground') ?? { ...inserted, a: MIN_LINE_ALPHA };
  const removedLine =
    readVar('--vscode-diffEditor-removedLineBackground') ?? { ...removed, a: MIN_LINE_ALPHA };

  try {
    monaco.editor.defineTheme(name, {
      base,
      inherit: true,
      rules: [],
      colors: {
        'diffEditor.insertedTextBackground': toHex(inserted, MIN_TEXT_ALPHA),
        'diffEditor.removedTextBackground': toHex(removed, MIN_TEXT_ALPHA),
        'diffEditor.insertedLineBackground': toHex(insertedLine, MIN_LINE_ALPHA),
        'diffEditor.removedLineBackground': toHex(removedLine, MIN_LINE_ALPHA),
        // Gutter đậm hơn dòng một chút — cột +/- nổi rõ như SmartGit.
        'diffEditorGutter.insertedLineBackground': toHex(insertedLine, MIN_LINE_ALPHA + 0.06),
        'diffEditorGutter.removedLineBackground': toHex(removedLine, MIN_LINE_ALPHA + 0.06),
      },
    });
    return name;
  } catch {
    // Màu từ CSS var có định dạng lạ → dùng theme gốc, không làm sập diff.
    return base;
  }
}

/** Đọc 1 CSS variable màu của VSCode; null nếu không có/không parse được. */
function readVar(name: string): Rgba | null {
  const raw = getComputedStyle(document.body).getPropertyValue(name).trim();
  return raw === '' ? null : parseCssColor(raw);
}


/** '#rrggbbaa' với alpha không thấp hơn `minAlpha` — chính là bước "làm rõ màu". */
function toHex(color: Rgba, minAlpha: number): string {
  const channel = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  const alpha = Math.max(color.a, minAlpha);
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}${channel(alpha * 255)}`;
}
