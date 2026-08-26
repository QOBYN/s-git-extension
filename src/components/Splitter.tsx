// Thanh kéo tại biên giữa 2 vùng — pointer capture nên kéo nhanh ra ngoài
// thanh vẫn bám. onResize nhận delta từng bước (movementX/Y); parent tự clamp.

import { useCallback, useRef } from 'react';

interface Props {
  orientation: 'vertical' | 'horizontal';
  /**
   * Delta dương = kéo sang phải / xuống dưới. Vùng nằm BÊN PHẢI hay BÊN DƯỚI
   * splitter muốn to ra khi kéo về phía nó thì truyền invert.
   */
  invert?: boolean;
  onResize(delta: number): void;
}

export function Splitter({ orientation, invert, onResize }: Props) {
  const dragging = useRef(false);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) {
        return;
      }
      const delta = orientation === 'vertical' ? event.movementX : event.movementY;
      onResize(invert ? -delta : delta);
    },
    [orientation, invert, onResize],
  );

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return (
    <div
      className={`sg-splitter ${orientation}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="separator"
      aria-orientation={orientation}
    />
  );
}
