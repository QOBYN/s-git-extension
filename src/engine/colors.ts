// Bảng màu rail cho graph — chọn các hue cách đều, đủ tương phản trên cả
// dark lẫn light theme. Engine trả colorId là số nguyên tăng dần;
// renderer map qua bảng này bằng modulo — engine KHÔNG biết bảng màu.

export const RAIL_PALETTE: readonly string[] = [
  '#4e9de6', // xanh dương — lane 0 thường là nhánh chính
  '#e0823d', // cam
  '#4db354', // xanh lá
  '#c678dd', // tím
  '#e05561', // đỏ
  '#2bbac5', // cyan
  '#d4a959', // vàng đất
  '#7d8fe0', // xanh tím
  '#5fb37e', // xanh ngọc
  '#d46fa8', // hồng
  '#9aa657', // olive
  '#c17f5f', // nâu cam
];

export function railColor(colorId: number): string {
  return RAIL_PALETTE[colorId % RAIL_PALETTE.length];
}
