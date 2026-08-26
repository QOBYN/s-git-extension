// Ô graph của 1 hàng commit: vẽ SVG từ GraphRowLayout (engine thuần đã tính lane/cạnh).
// Đường cong merge dùng cubic bezier: rời/dập vào dot theo phương ngang, chạm mép
// hàng theo phương dọc — đúng dáng cong của SmartGit (ui-analysis B4, D3).

import { memo } from 'react';
import { railColor } from '../../engine/colors';
import type { GraphEdge, GraphRowLayout } from '../../engine/graphLayout';

/** Kích thước 1 ô lane / 1 hàng — đổi ở đây là đổi toàn cục. */
export const LANE_WIDTH = 14;
export const ROW_HEIGHT = 26;
const DOT_RADIUS = 3.5;
const STROKE_WIDTH = 2;

const laneX = (lane: number): number => lane * LANE_WIDTH + LANE_WIDTH / 2;

interface Props {
  row: GraphRowLayout;
  laneCount: number;
}

export const GraphCell = memo(function GraphCell({ row, laneCount }: Props) {
  const width = laneCount * LANE_WIDTH;
  const cy = ROW_HEIGHT / 2;
  const cx = laneX(row.lane);

  const paths: Array<{ d: string; color: number }> = [];

  for (const edge of row.through) {
    const x = laneX(edge.from);
    paths.push({ d: `M ${x} 0 V ${ROW_HEIGHT}`, color: edge.color });
  }
  for (const edge of row.intoDot) {
    paths.push({ d: intoDotPath(edge, cx, cy), color: edge.color });
  }
  for (const edge of row.outOfDot) {
    paths.push({ d: outOfDotPath(edge, cx, cy), color: edge.color });
  }

  return (
    <svg
      className="sg-graph-cell"
      width={width}
      height={ROW_HEIGHT}
      viewBox={`0 0 ${width} ${ROW_HEIGHT}`}
      aria-hidden="true"
    >
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          stroke={railColor(p.color)}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
        />
      ))}
      {/* Dot vẽ sau cùng để đè lên các cạnh; vòng stroke màu nền tách dot khỏi rail. */}
      <circle cx={cx} cy={cy} r={DOT_RADIUS} fill={railColor(row.color)} className="sg-graph-dot" />
    </svg>
  );
});

/** Từ mép trên (lane from) vào dot: rời mép theo phương dọc, dập vào dot theo ngang. */
function intoDotPath(edge: GraphEdge, cx: number, cy: number): string {
  const xf = laneX(edge.from);
  if (edge.from === edge.to) {
    return `M ${xf} 0 V ${cy}`;
  }
  return `M ${xf} 0 C ${xf} ${cy}, ${(xf + cx) / 2} ${cy}, ${cx} ${cy}`;
}

/** Từ dot xuống mép dưới (lane to): rời dot theo ngang, chạm mép theo phương dọc. */
function outOfDotPath(edge: GraphEdge, cx: number, cy: number): string {
  const xt = laneX(edge.to);
  if (edge.from === edge.to) {
    return `M ${cx} ${cy} V ${ROW_HEIGHT}`;
  }
  return `M ${cx} ${cy} C ${(cx + xt) / 2} ${cy}, ${xt} ${cy}, ${xt} ${ROW_HEIGHT}`;
}
