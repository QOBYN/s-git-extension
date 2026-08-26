// Windowing tự viết cho danh sách hàng CAO CỐ ĐỊNH (graph commit — architecture.md
// mục 5: chỉ render viewport). Đủ cho nhu cầu này, không cần thêm dependency.

import { useCallback, useMemo, useState, type UIEvent } from 'react';

/** Số hàng render dư mỗi đầu để cuộn không thấy khoảng trắng. */
const OVERSCAN_ROWS = 10;

export interface VirtualSlice {
  /** Chỉ số hàng đầu/cuối (exclusive) cần render. */
  start: number;
  end: number;
  /** Chiều cao đệm trên/dưới thay cho các hàng không render. */
  topPad: number;
  bottomPad: number;
  /** Gắn vào onScroll của container. */
  onScroll: (event: UIEvent<HTMLElement>) => void;
}

export function useVirtualList(
  itemCount: number,
  rowHeight: number,
  viewportHeight: number,
): VirtualSlice {
  const [scrollTop, setScrollTop] = useState(0);

  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  return useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS);
    const visibleCount = Math.ceil(viewportHeight / rowHeight) + OVERSCAN_ROWS * 2;
    const end = Math.min(itemCount, start + visibleCount);
    return {
      start,
      end,
      topPad: start * rowHeight,
      bottomPad: (itemCount - end) * rowHeight,
      onScroll,
    };
  }, [itemCount, rowHeight, viewportHeight, scrollTop, onScroll]);
}
