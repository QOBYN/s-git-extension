import { describe, expect, it } from 'vitest';
import { layoutGraph } from './graphLayout';
import type { CommitInfo } from '../../shared/types';

/** Dựng commit tối giản cho topology test. */
function commit(oid: string, ...parents: string[]): CommitInfo {
  return {
    oid,
    parents,
    author: 'A',
    email: 'a@x.com',
    date: '2026-08-26T09:00:00+07:00',
    refs: [],
    subject: oid,
  };
}

describe('layoutGraph — các topology chuẩn (architecture.md mục 5)', () => {
  it('chuỗi thẳng: tất cả lane 0, cùng màu, không đường xuyên', () => {
    const { rows, laneCount } = layoutGraph([commit('c1', 'c2'), commit('c2', 'c3'), commit('c3')]);

    expect(laneCount).toBe(1);
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0]);
    expect(new Set(rows.map((r) => r.color)).size).toBe(1);
    expect(rows.every((r) => r.through.length === 0)).toBe(true);
    // Commit giữa chuỗi: 1 cạnh vào + 1 cạnh ra, đều thẳng.
    expect(rows[1].intoDot).toEqual([{ from: 0, to: 0, color: 0 }]);
    expect(rows[1].outOfDot).toEqual([{ from: 0, to: 0, color: 0 }]);
    // Commit gốc: không có cạnh ra.
    expect(rows[2].outOfDot).toEqual([]);
  });

  it('merge chéo: nhánh phụ mở lane 1 rồi hội tụ về lane 0', () => {
    // m(c2,c3) → c2 → c4 ; c3 → c4 ; c4 gốc
    const { rows, laneCount } = layoutGraph([
      commit('m', 'c2', 'c3'),
      commit('c2', 'c4'),
      commit('c3', 'c4'),
      commit('c4'),
    ]);

    expect(laneCount).toBe(2);
    // Merge commit: 2 cạnh ra — thẳng xuống lane 0 và cong sang lane 1 (màu mới).
    expect(rows[0].lane).toBe(0);
    expect(rows[0].outOfDot).toEqual([
      { from: 0, to: 0, color: 0 },
      { from: 0, to: 1, color: 1 },
    ]);
    // c2 ở lane 0; lane 1 (đang chờ c3) chạy xuyên qua hàng.
    expect(rows[1].lane).toBe(0);
    expect(rows[1].through).toEqual([{ from: 1, to: 1, color: 1 }]);
    // c3 ở lane 1, first-parent c4 đã có lane 0 chờ → cong hội tụ, lane 1 kết thúc.
    expect(rows[2].lane).toBe(1);
    expect(rows[2].outOfDot).toEqual([{ from: 1, to: 0, color: 0 }]);
    // c4: chỉ còn 1 cạnh vào thẳng (lane 1 đã hội tụ từ hàng trên).
    expect(rows[3].lane).toBe(0);
    expect(rows[3].intoDot).toEqual([{ from: 0, to: 0, color: 0 }]);
  });

  it('nhiều lane cùng chờ 1 commit (octopus con) gộp cạnh vào dot', () => {
    // m có 3 parent: p1 p2 p3; cả 3 là chuỗi rời đến gốc chung? — đơn giản:
    // p2, p3 đều trỏ p1 → khi p1 xuất hiện có 3 lane chờ nó.
    const { rows } = layoutGraph([
      commit('m', 'p1', 'p2', 'p3'),
      commit('p2', 'p1'),
      commit('p3', 'p1'),
      commit('p1'),
    ]);

    const p1Row = rows[3];
    // p1 nhận cạnh vào từ lane 0 (chuỗi chính) và các lane hội tụ trước đó đã gộp dần.
    expect(p1Row.lane).toBe(0);
    expect(p1Row.intoDot.length).toBeGreaterThanOrEqual(1);
    expect(p1Row.intoDot.every((e) => e.to === 0)).toBe(true);
  });

  it('tip mới xuất hiện giữa danh sách mở lane mới với màu mới', () => {
    // main: a→b; nhánh khác: x→b (x không có con trong danh sách = tip)
    const { rows, laneCount } = layoutGraph([commit('a', 'b'), commit('x', 'b'), commit('b')]);

    expect(laneCount).toBe(2);
    expect(rows[1].lane).toBe(1); // tip x không chen vào lane 0
    expect(rows[1].intoDot).toEqual([]); // tip không có cạnh vào
    expect(rows[1].color).not.toBe(rows[0].color);
    // x hội tụ về lane 0 ngay tại hàng của nó (first-parent b đã có lane 0 chờ) —
    // đường cong vẽ ở hàng con, hàng b chỉ còn 1 cạnh vào thẳng.
    expect(rows[1].outOfDot).toEqual([{ from: 1, to: 0, color: 0 }]);
    expect(rows[2].intoDot).toEqual([{ from: 0, to: 0, color: 0 }]);
  });

  it('lịch sử đứt đoạn (disjoint — ui-analysis C): 2 chuỗi độc lập, chuỗi sau tái dùng lane 0', () => {
    const { rows, laneCount } = layoutGraph([
      commit('a', 'b'),
      commit('b'), // chuỗi 1 kết thúc, lane 0 được giải phóng
      commit('x', 'y'), // chuỗi 2 bắt đầu
      commit('y'),
    ]);

    expect(laneCount).toBe(1);
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0, 0]);
    // Chuỗi 2 phải có MÀU khác chuỗi 1 dù cùng lane.
    expect(rows[2].color).not.toBe(rows[0].color);
    expect(rows[2].intoDot).toEqual([]); // không nối gì với chuỗi trên
  });

  it('lane được tái sử dụng sau khi nhánh kết thúc (không phình bề rộng)', () => {
    // merge b1 vào main, b1 kết thúc; sau đó merge b2 — b2 nên dùng lại lane 1.
    const { laneCount } = layoutGraph([
      commit('m2', 'm1', 'b2'),
      commit('m1', 'm0', 'b1'),
      commit('b2', 'm0'),
      commit('b1', 'm0'),
      commit('m0'),
    ]);

    expect(laneCount).toBeLessThanOrEqual(3);
  });
});
