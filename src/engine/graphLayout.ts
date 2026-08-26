// GraphLayoutEngine — gán lane/màu cho từng commit và tính các cạnh cần vẽ.
// THUẦN TypeScript, không biết gì về React/DOM/SVG (architecture.md mục 5) —
// test snapshot topology trong graphLayout.test.ts.
//
// Mô hình: duyệt commit theo thứ tự git log (mới → cũ). Mỗi lane là 1 "khe"
// đang CHỜ một oid xuất hiện (oid của parent mà một commit phía trên trỏ tới).
// Khi commit xuất hiện: nó chiếm lane chờ nó (trái nhất), các lane khác cùng chờ
// gộp vào (đường cong hội tụ); sau đó lane tiếp tục chờ first-parent, các
// merge-parent mở lane mới hoặc cong sang lane đã chờ sẵn.

import type { CommitInfo } from '../../shared/types';

/** 1 cạnh trong phạm vi 1 hàng. from/to là chỉ số lane; from === to = đường thẳng. */
export interface GraphEdge {
  from: number;
  to: number;
  /** Id màu tăng dần — renderer map qua RAIL_PALETTE bằng modulo. */
  color: number;
}

export interface GraphRowLayout {
  /** Lane đặt dot của commit này. */
  lane: number;
  color: number;
  /** Đường thẳng xuyên hàng của các lane không liên quan tới commit này. */
  through: GraphEdge[];
  /** Cạnh từ mép TRÊN hàng đi vào dot (from = lane xuất phát, to = lane dot). */
  intoDot: GraphEdge[];
  /** Cạnh từ dot đi xuống mép DƯỚI hàng (from = lane dot, to = lane đích). */
  outOfDot: GraphEdge[];
}

export interface GraphLayout {
  rows: GraphRowLayout[];
  /** Số lane tối đa từng dùng — quyết định bề rộng cột graph. */
  laneCount: number;
}

interface LaneSlot {
  /** Oid mà lane này đang chờ. */
  oid: string;
  color: number;
}

export function layoutGraph(commits: CommitInfo[]): GraphLayout {
  const slots: Array<LaneSlot | null> = [];
  const rows: GraphRowLayout[] = [];
  let nextColor = 0;
  let laneCount = 0;

  const firstFreeLane = (): number => {
    const free = slots.findIndex((slot) => slot === null);
    if (free !== -1) {
      return free;
    }
    slots.push(null);
    return slots.length - 1;
  };

  for (const commit of commits) {
    // 1) Các lane đang chờ commit này (con của nó ở phía trên đã trỏ xuống).
    const expecting: number[] = [];
    slots.forEach((slot, index) => {
      if (slot?.oid === commit.oid) {
        expecting.push(index);
      }
    });

    let lane: number;
    let color: number;
    const intoDot: GraphEdge[] = [];

    if (expecting.length === 0) {
      // Tip của một nhánh (không con nào phía trên) — mở lane mới, không có cạnh vào.
      lane = firstFreeLane();
      color = nextColor++;
      slots[lane] = { oid: commit.oid, color };
    } else {
      // Chiếm lane trái nhất; các lane khác cùng chờ cong vào dot rồi giải phóng.
      lane = expecting[0];
      color = slots[lane]!.color;
      for (const from of expecting) {
        intoDot.push({ from, to: lane, color: slots[from]!.color });
      }
      for (const extra of expecting.slice(1)) {
        slots[extra] = null;
      }
    }

    // 2) Đường xuyên hàng: mọi lane còn chờ oid KHÁC commit hiện tại.
    const through: GraphEdge[] = [];
    slots.forEach((slot, index) => {
      if (slot !== null && slot.oid !== commit.oid) {
        through.push({ from: index, to: index, color: slot.color });
      }
    });

    // 3) Nối xuống parents.
    const outOfDot: GraphEdge[] = [];
    const [firstParent, ...mergeParents] = commit.parents;

    if (firstParent === undefined) {
      slots[lane] = null; // commit gốc — nhánh kết thúc, lane trả lại để tái sử dụng
    } else {
      const convergeLane = slots.findIndex(
        (slot, index) => index !== lane && slot?.oid === firstParent,
      );
      if (convergeLane !== -1) {
        // First-parent đã có lane khác chờ — hội tụ sang đó, lane này kết thúc
        // (giữ lane chính bên trái ổn định, giống SmartGit).
        outOfDot.push({ from: lane, to: convergeLane, color: slots[convergeLane]!.color });
        slots[lane] = null;
      } else {
        slots[lane] = { oid: firstParent, color };
        outOfDot.push({ from: lane, to: lane, color });
      }
    }

    for (const parent of mergeParents) {
      const existing = slots.findIndex((slot) => slot?.oid === parent);
      if (existing !== -1) {
        outOfDot.push({ from: lane, to: existing, color: slots[existing]!.color });
      } else {
        const newLane = firstFreeLane();
        const newColor = nextColor++;
        slots[newLane] = { oid: parent, color: newColor };
        outOfDot.push({ from: lane, to: newLane, color: newColor });
      }
    }

    laneCount = Math.max(laneCount, slots.length, lane + 1);
    rows.push({ lane, color, through, intoDot, outOfDot });
  }

  return { rows, laneCount };
}
