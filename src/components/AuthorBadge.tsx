// Ô initials tác giả (kiểu "TP", "QQ" trong screenshot SmartGit — ui-analysis B4).
// Màu nền hash ổn định từ tên để cùng người luôn cùng màu.

import { memo } from 'react';
import { RAIL_PALETTE } from '../engine/colors';

interface Props {
  name: string;
}

export const AuthorBadge = memo(function AuthorBadge({ name }: Props) {
  return (
    <span
      className="sg-author-badge"
      style={{ backgroundColor: RAIL_PALETTE[hashName(name) % RAIL_PALETTE.length] }}
      title={name}
    >
      {initialsOf(name)}
    </span>
  );
});

/** Chữ cái đầu của tối đa 2 từ đầu tiên: "Trọng Phạm" → "TP", "alice" → "A". */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash;
}
