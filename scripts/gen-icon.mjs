// Sinh media/icon.png từ media/icon.svg.
//
// Marketplace KHÔNG nhận SVG cho trường `icon` trong package.json — bắt buộc PNG,
// tối thiểu 128×128 (khuyến nghị 256×256 cho màn Retina). Icon activity bar
// (media/s-git.svg) thì ngược lại: SVG mới đổi màu theo theme được.
//
// Chạy: npm run icon    (sau mỗi lần sửa media/icon.svg)

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(ROOT, 'media/icon.svg');

/** [tên file, cạnh px] — 256 là bản Marketplace dùng, 128 để đối chiếu độ đọc được. */
const TARGETS = [
  ['media/icon.png', 256],
  ['media/icon-128.png', 128],
];

const svg = readFileSync(SOURCE);

for (const [rel, size] of TARGETS) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    // Nền trong suốt: icon.svg đã tự vẽ rect bo góc làm nền, để resvg thêm nền
    // nữa sẽ lòi 4 góc vuông ra ngoài bo góc.
    background: 'rgba(0,0,0,0)',
  })
    .render()
    .asPng();

  writeFileSync(resolve(ROOT, rel), png);
  console.log(`✓ ${rel}  ${size}×${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
